-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- COMPLETELY RESET (Use with caution!)
-- We need to drop the function first because it depends on the table return type if linked, 
-- but actually here we just need to drop the function to change its signature.
drop function if exists match_documents;
drop table if exists documents;

create table documents (
  id uuid primary key default gen_random_uuid(),
  content text, -- Corresponds to Document.page_content
  metadata jsonb, -- Corresponds to Document.metadata
  embedding vector(1024) -- Embedding dimension (BAAI/bge-m3 uses 1024)
);

-- Enable Row Level Security (RLS)
alter table documents enable row level security;

-- Create a function to match documents (Vector Search)
create or replace function match_documents (
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  filter jsonb DEFAULT '{}'
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  and documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create an index for faster queries (HNSW)
-- Note: You might need to add data first before this index becomes effective,
-- but creating it upfront is fine for small datasets.
create index on documents using hnsw (embedding vector_cosine_ops);
