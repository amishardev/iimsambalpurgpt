'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Message as MessageType } from '@/app/page';
import { User, Bot, ExternalLink } from 'lucide-react';

interface MessageProps {
    message: MessageType;
}

export default function Message({ message }: MessageProps) {
    const isUser = message.role === 'user';

    return (
        <div
            className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
        >
            {/* Avatar for assistant */}
            {!isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                    <Bot size={18} className="text-white" />
                </div>
            )}

            {/* Message Content */}
            <div
                className={`max-w-[85%] ${isUser
                    ? 'bg-background-card border border-border rounded-2xl rounded-tr-sm px-4 py-3'
                    : ''
                    }`}
            >
                {isUser ? (
                    <p className="text-text-primary whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <div className="space-y-4">
                        {/* Markdown Content */}
                        <div className="message-content text-text-primary">
                            {message.content ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={{
                                        // Custom heading renders
                                        h1: ({ children }) => (
                                            <h1 className="text-2xl font-bold text-text-primary mt-4 mb-3">
                                                {children}
                                            </h1>
                                        ),
                                        h2: ({ children }) => (
                                            <h2 className="text-xl font-semibold text-text-primary mt-4 mb-2">
                                                {children}
                                            </h2>
                                        ),
                                        h3: ({ children }) => (
                                            <h3 className="text-lg font-medium text-text-primary mt-3 mb-2">
                                                {children}
                                            </h3>
                                        ),
                                        // Custom link styling
                                        a: ({ href, children }) => (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-accent hover:underline inline-flex items-center gap-1"
                                            >
                                                {children}
                                                <ExternalLink size={12} />
                                            </a>
                                        ),
                                        // Custom code block
                                        code: ({ className, children }) => {
                                            const isInline = !className;
                                            return isInline ? (
                                                <code className="bg-background-card px-1.5 py-0.5 rounded text-sm font-mono text-accent-light">
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className={className}>{children}</code>
                                            );
                                        },
                                        // Custom list styling
                                        ul: ({ children }) => (
                                            <ul className="list-disc list-inside space-y-1 my-2">
                                                {children}
                                            </ul>
                                        ),
                                        ol: ({ children }) => (
                                            <ol className="list-decimal list-inside space-y-1 my-2">
                                                {children}
                                            </ol>
                                        ),
                                        // Custom table styling
                                        table: ({ children }) => (
                                            <div className="overflow-x-auto my-4">
                                                <table className="min-w-full border border-border rounded-lg overflow-hidden">
                                                    {children}
                                                </table>
                                            </div>
                                        ),
                                        th: ({ children }) => (
                                            <th className="bg-background-card px-4 py-2 text-left text-sm font-medium text-text-primary border-b border-border">
                                                {children}
                                            </th>
                                        ),
                                        td: ({ children }) => (
                                            <td className="px-4 py-2 text-sm text-text-secondary border-b border-border">
                                                {children}
                                            </td>
                                        ),
                                    }}
                                >
                                    {message.content}
                                </ReactMarkdown>
                            ) : (
                                <span className="typing-cursor text-text-muted">Generating response</span>
                            )}
                        </div>

                        {/* Sources */}
                        {message.sources && message.sources.length > 0 && (
                            <div className="pt-3 border-t border-border">
                                <p className="text-xs text-text-muted mb-2 font-medium">Sources:</p>
                                <div className="flex flex-wrap gap-2">
                                    {message.sources.map((source, i) => (
                                        <a
                                            key={i}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs bg-background-card text-text-secondary hover:text-accent px-2 py-1 rounded-full border border-border transition-colors"
                                        >
                                            <ExternalLink size={10} />
                                            {source.title || 'Source'}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Avatar for user */}
            {isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-background-card border border-border flex items-center justify-center">
                    <User size={18} className="text-text-secondary" />
                </div>
            )}
        </div>
    );
}
