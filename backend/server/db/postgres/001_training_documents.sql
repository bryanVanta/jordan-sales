-- PostgreSQL schema for local training documents.
-- Run this in pgAdmin Query Tool against the "jordan-salesbot" database.

create extension if not exists pgcrypto;

create table if not exists training_documents (
  id uuid primary key default gen_random_uuid(),
  product_info_id text not null,
  asset_key text not null check (asset_key in ('companyInfo', 'knowledgeBase', 'salesPlaybook')),
  file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  local_path text not null,
  sha256 text,
  extracted_text text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'completed', 'failed')),
  extraction_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_training_documents_product_asset
  on training_documents (product_info_id, asset_key, created_at desc);

create unique index if not exists idx_training_documents_product_sha256
  on training_documents (product_info_id, sha256)
  where sha256 is not null;

create table if not exists training_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references training_documents(id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_training_document_chunks_document
  on training_document_chunks (document_id, chunk_index);

create index if not exists idx_training_document_chunks_search
  on training_document_chunks using gin (to_tsvector('english', chunk_text));
