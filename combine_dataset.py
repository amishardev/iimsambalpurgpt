import os

TXT_DIR = "scraped_data/txt"
MASTER_OUTPUT_FILE = "iim_sambalpur_dataset_master.txt"

def combine_dataset():
    print(f"Combining all text files from {TXT_DIR} into {MASTER_OUTPUT_FILE}...")
    if not os.path.exists(TXT_DIR):
        print("No scraped data found.")
        return

    files = os.listdir(TXT_DIR)
    with open(MASTER_OUTPUT_FILE, 'w', encoding='utf-8') as master:
        count = 0
        for filename in files:
            if filename.endswith(".txt"):
                filepath = os.path.join(TXT_DIR, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as single:
                            master.write(single.read())
                            master.write("\n\n")
                    count += 1
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
    print(f"Combination complete. Merged {count} files.")

if __name__ == "__main__":
    combine_dataset()
