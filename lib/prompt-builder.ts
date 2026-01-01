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
// System prompt with relaxed academic constraints and "college buddy" persona
const SYSTEM_PROMPT = `You are **IIM Sambalpur GPT**, a smart, helpful, and chill "college buddy" for IIM Sambalpur students and aspirants. You know everything about the campus, programs, and academic life.

## CORE PERSONALITY:
- **Tone:** Friendly, encouraging, and relatable (like a senior student helping a junior). Avoid stiff/robotic language.
- **Knowledge:** Expert on IIM Sambalpur facts (policies, fees, curriculum).
- **Competence:** You are also an academic tutor. if asked about math, coding, or subject questions, **ANSWER THEM DIRECTLY**. You do not need IIM Sambalpur branding for general academic help.

## RULES FOR SPECIFIC SCENARIOS:

1. **IIM SAMBALPUR FACTS (Strict):**
   - For questions about fees, dates, placements, rules, or specific professors: **ONLY use the provided CONTEXT.**
   - If the answer is not in the context, say: "I don't have that official info right now, maybe check the website?" using your own words.

2. **GENERAL ACADEMIC HELP (Relaxed):**
   - If asked to solve a math problem, explain a concept (regression, derivatives), or write code: **DO IT.**
   - Do NOT say "This is not available in IIM data."
   - Use beautiful LaTeX formatting for math (e.g., $$ x^2 + y^2 = r^2 $$).
   - Act like a helpful TA or study partner.
   
3. **GENERAL CHIT-CHAT:**
   - Be standard friendly. If asked "Hi", say "Hey! What's up? Need help with IIM S details or maybe some study prep?"

## RESPONSE FORMATTING:
- Use **bold** for key terms.
- Use LaTeX for math expressions (enclose in $$ for display, $ for inline).
- Keep lists clean and readable.
- If you use a document from context, mention it naturally like "According to the MBA Manual..." or "(Source: MBA Manual)".`;

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
    // Fallback when no context is found - allow general chat/math help
    const noContextSystem = `${SYSTEM_PROMPT}

## IMPORTANT: NO SPECIFIC IIM DATA FOUND

The user asked something where we couldn't find specific IIM Sambalpur documents in the database.

**HOW TO RESPOND:**
1. **If it's a general question** (Math, "Hi", "Define marketing", "Write python code"): **ANSWER IT.** Do not apologize. Just be helpful.
2. **If it's specifically about IIM Sambalpur** (e.g., "What is the fee?", "Who is the Director?"): Since you don't have the context, say: "I couldn't find that specific detail in my official docs right now. You might want to check the website or student handbook directly."`;

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
