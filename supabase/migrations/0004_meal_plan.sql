-- レシピ箱: 献立カレンダー機能の追加
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 1日に複数レシピを登録できる(食事ごとの枠は設けない、単純な日付×レシピの組)。
-- 同じ日に同じレシピを二重登録しないようunique制約を付ける。

create table public.meal_plan (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (date, recipe_id)
);

create index meal_plan_date_idx      on public.meal_plan (date);
create index meal_plan_recipe_id_idx on public.meal_plan (recipe_id);

alter table public.meal_plan enable row level security;
create policy "authenticated_full_access" on public.meal_plan
  for all to authenticated using (true) with check (true);
