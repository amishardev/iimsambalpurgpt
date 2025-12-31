-- Supabase pgvector Setup for IIM Sambalpur GPT
-- Run this in the Supabase SQL Editor to set up the vector database

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the chunks table
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL,
  page_title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER,
  tags TEXT[] DEFAULT '{}',
  embedding vector(384), -- For all-MiniLM-L6-v2 dimension
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chunks_source_url ON chunks(source_url);
CREATE INDEX IF NOT EXISTS idx_chunks_tags ON chunks USING GIN(tags);

-- Create a GIN index for full-text search
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS fts tsvector 
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, '') || ' ' || coalesce(page_title, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_fts ON chunks USING GIN(fts);

-- Create the vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  source_url TEXT,
  page_title TEXT,
  content TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    chunks.id,
    chunks.source_url,
    chunks.page_title,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) AS similarity
  FROM chunks
  WHERE 1 - (chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS chunks_updated_at ON chunks;
CREATE TRIGGER chunks_updated_at
  BEFORE UPDATE ON chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS) - Enable if needed
-- ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow public read" ON chunks FOR SELECT USING (true);

-- Sample insert (for testing)
-- INSERT INTO chunks (source_url, page_title, content, word_count, tags)
-- VALUES (
--   'https://iimsambalpur.ac.in',
--   'Home - IIM Sambalpur',
--   'IIM Sambalpur is a premier management institute...',
--   10,
--   ARRAY['about', 'home']
-- );

-- Verify setup
SELECT 'pgvector extension' AS check_item, installed_version IS NOT NULL AS status 
FROM pg_available_extensions WHERE name = 'vector';

SELECT 'chunks table' AS check_item, COUNT(*) >= 0 AS status FROM chunks;
