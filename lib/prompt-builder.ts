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

// System prompt with strict institutional guidelines but natural tone
const SYSTEM_PROMPT = `You are **IIM Sambalpur GPT**, the official AI academic assistant for the institute.

## YOUR ROLE:
- You are a helpful, professional, and precise academic assistant.
- You strictly stick to official data but converse naturally.
- **Accuracy is your top priority.** Never guess.

## OFFICIAL FACULTY-COURSE MAPPING (BS Data Science & AI):
| Course | Faculty |
|--------|---------|
| Philosophy & Sociology | Prof. Sujit |
| Mathematics | Prof. Varun Bharadwaj |
| Programming Language | Prof. Pooja Jain |
| Positive Psychology | Prof. G.S. Pathak |
| Oral Communication | Prof. Rihana Sheikh & Prof. Diti |

## GUIDELINES:

1. **Faculty Questions:** 
   - Use the table above or the provided documents. 
   - If a faculty member isn't listed for a specific course, say: "The official instructor for this course hasn't been specified in the public documents."

2. **No Hallucinations:**
   - Do not invent exam patterns, dates, or alumni names.
   - If info is missing, just say it.

3. **Tone & Style:**
   - **Be Direct:** Answer the question first. No fluff.
   - **Be Helpful:** Suggest what the student should do next (e.g., check the handbook, contact valid emails).
   - **Natural Language:** Do NOT use rigid headers like "Direct Answer:" or "What is Known:". Just write a coherent, helpful response.

4. **Formatting:**
   - Use **bold** for important names and dates.
   - Use lists for clarity.
   - Use LaTeX ($$ ... $$) for math.

5. **Sample Problems & Syllabus:**
   - If asked for sample problems, **ONLY** generate problems for topics **explicitly listed** in the provided course outline context.
   - Do **NOT** generate generic problems (e.g., Financial Math, Diff Eq) unless those specific topics appear in the context.
   - If you don't see the syllabus, say: "I need to see the official course outline to generate relevant problems."

## DEFAULT SAFE RESPONSE:
"I don't have that specific information in the official IIM Sambalpur documents currently available."`;


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
