'use client';

import { BookOpen, FileText, ClipboardList, Library } from 'lucide-react';

interface SuggestionCardsProps {
    onSelect: (message: string) => void;
}

const suggestions = [
    {
        icon: <BookOpen size={24} className="text-blue-400" />,
        title: 'Classes Today',
        items: [
            'Economics 11:00-12:30',
            'Business Stats 12:30-2:00',
        ],
        query: 'What classes do I have today?',
    },
    {
        icon: <FileText size={24} className="text-blue-400" />,
        title: 'Upcoming Events',
        items: [
            'Economics paper discussion at 4:00 PM',
        ],
        query: 'Tell me about upcoming events at IIM Sambalpur',
    },
    {
        icon: <ClipboardList size={24} className="text-yellow-400" />,
        title: 'Assignments',
        items: [
            'Statistics assignment Due tomorrow',
        ],
        query: 'What assignments are due this week?',
    },
    {
        icon: <Library size={24} className="text-yellow-400" />,
        title: 'Library Updates',
        items: [
            'Library hours extended',
            'Quiz on Friday',
        ],
        query: 'What resources does the IIM Sambalpur library have?',
    },
];

export default function SuggestionCards({ onSelect }: SuggestionCardsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {suggestions.map((suggestion, index) => (
                <button
                    key={index}
                    onClick={() => onSelect(suggestion.query)}
                    className="bg-background-card hover:bg-background-hover border border-border rounded-xl p-4 text-left transition-all card-hover group"
                >
                    {/* Icon */}
                    <div className="mb-3">{suggestion.icon}</div>

                    {/* Title */}
                    <h3 className="text-sm font-medium text-text-primary mb-2 group-hover:text-accent transition-colors">
                        {suggestion.title}
                    </h3>

                    {/* Items */}
                    <ul className="space-y-1">
                        {suggestion.items.map((item, i) => (
                            <li key={i} className="text-xs text-text-secondary flex items-start gap-1">
                                <span className="text-text-muted">•</span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </button>
            ))}
        </div>
    );
}
