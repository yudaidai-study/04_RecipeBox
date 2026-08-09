-- レシピ箱: メインに「ご飯」を追加(野菜と麺類の間)
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
-- (本番環境には supabase db query --linked で直接適用済み。新規セットアップ用にmigrationとしても残す。)

update public.categories set sort_order = 5 where name = '麺類' and group_key = 'main_ingredient';

insert into public.categories (name, group_key, sort_order) values
  ('ご飯', 'main_ingredient', 4);
