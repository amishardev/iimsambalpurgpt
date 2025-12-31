'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Paperclip, Sparkles, Globe, MoreHorizontal } from 'lucide-react';

interface MessageComposerProps {
    onSend: (message: string) => void;
    disabled?: boolean;
}

export default function MessageComposer({ onSend, disabled }: MessageComposerProps) {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [message]);

    const handleSend = () => {
        if (message.trim() && !disabled) {
            onSend(message.trim());
            setMessage('');
            // Reset height
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
            {/* Input Area */}
            <div className="px-4 py-3">
                <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask whatever you want"
                    disabled={disabled}
                    rows={1}
                    className="w-full bg-transparent text-text-primary placeholder-text-muted resize-none focus:outline-none text-base"
                    style={{ minHeight: '24px', maxHeight: '200px' }}
                />
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
                {/* Left Actions */}
                <div className="flex items-center gap-1">
                    <ActionButton icon={<Sparkles size={16} />} label="Think" />
                    <ActionButton icon={<Globe size={16} />} label="Search" active />
                    <button className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-background-hover transition-colors">
                        <MoreHorizontal size={18} />
                    </button>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2">
                    <button
                        className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-background-hover transition-colors"
                        aria-label="Attach file"
                    >
                        <Paperclip size={18} />
                    </button>

                    <button
                        onClick={handleSend}
                        disabled={!message.trim() || disabled}
                        className={`p-2.5 rounded-full transition-all ${message.trim() && !disabled
                                ? 'bg-accent hover:bg-accent-hover text-white'
                                : 'bg-background-hover text-text-muted cursor-not-allowed'
                            }`}
                        aria-label="Send message"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActionButton({
    icon,
    label,
    active = false,
}: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
}) {
    return (
        <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${active
                    ? 'bg-background-hover text-text-primary border border-border'
                    : 'text-text-muted hover:text-text-primary hover:bg-background-hover'
                }`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
