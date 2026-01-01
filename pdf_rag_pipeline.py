"""
IIM Sambalpur PDF Crawler & RAG Pipeline
=========================================

A comprehensive pipeline that:
1. Respects robots.txt and crawls ONLY publicly accessible pages
2. Discovers and downloads ALL publicly available PDF files
3. Extracts clean plain text from each PDF
4. Splits text into semantic chunks (300-400 words)
5. Generates embeddings for each chunk
6. Stores chunks + embeddings in Supabase pgvector

Run: python pdf_rag_pipeline.py
"""

import os
import re
import json
import hashlib
import asyncio
import aiohttp
import aiofiles
from datetime import datetime
from urllib.parse import urljoin, urlparse, unquote
from urllib.robotparser import RobotFileParser
from pathlib import Path
from typing import List, Dict, Set, Optional
from dataclasses import dataclass, asdict
from collections import deque

# PDF extraction
try:
    from pdfminer.high_level import extract_text as pdfminer_extract
    from pdfminer.pdfparser import PDFSyntaxError
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("⚠️  Install pdfminer.six: pip install pdfminer.six")

# Supabase
try:
    from supabase import create_client, Client
    SUPABASE_SUPPORT = True
except ImportError:
    SUPABASE_SUPPORT = False
    print("⚠️  Install supabase: pip install supabase")


# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_URL = "https://iimsambalpur.ac.in"
ALLOWED_DOMAINS = [
    "iimsambalpur.ac.in",
    "www.iimsambalpur.ac.in",
]
PDF_DIR = Path("downloaded_pdfs")
OUTPUT_DIR = Path("pdf_chunks")
USER_AGENT = "IIMSambalpurGPT-Crawler/1.0 (+https://iimsambalpur.ac.in; educational-use)"

# Chunk configuration
MIN_CHUNK_WORDS = 300
MAX_CHUNK_WORDS = 400
OVERLAP_WORDS = 50

# Rate limiting
REQUEST_DELAY = 1.0  # seconds between requests
MAX_CONCURRENT = 3


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class PDFMetadata:
    """Metadata for a downloaded PDF."""
    url: str
    filename: str
    local_path: str
    download_time: str
    file_size: int
    category: str  # mba, policy, admission, notice, etc.


@dataclass
class TextChunk:
    """A semantic chunk of text ready for embedding."""
    chunk_id: str
    source_url: str
    source_filename: str
    page_title: str
    text: str
    word_count: int
    category: str
    tags: List[str]


# ============================================================================
# ROBOTS.TXT CHECKER
# ============================================================================

class RobotsChecker:
    """Respects robots.txt for crawling."""
    
    def __init__(self):
        self.parsers: Dict[str, RobotFileParser] = {}
    
    async def fetch_robots(self, session: aiohttp.ClientSession, base_url: str) -> RobotFileParser:
        """Fetch and parse robots.txt for a domain."""
        robots_url = urljoin(base_url, "/robots.txt")
        rp = RobotFileParser()
        
        try:
            async with session.get(robots_url, timeout=10) as response:
                if response.status == 200:
                    content = await response.text()
                    rp.parse(content.splitlines())
                    print(f"✓ Loaded robots.txt from {robots_url}")
                else:
                    # No robots.txt = everything allowed
                    rp.parse([])
                    print(f"! No robots.txt at {robots_url} (status {response.status})")
        except Exception as e:
            rp.parse([])
            print(f"! Could not fetch robots.txt: {e}")
        
        return rp
    
    async def can_fetch(self, session: aiohttp.ClientSession, url: str) -> bool:
        """Check if we're allowed to fetch this URL."""
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        
        if base not in self.parsers:
            self.parsers[base] = await self.fetch_robots(session, base)
        
        return self.parsers[base].can_fetch(USER_AGENT, url)


# ============================================================================
# PDF CRAWLER
# ============================================================================

class PDFCrawler:
    """Crawls iimsambalpur.ac.in and discovers all PDF files."""
    
    def __init__(self):
        self.visited_urls: Set[str] = set()
        self.pdf_urls: Set[str] = set()
        self.queue: deque = deque()
        self.robots = RobotsChecker()
        self.session: Optional[aiohttp.ClientSession] = None
        
        # Ensure directories exist
        PDF_DIR.mkdir(exist_ok=True)
        OUTPUT_DIR.mkdir(exist_ok=True)
    
    def is_allowed_domain(self, url: str) -> bool:
        """Check if URL is from allowed domain."""
        try:
            parsed = urlparse(url)
            return any(parsed.netloc.endswith(d) for d in ALLOWED_DOMAINS)
        except:
            return False
    
    def is_pdf_url(self, url: str) -> bool:
        """Check if URL points to a PDF."""
        return url.lower().endswith('.pdf')
    
    def categorize_pdf(self, url: str, filename: str) -> str:
        """Categorize PDF based on URL/filename."""
        content = (url + " " + filename).lower()
        
        if any(k in content for k in ['mba-manual', 'mba_manual', 'manual']):
            return 'mba_manual'
        elif any(k in content for k in ['data-science', 'data_science', 'dsai', 'ds&ai']):
            return 'data_science'
        elif any(k in content for k in ['public-policy', 'public_policy', 'policy']):
            return 'public_policy'
        elif any(k in content for k in ['executive-mba', 'executive_mba', 'exec-mba']):
            return 'executive_mba'
        elif any(k in content for k in ['admission', 'apply', 'application']):
            return 'admission'
        elif any(k in content for k in ['fee', 'structure', 'payment']):
            return 'fees'
        elif any(k in content for k in ['tender', 'notice', 'corrigendum']):
            return 'notice'
        elif any(k in content for k in ['placement', 'recruit']):
            return 'placement'
        elif any(k in content for k in ['annual-report', 'annual_report']):
            return 'annual_report'
        elif any(k in content for k in ['curriculum', 'syllabus', 'course']):
            return 'curriculum'
        elif any(k in content for k in ['brochure']):
            return 'brochure'
        elif any(k in content for k in ['act', 'rule', 'regulation']):
            return 'rules'
        else:
            return 'general'
    
    def normalize_url(self, url: str) -> str:
        """Normalize URL for deduplication."""
        url = url.split('#')[0]  # Remove fragment
        url = url.rstrip('/')
        return url
    
    async def extract_links(self, html: str, base_url: str) -> List[str]:
        """Extract all links from HTML."""
        links = []
        
        # Find href attributes
        href_pattern = r'href=["\']([^"\']+)["\']'
        for match in re.finditer(href_pattern, html, re.IGNORECASE):
            href = match.group(1)
            if href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
                continue
            
            full_url = urljoin(base_url, href)
            full_url = self.normalize_url(full_url)
            
            if self.is_allowed_domain(full_url):
                links.append(full_url)
        
        return links
    
    async def crawl_page(self, url: str) -> List[str]:
        """Crawl a single page and extract links."""
        if url in self.visited_urls:
            return []
        
        self.visited_urls.add(url)
        
        # Check robots.txt
        if not await self.robots.can_fetch(self.session, url):
            print(f"  🚫 Blocked by robots.txt: {url}")
            return []
        
        try:
            async with self.session.get(url, timeout=30) as response:
                if response.status != 200:
                    return []
                
                content_type = response.headers.get('Content-Type', '')
                
                # If it's a PDF, add to PDF list
                if 'application/pdf' in content_type or self.is_pdf_url(url):
                    self.pdf_urls.add(url)
                    print(f"  📄 Found PDF: {url}")
                    return []
                
                # If it's HTML, extract links
                if 'text/html' in content_type:
                    html = await response.text()
                    return await self.extract_links(html, url)
                
                return []
        
        except Exception as e:
            print(f"  ❌ Error crawling {url}: {e}")
            return []
    
    async def run_crawler(self, max_pages: int = 500) -> Set[str]:
        """Run the crawler to discover PDFs."""
        print("\n" + "=" * 60)
        print("🕷️  IIM Sambalpur PDF Crawler")
        print("=" * 60)
        
        headers = {"User-Agent": USER_AGENT}
        connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT, ssl=False)
        
        async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
            self.session = session
            
            # Start with homepage
            self.queue.append(BASE_URL)
            
            # Add known PDF-heavy pages
            seed_urls = [
                f"{BASE_URL}/tender-notices",
                f"{BASE_URL}/annual-reports",
                f"{BASE_URL}/admissions",
                f"{BASE_URL}/mba",
                f"{BASE_URL}/executive-mba",
                f"{BASE_URL}/bs-data-science-ai",
                f"{BASE_URL}/bs-management-public-policy",
                f"{BASE_URL}/phd",
                f"{BASE_URL}/placements",
                f"{BASE_URL}/iim-act-and-rules",
                f"{BASE_URL}/rti",
            ]
            
            for url in seed_urls:
                self.queue.append(url)
            
            pages_crawled = 0
            
            while self.queue and pages_crawled < max_pages:
                url = self.queue.popleft()
                
                if url in self.visited_urls:
                    continue
                
                print(f"[{pages_crawled + 1}/{max_pages}] Crawling: {url[:80]}...")
                
                new_links = await self.crawl_page(url)
                
                for link in new_links:
                    if link not in self.visited_urls:
                        self.queue.append(link)
                
                pages_crawled += 1
                await asyncio.sleep(REQUEST_DELAY)
        
        print(f"\n✅ Crawl complete! Found {len(self.pdf_urls)} PDFs")
        return self.pdf_urls
    
    async def download_pdfs(self, pdf_urls: Set[str]) -> List[PDFMetadata]:
        """Download all discovered PDFs."""
        print("\n" + "=" * 60)
        print("📥 Downloading PDFs")
        print("=" * 60)
        
        metadata_list = []
        headers = {"User-Agent": USER_AGENT}
        connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT, ssl=False)
        
        async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
            for i, url in enumerate(pdf_urls, 1):
                try:
                    # Generate filename
                    parsed = urlparse(url)
                    original_name = unquote(parsed.path.split('/')[-1])
                    safe_name = re.sub(r'[^\w\-_.]', '_', original_name)
                    
                    # Add hash to avoid collisions
                    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
                    filename = f"{url_hash}_{safe_name}"
                    local_path = PDF_DIR / filename
                    
                    # Skip if already downloaded
                    if local_path.exists():
                        print(f"[{i}/{len(pdf_urls)}] ⏭️  Already exists: {filename[:50]}")
                        metadata_list.append(PDFMetadata(
                            url=url,
                            filename=filename,
                            local_path=str(local_path),
                            download_time=datetime.now().isoformat(),
                            file_size=local_path.stat().st_size,
                            category=self.categorize_pdf(url, filename)
                        ))
                        continue
                    
                    print(f"[{i}/{len(pdf_urls)}] Downloading: {filename[:50]}...")
                    
                    async with session.get(url, timeout=60) as response:
                        if response.status == 200:
                            content = await response.read()
                            
                            async with aiofiles.open(local_path, 'wb') as f:
                                await f.write(content)
                            
                            metadata_list.append(PDFMetadata(
                                url=url,
                                filename=filename,
                                local_path=str(local_path),
                                download_time=datetime.now().isoformat(),
                                file_size=len(content),
                                category=self.categorize_pdf(url, filename)
                            ))
                            print(f"  ✅ Downloaded ({len(content) / 1024:.1f} KB)")
                        else:
                            print(f"  ❌ Failed (status {response.status})")
                    
                    await asyncio.sleep(REQUEST_DELAY)
                
                except Exception as e:
                    print(f"  ❌ Error downloading {url}: {e}")
        
        # Save metadata
        metadata_path = PDF_DIR / "metadata.json"
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump([asdict(m) for m in metadata_list], f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Downloaded {len(metadata_list)} PDFs to {PDF_DIR}")
        return metadata_list


# ============================================================================
# PDF TEXT EXTRACTION
# ============================================================================

class PDFTextExtractor:
    """Extracts clean text from PDFs."""
    
    def clean_text(self, text: str) -> str:
        """Clean extracted text by removing artifacts."""
        if not text:
            return ""
        
        # Remove common headers/footers
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            
            # Skip likely headers/footers
            if re.match(r'^Page\s*\d+', line, re.IGNORECASE):
                continue
            if re.match(r'^\d+\s*$', line):  # Just a page number
                continue
            if re.match(r'^IIM\s*Sambalpur\s*$', line, re.IGNORECASE):
                continue
            if re.match(r'^www\.iimsambalpur\.ac\.in\s*$', line, re.IGNORECASE):
                continue
            
            cleaned_lines.append(line)
        
        text = '\n'.join(cleaned_lines)
        
        # Fix common OCR/extraction issues
        text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)  # Max 2 newlines
        text = re.sub(r'[^\x00-\x7F\u0900-\u097F]+', ' ', text)  # Keep ASCII + Devanagari
        text = text.strip()
        
        return text
    
    def extract_from_pdf(self, pdf_path: str) -> Optional[str]:
        """Extract text from a PDF file."""
        if not PDF_SUPPORT:
            print("❌ pdfminer.six not installed!")
            return None
        
        try:
            raw_text = pdfminer_extract(pdf_path)
            cleaned = self.clean_text(raw_text)
            return cleaned if len(cleaned) > 100 else None
        except PDFSyntaxError:
            print(f"  ⚠️  Corrupted PDF: {pdf_path}")
            return None
        except Exception as e:
            print(f"  ❌ Extraction error: {e}")
            return None
    
    def process_all_pdfs(self, metadata_list: List[PDFMetadata]) -> Dict[str, str]:
        """Extract text from all downloaded PDFs."""
        print("\n" + "=" * 60)
        print("📝 Extracting Text from PDFs")
        print("=" * 60)
        
        extracted: Dict[str, str] = {}
        
        for i, meta in enumerate(metadata_list, 1):
            print(f"[{i}/{len(metadata_list)}] Extracting: {meta.filename[:50]}...")
            
            text = self.extract_from_pdf(meta.local_path)
            
            if text:
                extracted[meta.url] = text
                word_count = len(text.split())
                print(f"  ✅ Extracted {word_count:,} words")
            else:
                print(f"  ⏭️  No text extracted (possibly scanned)")
        
        print(f"\n✅ Extracted text from {len(extracted)}/{len(metadata_list)} PDFs")
        return extracted


# ============================================================================
# SEMANTIC CHUNKING
# ============================================================================

class SemanticChunker:
    """Splits text into semantic chunks for RAG."""
    
    def generate_tags(self, text: str, category: str) -> List[str]:
        """Generate relevant tags for a chunk."""
        tags = [category]
        content = text.lower()
        
        tag_patterns = [
            ('MBA', ['mba ', 'master of business']),
            ('Data Science', ['data science', 'machine learning', 'artificial intelligence']),
            ('Public Policy', ['public policy', 'governance', 'administration']),
            ('Admission', ['admission', 'eligibility', 'apply']),
            ('Curriculum', ['curriculum', 'course', 'syllabus', 'module']),
            ('Placement', ['placement', 'recruiter', 'salary', 'package']),
            ('Fee', ['fee', 'tuition', 'payment']),
            ('Faculty', ['professor', 'faculty', 'dr.']),
        ]
        
        for tag, patterns in tag_patterns:
            if any(p in content for p in patterns):
                tags.append(tag)
        
        return list(set(tags))[:8]
    
    def chunk_text(self, text: str, source_url: str, filename: str, category: str) -> List[TextChunk]:
        """Split text into semantic chunks."""
        chunks = []
        words = text.split()
        total_words = len(words)
        
        if total_words < MIN_CHUNK_WORDS:
            # Text too short, make it one chunk
            chunk_id = hashlib.md5(f"{source_url}_0".encode()).hexdigest()
            chunks.append(TextChunk(
                chunk_id=chunk_id,
                source_url=source_url,
                source_filename=filename,
                page_title=filename.replace('.pdf', '').replace('_', ' '),
                text=text,
                word_count=total_words,
                category=category,
                tags=self.generate_tags(text, category)
            ))
            return chunks
        
        # Split into overlapping chunks
        start = 0
        chunk_num = 0
        
        while start < total_words:
            end = min(start + MAX_CHUNK_WORDS, total_words)
            chunk_words = words[start:end]
            chunk_text = ' '.join(chunk_words)
            
            chunk_id = hashlib.md5(f"{source_url}_{chunk_num}".encode()).hexdigest()
            
            chunks.append(TextChunk(
                chunk_id=chunk_id,
                source_url=source_url,
                source_filename=filename,
                page_title=filename.replace('.pdf', '').replace('_', ' '),
                text=chunk_text,
                word_count=len(chunk_words),
                category=category,
                tags=self.generate_tags(chunk_text, category)
            ))
            
            # Move to next chunk with overlap
            start = end - OVERLAP_WORDS if end < total_words else total_words
            chunk_num += 1
        
        return chunks
    
    def process_all_texts(self, extracted_texts: Dict[str, str], metadata_list: List[PDFMetadata]) -> List[TextChunk]:
        """Chunk all extracted texts."""
        print("\n" + "=" * 60)
        print("✂️  Creating Semantic Chunks")
        print("=" * 60)
        
        all_chunks: List[TextChunk] = []
        
        # Create URL -> metadata lookup
        url_to_meta = {m.url: m for m in metadata_list}
        
        for url, text in extracted_texts.items():
            meta = url_to_meta.get(url)
            if not meta:
                continue
            
            chunks = self.chunk_text(text, url, meta.filename, meta.category)
            all_chunks.extend(chunks)
            print(f"  Created {len(chunks)} chunks from {meta.filename[:40]}...")
        
        print(f"\n✅ Created {len(all_chunks)} total chunks")
        
        # Save chunks to file
        chunks_path = OUTPUT_DIR / "pdf_chunks.json"
        with open(chunks_path, 'w', encoding='utf-8') as f:
            json.dump([asdict(c) for c in all_chunks], f, indent=2, ensure_ascii=False)
        
        print(f"💾 Saved to {chunks_path}")
        return all_chunks


# ============================================================================
# SUPABASE UPLOADER WITH EMBEDDINGS
# ============================================================================

class SupabaseUploader:
    """Uploads chunks with embeddings to Supabase pgvector."""
    
    def __init__(self):
        self.supabase: Optional[Client] = None
        self.vocabulary: Dict[str, int] = {}
        self.embedding_dim = 384
    
    def connect(self):
        """Connect to Supabase."""
        url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not url or not key:
            print("❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
            return False
        
        self.supabase = create_client(url, key)
        print(f"✅ Connected to Supabase: {url}")
        return True
    
    def build_vocabulary(self, chunks: List[TextChunk]):
        """Build vocabulary for TF-IDF embeddings."""
        print("Building vocabulary...")
        word_counts: Dict[str, int] = {}
        
        for chunk in chunks:
            words = chunk.text.lower().split()
            for word in words:
                word = re.sub(r'[^\w]', '', word)
                if len(word) > 2:
                    word_counts[word] = word_counts.get(word, 0) + 1
        
        # Take top N words as vocabulary
        sorted_words = sorted(word_counts.items(), key=lambda x: -x[1])
        self.vocabulary = {w: i for i, (w, _) in enumerate(sorted_words[:self.embedding_dim])}
        print(f"  Vocabulary size: {len(self.vocabulary)}")
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate a simple TF-IDF-style embedding."""
        embedding = [0.0] * self.embedding_dim
        words = text.lower().split()
        word_count = len(words)
        
        if word_count == 0:
            return embedding
        
        for word in words:
            word = re.sub(r'[^\w]', '', word)
            if word in self.vocabulary:
                idx = self.vocabulary[word]
                embedding[idx] += 1.0 / word_count
        
        # Normalize
        magnitude = sum(x * x for x in embedding) ** 0.5
        if magnitude > 0:
            embedding = [x / magnitude for x in embedding]
        
        return embedding
    
    def upload_chunks(self, chunks: List[TextChunk], batch_size: int = 50):
        """Upload chunks with embeddings to Supabase."""
        print("\n" + "=" * 60)
        print("☁️  Uploading to Supabase pgvector")
        print("=" * 60)
        
        if not self.supabase:
            if not self.connect():
                return
        
        # Build vocabulary
        self.build_vocabulary(chunks)
        
        # Upload in batches
        total = len(chunks)
        success = 0
        failed = 0
        
        for i in range(0, total, batch_size):
            batch = chunks[i:i + batch_size]
            records = []
            
            for chunk in batch:
                embedding = self.generate_embedding(chunk.text)
                
                records.append({
                    'chunk_id': chunk.chunk_id,
                    'source_url': chunk.source_url,
                    'page_title': chunk.page_title,
                    'text': chunk.text,
                    'embedding': embedding,
                    'metadata': {
                        'category': chunk.category,
                        'tags': chunk.tags,
                        'word_count': chunk.word_count,
                        'source_filename': chunk.source_filename
                    }
                })
            
            try:
                self.supabase.table('chunks').upsert(records).execute()
                success += len(batch)
                print(f"Uploaded batch {i // batch_size + 1}/{(total + batch_size - 1) // batch_size} ({success}/{total})")
            except Exception as e:
                failed += len(batch)
                print(f"Batch {i // batch_size + 1} failed: {e}")
        
        print(f"\n✅ Upload Complete! Success: {success}, Failed: {failed}")


# ============================================================================
# MAIN PIPELINE
# ============================================================================

async def run_pipeline():
    """Run the complete PDF RAG pipeline."""
    print("\n" + "=" * 70)
    print("🚀 IIM SAMBALPUR PDF RAG PIPELINE")
    print("=" * 70)
    print(f"Start Time: {datetime.now().isoformat()}")
    print(f"Base URL: {BASE_URL}")
    print(f"PDF Directory: {PDF_DIR}")
    print(f"Chunk Output: {OUTPUT_DIR}")
    print("=" * 70)
    
    # Step 1: Crawl and discover PDFs
    crawler = PDFCrawler()
    pdf_urls = await crawler.run_crawler(max_pages=500)
    
    if not pdf_urls:
        print("❌ No PDFs found!")
        return
    
    # Step 2: Download PDFs
    metadata_list = await crawler.download_pdfs(pdf_urls)
    
    # Step 3: Extract text
    extractor = PDFTextExtractor()
    extracted_texts = extractor.process_all_pdfs(metadata_list)
    
    if not extracted_texts:
        print("❌ No text extracted from PDFs!")
        return
    
    # Step 4: Create semantic chunks
    chunker = SemanticChunker()
    chunks = chunker.process_all_texts(extracted_texts, metadata_list)
    
    # Step 5: Upload to Supabase
    uploader = SupabaseUploader()
    uploader.upload_chunks(chunks)
    
    print("\n" + "=" * 70)
    print("✅ PIPELINE COMPLETE!")
    print("=" * 70)
    print(f"PDFs Discovered: {len(pdf_urls)}")
    print(f"PDFs Downloaded: {len(metadata_list)}")
    print(f"Texts Extracted: {len(extracted_texts)}")
    print(f"Chunks Created: {len(chunks)}")
    print(f"End Time: {datetime.now().isoformat()}")
    print("=" * 70)


if __name__ == "__main__":
    # Check dependencies
    if not PDF_SUPPORT:
        print("Install required packages: pip install pdfminer.six aiohttp aiofiles supabase")
        exit(1)
    
    asyncio.run(run_pipeline())
