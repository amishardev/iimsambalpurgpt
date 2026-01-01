'use client';

import { useState } from 'react';
import {
    MessageSquarePlus,
    Compass,
    FileText,
    LayoutTemplate,
    Search,
    ChevronRight,
    MessageSquare,
    Menu,
    X,
} from 'lucide-react';
import type { Chat } from '@/app/page';

interface SidebarProps {
    chatHistory: Chat[];
    onNewChat: () => void;
    onSelectChat: (chat: Chat) => void;
    currentChatId: string | null;
}

function NavItem({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors">
            {icon}
            <span className="text-sm">{label}</span>
        </button>
    );
}

export default function Sidebar({
    chatHistory,
    onNewChat,
    onSelectChat,
    currentChatId,
}: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const filteredChats = chatHistory.filter(chat =>
        chat.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            {/* Mobile Toggle Button */}
            <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="md:hidden fixed top-4 left-4 z-50 p-2 bg-background-card rounded-lg border border-border shadow-lg"
                aria-label="Toggle menu"
            >
                {isMobileOpen ? (
                    <X size={20} className="text-text-primary" />
                ) : (
                    <Menu size={20} className="text-text-primary" />
                )}
            </button>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <aside className={`
                fixed md:relative z-50
                w-64 h-screen bg-background-secondary flex flex-col border-r border-border
                transform transition-transform duration-300 ease-in-out
                ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="p-4 flex items-center gap-2">
                    <span className="text-lg font-semibold text-text-primary">IIM SAMBALPUR</span>
                    <span className="bg-accent text-white text-xs px-2 py-0.5 rounded font-medium">
                        GPT
                    </span>
                </div>

                {/* New Chat Button */}
                <div className="px-3 mb-4">
                    <button
                        onClick={() => {
                            onNewChat();
                            setIsMobileOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
                    >
                        <MessageSquarePlus size={18} />
                        New chat
                    </button>
                </div>

                {/* Navigation */}
                <nav className="px-3 space-y-1">
                    <NavItem icon={<Compass size={18} />} label="Explore" />
                    <NavItem icon={<FileText size={18} />} label="Files" />
                    <NavItem icon={<LayoutTemplate size={18} />} label="Templates" />
                </nav>

                {/* Recent Chats Section */}
                <div className="flex-1 overflow-hidden flex flex-col mt-6">
                    <div className="px-4 flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            Recent Chat
                        </span>
                        <button className="text-text-muted hover:text-text-primary">
                            <span className="text-lg">···</span>
                        </button>
                    </div>

                    {/* Search */}
                    <div className="px-3 mb-3">
                        <div className="relative">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                            />
                            <input
                                type="text"
                                placeholder="Search"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-background-card text-text-primary text-sm py-2 pl-9 pr-3 rounded-lg border border-border focus:border-accent focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Chat List */}
                    <div className="flex-1 overflow-y-auto px-2 space-y-1">
                        {filteredChats.length > 0 ? (
                            filteredChats.map(chat => (
                                <button
                                    key={chat.id}
                                    onClick={() => {
                                        onSelectChat(chat);
                                        setIsMobileOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${currentChatId === chat.id
                                        ? 'bg-background-hover text-text-primary'
                                        : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                                        }`}
                                >
                                    <ChevronRight size={14} />
                                    <span className="text-sm truncate">{chat.title}</span>
                                </button>
                            ))
                        ) : (
                            <div className="px-3 py-2 text-text-muted text-sm">
                                {searchQuery ? 'No chats found' : 'No recent chats'}
                            </div>
                        )}

                        {/* All Chats Link */}
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-text-secondary hover:text-text-primary transition-colors">
                            <ChevronRight size={14} />
                            <span className="text-sm">All chats</span>
                        </button>
                    </div>
                </div>

                {/* Upgrade Banner */}
                <div className="mx-3 mb-3 p-3 bg-background-card rounded-lg border border-border">
                    <p className="text-sm font-medium text-text-primary mb-1">Upgrade to</p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Enjoy faster time reply, image generations and more advanced search experience.
                    </p>
                    <button className="mt-3 w-full py-2 bg-background-hover hover:bg-border text-text-secondary hover:text-text-primary text-sm rounded-lg transition-colors">
                        Learn more
                    </button>
                </div>

                {/* User Section */}
                <div className="px-3 py-3 border-t border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                            <MessageSquare size={16} className="text-white" />
                        </div>
                        <span className="text-sm font-medium text-text-primary">AMISH</span>
                    </div>
                </div>
            </aside>
        </>
    );
}
