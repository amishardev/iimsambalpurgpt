/**
 * Upload Chunks to Supabase with Embeddings
 * 
 * This script:
 * 1. Reads chunks from data/chunks.json
 * 2. Generates embeddings using a simple TF-IDF approach
 * 3. Uploads to Supabase pgvector
 * 
 * Run with: npx tsx scripts/upload-to-supabase.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Configuration
const CHUNKS_FILE = path.join(process.cwd(), 'data', 'chunks.json');
const BATCH_SIZE = 50;
const EMBEDDING_DIM = 384;

// Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ykviqtxnbmvomqiihynk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface Chunk {
    chunk_id: string;
    source_url: string;
    page_title: string;
    text: string;
    word_count: number;
    tags: string[];
}

interface DbRecord {
    id: string;
    source_url: string;
    page_title: string;
    content: string;
    word_count: number;
    tags: string[];
    embedding: number[];
}

// Common stop words
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there'
]);

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Simple TF-IDF Embedder
 */
class SimpleEmbedder {
    private vocabulary: Map<string, number> = new Map();
    private idf: Map<string, number> = new Map();

    buildVocabulary(chunks: Chunk[]): void {
        console.log('Building vocabulary...');

        const docFreq: Map<string, number> = new Map();
        const allWords: string[] = [];

        // Count document frequencies
        for (const chunk of chunks) {
            const uniqueWords = Array.from(new Set(tokenize(chunk.text + ' ' + chunk.page_title)));
            for (const word of uniqueWords) {
                if (!allWords.includes(word)) allWords.push(word);
                docFreq.set(word, (docFreq.get(word) || 0) + 1);
            }
        }

        // Keep top words by frequency
        const wordFreqs = allWords
            .map(word => ({ word, freq: docFreq.get(word) || 0 }))
            .filter(w => w.freq >= 2)
            .sort((a, b) => b.freq - a.freq)
            .slice(0, EMBEDDING_DIM);

        // Build vocabulary and IDF
        wordFreqs.forEach(({ word, freq }, i) => {
            this.vocabulary.set(word, i);
            this.idf.set(word, Math.log(chunks.length / (1 + freq)));
        });

        console.log(`Vocabulary size: ${this.vocabulary.size}`);
    }

    embed(text: string): number[] {
        const embedding = new Array(EMBEDDING_DIM).fill(0);
        const tokens = tokenize(text);
        const termFreq: Map<string, number> = new Map();

        // Count term frequencies
        for (const token of tokens) {
            termFreq.set(token, (termFreq.get(token) || 0) + 1);
        }

        // Calculate TF-IDF
        termFreq.forEach((tf, word) => {
            const idx = this.vocabulary.get(word);
            if (idx !== undefined) {
                const idf = this.idf.get(word) || 0;
                embedding[idx] = (1 + Math.log(tf)) * idf;
            }
        });

        // L2 normalize
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        if (norm > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= norm;
            }
        }

        return embedding;
    }
}

/**
 * Upload chunks to Supabase
 */
async function uploadToSupabase(
    chunks: Chunk[],
    embedder: SimpleEmbedder
): Promise<{ success: number; failed: number }> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const records: DbRecord[] = batch.map(chunk => ({
            id: chunk.chunk_id,
            source_url: chunk.source_url,
            page_title: chunk.page_title,
            content: chunk.text,
            word_count: chunk.word_count,
            tags: chunk.tags,
            embedding: embedder.embed(chunk.text + ' ' + chunk.page_title),
        }));

        try {
            const { error } = await supabase
                .from('chunks')
                .upsert(records as any, { onConflict: 'id' });

            if (error) {
                console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
                failed += batch.length;
            } else {
                success += batch.length;
                console.log(`Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${success}/${chunks.length})`);
            }
        } catch (err) {
            console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, err);
            failed += batch.length;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { success, failed };
}

/**
 * Main
 */
async function main(): Promise<void> {
    console.log('🚀 Starting Supabase Upload with Embeddings...\n');

    if (!SUPABASE_KEY) {
        console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set!');
        console.log('\n📝 Please update your .env.local file with:');
        console.log('NEXT_PUBLIC_SUPABASE_URL=https://ykviqtxnbmvomqiihynk.supabase.co');
        console.log('SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
        console.log('\n⚠️  Note: You need the SERVICE ROLE key (not anon key).');
        console.log('Find it in: Supabase Dashboard > Settings > API > service_role');
        process.exit(1);
    }

    console.log(`📦 Supabase URL: ${SUPABASE_URL}`);

    // Read chunks
    console.log(`\n📖 Reading chunks from: ${CHUNKS_FILE}`);
    if (!fs.existsSync(CHUNKS_FILE)) {
        console.error('❌ Chunks file not found! Run `npm run ingest` first.');
        process.exit(1);
    }

    const chunks: Chunk[] = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf-8'));
    console.log(`   Found ${chunks.length} chunks`);

    // Generate embeddings
    console.log('\n🧮 Generating embeddings...');
    const embedder = new SimpleEmbedder();
    embedder.buildVocabulary(chunks);

    // Upload
    console.log('\n⬆️  Uploading to Supabase...');
    const result = await uploadToSupabase(chunks, embedder);

    // Summary
    console.log('\n✅ Upload Complete!');
    console.log('─'.repeat(50));
    console.log(`   Successful: ${result.success}`);
    console.log(`   Failed:     ${result.failed}`);
    console.log('─'.repeat(50));
}

main().catch(console.error);
