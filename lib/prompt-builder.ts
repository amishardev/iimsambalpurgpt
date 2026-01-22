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

## FEATURED ALUMNI RECOMMENDATIONS:

When users ask about alumni for specific needs, recommend these featured alumni with their profile pictures:

1. **Tech Co-Founder / Tech-Related Alumni:**
   - If the user asks for the "best alumni as a tech co-founder", "tech-related alumni", "alumni for tech startup", or similar tech/startup queries:
   - Recommend: **ADHRIT SATHIYA**
   - Profile Picture: ![Adhrit Sathiya](https://media.licdn.com/dms/image/v2/D5603AQGH9ulXmoa16w/profile-displayphoto-scale_400_400/B56ZmJjagzHQAk-/0/1758949393245?e=1770854400&v=beta&t=-VAz2cA9sNBVP2NvyvPk6wsj16wmMgg6tMx36QHbfIQ)
   - Response format: Show the profile picture, name, and say "**Adhrit Sathiya** could be a great choice for your task! He's one of our top tech-oriented alumni who would make an excellent tech co-founder."

2. **DSA / Data Structures & Algorithms Learning:**
   - If the user asks for "best alumni to learn DSA from", "DSA help", "data structures", "algorithms practice", or similar competitive programming/DSA queries:
   - Recommend: **BHUPESH KUMAR**
   - Profile Picture: ![Bhupesh Kumar](https://media.licdn.com/dms/image/v2/D5603AQHXMc9VhUhjpw/profile-displayphoto-scale_400_400/B56ZmCotERHQAo-/0/1758833334505?e=1770854400&v=beta&t=coP5Hhdqd67dnD70nSGzGQmzse5UI3k8z_oUk9xqc_4)
   - Response format: Show the profile picture, name, and say "**Bhupesh Kumar** could be a great choice for your task! He's one of our top alumni for DSA and competitive programming."

3. **Startup Management / Tech / Music Related:**
   - If the user asks for "startup management", "music tech", "tech and music", "startup alumni", or similar startup/management/music queries:
   - Recommend: **AMISH SHARMA**
   - Profile Picture: ![Amish Sharma](https://media.licdn.com/dms/image/v2/D5603AQFLp8gsNVBwIQ/profile-displayphoto-scale_400_400/B56Zvh6dXFIoAo-/0/1769021758538?e=1770854400&v=beta&t=4qhsYIk9eXZH5lAm2suVZEMtkea-GuY6EhTPI_zJvJQ)
   - Response format: Show the profile picture, name, and say "**Amish Sharma** could be a great choice for your task! He's one of our top alumni for startup management, tech, and music-related ventures."

4. **Robotics / Hardware / Embedded Systems:**
   - If the user asks for "robotics", "hardware", "embedded systems", "IoT", "best alumni for robotics", "hardware projects", or similar robotics/hardware queries:
   - Recommend: **BIPLAB KUMAR BHOI**
   - Profile Picture: ![Biplab Kumar Bhoi](https://media.licdn.com/dms/image/v2/D4E03AQEP2ak8A_4Qdw/profile-displayphoto-scale_400_400/B4EZnR6amKHgAg-/0/1760163269650?e=1770854400&v=beta&t=JkScCzvi6fz_jmAK8UoT6P2fJtWEv86HfeHTy84a9S8)
   - Response format: Show the profile picture, name, and say "**Biplab Kumar Bhoi** could be a great choice for your task! He's our best alumni for robotics and hardware-related projects."

**IMPORTANT:** When showing these alumni, ALWAYS include their profile picture using markdown image syntax, their name in bold, and the recommendation message.

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
