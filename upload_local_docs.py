"""
Upload Local Documents to Supabase

This script uploads the extracted local documents (from 'pdf and docs' folder)
to Supabase for RAG retrieval.
"""

import os
import re
import json
from pathlib import Path
from supabase import create_client

# Configuration
SCRAPED_DIR = Path("scraped_data/txt")
MIN_CHUNK_WORDS = 200
MAX_CHUNK_WORDS = 400
OVERLAP_WORDS = 50

def get_supabase_client():
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        raise ValueError("Missing Supabase credentials")
    return create_client(url, key)

def parse_extracted_file(filepath):
    """Parse the structured extracted file."""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Extract metadata
    url_match = re.search(r'URL:\s*(.+)', content)
    title_match = re.search(r'PAGE_TITLE:\s*(.+)', content)
    
    # Extract text between markers
    text_match = re.search(r'==================== TEXT ====================\n(.*?)\n==================== METADATA ====================', content, re.DOTALL)
    
    return {
        'source_url': url_match.group(1).strip() if url_match else 'local_document',
        'page_title': title_match.group(1).strip() if title_match else filepath.stem,
        'text': text_match.group(1).strip() if text_match else content
    }

def chunk_text(text, source_url, page_title):
    """Chunk text into ~300 word segments."""
    words = text.split()
    chunks = []
    start = 0
    chunk_num = 0
    
    while start < len(words):
        end = min(start + MAX_CHUNK_WORDS, len(words))
        chunk_words = words[start:end]
        chunk_text = ' '.join(chunk_words)
        
        if len(chunk_words) >= MIN_CHUNK_WORDS or start + len(chunk_words) >= len(words):
            chunks.append({
                'source_url': source_url,
                'page_title': f"{page_title} (Chunk {chunk_num + 1})",
                'content': chunk_text,
                'word_count': len(chunk_words),
                'tags': extract_tags(chunk_text)
            })
            chunk_num += 1
        
        start = end - OVERLAP_WORDS if end < len(words) else len(words)
    
    return chunks

def extract_tags(text):
    """Extract relevant tags from text."""
    text_lower = text.lower()
    tags = []
    
    tag_keywords = {
        'mathematics': ['mathematics', 'calculus', 'algebra', 'statistics', 'probability'],
        'data_science': ['data science', 'machine learning', 'deep learning', 'ai', 'artificial intelligence'],
        'course': ['course', 'syllabus', 'curriculum', 'module', 'outline'],
        'professor': ['professor', 'faculty', 'dr.', 'prof.'],
        'schedule': ['schedule', 'timetable', 'calendar', 'semester'],
        'yoga': ['yoga', 'meditation', 'mindfulness'],
        'psychology': ['psychology', 'positive psychology', 'behavioral'],
        'philosophy': ['philosophy', 'sociology', 'ethics']
    }
    
    for tag, keywords in tag_keywords.items():
        if any(kw in text_lower for kw in keywords):
            tags.append(tag)
    
    return tags[:5]

def main():
    print("=" * 60)
    print("Uploading Local Documents to Supabase")
    print("=" * 60)
    
    supabase = get_supabase_client()
    
    # Find document files (those starting with 'doc_')
    doc_files = list(SCRAPED_DIR.glob("doc_*.txt"))
    print(f"\nFound {len(doc_files)} extracted documents")
    
    all_chunks = []
    
    for filepath in doc_files:
        print(f"\nProcessing: {filepath.name}")
        
        try:
            doc = parse_extracted_file(filepath)
            if len(doc['text']) < 100:
                print(f"  ⏭️  Skipped (too short)")
                continue
            
            chunks = chunk_text(doc['text'], doc['source_url'], doc['page_title'])
            all_chunks.extend(chunks)
            print(f"  ✅ Created {len(chunks)} chunks")
            
        except Exception as e:
            print(f"  ❌ Error: {e}")
    
    print(f"\n{'=' * 60}")
    print(f"Total chunks to upload: {len(all_chunks)}")
    print(f"{'=' * 60}")
    
    # Upload in batches
    batch_size = 50
    success = 0
    failed = 0
    
    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i:i + batch_size]
        records = []
        
        for chunk in batch:
            # Sanitize content
            content = chunk['content'].encode('ascii', 'ignore').decode('ascii')
            records.append({
                'source_url': chunk['source_url'][:500],
                'page_title': chunk['page_title'][:200],
                'content': content[:10000],
                'word_count': chunk['word_count'],
                'tags': chunk['tags'],
                'embedding': [0.0] * 384  # Placeholder embedding
            })
        
        try:
            supabase.table('chunks').insert(records).execute()
            success += len(batch)
            print(f"Batch {i // batch_size + 1}: Uploaded {success} / {len(all_chunks)}")
        except Exception as e:
            failed += len(batch)
            print(f"Batch {i // batch_size + 1}: Failed - {str(e)[:80]}")
    
    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {success} succeeded, {failed} failed")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
