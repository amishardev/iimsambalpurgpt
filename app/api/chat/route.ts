/**
 * Chat API Route
 * 
 * Handles chat messages using RAG pipeline:
 * 1. Retrieve relevant chunks from vector DB
 * 2. Build prompt with context
 * 3. Stream response from OpenRouter/DeepSeek
 */

import { NextRequest, NextResponse } from 'next/server';
import { chatCompletionStream, getDefaultModel } from '@/lib/openrouter-client';
import { retrieveRelevantChunks } from '@/lib/retrieval';
import { buildPrompt, buildNoContextPrompt } from '@/lib/prompt-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatRequest {
    message: string;
    history?: { role: string; content: string }[];
}

export async function POST(request: NextRequest) {
    try {
        const body: ChatRequest = await request.json();
        const { message, history = [] } = body;

        if (!message?.trim()) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        // Step 1: Retrieve relevant chunks from vector DB
        console.log('[Chat API] Retrieving context for:', message.slice(0, 50));
        const chunks = await retrieveRelevantChunks(message, 15); // Increased for better coverage
        console.log(`[Chat API] Retrieved ${chunks.length} chunks`);

        // Step 2: Build prompt with context
        const prompt = chunks.length > 0
            ? buildPrompt(message, chunks)
            : buildNoContextPrompt(message);

        console.log(`[Chat API] Prompt built, estimated tokens: ${prompt.tokenEstimate}`);

        // Step 3: Prepare messages for OpenRouter
        const messages = [
            { role: 'system' as const, content: prompt.systemPrompt },
            ...history.slice(-6).map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: prompt.userPrompt },
        ];

        // Step 4: Call OpenRouter with streaming
        const stream = await chatCompletionStream({
            model: getDefaultModel(),
            messages,
            temperature: 0.5,  // Lower for more focused responses
            max_tokens: 4000,  // Increased for comprehensive answers
            stream: true,
        });

        // Create sources info to send at the end
        const sources = prompt.contextUsed.map(c => ({
            url: c.source_url,
            title: c.page_title,
        }));

        // Transform the stream to SSE format
        const encoder = new TextEncoder();
        const transformedStream = new ReadableStream({
            async start(controller) {
                const reader = stream.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') {
                                    // Send sources at the end
                                    controller.enqueue(
                                        encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`)
                                    );
                                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                    continue;
                                }

                                try {
                                    const parsed = JSON.parse(data);
                                    const content = parsed.choices?.[0]?.delta?.content;
                                    if (content) {
                                        controller.enqueue(
                                            encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                                        );
                                    }
                                } catch {
                                    // Skip invalid JSON
                                }
                            }
                        }
                    }

                    // Send any remaining buffer
                    if (buffer.trim()) {
                        try {
                            const parsed = JSON.parse(buffer.replace('data: ', ''));
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                controller.enqueue(
                                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                                );
                            }
                        } catch {
                            // Ignore
                        }
                    }

                    // Ensure sources are sent
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`)
                    );
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                } catch (error) {
                    console.error('[Chat API] Stream error:', error);
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`
                        )
                    );
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(transformedStream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('[Chat API] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
