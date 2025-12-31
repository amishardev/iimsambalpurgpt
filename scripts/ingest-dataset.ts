/**
 * Data Ingestion Script
 * 
 * Parses iim_sambalpur_text_only_master.txt and creates chunks for vector search.
 * Run with: npx tsx scripts/ingest-dataset.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const INPUT_FILE = path.join(process.cwd(), 'iim_sambalpur_text_only_master.txt');
const OUTPUT_DIR = path.join(process.cwd(), 'data');
const CHUNKS_FILE = path.join(OUTPUT_DIR, 'chunks.json');
const REPORT_FILE = path.join(OUTPUT_DIR, 'ingest_report.json');

// Chunk configuration
const MIN_CHUNK_WORDS = 100;
const MAX_CHUNK_WORDS = 400;
const OVERLAP_WORDS = 50;

interface SourceBlock {
    source_url: string;
    page_title: string;
    text_content: string;
    character_count: number;
}

interface Chunk {
    chunk_id: string;
    source_url: string;
    page_title: string;
    text: string;
    word_count: number;
    tags: string[];
}

interface IngestReport {
    total_sources: number;
    successful_sources: number;
    failed_sources: number;
    total_chunks: number;
    avg_chunk_words: number;
    top_sources: { url: string; chunks: number }[];
    timestamp: string;
}

/**
 * Parse the master dataset file into source blocks
 */
function parseDataset(content: string): SourceBlock[] {
    const blocks: SourceBlock[] = [];
    const sourceDelimiter = '==================== SOURCE ====================';
    const textDelimiter = '==================== TEXT CONTENT ====================';
    const metadataDelimiter = '==================== METADATA ====================';

    // Split by source delimiter
    const parts = content.split(sourceDelimiter);

    for (const part of parts) {
        if (!part.trim()) continue;

        try {
            // Extract source URL
            const urlMatch = part.match(/SOURCE_URL:\s*(.+)/);
            const titleMatch = part.match(/PAGE_TITLE:\s*(.+)/);
            const statusMatch = part.match(/FETCH_STATUS:\s*(.+)/);

            if (!urlMatch || statusMatch?.[1]?.trim() !== 'success') {
                continue;
            }

            const source_url = urlMatch[1].trim();
            const page_title = titleMatch?.[1]?.trim() || 'Unknown';

            // Extract text content
            const textStart = part.indexOf(textDelimiter);
            const metadataStart = part.indexOf(metadataDelimiter);

            if (textStart === -1 || metadataStart === -1) continue;

            const textContent = part
                .substring(textStart + textDelimiter.length, metadataStart)
                .trim();

            // Skip empty content
            if (!textContent || textContent.length < 50) continue;

            // Extract character count
            const charCountMatch = part.match(/CHARACTER_COUNT:\s*(\d+)/);
            const character_count = charCountMatch ? parseInt(charCountMatch[1]) : textContent.length;

            blocks.push({
                source_url,
                page_title,
                text_content: textContent,
                character_count,
            });
        } catch (error) {
            console.warn('Error parsing block:', error);
        }
    }

    return blocks;
}

/**
 * Generate tags from text content
 */
function generateTags(text: string, title: string): string[] {
    const tags: string[] = [];
    const lowerText = (text + ' ' + title).toLowerCase();

    // Program-related tags
    if (lowerText.includes('mba')) tags.push('mba');
    if (lowerText.includes('phd') || lowerText.includes('doctoral')) tags.push('phd');
    if (lowerText.includes('executive')) tags.push('executive');
    if (lowerText.includes('admission')) tags.push('admission');
    if (lowerText.includes('fee') || lowerText.includes('fees')) tags.push('fees');
    if (lowerText.includes('placement')) tags.push('placement');
    if (lowerText.includes('faculty')) tags.push('faculty');
    if (lowerText.includes('curriculum') || lowerText.includes('course')) tags.push('curriculum');
    if (lowerText.includes('library')) tags.push('library');
    if (lowerText.includes('infrastructure') || lowerText.includes('campus')) tags.push('campus');
    if (lowerText.includes('contact')) tags.push('contact');
    if (lowerText.includes('research')) tags.push('research');
    if (lowerText.includes('alumni')) tags.push('alumni');
    if (lowerText.includes('event') || lowerText.includes('workshop')) tags.push('events');
    if (lowerText.includes('scholarship')) tags.push('scholarship');

    return Array.from(new Set(tags));
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
    // Split on sentence endings, keeping the delimiter
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.filter(s => s.trim().length > 0);
}

/**
 * Chunk a source block into smaller pieces
 */
function chunkSourceBlock(block: SourceBlock): Chunk[] {
    const chunks: Chunk[] = [];
    const sentences = splitIntoSentences(block.text_content);

    if (sentences.length === 0) return chunks;

    let currentChunk: string[] = [];
    let currentWordCount = 0;

    for (const sentence of sentences) {
        const sentenceWords = sentence.split(/\s+/).length;

        // If adding this sentence would exceed max, save current chunk and start new
        if (currentWordCount + sentenceWords > MAX_CHUNK_WORDS && currentChunk.length > 0) {
            const chunkText = currentChunk.join(' ').trim();

            if (currentWordCount >= MIN_CHUNK_WORDS) {
                chunks.push({
                    chunk_id: uuidv4(),
                    source_url: block.source_url,
                    page_title: block.page_title,
                    text: chunkText,
                    word_count: currentWordCount,
                    tags: generateTags(chunkText, block.page_title),
                });
            }

            // Keep some overlap for context
            const overlapSentences = currentChunk.slice(-2);
            currentChunk = [...overlapSentences];
            currentWordCount = overlapSentences.join(' ').split(/\s+/).length;
        }

        currentChunk.push(sentence);
        currentWordCount += sentenceWords;
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        const chunkText = currentChunk.join(' ').trim();

        if (currentWordCount >= MIN_CHUNK_WORDS / 2) { // More lenient for last chunk
            chunks.push({
                chunk_id: uuidv4(),
                source_url: block.source_url,
                page_title: block.page_title,
                text: chunkText,
                word_count: currentWordCount,
                tags: generateTags(chunkText, block.page_title),
            });
        }
    }

    return chunks;
}

/**
 * Main ingestion function
 */
async function ingestDataset(): Promise<void> {
    console.log('🚀 Starting IIM Sambalpur GPT Data Ingestion...\n');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Read input file
    console.log(`📖 Reading dataset from: ${INPUT_FILE}`);
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('❌ Dataset file not found!');
        process.exit(1);
    }

    const content = fs.readFileSync(INPUT_FILE, 'utf-8');
    console.log(`   File size: ${(content.length / 1024 / 1024).toFixed(2)} MB`);

    // Parse source blocks
    console.log('\n📋 Parsing source blocks...');
    const sourceBlocks = parseDataset(content);
    console.log(`   Found ${sourceBlocks.length} valid source blocks`);

    // Chunk each source block
    console.log('\n✂️  Chunking source blocks...');
    const allChunks: Chunk[] = [];
    const sourceChunkCounts: Map<string, number> = new Map();

    for (const block of sourceBlocks) {
        const chunks = chunkSourceBlock(block);
        allChunks.push(...chunks);
        sourceChunkCounts.set(block.source_url, chunks.length);
    }

    console.log(`   Created ${allChunks.length} chunks`);

    // Calculate statistics
    const totalWords = allChunks.reduce((sum, c) => sum + c.word_count, 0);
    const avgWords = Math.round(totalWords / allChunks.length);

    // Get top sources by chunk count
    const topSources = Array.from(sourceChunkCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([url, chunks]) => ({ url, chunks }));

    // Create report
    const report: IngestReport = {
        total_sources: sourceBlocks.length,
        successful_sources: sourceBlocks.length,
        failed_sources: 0,
        total_chunks: allChunks.length,
        avg_chunk_words: avgWords,
        top_sources: topSources,
        timestamp: new Date().toISOString(),
    };

    // Save chunks
    console.log(`\n💾 Saving chunks to: ${CHUNKS_FILE}`);
    fs.writeFileSync(CHUNKS_FILE, JSON.stringify(allChunks, null, 2));

    // Save report
    console.log(`📊 Saving report to: ${REPORT_FILE}`);
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n✅ Ingestion Complete!');
    console.log('─'.repeat(50));
    console.log(`   Sources processed: ${report.total_sources}`);
    console.log(`   Chunks created:    ${report.total_chunks}`);
    console.log(`   Avg words/chunk:   ${report.avg_chunk_words}`);
    console.log('─'.repeat(50));
    console.log('\n📁 Output files:');
    console.log(`   - ${CHUNKS_FILE}`);
    console.log(`   - ${REPORT_FILE}`);
}

// Run the script
ingestDataset().catch(console.error);
