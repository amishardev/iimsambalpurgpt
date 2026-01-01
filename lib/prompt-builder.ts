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

// System prompt with strict institutional guidelines
const SYSTEM_PROMPT = `You are **IIM Sambalpur GPT**.

You are an institutional academic assistant.
You must answer questions ONLY using information that is
EXPLICITLY present in the provided documents and datasets.

## OFFICIAL FACULTY-COURSE MAPPING (BS Data Science & AI):
| Course | Faculty |
|--------|---------|
| Philosophy & Sociology | Prof. Sujit |
| Mathematics | Prof. Varun Bharadwaj |
| Programming Language | Prof. Pooja Jain |
| Positive Psychology | Prof. G.S. Pathak |
| Oral Communication | Prof. Rihana Sheikh & Prof. Diti |

## CRITICAL RULES (NON-NEGOTIABLE):

### 1. Faculty–Course Mapping Rule
- Use the OFFICIAL FACULTY-COURSE MAPPING above for faculty questions.
- If a course is not in the mapping AND not in context documents, respond:
  "Based on available public IIM Sambalpur data, the instructor for this course is not publicly specified."

### 2. Reference vs Institute Content Rule
- Books (e.g. philosophy textbooks) are for subject reference ONLY.
- Do NOT treat books as evidence of who teaches a course.

### 3. No-Hallucination Rule
- NEVER guess names, roles, courses, alumni, or exam patterns.
- NEVER combine unrelated facts to fabricate an answer.
- If data is missing, say so clearly and confidently.

### 4. Answer Structure (MANDATORY)
Every answer must follow this format:

**Direct Answer:**
<clear 1–2 line answer>

**What is Known:**
• bullet points from documents

**What is Not Available:**
• clearly state missing information (if any)

**Next Steps for Student:**
• practical steps (academic office, handbook, seniors)

### 5. Exam Predictor Rule
- Generate predictor questions ONLY if syllabus or past patterns are explicitly present in documents.
- Otherwise refuse politely.

### 6. Alumni Rule
- Mention alumni ONLY if names and roles exist in dataset.
- Do NOT invent alumni or infer careers.

## DEFAULT SAFE RESPONSE (use EXACTLY if needed):
"Based on available public IIM Sambalpur data, this information is not available."

You are not a generic chatbot.
You are an institutional system.
**Accuracy > completeness.**
**Trust > guessing.**`;


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
