import re
import time
import requests
from bs4 import BeautifulSoup
import os
import io
from urllib.parse import urlparse
import urllib3

# Suppress all warnings
urllib3.disable_warnings()

# Optional PDF support
try:
    from pypdf import PdfReader
    PDF_ENABLED = True
except ImportError:
    PDF_ENABLED = False
    print("WARNING: pypdf not installed. PDFs will be skipped.")

# Configuration
INPUT_FILE = "iim_sambalpur_dataset_master.txt"
OUTPUT_FILE = "iim_sambalpur_text_only_master.txt"
USER_AGENT = "IIMSambalpurGPT/1.0 (Academic Research)"
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15MB

# Known dead subdomains (skip these to save time)
SKIP_SUBDOMAINS = ['alumni.iimsambalpur.ac.in', 'admission.iimsambalpur.ac.in', 'insite.iimsambalpur.ac.in']

def is_valid_url(url):
    """Quick validation to skip malformed URLs."""
    if '[' in url or ']' in url:
        return False
    if not url.startswith('http'):
        return False
    try:
        parsed = urlparse(url)
        if not parsed.netloc or not parsed.scheme:
            return False
        # Skip known dead subdomains
        for skip in SKIP_SUBDOMAINS:
            if skip in parsed.netloc:
                return False
        return True
    except:
        return False

def clean_html(html_content):
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'iframe', 'noscript', 'meta', 'link', 'form', 'button', 'input', 'img', 'svg', 'video', 'audio', 'aside']):
            tag.decompose()
        text = soup.get_text(separator='\n\n', strip=True)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return '\n\n'.join(lines)
    except:
        return ""

def extract_text_from_pdf(pdf_bytes):
    if not PDF_ENABLED:
        return ""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = []
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text.append(extracted)
        return "\n\n".join(text)
    except Exception as e:
        print(f"   -> PDF parse error: {e}")
        return ""

def get_title(html_content):
    if not html_content:
        return "Unknown"
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        if soup.title and soup.title.string:
            return soup.title.string.strip()
    except:
        pass
    return "Unknown"

def fetch_url(url):
    """Fetch a single URL. Returns (title, text, status)."""
    try:
        resp = requests.get(
            url,
            headers={'User-Agent': USER_AGENT},
            timeout=5,
            verify=False,
            allow_redirects=True
        )
        
        if resp.status_code != 200:
            return "Unknown", "", "failed"
        
        content_type = resp.headers.get('Content-Type', '').lower()
        
        # PDF handling
        if url.lower().endswith('.pdf') or 'application/pdf' in content_type:
            print("   -> PDF detected")
            text = extract_text_from_pdf(resp.content)
            title = f"PDF: {os.path.basename(urlparse(url).path)}"
            return title, text, "success"
        
        # HTML handling
        if 'text' in content_type:
            resp.encoding = 'utf-8'
            html = resp.text
            title = get_title(html)
            text = clean_html(html)
            return title, text, "success"
        
        # Other binary
        print(f"   -> Skipping binary: {content_type}")
        return "Unknown", "", "skipped"
        
    except Exception as e:
        return "Unknown", "", "failed"

def main():
    print(f"Reading {INPUT_FILE}...")
    
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found. Run combine_dataset.py first.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Extract and filter URLs
    raw_urls = re.findall(r'https?://[^\s<>")\]\']+', content)
    valid_urls = []
    for url in raw_urls:
        clean_url = url.split('#')[0].rstrip('.,;)]}\'')
        if 'iimsambalpur.ac' in clean_url and is_valid_url(clean_url):
            if clean_url not in valid_urls:
                valid_urls.append(clean_url)
    
    print(f"Found {len(valid_urls)} valid URLs (filtered out dead subdomains).")

    success_count = 0
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out_f:
        for i, url in enumerate(valid_urls):
            print(f"[{i+1}/{len(valid_urls)}] {url[:70]}...")
            
            title, text, status = fetch_url(url)
            
            if status == "success":
                success_count += 1
            
            char_count = len(text)
            
            out_f.write("==================== SOURCE ====================\n")
            out_f.write(f"SOURCE_URL: {url}\n")
            out_f.write(f"PAGE_TITLE: {title}\n")
            out_f.write(f"FETCH_STATUS: {status}\n")
            out_f.write("INSTITUTION: IIM Sambalpur\n\n")
            
            out_f.write("==================== TEXT CONTENT ====================\n")
            out_f.write(text if text else "")
            out_f.write("\n\n")
            
            out_f.write("==================== METADATA ====================\n")
            out_f.write(f"CHARACTER_COUNT: {char_count}\n")
            out_f.write("LANGUAGE: English\n")
            out_f.write("DATA_SOURCE: auto-converted\n\n")
            out_f.write("=====================================================\n\n")
            
            # Flush periodically
            if i % 10 == 0:
                out_f.flush()
    
    print(f"\n{'='*50}")
    print(f"DONE! Processed {len(valid_urls)} URLs.")
    print(f"Success: {success_count} | Failed/Skipped: {len(valid_urls) - success_count}")
    print(f"Output saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
