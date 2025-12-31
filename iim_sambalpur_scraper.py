import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
import time
import re
import json
from datetime import datetime
from collections import deque
import os

class IIMSambalpurScraper:
    def __init__(self, base_url="https://iimsambalpur.ac.in/", output_file="iim_sambalpur_dataset.txt", max_pages=500):
        self.base_url = base_url
        self.output_file = output_file
        self.max_pages = max_pages
        self.visited_urls = set()
        self.scraped_data = []
        self.domain = urlparse(base_url).netloc
        self.robot_parser = RobotFileParser()
        self.robot_parser.set_url(urljoin(base_url, "/robots.txt"))
        try:
            self.robot_parser.read()
        except:
            print("Warning: Could not read robots.txt")
        
        self.headers = {
            'User-Agent': 'IIM-Sambalpur-GPT-Bot/1.0 (Educational Purpose)'
        }
        
        self.skip_patterns = [
            r'/login', r'/signin', r'/signup', r'/register',
            r'/admin', r'/dashboard', r'/wp-admin',
            r'\.pdf$', r'\.doc$', r'\.docx$', r'\.xls$', r'\.xlsx$',
            r'\.zip$', r'\.rar$', r'\.tar$', r'\.gz$'
        ]
        
        self.type_keywords = {
            'faculty': ['faculty', 'professor', 'academic staff', 'teaching'],
            'course': ['course', 'curriculum', 'program', 'mba', 'pgp'],
            'syllabus': ['syllabus', 'course outline', 'curriculum'],
            'alumni': ['alumni', 'batch', 'placement'],
            'notice': ['notice', 'announcement', 'news', 'event'],
            'general': []
        }
        
    def can_fetch(self, url):
        try:
            return self.robot_parser.can_fetch("*", url)
        except:
            return True
    
    def should_skip_url(self, url):
        for pattern in self.skip_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True
        return False
    
    def is_valid_url(self, url):
        parsed = urlparse(url)
        return parsed.netloc == self.domain and parsed.scheme in ['http', 'https']
    
    def clean_text(self, text):
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
        text = text.strip()
        return text
    
    def remove_boilerplate(self, soup):
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript']):
            element.decompose()
        
        for element in soup.find_all(class_=re.compile(r'(menu|navigation|sidebar|ad|advertisement|banner|cookie)', re.IGNORECASE)):
            element.decompose()
        
        for element in soup.find_all(id=re.compile(r'(menu|navigation|sidebar|ad|advertisement|banner|cookie)', re.IGNORECASE)):
            element.decompose()
        
        return soup
    
    def detect_page_type(self, url, title, text):
        url_lower = url.lower()
        title_lower = title.lower()
        text_lower = text.lower()
        
        combined = f"{url_lower} {title_lower} {text_lower}"
        
        for page_type, keywords in self.type_keywords.items():
            if page_type == 'general':
                continue
            for keyword in keywords:
                if keyword in combined:
                    return page_type
        
        return 'general'
    
    def extract_tags(self, text, title):
        words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text + " " + title)
        common_words = {'The', 'Indian', 'Institute', 'Management', 'Sambalpur', 'IIM'}
        tags = [word for word in set(words) if word in common_words or len(word) > 4]
        return ', '.join(tags[:10])
    
    def get_image_context(self, soup, img_tag):
        context_parts = []
        
        parent = img_tag.find_parent(['p', 'div', 'section', 'article', 'figure'])
        if parent:
            text = parent.get_text(strip=True)
            if text and len(text) > 10:
                context_parts.append(text[:300])
        
        prev_sibling = img_tag.find_previous_sibling(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        if prev_sibling:
            text = prev_sibling.get_text(strip=True)
            if text and len(text) > 10:
                context_parts.append(text[:200])
        
        next_sibling = img_tag.find_next_sibling(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        if next_sibling:
            text = next_sibling.get_text(strip=True)
            if text and len(text) > 10:
                context_parts.append(text[:200])
        
        alt_text = img_tag.get('alt', '')
        if alt_text:
            context_parts.append(f"Image alt text: {alt_text}")
        
        title_text = img_tag.get('title', '')
        if title_text:
            context_parts.append(f"Image title: {title_text}")
        
        if context_parts:
            return " | ".join(context_parts)
        else:
            return "context not explicitly stated in page text"
    
    def get_image_inference(self, context, img_tag):
        if "context not explicitly stated" in context:
            return "context not explicitly stated in page text"
        
        alt_text = img_tag.get('alt', '').lower()
        context_lower = context.lower()
        
        hints = []
        if 'faculty' in context_lower or 'professor' in context_lower:
            hints.append("likely faculty member photo or academic-related image")
        elif 'student' in context_lower or 'batch' in context_lower:
            hints.append("likely student or batch-related image")
        elif 'campus' in context_lower or 'building' in context_lower:
            hints.append("likely campus or infrastructure image")
        elif 'event' in context_lower or 'ceremony' in context_lower:
            hints.append("likely event or ceremony image")
        
        if alt_text:
            hints.append(f"described as: {alt_text}")
        
        if hints:
            return " | ".join(hints)
        else:
            return "general institutional image based on surrounding context"
    
    def chunk_text(self, text, max_words=400):
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = []
        current_word_count = 0
        
        for para in paragraphs:
            para_words = len(para.split())
            
            if current_word_count + para_words > max_words and current_chunk:
                chunks.append('\n\n'.join(current_chunk))
                current_chunk = [para]
                current_word_count = para_words
            else:
                current_chunk.append(para)
                current_word_count += para_words
        
        if current_chunk:
            chunks.append('\n\n'.join(current_chunk))
        
        return chunks
    
    def extract_page_data(self, url):
        if not self.can_fetch(url):
            print(f"Blocked by robots.txt: {url}")
            return None
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
        except Exception as e:
            print(f"Error fetching {url}: {str(e)}")
            return None
        
        soup = BeautifulSoup(response.content, 'html.parser')
        soup = self.remove_boilerplate(soup)
        
        title = soup.find('title')
        title = title.get_text(strip=True) if title else "Untitled"
        
        main_content = soup.find('main') or soup.find('article') or soup.find('div', class_=re.compile(r'content|main', re.IGNORECASE)) or soup.find('body')
        
        if not main_content:
            return None
        
        text_content = main_content.get_text(separator='\n', strip=True)
        text_content = self.clean_text(text_content)
        
        if len(text_content) < 100:
            return None
        
        page_type = self.detect_page_type(url, title, text_content)
        
        last_updated = soup.find('meta', property='article:modified_time')
        if not last_updated:
            last_updated = soup.find('time')
        last_updated = last_updated.get('content') or last_updated.get('datetime') if last_updated else "unknown"
        
        images = []
        for img in main_content.find_all('img'):
            img_url = img.get('src') or img.get('data-src')
            if not img_url:
                continue
            
            img_url = urljoin(url, img_url)
            
            if any(x in img_url.lower() for x in ['logo', 'icon', 'arrow', 'bullet', 'spacer']):
                continue
            
            context = self.get_image_context(soup, img)
            inference = self.get_image_inference(context, img)
            
            images.append({
                'url': img_url,
                'context': context,
                'inference': inference
            })
        
        tags = self.extract_tags(text_content, title)
        
        confidence = "high"
        if len(text_content) < 200:
            confidence = "low"
        elif len(text_content) < 500 or not images:
            confidence = "medium"
        
        text_chunks = self.chunk_text(text_content)
        
        return {
            'url': url,
            'title': title,
            'type': page_type,
            'last_updated': last_updated,
            'text_chunks': text_chunks,
            'images': images,
            'tags': tags,
            'confidence': confidence
        }
    
    def find_links(self, url):
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            links = set()
            for link in soup.find_all('a', href=True):
                href = link['href']
                full_url = urljoin(url, href)
                
                full_url = full_url.split('#')[0]
                full_url = full_url.rstrip('/')
                
                if self.is_valid_url(full_url) and not self.should_skip_url(full_url):
                    links.add(full_url)
            
            return links
        except Exception as e:
            print(f"Error finding links in {url}: {str(e)}")
            return set()
    
    def crawl(self):
        print(f"Starting crawl of {self.base_url}")
        print(f"Maximum pages to scrape: {self.max_pages}")
        
        queue = deque([self.base_url])
        page_count = 0
        
        while queue and page_count < self.max_pages:
            url = queue.popleft()
            
            if url in self.visited_urls:
                continue
            
            self.visited_urls.add(url)
            page_count += 1
            
            print(f"[{page_count}/{self.max_pages}] Scraping: {url}")
            
            page_data = self.extract_page_data(url)
            if page_data:
                self.scraped_data.append(page_data)
            
            new_links = self.find_links(url)
            for link in new_links:
                if link not in self.visited_urls:
                    queue.append(link)
            
            time.sleep(1)
        
        print(f"\nCrawl complete. Scraped {len(self.scraped_data)} pages.")
    
    def save_dataset(self):
        print(f"Saving dataset to {self.output_file}")
        
        with open(self.output_file, 'w', encoding='utf-8') as f:
            for page_data in self.scraped_data:
                for chunk_idx, text_chunk in enumerate(page_data['text_chunks']):
                    f.write("===== SOURCE =====\n")
                    f.write(f"URL: {page_data['url']}\n")
                    f.write(f"TITLE: {page_data['title']}\n")
                    f.write(f"TYPE: {page_data['type']}\n")
                    f.write(f"LAST_UPDATED: {page_data['last_updated']}\n")
                    if len(page_data['text_chunks']) > 1:
                        f.write(f"CHUNK: {chunk_idx + 1}/{len(page_data['text_chunks'])}\n")
                    f.write("\n")
                    
                    f.write("===== TEXT CONTENT =====\n")
                    f.write(text_chunk)
                    f.write("\n\n")
                    
                    if page_data['images'] and chunk_idx == 0:
                        f.write("===== IMAGES =====\n")
                        for img_idx, img in enumerate(page_data['images'], 1):
                            f.write(f"[IMAGE_{img_idx}]\n")
                            f.write(f"IMAGE_URL: {img['url']}\n")
                            f.write(f"IMAGE_CONTEXT:\n{img['context']}\n")
                            f.write(f"IMAGE_INFERENCE_HINT:\n{img['inference']}\n")
                            f.write("\n")
                    
                    f.write("===== METADATA =====\n")
                    f.write(f"TAGS: {page_data['tags']}\n")
                    f.write(f"CONFIDENCE_LEVEL: {page_data['confidence']}\n")
                    f.write(f"INSTITUTION: IIM Sambalpur\n")
                    f.write("\n")
                    
                    f.write("========================\n\n")
        
        print(f"Dataset saved successfully with {len(self.scraped_data)} pages.")
    
    def run(self):
        start_time = time.time()
        self.crawl()
        self.save_dataset()
        end_time = time.time()
        
        print(f"\n{'='*50}")
        print(f"Scraping completed in {end_time - start_time:.2f} seconds")
        print(f"Total pages scraped: {len(self.scraped_data)}")
        print(f"Output file: {self.output_file}")
        print(f"{'='*50}")

class IncrementalScraper(IIMSambalpurScraper):
    def __init__(self, base_url="https://iimsambalpur.ac.in/", output_file="iim_sambalpur_dataset.txt", max_pages=500, state_file="scraper_state.json"):
        super().__init__(base_url, output_file, max_pages)
        self.state_file = state_file
        self.load_state()
    
    def load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    state = json.load(f)
                    self.visited_urls = set(state.get('visited_urls', []))
                    print(f"Loaded state: {len(self.visited_urls)} URLs already visited")
            except Exception as e:
                print(f"Could not load state: {str(e)}")
    
    def save_state(self):
        try:
            with open(self.state_file, 'w') as f:
                json.dump({
                    'visited_urls': list(self.visited_urls),
                    'last_run': datetime.now().isoformat()
                }, f)
            print(f"State saved to {self.state_file}")
        except Exception as e:
            print(f"Could not save state: {str(e)}")
    
    def save_dataset(self):
        mode = 'a' if os.path.exists(self.output_file) else 'w'
        action = "Appending to" if mode == 'a' else "Creating"
        print(f"{action} dataset file {self.output_file}")
        
        with open(self.output_file, mode, encoding='utf-8') as f:
            for page_data in self.scraped_data:
                for chunk_idx, text_chunk in enumerate(page_data['text_chunks']):
                    f.write("===== SOURCE =====\n")
                    f.write(f"URL: {page_data['url']}\n")
                    f.write(f"TITLE: {page_data['title']}\n")
                    f.write(f"TYPE: {page_data['type']}\n")
                    f.write(f"LAST_UPDATED: {page_data['last_updated']}\n")
                    if len(page_data['text_chunks']) > 1:
                        f.write(f"CHUNK: {chunk_idx + 1}/{len(page_data['text_chunks'])}\n")
                    f.write("\n")
                    
                    f.write("===== TEXT CONTENT =====\n")
                    f.write(text_chunk)
                    f.write("\n\n")
                    
                    if page_data['images'] and chunk_idx == 0:
                        f.write("===== IMAGES =====\n")
                        for img_idx, img in enumerate(page_data['images'], 1):
                            f.write(f"[IMAGE_{img_idx}]\n")
                            f.write(f"IMAGE_URL: {img['url']}\n")
                            f.write(f"IMAGE_CONTEXT:\n{img['context']}\n")
                            f.write(f"IMAGE_INFERENCE_HINT:\n{img['inference']}\n")
                            f.write("\n")
                    
                    f.write("===== METADATA =====\n")
                    f.write(f"TAGS: {page_data['tags']}\n")
                    f.write(f"CONFIDENCE_LEVEL: {page_data['confidence']}\n")
                    f.write(f"INSTITUTION: IIM Sambalpur\n")
                    f.write("\n")
                    
                    f.write("========================\n\n")
        
        print(f"Dataset updated with {len(self.scraped_data)} new pages.")
    
    def run(self):
        start_time = time.time()
        self.crawl()
        self.save_dataset()
        self.save_state()
        end_time = time.time()
        
        print(f"\n{'='*50}")
        print(f"Scraping completed in {end_time - start_time:.2f} seconds")
        print(f"New pages scraped: {len(self.scraped_data)}")
        print(f"Total URLs visited: {len(self.visited_urls)}")
        print(f"Output file: {self.output_file}")
        print(f"{'='*50}")

if __name__ == "__main__":
    import sys
    
    INCREMENTAL_MODE = True
    
    if INCREMENTAL_MODE:
        scraper = IncrementalScraper(
            base_url="https://iimsambalpur.ac.in/",
            output_file="iim_sambalpur_dataset.txt",
            max_pages=500,
            state_file="scraper_state.json"
        )
    else:
        scraper = IIMSambalpurScraper(
            base_url="https://iimsambalpur.ac.in/",
            output_file="iim_sambalpur_dataset.txt",
            max_pages=500
        )
    
    scraper.run()
