-- レシピ箱: カテゴリ名の変更
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 変更内容:
--   1. ジャンルの「その他」を「他の国」に変更
--      (料理区分に新設する「他の区分」と紛らわしくない名前にするため。
--       categories.name はグループ横断のunique制約があり、他グループと同名にはできない)
--   2. 料理区分の「ドリンク」を「他の区分」に変更
--   3. メインの「ご飯」を「ご飯物」に変更

update public.categories set name = '他の国'   where name = 'その他'   and group_key = 'genre';
update public.categories set name = '他の区分' where name = 'ドリンク' and group_key = 'role';
update public.categories set name = 'ご飯物'   where name = 'ご飯'     and group_key = 'main_ingredient';
