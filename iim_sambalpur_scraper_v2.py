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
import sys

class IIMSambalpurScraper:
    def __init__(self, base_url="https://iimsambalpur.ac.in/", output_file="iim_sambalpur_dataset.txt", max_pages=500, state_file="scraper_state.json", incremental=True):
        self.base_url = base_url
        self.output_file = output_file
        self.max_pages = max_pages
        self.state_file = state_file
        self.incremental = incremental
        self.visited_urls = set()
        self.scraped_data = []
        self.domain = urlparse(base_url).netloc
        
        self.robot_parser = RobotFileParser()
        self.robot_parser.set_url(urljoin(base_url, "/robots.txt"))
        try:
            self.robot_parser.read()
        except:
            pass
        
        self.headers = {
            'User-Agent': 'IIM-Sambalpur-GPT-Bot/1.0 (Educational Purpose)'
        }
        
        self.skip_patterns = [
            r'/login', r'/signin', r'/signup', r'/register', r'/auth',
            r'/admin', r'/dashboard', r'/wp-admin', r'/user',
            r'\.pdf$', r'\.doc$', r'\.docx$', r'\.xls$', r'\.xlsx$',
            r'\.zip$', r'\.rar$', r'\.tar$', r'\.gz$', r'\.ppt$'
        ]
        
        self.type_keywords = {
            'faculty': ['faculty', 'professor', 'academic staff', 'teaching', 'dr.', 'prof.'],
            'course': ['course', 'curriculum', 'program', 'mba', 'pgp', 'module'],
            'syllabus': ['syllabus', 'course outline', 'curriculum', 'academic calendar'],
            'alumni': ['alumni', 'batch', 'placement', 'recruiter'],
            'notice': ['notice', 'announcement', 'news', 'event', 'circular'],
            'general': []
        }
        
        if self.incremental:
            self.load_state()
    
    def load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    state = json.load(f)
                    self.visited_urls = set(state.get('visited_urls', []))
                    print(f"Loaded {len(self.visited_urls)} previously visited URLs")
            except:
                pass
    
    def save_state(self):
        if self.incremental:
            try:
                with open(self.state_file, 'w') as f:
                    json.dump({
                        'visited_urls': list(self.visited_urls),
                        'last_run': datetime.now().isoformat()
                    }, f)
            except:
                pass
    
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
        
        lines = text.split('\n')
        seen = set()
        unique_lines = []
        for line in lines:
            line_stripped = line.strip()
            if line_stripped and line_stripped not in seen:
                seen.add(line_stripped)
                unique_lines.append(line)
            elif not line_stripped:
                unique_lines.append(line)
        
        text = '\n'.join(unique_lines)
        text = text.strip()
        
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        text = re.sub(email_pattern, '[EMAIL_REMOVED]', text)
        
        phone_pattern = r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        text = re.sub(phone_pattern, '[PHONE_REMOVED]', text)
        
        return text
    
    def remove_boilerplate(self, soup):
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript', 'form']):
            element.decompose()
        
        for element in soup.find_all(class_=re.compile(r'(menu|navigation|sidebar|ad|advertisement|banner|cookie|social|share)', re.IGNORECASE)):
            element.decompose()
        
        for element in soup.find_all(id=re.compile(r'(menu|navigation|sidebar|ad|advertisement|banner|cookie|social|share)', re.IGNORECASE)):
            element.decompose()
        
        for element in soup.find_all(attrs={'role': re.compile(r'(navigation|banner|complementary)', re.IGNORECASE)}):
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
        
        common_academic = {'IIM', 'Sambalpur', 'Management', 'Institute', 'Indian', 'MBA', 'Faculty', 'Course', 'Student', 'Academic', 'Research', 'Program'}
        
        tags = []
        for word in set(words):
            if word in common_academic or len(word) > 5:
                tags.append(word)
        
        return ', '.join(sorted(set(tags))[:15])
    
    def get_image_context(self, soup, img_tag, main_content):
        context_parts = []
        
        alt_text = img_tag.get('alt', '').strip()
        title_text = img_tag.get('title', '').strip()
        
        parent = img_tag.find_parent(['p', 'div', 'section', 'article', 'figure', 'li'])
        if parent:
            text = parent.get_text(strip=True)
            if text and len(text) > 15:
                context_parts.append(text[:250])
        
        prev_elements = []
        for sibling in img_tag.find_all_previous(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
            text = sibling.get_text(strip=True)
            if text and len(text) > 15:
                prev_elements.append(text)
                if len(prev_elements) >= 2:
                    break
        
        next_elements = []
        for sibling in img_tag.find_all_next(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
            text = sibling.get_text(strip=True)
            if text and len(text) > 15:
                next_elements.append(text)
                if len(next_elements) >= 2:
                    break
        
        if prev_elements:
            context_parts.extend(reversed(prev_elements[:2]))
        if next_elements:
            context_parts.extend(next_elements[:2])
        
        context_text = ' '.join(context_parts)
        
        if alt_text and alt_text.lower() not in context_text.lower():
            context_text = f"{context_text} [Alt: {alt_text}]" if context_text else f"[Alt: {alt_text}]"
        
        if title_text and title_text.lower() not in context_text.lower() and title_text != alt_text:
            context_text = f"{context_text} [Title: {title_text}]" if context_text else f"[Title: {title_text}]"
        
        return context_text if context_text else "not explicitly stated"
    
    def get_context_note(self, context, img_tag):
        if context == "not explicitly stated":
            return "not explicitly stated"
        
        alt_text = img_tag.get('alt', '').strip()
        title_text = img_tag.get('title', '').strip()
        
        context_lower = context.lower()
        
        notes = []
        
        if alt_text:
            notes.append(f"Image labeled as: {alt_text}")
        
        if title_text and title_text != alt_text:
            notes.append(f"Image titled: {title_text}")
        
        if 'faculty' in context_lower or 'professor' in context_lower or 'dr.' in context_lower:
            notes.append("Context suggests faculty or staff member")
        elif 'student' in context_lower or 'batch' in context_lower:
            notes.append("Context suggests student-related content")
        elif 'campus' in context_lower or 'building' in context_lower or 'infrastructure' in context_lower:
            notes.append("Context suggests campus or infrastructure")
        elif 'event' in context_lower or 'ceremony' in context_lower or 'conference' in context_lower:
            notes.append("Context suggests event or ceremony")
        elif 'chart' in context_lower or 'graph' in context_lower or 'data' in context_lower:
            notes.append("Context suggests data visualization or chart")
        
        return ' | '.join(notes) if notes else "general institutional image based on surrounding text"
    
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
        
        return chunks if chunks else [text]
    
    def extract_page_data(self, url):
        if not self.can_fetch(url):
            return None
        
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
        except Exception as e:
            print(f"Error fetching {url}: {str(e)}")
            return None
        
        soup = BeautifulSoup(response.content, 'html.parser')
        soup = self.remove_boilerplate(soup)
        
        title_tag = soup.find('title')
        title = title_tag.get_text(strip=True) if title_tag else "Untitled Page"
        
        main_content = (soup.find('main') or 
                       soup.find('article') or 
                       soup.find('div', class_=re.compile(r'content|main|post|entry', re.IGNORECASE)) or 
                       soup.find('body'))
        
        if not main_content:
            return None
        
        for heading in main_content.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            heading.insert_before('\n')
            heading.insert_after('\n')
        
        for list_item in main_content.find_all('li'):
            list_item.insert_before('\n• ')
        
        for table in main_content.find_all('table'):
            table_text = '\n[TABLE]\n'
            for row in table.find_all('tr'):
                cells = [cell.get_text(strip=True) for cell in row.find_all(['td', 'th'])]
                table_text += ' | '.join(cells) + '\n'
            table_text += '[/TABLE]\n'
            table.replace_with(BeautifulSoup(table_text, 'html.parser'))
        
        text_content = main_content.get_text(separator='\n', strip=True)
        text_content = self.clean_text(text_content)
        
        if len(text_content) < 100:
            return None
        
        page_type = self.detect_page_type(url, title, text_content)
        
        last_updated = soup.find('meta', property='article:modified_time')
        if not last_updated:
            last_updated = soup.find('meta', property='article:published_time')
        if not last_updated:
            last_updated = soup.find('time')
        
        if last_updated:
            last_updated = last_updated.get('content') or last_updated.get('datetime', 'unknown')
        else:
            last_updated = "unknown"
        
        images = []
        for img in main_content.find_all('img'):
            img_url = img.get('src') or img.get('data-src') or img.get('data-lazy-src')
            if not img_url:
                continue
            
            img_url = urljoin(url, img_url)
            
            if any(x in img_url.lower() for x in ['logo', 'icon', 'arrow', 'bullet', 'spacer', 'pixel', '1x1']):
                continue
            
            if any(img_url.lower().endswith(ext) for ext in ['.svg', '.ico']):
                continue
            
            context = self.get_image_context(soup, img, main_content)
            note = self.get_context_note(context, img)
            
            images.append({
                'url': img_url,
                'context': context,
                'note': note
            })
        
        tags = self.extract_tags(text_content, title)
        
        confidence = "high"
        if len(text_content) < 200 or not tags:
            confidence = "low"
        elif len(text_content) < 500 or len(images) == 0:
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
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            links = set()
            for link in soup.find_all('a', href=True):
                href = link['href']
                full_url = urljoin(url, href)
                
                full_url = full_url.split('#')[0]
                full_url = full_url.split('?')[0]
                full_url = full_url.rstrip('/')
                
                if self.is_valid_url(full_url) and not self.should_skip_url(full_url):
                    links.add(full_url)
            
            return links
        except Exception as e:
            return set()
    
    def crawl(self):
        print(f"Starting crawl of {self.base_url}")
        print(f"Maximum pages: {self.max_pages}")
        print(f"Incremental mode: {self.incremental}")
        
        queue = deque([self.base_url])
        page_count = 0
        
        while queue and page_count < self.max_pages:
            url = queue.popleft()
            
            if url in self.visited_urls:
                continue
            
            self.visited_urls.add(url)
            page_count += 1
            
            print(f"[{page_count}/{self.max_pages}] {url}")
            
            page_data = self.extract_page_data(url)
            if page_data:
                self.scraped_data.append(page_data)
            
            new_links = self.find_links(url)
            for link in new_links:
                if link not in self.visited_urls:
                    queue.append(link)
            
            time.sleep(1)
        
        print(f"\nCrawl complete: {len(self.scraped_data)} pages extracted")
    
    def save_dataset(self):
        mode = 'a' if self.incremental and os.path.exists(self.output_file) else 'w'
        
        print(f"Saving to {self.output_file} ({'append' if mode == 'a' else 'new file'})")
        
        with open(self.output_file, mode, encoding='utf-8') as f:
            for page_data in self.scraped_data:
                for chunk_idx, text_chunk in enumerate(page_data['text_chunks']):
                    f.write("==================== SOURCE ====================\n")
                    f.write(f"URL: {page_data['url']}\n")
                    f.write(f"PAGE_TITLE: {page_data['title']}\n")
                    f.write(f"SOURCE_TYPE: {page_data['type']}\n")
                    f.write(f"INSTITUTION: IIM Sambalpur\n")
                    f.write(f"LAST_UPDATED: {page_data['last_updated']}\n")
                    
                    f.write("\n==================== TEXT ====================\n")
                    f.write(text_chunk)
                    f.write("\n\n")
                    
                    if page_data['images'] and chunk_idx == 0:
                        f.write("==================== IMAGES ====================\n")
                        for img_idx, img in enumerate(page_data['images'], 1):
                            f.write(f"[IMAGE_{img_idx}]\n")
                            f.write(f"IMAGE_URL: {img['url']}\n")
                            f.write(f"IMAGE_CONTEXT:\n{img['context']}\n")
                            f.write(f"IMAGE_CONTEXT_NOTE:\n{img['note']}\n")
                            f.write("\n")
                    
                    f.write("==================== METADATA ====================\n")
                    f.write(f"TAGS: {page_data['tags']}\n")
                    f.write(f"CONFIDENCE_LEVEL: {page_data['confidence']}\n")
                    f.write(f"CONTENT_LANGUAGE: English\n")
                    
                    f.write("\n================================================\n\n")
        
        print(f"Dataset saved: {len(self.scraped_data)} pages")
    
    def run(self):
        start_time = time.time()
        
        self.crawl()
        self.save_dataset()
        self.save_state()
        
        elapsed = time.time() - start_time
        
        print(f"\n{'='*60}")
        print(f"SCRAPING COMPLETE")
        print(f"Time elapsed: {elapsed:.2f}s")
        print(f"Pages scraped: {len(self.scraped_data)}")
        print(f"Total URLs visited: {len(self.visited_urls)}")
        print(f"Output: {self.output_file}")
        print(f"{'='*60}")

if __name__ == "__main__":
    scraper = IIMSambalpurScraper(
        base_url="https://iimsambalpur.ac.in/",
        output_file="iim_sambalpur_dataset.txt",
        max_pages=500,
        state_file="scraper_state.json",
        incremental=True
    )
    
    scraper.run()
