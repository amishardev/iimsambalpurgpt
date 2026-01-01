/**
 * Vector Retrieval using Supabase pgvector
 * 
 * Retrieves relevant chunks from the vector database
 * based on cosine similarity
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { RetrievedChunk } from './prompt-builder';

// Initialize Supabase client
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            throw new Error('Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        }

        supabaseClient = createClient(url, key);
    }
    return supabaseClient;
}

/**
 * Generate embedding for a text query using OpenRouter
 * Note: OpenRouter doesn't have a dedicated embedding endpoint,
 * so we'll use a simple TF-IDF based approach for now
 * or integrate with another embedding service
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
    // For MVP, we'll use keyword matching as fallback
    // In production, integrate with OpenAI embeddings or similar

    // Placeholder: Return null to trigger keyword search
    return [];
}

/**
 * Retrieve relevant chunks using keyword search (Supabase)
 */
export async function retrieveChunks(
    query: string,
    topK: number = 5
): Promise<RetrievedChunk[]> {
    const supabase = getSupabaseClient();

    try {
        // Synonym map for better matching
        const synonyms: Record<string, string[]> = {
            'statistics': ['statistics', 'stats', 'p&s', 'probability'],
            'mathematics': ['mathematics', 'math', 'maths', 'calculus', 'algebra'],
            'professor': ['professor', 'prof', 'faculty', 'teaches', 'instructor'],
            'syllabus': ['syllabus', 'curriculum', 'course', 'outline', 'topics'],
            'schedule': ['schedule', 'timetable', 'calendar', 'timing', 'class'],
            'data': ['data', 'dsai', 'ds&ai', 'datascience'],
            'science': ['science', 'dsai', 'ds&ai'],
            'semester': ['semester', 'sem', 'term', 'year'],
            'first': ['first', '1st', 'sem-i', 'semester-1', 'sem-1'],
            'yoga': ['yoga', 'meditation', 'mindfulness'],
            'psychology': ['psychology', 'positive', 'behavioral'],
        };

        // Extract meaningful keywords (min 3 chars, filter stopwords)
        const stopwords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'what', 'about', 'which', 'when', 'how', 'who', 'where', 'why', 'does', 'have', 'has', 'is', 'in', 'it', 'of', 'to', 'a', 'an', 'be', 'at', 'as', 'by', 'from', 'or', 'on', 'with', 'that', 'this']);
        let keywords = query
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length >= 3 && !stopwords.has(w))
            .slice(0, 5);

        // Expand keywords with synonyms
        const expandedKeywords = new Set<string>();
        for (const kw of keywords) {
            expandedKeywords.add(kw);
            // Check if this keyword is a key or appears in synonym values
            for (const [key, syns] of Object.entries(synonyms)) {
                if (kw === key || syns.includes(kw)) {
                    syns.forEach(s => expandedKeywords.add(s));
                }
            }
        }
        keywords = Array.from(expandedKeywords).slice(0, 10);

        if (keywords.length === 0) {
            console.log('[Retrieval] No meaningful keywords extracted');
            return [];
        }

        console.log('[Retrieval] Searching with expanded keywords:', keywords);

        // Build OR filter for ilike pattern matching
        const orFilters = keywords.map(k => `content.ilike.%${k}%,page_title.ilike.%${k}%`).join(',');

        const { data, error } = await supabase
            .from('chunks')
            .select('id, source_url, page_title, content')
            .or(orFilters)
            .limit(topK * 3); // Fetch more, then score and rank

        if (error) {
            console.error('[Retrieval] Supabase error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log('[Retrieval] No chunks found with keywords');
            return [];
        }

        // Score chunks by keyword match count
        const scoredChunks = data.map((row: any) => {
            const contentLower = (row.content || '').toLowerCase();
            const titleLower = (row.page_title || '').toLowerCase();
            let score = 0;

            for (const kw of keywords) {
                if (contentLower.includes(kw)) score += 1;
                if (titleLower.includes(kw)) score += 3; // Title matches are more relevant
            }

            return {
                chunk_id: row.id,
                source_url: row.source_url,
                page_title: row.page_title,
                text: row.content,
                similarity: score / (keywords.length * 4), // Normalize
            };
        });

        // Sort by score and return top-k
        return scoredChunks
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

    } catch (error) {
        console.error('[Retrieval] Error querying Supabase:', error);
        return [];
    }
}

/**
 * Retrieve chunks using local JSON file (fallback for demo/testing)
 */
export async function retrieveChunksLocal(
    query: string,
    topK: number = 5
): Promise<RetrievedChunk[]> {
    try {
        // Dynamic import of chunks data
        const fs = await import('fs/promises');
        const path = await import('path');

        const chunksPath = path.join(process.cwd(), 'data', 'chunks.json');
        const chunksData = await fs.readFile(chunksPath, 'utf-8');
        const chunks = JSON.parse(chunksData);

        // Simple keyword matching for demo
        const queryWords = query.toLowerCase().split(/\s+/);

        const scoredChunks = chunks.map((chunk: any) => {
            const text = chunk.text.toLowerCase();
            const title = (chunk.page_title || '').toLowerCase();

            let score = 0;
            for (const word of queryWords) {
                if (word.length < 3) continue;
                if (text.includes(word)) score += 1;
                if (title.includes(word)) score += 2; // Title matches weighted higher
            }

            return {
                ...chunk,
                similarity: score / queryWords.length,
            };
        });

        // Sort by score and return top-k
        return scoredChunks
            .filter((c: any) => c.similarity > 0)
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, topK);

    } catch (error) {
        console.error('[Retrieval] Error reading local chunks:', error);
        return [];
    }
}

/**
 * Main retrieval function - tries Supabase, falls back to local
 */
export async function retrieveRelevantChunks(
    query: string,
    topK: number = 5
): Promise<RetrievedChunk[]> {
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
        const chunks = await retrieveChunks(query, topK);
        if (chunks.length > 0) {
            return chunks;
        }
    }

    // Fall back to local JSON search
    return retrieveChunksLocal(query, topK);
}
