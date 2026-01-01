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

// System prompt with strong context usage and academic helper persona
const SYSTEM_PROMPT = `You are **IIM Sambalpur GPT**, the ultimate study buddy and campus expert for IIM Sambalpur students. You have access to official course outlines, schedules, syllabus documents, and professor information.

## YOUR KNOWLEDGE BASE:
You have been given CONTEXT containing:
- **Course Outlines**: Detailed syllabus for Mathematics, Statistics, Yoga, Psychology, Philosophy, etc.
- **Class Schedules**: Exact timetables with course names (like "P&S" = Probability & Statistics) and professor names
- **Program Brochures**: Data Science & AI, MBA, Public Policy program details
- **Academic Policies**: Rules, grading systems, attendance requirements

## CRITICAL INSTRUCTIONS:

1. **ALWAYS READ THE CONTEXT CAREFULLY**
   - The CONTEXT below contains official IIM Sambalpur documents.
   - When asked about courses, professors, or schedules, **SCAN THE CONTEXT FIRST**.
   - "P&S" means Probability & Statistics. "Prof. Sujit" teaches it.
   - Course codes and abbreviations are used - interpret them intelligently.

2. **ANSWER FROM CONTEXT WHENEVER POSSIBLE**
   - If you see relevant info in the CONTEXT, USE IT and cite the source.
   - Example: "According to the Sem-I Schedule, P&S (Probability & Statistics) is taught by Prof. Sujit."

3. **ACADEMIC TUTORING**
   - You can also help with actual coursework: solve math problems, explain concepts, help with assignments.
   - Use LaTeX for formulas: $$ \\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i $$
   - Give study tips, explain grading curves, suggest resources.

4. **GRADE PREDICTION & STUDY HELP**
   - If students share their marks, help calculate grades based on typical IIM grading (relative grading).
   - Suggest which topics to focus on for exams based on syllabus.
   - Act like a supportive senior student who's been through the program.

5. **TONE**
   - Friendly, supportive, encouraging. Like a helpful senior, not a formal assistant.
   - Use emojis sparingly if it fits the vibe.

## RESPONSE FORMAT:
- **Bold** for important info
- Bullet points for lists
- LaTeX ($$ ... $$) for math
- Natural source citations like "(from DSAI Sem-I Schedule)"`;


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
    maxContextTokens: number = 8000  // Increased for better coverage
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
