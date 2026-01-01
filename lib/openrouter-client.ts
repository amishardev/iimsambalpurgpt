/**
 * OpenRouter API Client with Key Rotation
 * 
 * Automatically rotates between 3 API keys when rate limited (429/401)
 * Supports both streaming and non-streaming responses
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Get keys from environment
const API_KEYS = [
    process.env.OPENROUTER_KEY_1,
    process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3,
].filter(Boolean) as string[];

// Track current key index (rotates on failure)
let currentKeyIndex = 0;

// Track key usage stats for monitoring
interface KeyStats {
    requests: number;
    failures: number;
    lastUsed: Date | null;
}

const keyStats: Map<number, KeyStats> = new Map(
    API_KEYS.map((_, i) => [i, { requests: 0, failures: 0, lastUsed: null }])
);

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenRouterRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

export interface OpenRouterResponse {
    id: string;
    choices: {
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Get the current API key
 */
function getCurrentKey(): string {
    if (API_KEYS.length === 0) {
        throw new Error('No OpenRouter API keys configured');
    }
    return API_KEYS[currentKeyIndex];
}

/**
 * Rotate to the next API key
 */
function rotateKey(): void {
    const stats = keyStats.get(currentKeyIndex);
    if (stats) {
        stats.failures++;
    }

    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[OpenRouter] Rotating to key ${currentKeyIndex + 1}/${API_KEYS.length}`);
}

/**
 * Check if response indicates rate limiting or auth failure
 */
function shouldRotateKey(status: number): boolean {
    return status === 429 || status === 401 || status === 403;
}

/**
 * Make a chat completion request with automatic key rotation
 */
export async function chatCompletion(
    payload: OpenRouterRequest
): Promise<OpenRouterResponse> {
    const maxAttempts = API_KEYS.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const key = getCurrentKey();
        const stats = keyStats.get(currentKeyIndex);

        try {
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
                    'X-Title': 'IIM Sambalpur GPT',
                },
                body: JSON.stringify({
                    ...payload,
                    stream: false,
                }),
            });

            if (shouldRotateKey(response.status)) {
                console.log(`[OpenRouter] Key ${currentKeyIndex + 1} returned ${response.status}, rotating...`);
                rotateKey();
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[OpenRouter] API error: ${response.status} - ${errorText}`);
                throw new Error(`OpenRouter API error: ${response.status}`);
            }

            // Update stats
            if (stats) {
                stats.requests++;
                stats.lastUsed = new Date();
            }

            return await response.json();
        } catch (error) {
            console.error(`[OpenRouter] Request failed with key ${currentKeyIndex + 1}:`, error);

            // Only rotate on network errors if we haven't exhausted all keys
            if (attempt < maxAttempts - 1) {
                rotateKey();
            }
        }
    }

    throw new Error('All OpenRouter API keys exhausted or failed');
}

/**
 * Make a streaming chat completion request with automatic key rotation
 * Returns a ReadableStream for streaming responses
 */
export async function chatCompletionStream(
    payload: OpenRouterRequest
): Promise<ReadableStream<Uint8Array>> {
    const maxAttempts = API_KEYS.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const key = getCurrentKey();
        const stats = keyStats.get(currentKeyIndex);

        try {
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
                    'X-Title': 'IIM Sambalpur GPT',
                },
                body: JSON.stringify({
                    ...payload,
                    stream: true,
                }),
            });

            if (shouldRotateKey(response.status)) {
                console.log(`[OpenRouter] Key ${currentKeyIndex + 1} returned ${response.status}, rotating...`);
                rotateKey();
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[OpenRouter] API error: ${response.status} - ${errorText}`);
                throw new Error(`OpenRouter API error: ${response.status}`);
            }

            // Update stats
            if (stats) {
                stats.requests++;
                stats.lastUsed = new Date();
            }

            if (!response.body) {
                throw new Error('No response body for streaming');
            }

            return response.body;
        } catch (error) {
            console.error(`[OpenRouter] Streaming request failed with key ${currentKeyIndex + 1}:`, error);

            if (attempt < maxAttempts - 1) {
                rotateKey();
            }
        }
    }

    throw new Error('All OpenRouter API keys exhausted or failed');
}

/**
 * Get current key usage statistics (for monitoring)
 */
export function getKeyStats(): { keyIndex: number; stats: KeyStats }[] {
    return Array.from(keyStats.entries()).map(([keyIndex, stats]) => ({
        keyIndex,
        stats,
    }));
}

/**
 * Get the default model to use
 */
export function getDefaultModel(): string {
    return process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro-exp-03-25:free';
}
