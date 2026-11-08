-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a table for the knowledge base documents
CREATE TABLE kb_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text, -- corresponds to Document.page_content
  metadata jsonb, -- corresponds to Document.metadata
  embedding vector(384) -- 384 is the dimension for all-MiniLM-L6-v2
);

-- Create a function to similarity search for documents
CREATE OR REPLACE FUNCTION match_kb_documents (
  query_embedding vector(384),
  match_count int DEFAULT null,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN query
  SELECT
    id,
    content,
    metadata,
    1 - (kb_documents.embedding <=> query_embedding) AS similarity
  FROM kb_documents
  WHERE metadata @> filter
  ORDER BY kb_documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── Order Tracking ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_tracking (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text NOT NULL,
  product           text NOT NULL,
  order_date        date NOT NULL,
  delivery_due_date date NOT NULL,
  delivery_status   text NOT NULL DEFAULT 'Pending',  -- Pending | Shipped | Delivered | Delayed
  created_at        timestamptz DEFAULT now()
);

-- Index for fast email lookups
CREATE INDEX ON order_tracking (lower(email));
