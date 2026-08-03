-- レシピ箱: 初期スキーマ
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。

create extension if not exists pgcrypto;

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  title        text,
  category_id  uuid references public.categories(id) on delete set null,
  image_url    text,
  excerpt      text,
  raw_html     text,
  memo         text,
  fetch_status text not null default 'pending' check (fetch_status in ('pending', 'ok', 'failed')),
  fetch_error  text,
  created_at   timestamptz not null default now()
);

create index recipes_category_id_idx on public.recipes (category_id);
create index recipes_created_at_idx  on public.recipes (created_at desc);

-- Row Level Security: 認証済みユーザー(=夫婦共有アカウント)は全操作可、未ログインは一切アクセス不可
alter table public.categories enable row level security;
alter table public.recipes    enable row level security;

create policy "authenticated_full_access" on public.categories
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.recipes
  for all to authenticated using (true) with check (true);

-- 初期カテゴリ(空の状態を避けるための最低限の種データ。アプリ内から追加・変更可能)
insert into public.categories (name) values
  ('主菜'), ('副菜'), ('汁物・スープ'), ('ご飯もの'), ('麺類'), ('デザート・おやつ'), ('その他');
