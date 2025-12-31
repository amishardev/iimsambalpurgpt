import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'IIM Sambalpur GPT - AI Assistant',
    description: 'AI-powered assistant for IIM Sambalpur - Get instant answers about admissions, programs, placements, and campus life.',
    keywords: ['IIM Sambalpur', 'MBA', 'admissions', 'placements', 'management education'],
    authors: [{ name: 'IIM Sambalpur' }],
    openGraph: {
        title: 'IIM Sambalpur GPT',
        description: 'AI-powered assistant for IIM Sambalpur',
        type: 'website',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-background text-text-primary`}>
                {children}
            </body>
        </html>
    );
}
