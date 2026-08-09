-- レシピ箱: 固定カテゴリの追加(メインに「麺類」、料理区分に「ドリンク」)
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
-- (本番環境には supabase db query --linked で直接適用済み。新規セットアップ用にmigrationとしても残す。)

insert into public.categories (name, group_key, sort_order) values
  ('麺類', 'main_ingredient', 4),
  ('ドリンク', 'role', 4);
