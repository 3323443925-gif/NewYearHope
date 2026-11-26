-- Starlight Isle (星屿祈光) — Supabase PostgreSQL Schema
-- Run this SQL in your Supabase SQL Editor before switching DATA_PROVIDER=supabase.

create table if not exists public.lanterns (
  id text primary key,
  type text not null check (type in ('wish', 'unspoken', 'greeting')),
  mood text not null,
  content text not null,
  nickname text,
  sticker_id text,
  image_url text,
  allow_replies boolean not null default true,
  owner_secret_hash text not null,
  bless_wish_count integer not null default 0,
  bless_hug_count integer not null default 0,
  bless_newyear_count integer not null default 0,
  reply_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'hidden_by_report', 'deleted_by_owner', 'deleted_by_admin')),
  report_count integer not null default 0,
  locale text not null default 'zh',
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lanterns_status_created on public.lanterns (status, created_at desc);

create table if not exists public.replies (
  id text primary key,
  lantern_id text not null references public.lanterns(id) on delete cascade,
  content text not null,
  nickname text,
  status text not null default 'active' check (status in ('active', 'hidden_by_report', 'deleted_by_admin')),
  report_count integer not null default 0,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_replies_lantern_status on public.replies (lantern_id, status, created_at asc);

create table if not exists public.reports (
  id text primary key,
  target_type text not null check (target_type in ('lantern', 'reply')),
  target_id text not null,
  reason text not null,
  reporter_hash text not null,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_hash)
);

create table if not exists public.banned_ips (
  ip_hash text primary key,
  reason text,
  created_at timestamptz not null default now()
);

-- Enable RLS on all public tables: all reads/writes go exclusively through our Next.js server
alter table public.lanterns enable row level security;
alter table public.replies enable row level security;
alter table public.reports enable row level security;
alter table public.banned_ips enable row level security;

revoke all on table public.lanterns, public.replies, public.reports, public.banned_ips from anon, authenticated;
grant usage on schema public to service_role;
grant all on table public.lanterns, public.replies, public.reports, public.banned_ips to service_role;

-- Private Storage bucket (served via our own domain /api/media/[key] with immutable CDN cache)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lantern-images', 'lantern-images', false, 614400, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
