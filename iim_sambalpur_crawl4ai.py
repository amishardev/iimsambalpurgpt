import asyncio
import os
import re
import hashlib
import json
import shutil
from urllib.parse import urljoin, urlparse
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.content_filter_strategy import PruningContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

# Configuration
BASE_URL = "https://iimsambalpur.ac.in/"
# We will generate this master file at the end
MASTER_OUTPUT_FILE = "iim_sambalpur_dataset_master.txt"
DATA_DIR = "scraped_data"
HTML_DIR = os.path.join(DATA_DIR, "html")
TXT_DIR = os.path.join(DATA_DIR, "txt")
MAX_PAGES = 3000
CONCURRENT_REQUESTS = 3

class RobustIIMScraper:
    def __init__(self):
        self.visited_urls = set()
        self.queue = asyncio.Queue()
        self.domain = "iimsambalpur.ac.in"
        
        # Setup directories
        os.makedirs(HTML_DIR, exist_ok=True)
        os.makedirs(TXT_DIR, exist_ok=True)
         
        # Load state logic omitted for simplicity, relying on file existence check
        
        if self.queue.empty() and not self.visited_urls:
             self.queue.put_nowait(BASE_URL)

    def get_url_hash(self, url):
        return hashlib.md5(url.encode('utf-8')).hexdigest()

    def is_valid_url(self, url):
        try:
            parsed = urlparse(url)
            # Allow subdomains like ihub.iimsambalpur.ac.in, alumni.iimsambalpur.ac.in
            return parsed.netloc.endswith(self.domain) and parsed.scheme in ['http', 'https']
        except:
            return False

    def is_skip_url(self, url):
        skip_patterns = [
            r'/login', r'/signin', r'/signup', r'/auth', r'/admin', r'/wp-admin',
            r'\.zip$', r'\.rar$', r'\.tar$', r'\.gz$', r'\.exe$', r'\.mp4$', r'\.mp3$'
        ]
        for pattern in skip_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True
        return False
        
    def detect_page_type(self, url, title, text):
        keywords = {
            'faculty': ['faculty', 'professor', 'academic staff'],
            'course': ['course', 'curriculum', 'program', 'mba'],
            'alumni': ['alumni', 'batch'],
            'notice': ['notice', 'announcement', 'news'],
        }
        content = (url + " " + title + " " + (text or "")).lower()
        for type_name, keys in keywords.items():
            if any(k in content for k in keys):
                return type_name
        return 'general'

    def extract_tags(self, text, title):
        if not text: return ""
        words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text + " " + title)
        common = {'IIM', 'Sambalpur', 'Management', 'Institute', 'The'}
        tags = [w for w in set(words) if w not in common and len(w) > 4]
        return ', '.join(tags[:10])

    async def process_batch(self, crawler, batch):
        # Filter out already downloaded files
        urls_to_crawl = []
        for url in batch:
            file_hash = self.get_url_hash(url)
            if os.path.exists(os.path.join(TXT_DIR, f"{file_hash}.txt")):
                self.visited_urls.add(url) 
                print(f"Skipping {url} (already scraped)")
                continue
            urls_to_crawl.append(url)
            
        if not urls_to_crawl:
            return

        run_config = CrawlerRunConfig(
            cache_mode=CacheMode.ENABLED,
            exclude_external_links=True,
            check_robots_txt=False,
            verbose=False
        )

        results = await crawler.arun_many(urls_to_crawl, config=run_config)

        for result in results:
            url = result.url
            file_hash = self.get_url_hash(url)
            
            if not result.success:
                print(f"Failed: {url} - {result.error_message}")
                continue

            # Save HTML 
            html_content = result.cleaned_html or result.html or ""
            with open(os.path.join(HTML_DIR, f"{file_hash}.html"), 'w', encoding='utf-8') as f:
                f.write(f"<!-- URL: {url} -->\n")
                f.write(html_content)

            # Process Text
            title = "Unknown"
            title_match = re.search(r'<title>(.*?)</title>', html_content, re.IGNORECASE)
            if title_match:
                title = title_match.group(1).strip()
            
            text_content = result.markdown.fit_markdown or result.markdown.raw_markdown or ""
            
            with open(os.path.join(TXT_DIR, f"{file_hash}.txt"), 'w', encoding='utf-8') as f:
                f.write("==================== SOURCE ====================\n")
                f.write(f"URL: {url}\n")
                f.write(f"PAGE_TITLE: {title}\n")
                f.write(f"SOURCE_TYPE: {self.detect_page_type(url, title, text_content)}\n")
                f.write(f"INSTITUTION: IIM Sambalpur\n")
                f.write(f"LAST_UPDATED: unknown\n\n")
                f.write("==================== TEXT ====================\n")
                f.write(text_content)
                f.write("\n\n")
                f.write("==================== METADATA ====================\n")
                f.write(f"TAGS: {self.extract_tags(text_content, title)}\n")
                f.write(f"CONFIDENCE_LEVEL: high\n")
                f.write("\n================================================\n\n")

            self.visited_urls.add(url)
            
            # Extract links for next batch
            for link in result.links.get('internal', []):
                href = link.get('href')
                if href:
                    full_url = urljoin(url, href)
                    full_url = full_url.split('#')[0].split('?')[0].rstrip('/')
                    if self.is_valid_url(full_url) and not self.is_skip_url(full_url):
                        if full_url not in self.visited_urls:
                             self.queue.put_nowait(full_url)
    
    def seed_from_file(self, filepath):
        print(f"Seeding URLs from {filepath}...")
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                # Extract all http/https URLs
                urls = re.findall(r'https?://[^\s<>")\]]+', content)
                
                count = 0
                for url in urls:
                    # Clean the URL
                    url = url.split('#')[0].split('?')[0].rstrip('/').rstrip('.')
                    if self.is_valid_url(url) and not self.is_skip_url(url):
                         self.queue.put_nowait(url)
                         count += 1
                print(f"Seeded {count} URLs from dataset.")
        except FileNotFoundError:
            print(f"Seed file {filepath} not found. Skipping.")

    async def main_loop(self):
        print(f"Starting Robust Scraper. Data dir: {DATA_DIR}")
        
        while not self.queue.empty() or len(self.visited_urls) < MAX_PAGES:
            try:
                browser_config = BrowserConfig(headless=True, verbose=False)
                async with AsyncWebCrawler(config=browser_config) as crawler:
                    while not self.queue.empty():
                        batch = []
                        while len(batch) < CONCURRENT_REQUESTS and not self.queue.empty():
                            batch.append(await self.queue.get())
                        
                        if not batch: break
                        
                        print(f"Processing batch of {len(batch)} URLs. Queue size: {self.queue.qsize()}")
                        await self.process_batch(crawler, batch)
                        
                        if len(self.visited_urls) >= MAX_PAGES:
                            print("Max pages reached.")
                            return

            except Exception as e:
                print(f"CRITICAL ERROR (Likely Browser Crash): {e}")
                print("Restarting Crawler Context in 5 seconds...")
                await asyncio.sleep(5)
                continue
                
    def combine_dataset(self):
        print(f"Combining all text files into {MASTER_OUTPUT_FILE}...")
        with open(MASTER_OUTPUT_FILE, 'w', encoding='utf-8') as master:
            files = os.listdir(TXT_DIR)
            for filename in files:
                if filename.endswith(".txt"):
                    filepath = os.path.join(TXT_DIR, filename)
                    with open(filepath, 'r', encoding='utf-8') as single:
                         master.write(single.read())
                         master.write("\n\n")
        print("Combination complete.")

if __name__ == "__main__":
    scraper = RobustIIMScraper()
    
    # SEED FROM EXISTING MASTER FILE IF IT EXISTS
    if os.path.exists(MASTER_OUTPUT_FILE):
        scraper.seed_from_file(MASTER_OUTPUT_FILE)
    
    try:
        asyncio.run(scraper.main_loop())
    except KeyboardInterrupt:
        print("Scraper stopped by user.")
    
    scraper.combine_dataset()
