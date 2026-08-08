-- レシピ箱: レシピに5段階評価を追加
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。

alter table public.recipes
  add column rating smallint check (rating between 1 and 5);
