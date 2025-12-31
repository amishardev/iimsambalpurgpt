/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // IIM Sambalpur GPT Dark Theme
                background: {
                    DEFAULT: '#0a0a0a',
                    secondary: '#1a1a1a',
                    card: '#252525',
                    hover: '#2a2a2a',
                },
                accent: {
                    DEFAULT: '#f97316', // Orange
                    hover: '#ea580c',
                    light: '#fb923c',
                },
                border: {
                    DEFAULT: '#333333',
                    light: '#404040',
                },
                text: {
                    primary: '#ffffff',
                    secondary: '#9ca3af',
                    muted: '#6b7280',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-soft': 'pulseSoft 2s infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                pulseSoft: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
            },
        },
    },
    plugins: [],
};
