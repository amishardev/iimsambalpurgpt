'use client';

import { useRef, useEffect } from 'react';
import Message from './Message';
import MessageComposer from './MessageComposer';
import SuggestionCards from './SuggestionCards';
import type { Message as MessageType } from '@/app/page';
import { Bell, HelpCircle } from 'lucide-react';

interface ChatInterfaceProps {
    messages: MessageType[];
    isLoading: boolean;
    onSendMessage: (message: string) => void;
}

export default function ChatInterface({
    messages,
    isLoading,
    onSendMessage,
}: ChatInterfaceProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const isEmpty = messages.length === 0;

    return (
        <div className="flex-1 flex flex-col h-screen bg-background">
            {/* Header with icons */}
            <header className="flex items-center justify-end gap-4 p-4 border-b border-border">
                <button className="p-2 text-text-muted hover:text-text-primary transition-colors">
                    <Bell size={20} />
                </button>
                <button className="p-2 text-text-muted hover:text-text-primary transition-colors">
                    <HelpCircle size={20} />
                </button>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                {isEmpty ? (
                    /* Empty State - Home View */
                    <div className="h-full flex flex-col items-center justify-center px-4">
                        <div className="max-w-2xl w-full text-center">
                            {/* Logo */}
                            <div className="flex items-center justify-center gap-2 mb-4">
                                <span className="text-2xl font-bold text-text-primary">
                                    IIM SAMBALPUR
                                </span>
                                <span className="bg-accent text-white text-sm px-2 py-1 rounded font-medium">
                                    GPT
                                </span>
                            </div>

                            {/* Greeting */}
                            <h1 className="text-3xl font-semibold text-text-primary mb-2">
                                Hi, Amish 👋
                            </h1>
                            <p className="text-text-secondary mb-8">
                                Here&apos;s everything you need to know about your campus day.
                            </p>

                            {/* Suggestion Cards */}
                            <SuggestionCards onSelect={onSendMessage} />
                        </div>
                    </div>
                ) : (
                    /* Chat Messages */
                    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
                        {messages.map(message => (
                            <Message key={message.id} message={message} />
                        ))}

                        {/* Loading indicator */}
                        {isLoading && messages[messages.length - 1]?.content === '' && (
                            <div className="flex items-center gap-2 text-text-muted">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-sm">Thinking...</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Message Composer */}
            <div className="border-t border-border p-4">
                <div className="max-w-5xl mx-auto px-6">
                    <MessageComposer
                        onSend={onSendMessage}
                        disabled={isLoading}
                    />

                    {/* Disclaimer */}
                    <p className="text-xs text-text-muted text-center mt-3">
                        Answers are generated from public IIM Sambalpur data. For official confirmation, refer to the{' '}
                        <a
                            href="https://iimsambalpur.ac.in"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                        >
                            institute website
                        </a>
                        .
                    </p>
                </div>
            </div>
        </div>
    );
}
