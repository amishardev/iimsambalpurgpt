'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatInterface from '@/components/ChatInterface';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: { url: string; title: string }[];
    timestamp: Date;
}

export interface Chat {
    id: string;
    title: string;
    messages: Message[];
    createdAt: Date;
}

export default function Home() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [chatHistory, setChatHistory] = useState<Chat[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);

    const handleNewChat = () => {
        // Save current chat to history if it has messages
        if (messages.length > 0 && currentChatId) {
            const firstUserMessage = messages.find(m => m.role === 'user');
            const title = firstUserMessage?.content.slice(0, 50) || 'New Chat';

            setChatHistory(prev => [
                {
                    id: currentChatId,
                    title,
                    messages,
                    createdAt: new Date(),
                },
                ...prev.slice(0, 19), // Keep last 20 chats
            ]);
        }

        setMessages([]);
        setCurrentChatId(crypto.randomUUID());
    };

    const handleSendMessage = async (content: string) => {
        if (!content.trim() || isLoading) return;

        // Create chat ID if first message
        if (!currentChatId) {
            setCurrentChatId(crypto.randomUUID());
        }

        // Add user message
        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        // Create placeholder for assistant response
        const assistantId = crypto.randomUUID();
        const assistantMessage: Message = {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: content,
                    history: messages.slice(-10), // Send last 10 messages for context
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let sources: { url: string; title: string }[] = [];

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.content) {
                                    fullContent += parsed.content;
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, content: fullContent }
                                                : m
                                        )
                                    );
                                }
                                if (parsed.sources) {
                                    sources = parsed.sources;
                                }
                            } catch {
                                // Skip invalid JSON
                            }
                        }
                    }
                }
            }

            // Update with final content and sources
            setMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: fullContent, sources }
                        : m
                )
            );

        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? {
                            ...m,
                            content:
                                'I apologize, but I encountered an error processing your request. Please try again.',
                        }
                        : m
                )
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectChat = (chat: Chat) => {
        setMessages(chat.messages);
        setCurrentChatId(chat.id);
    };

    return (
        <div className="flex h-screen bg-background">
            {/* Sidebar */}
            <Sidebar
                chatHistory={chatHistory}
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                currentChatId={currentChatId}
            />

            {/* Main Chat Area */}
            <ChatInterface
                messages={messages}
                isLoading={isLoading}
                onSendMessage={handleSendMessage}
            />
        </div>
    );
}
