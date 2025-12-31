import requests
from bs4 import BeautifulSoup
import re
import time
import json
from datetime import datetime
from urllib.parse import urljoin, quote_plus
import os

class IIMSambalpurAlumniCollector:
    def __init__(self, output_file="iim_sambalpur_alumni_dataset.txt"):
        self.output_file = output_file
        self.alumni_data = []
        self.seen_names = set()
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        self.known_batches = []
        
        self.domain_keywords = {
            'consulting': ['consultant', 'consulting', 'advisory', 'strategy', 'mckinsey', 'bcg', 'bain', 'deloitte', 'kpmg', 'ey', 'pwc', 'accenture'],
            'analytics': ['analytics', 'data science', 'data analyst', 'machine learning', 'ai', 'business intelligence', 'bi'],
            'finance': ['finance', 'investment', 'banking', 'financial', 'equity', 'credit', 'risk', 'treasury', 'ca', 'cfa'],
            'marketing': ['marketing', 'brand', 'digital marketing', 'product marketing', 'growth', 'advertising'],
            'operations': ['operations', 'supply chain', 'logistics', 'procurement', 'manufacturing', 'lean'],
            'technology': ['software', 'engineer', 'developer', 'tech', 'it', 'product manager', 'pm'],
            'hr': ['hr', 'human resources', 'talent', 'recruitment', 'people operations']
        }
    
    def detect_domain(self, text):
        text_lower = text.lower()
        
        for domain, keywords in self.domain_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return domain
        
        return "general"
    
    def clean_text(self, text):
        if not text:
            return ""
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        return text
    
    def scrape_institute_alumni_page(self):
        print("Scraping IIM Sambalpur official alumni pages...")
        
        alumni_urls = [
            "https://iimsambalpur.ac.in/alumni/",
            "https://iimsambalpur.ac.in/alumni-stories/",
            "https://iimsambalpur.ac.in/placements/",
            "https://iimsambalpur.ac.in/alumni-connect/",
            "https://iimsambalpur.ac.in/alumni-association/"
        ]
        
        for url in alumni_urls:
            try:
                print(f"  Checking: {url}")
                response = requests.get(url, headers=self.headers, timeout=15)
                
                if response.status_code != 200:
                    continue
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                for script in soup(['script', 'style', 'nav', 'footer', 'header']):
                    script.decompose()
                
                text = soup.get_text(separator=' ', strip=True)
                
                batch_patterns = [
                    r'batch\s*(?:of\s*)?(\d{4})[–-](\d{2,4})',
                    r'(\d{4})[–-](\d{2,4})\s*batch',
                    r'class\s*of\s*(\d{4})',
                    r'MBA\s*(\d{4})[–-](\d{2,4})',
                    r'PGP\s*(\d{4})[–-](\d{2,4})'
                ]
                
                for pattern in batch_patterns:
                    matches = re.findall(pattern, text, re.IGNORECASE)
                    for match in matches:
                        if isinstance(match, tuple):
                            start_year = match[0]
                            end_year = match[1] if len(match[1]) == 4 else f"20{match[1]}"
                            batch = f"{start_year}-{end_year[-2:]}"
                        else:
                            batch = match
                        
                        if batch not in self.known_batches:
                            self.known_batches.append(batch)
                            print(f"    Found batch: {batch}")
                
                alumni_cards = soup.find_all(['div', 'article', 'section'], 
                    class_=re.compile(r'(alumni|testimonial|story|card|profile)', re.IGNORECASE))
                
                for card in alumni_cards:
                    name_tag = card.find(['h2', 'h3', 'h4', 'strong', 'b'])
                    name = name_tag.get_text(strip=True) if name_tag else None
                    
                    if not name or name in self.seen_names:
                        continue
                    
                    self.seen_names.add(name)
                    
                    card_text = card.get_text(separator=' ', strip=True)
                    
                    batch = "unknown"
                    for pattern in batch_patterns:
                        match = re.search(pattern, card_text, re.IGNORECASE)
                        if match:
                            if isinstance(match.groups(), tuple) and len(match.groups()) >= 2:
                                start = match.group(1)
                                end = match.group(2)
                                end = end if len(end) == 4 else f"20{end}"
                                batch = f"{start}-{end[-2:]}"
                            else:
                                batch = match.group(1)
                            break
                    
                    role_patterns = [
                        r'(?:works?\s*(?:as|at)|currently|role:?)\s*([A-Za-z\s]+(?:manager|analyst|consultant|director|lead|head|associate|executive)[A-Za-z\s]*)',
                        r'([A-Za-z\s]+(?:manager|analyst|consultant|director|lead|head|associate|executive))',
                    ]
                    
                    role = "unknown"
                    for pattern in role_patterns:
                        match = re.search(pattern, card_text, re.IGNORECASE)
                        if match:
                            role = self.clean_text(match.group(1))[:100]
                            break
                    
                    company = "unknown"
                    company_patterns = [
                        r'(?:at|with|@)\s+([A-Z][A-Za-z\s&]+(?:Ltd|Inc|Corp|Company|Consulting|Bank|Group)?)',
                        r'(?:joined|working\s*(?:at|with))\s+([A-Z][A-Za-z\s&]+)'
                    ]
                    
                    for pattern in company_patterns:
                        match = re.search(pattern, card_text)
                        if match:
                            company = self.clean_text(match.group(1))[:100]
                            break
                    
                    domain = self.detect_domain(card_text)
                    
                    headline = card_text[:300] if len(card_text) > 50 else card_text
                    
                    self.alumni_data.append({
                        'name': name,
                        'institute': 'IIM Sambalpur',
                        'program': 'MBA',
                        'batch': batch,
                        'role': role,
                        'company': company,
                        'domain': domain,
                        'headline': headline,
                        'profile_url': url,
                        'source': 'IIM Sambalpur Official Website',
                        'confidence': 'high' if batch != 'unknown' else 'medium',
                        'notes': ''
                    })
                    
                    print(f"    Found alumni: {name}")
                
                time.sleep(1)
                
            except Exception as e:
                print(f"  Error: {str(e)}")
                continue
    
    def search_public_alumni_info(self):
        print("\nSearching for public alumni information...")
        
        search_queries = [
            "IIM Sambalpur alumni",
            "IIM Sambalpur MBA batch",
            "IIM Sambalpur placement",
            "IIM Sambalpur graduates"
        ]
        
        print("  Note: For privacy and legal reasons, this script only collects")
        print("  information from the official IIM Sambalpur website.")
        print("  To add more alumni data, you can manually add entries from:")
        print("  - Public news articles mentioning IIM Sambalpur alumni")
        print("  - Official IIM Sambalpur press releases")
        print("  - Public placement reports")
    
    def add_sample_batch_structure(self):
        print("\nAdding known batch structure...")
        
        current_year = datetime.now().year
        
        for start_year in range(2015, current_year):
            end_year = start_year + 2
            if end_year <= current_year:
                batch = f"{start_year}-{str(end_year)[-2:]}"
                if batch not in self.known_batches:
                    self.known_batches.append(batch)
        
        print(f"  Known batches: {', '.join(sorted(self.known_batches))}")
    
    def save_dataset(self):
        print(f"\nSaving dataset to {self.output_file}...")
        
        with open(self.output_file, 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("IIM SAMBALPUR ALUMNI DATASET\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total Alumni Entries: {len(self.alumni_data)}\n")
            f.write(f"Known Batches: {', '.join(sorted(self.known_batches))}\n")
            f.write("=" * 60 + "\n\n")
            
            f.write("NOTE: This dataset contains only publicly available information\n")
            f.write("from the official IIM Sambalpur website. No private data has been\n")
            f.write("collected. For accuracy, all entries are sourced from public pages.\n\n")
            
            f.write("=" * 60 + "\n")
            f.write("BATCH INFORMATION\n")
            f.write("=" * 60 + "\n\n")
            
            for batch in sorted(self.known_batches):
                batch_alumni = [a for a in self.alumni_data if a['batch'] == batch]
                f.write(f"BATCH: {batch}\n")
                f.write(f"ALUMNI_COUNT: {len(batch_alumni)}\n")
                f.write(f"PROGRAM: MBA (Post Graduate Programme in Management)\n")
                f.write(f"INSTITUTION: IIM Sambalpur\n\n")
            
            f.write("=" * 60 + "\n")
            f.write("ALUMNI PROFILES\n")
            f.write("=" * 60 + "\n\n")
            
            for alumni in self.alumni_data:
                f.write("==================== IIM SAMBALPUR ALUMNI ====================\n\n")
                f.write(f"NAME: {alumni['name']}\n")
                f.write(f"INSTITUTE: {alumni['institute']}\n")
                f.write(f"PROGRAM: {alumni['program']}\n")
                f.write(f"BATCH: {alumni['batch']}\n\n")
                
                f.write(f"CURRENT_ROLE: {alumni['role']}\n")
                f.write(f"COMPANY: {alumni['company']}\n")
                f.write(f"DOMAIN: {alumni['domain']}\n\n")
                
                f.write(f"PUBLIC_HEADLINE:\n{alumni['headline']}\n\n")
                
                f.write(f"PUBLIC_PROFILE_URL:\n{alumni['profile_url']}\n\n")
                
                f.write(f"DATA_SOURCE:\n{alumni['source']}\n\n")
                
                f.write(f"CONFIDENCE_LEVEL:\n{alumni['confidence']}\n\n")
                
                if alumni['notes']:
                    f.write(f"NOTES:\n{alumni['notes']}\n\n")
                
                f.write("=============================================================\n\n")
            
            if not self.alumni_data:
                f.write("No alumni entries found from public sources.\n")
                f.write("To populate this dataset, manually add verified alumni information\n")
                f.write("from official IIM Sambalpur publications and press releases.\n\n")
                
                f.write("SAMPLE ENTRY FORMAT:\n\n")
                f.write("==================== IIM SAMBALPUR ALUMNI ====================\n\n")
                f.write("NAME: [Full Name]\n")
                f.write("INSTITUTE: IIM Sambalpur\n")
                f.write("PROGRAM: MBA\n")
                f.write("BATCH: [e.g., 2020-22]\n\n")
                f.write("CURRENT_ROLE: [Job Title]\n")
                f.write("COMPANY: [Company Name]\n")
                f.write("DOMAIN: [consulting | analytics | finance | marketing | operations | general]\n\n")
                f.write("PUBLIC_HEADLINE:\n[Brief description from public source]\n\n")
                f.write("PUBLIC_PROFILE_URL:\n[Source URL]\n\n")
                f.write("DATA_SOURCE:\n[e.g., IIM Sambalpur Press Release / News Article]\n\n")
                f.write("CONFIDENCE_LEVEL:\nhigh | medium | low\n\n")
                f.write("NOTES:\n[Any additional notes]\n\n")
                f.write("=============================================================\n\n")
        
        print(f"Dataset saved with {len(self.alumni_data)} alumni entries")
        print(f"Output file: {self.output_file}")
    
    def run(self):
        print("=" * 60)
        print("IIM SAMBALPUR ALUMNI DATASET GENERATOR")
        print("=" * 60)
        print()
        
        self.scrape_institute_alumni_page()
        
        self.add_sample_batch_structure()
        
        self.search_public_alumni_info()
        
        self.save_dataset()
        
        print()
        print("=" * 60)
        print("COLLECTION COMPLETE")
        print(f"Total alumni entries: {len(self.alumni_data)}")
        print(f"Known batches: {len(self.known_batches)}")
        print(f"Output file: {self.output_file}")
        print("=" * 60)

if __name__ == "__main__":
    collector = IIMSambalpurAlumniCollector(
        output_file="iim_sambalpur_alumni_dataset.txt"
    )
    collector.run()
