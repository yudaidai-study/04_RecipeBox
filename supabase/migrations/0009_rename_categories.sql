-- レシピ箱: 固定カテゴリの名称変更
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
-- (本番環境には supabase db query --linked で直接適用済み。新規セットアップ用にmigrationとしても残す。)

update public.categories set name = '他の国'   where name = 'その他'   and group_key = 'genre';
update public.categories set name = '他の区分' where name = 'ドリンク' and group_key = 'role';
update public.categories set name = 'ご飯物'   where name = 'ご飯'     and group_key = 'main_ingredient';
