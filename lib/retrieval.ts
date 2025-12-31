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
 * Retrieve relevant chunks using vector similarity (Supabase pgvector)
 */
export async function retrieveChunks(
    query: string,
    topK: number = 5
): Promise<RetrievedChunk[]> {
    const supabase = getSupabaseClient();

    try {
        // Try vector search first
        const embedding = await generateQueryEmbedding(query);

        if (embedding.length > 0) {
            // Use pgvector similarity search
            const { data, error } = await supabase.rpc('match_documents', {
                query_embedding: embedding,
                match_threshold: 0.5,
                match_count: topK,
            });

            if (error) throw error;

            return data.map((row: any) => ({
                chunk_id: row.id,
                source_url: row.source_url,
                page_title: row.page_title,
                text: row.content,
                similarity: row.similarity,
            }));
        }

        // Fallback: Full-text search using Supabase's text search
        const { data, error } = await supabase
            .from('chunks')
            .select('id, source_url, page_title, content')
            .textSearch('content', query.split(' ').join(' | '), {
                type: 'websearch',
                config: 'english',
            })
            .limit(topK);

        if (error) throw error;

        return (data || []).map((row: any, index: number) => ({
            chunk_id: row.id,
            source_url: row.source_url,
            page_title: row.page_title,
            text: row.content,
            similarity: (topK - index) / topK, // Approximate similarity from order
        }));

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
