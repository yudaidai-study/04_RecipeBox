-- レシピ箱: カテゴリを複数選択のタグ方式に変更
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 変更内容:
--   1. categories に group_key(グループ識別子) と sort_order(表示順)を追加
--      group_key: 'genre'(ジャンル) | 'role'(役割) | 'main_ingredient'(主な食材) | null(自由入力タグ)
--   2. recipes <-> categories を 1対多(category_id) から 多対多(recipe_categories) に変更
--   3. 固定3グループの初期カテゴリを投入(既存カテゴリは仕様変更に伴い作り直すため一旦削除)
--
-- 注意: これを実行すると、既存カテゴリと保存済みレシピの紐付けは失われます
-- (recipes.category_id は on delete set null のため、カテゴリ削除時点でレシピ側はNULL化される)。
-- レシピ本体(URL・タイトル・アーカイブHTML等)は削除されません。

alter table public.categories
  add column group_key  text,
  add column sort_order integer not null default 0;

-- 既存カテゴリを削除して新構成を投入
delete from public.categories;

insert into public.categories (name, group_key, sort_order) values
  ('和食', 'genre', 1), ('洋食', 'genre', 2), ('中華', 'genre', 3), ('その他', 'genre', 4),
  ('主菜', 'role', 1), ('副菜', 'role', 2), ('デザート', 'role', 3),
  ('肉', 'main_ingredient', 1), ('魚', 'main_ingredient', 2), ('野菜', 'main_ingredient', 3);

-- レシピ×カテゴリの多対多中間テーブル
create table public.recipe_categories (
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (recipe_id, category_id)
);
create index recipe_categories_category_id_idx on public.recipe_categories (category_id);

alter table public.recipe_categories enable row level security;
create policy "authenticated_full_access" on public.recipe_categories
  for all to authenticated using (true) with check (true);

-- 旧・単一カテゴリ列を廃止(recipe_categoriesに一本化)
drop index if exists recipes_category_id_idx;
alter table public.recipes drop column category_id;
