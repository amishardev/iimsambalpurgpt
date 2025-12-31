/**
 * Prompt Builder for RAG
 * 
 * Constructs prompts with system instructions, retrieved context,
 * and strict no-hallucination guardrails
 */

export interface RetrievedChunk {
    chunk_id: string;
    source_url: string;
    page_title: string;
    text: string;
    similarity: number;
}

export interface BuiltPrompt {
    systemPrompt: string;
    userPrompt: string;
    contextUsed: RetrievedChunk[];
    tokenEstimate: number;
}

// System prompt with strict no-hallucination rules
const SYSTEM_PROMPT = `You are **IIM Sambalpur GPT**, an AI assistant specifically designed to help with questions about Indian Institute of Management Sambalpur.

## STRICT RULES (NEVER VIOLATE):

1. **ONLY use information from the provided CONTEXT below.** Do not use any external knowledge about IIM Sambalpur or any other institution.

2. **NEVER invent, assume, or hallucinate facts.** If the answer is not explicitly stated in the context, you MUST respond with:
   "Based on available public IIM Sambalpur data, this information is not available."

3. **ALWAYS cite sources.** When providing information, mention where it came from using the format: (Source: [page title])

4. **Stay on topic.** Only answer questions related to IIM Sambalpur. For unrelated questions, politely redirect to IIM Sambalpur topics.

5. **Be helpful and academic.** Use a professional, informative tone appropriate for an educational institution.

## RESPONSE FORMATTING:

- Use markdown for better readability
- Use bullet points for lists
- Use **bold** for emphasis on key information
- Include source attributions for facts
- For contact information, format clearly with proper line breaks

## CONFIDENCE LEVELS:

- HIGH: Information is directly and clearly stated in context
- MEDIUM: Information can be reasonably inferred from context
- LOW: Information is only partially covered in context

If you cannot find relevant information, state this clearly rather than guessing.`;

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Build the context block from retrieved chunks
 */
function buildContextBlock(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) {
        return 'No relevant context found for this query.';
    }

    return chunks
        .map((chunk, i) => {
            const confidence = chunk.similarity > 0.8 ? 'HIGH' : chunk.similarity > 0.6 ? 'MEDIUM' : 'LOW';
            return `
---
**Context ${i + 1}** (Relevance: ${confidence})
**Source:** ${chunk.page_title}
**URL:** ${chunk.source_url}

${chunk.text.trim()}
---`;
        })
        .join('\n');
}

/**
 * Build the complete prompt for the LLM
 */
export function buildPrompt(
    userMessage: string,
    retrievedChunks: RetrievedChunk[],
    maxContextTokens: number = 3000
): BuiltPrompt {
    // Sort chunks by similarity (highest first)
    const sortedChunks = [...retrievedChunks].sort((a, b) => b.similarity - a.similarity);

    // Select chunks that fit within token budget
    const selectedChunks: RetrievedChunk[] = [];
    let currentTokens = 0;

    for (const chunk of sortedChunks) {
        const chunkTokens = estimateTokens(chunk.text);
        if (currentTokens + chunkTokens <= maxContextTokens) {
            selectedChunks.push(chunk);
            currentTokens += chunkTokens;
        }
    }

    // Build the context block
    const contextBlock = buildContextBlock(selectedChunks);

    // Build the full system prompt with context
    const fullSystemPrompt = `${SYSTEM_PROMPT}

## CONTEXT FROM IIM SAMBALPUR DATABASE:

${contextBlock}

## END OF CONTEXT

Remember: ONLY use information from the above context. If the answer is not there, say "Based on available public IIM Sambalpur data, this information is not available."`;

    // Estimate total tokens
    const systemTokens = estimateTokens(fullSystemPrompt);
    const userTokens = estimateTokens(userMessage);

    return {
        systemPrompt: fullSystemPrompt,
        userPrompt: userMessage,
        contextUsed: selectedChunks,
        tokenEstimate: systemTokens + userTokens,
    };
}

/**
 * Build a simple prompt for when no context is retrieved
 */
export function buildNoContextPrompt(userMessage: string): BuiltPrompt {
    const noContextSystem = `${SYSTEM_PROMPT}

## IMPORTANT: NO RELEVANT CONTEXT FOUND

The vector search did not find any relevant information in the IIM Sambalpur database for this query.

You MUST respond with: "Based on available public IIM Sambalpur data, this information is not available. Please try rephrasing your question or ask about specific topics like admissions, programs, faculty, placements, fees, or campus life."`;

    return {
        systemPrompt: noContextSystem,
        userPrompt: userMessage,
        contextUsed: [],
        tokenEstimate: estimateTokens(noContextSystem) + estimateTokens(userMessage),
    };
}

/**
 * Get suggestion questions for the home page
 */
export function getSuggestionQuestions(): string[] {
    return [
        'What programs does IIM Sambalpur offer?',
        'How can I apply for the MBA program?',
        'What is the fee structure at IIM Sambalpur?',
        'Tell me about placement statistics',
        'What facilities are available on campus?',
        'Who are the faculty members?',
    ];
}
