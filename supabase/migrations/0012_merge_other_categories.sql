-- レシピ箱: 固定カテゴリの「他」表記統一・複合キー化・メインの統合
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- ジャンル「他の国」・料理区分「他の区分」・メイン「ご飯物」をそれぞれ「他」に統一する。
-- 従来はcategories.nameがテーブル全体で一意だったため、3グループそれぞれで同じ「他」を
-- 名乗ることができない。そこで一意制約を「固定グループ内で一意」「自由入力タグ同士で一意」の
-- 2つの部分unique indexに置き換える(自由入力タグはgroup_keyがnullなので、null同士は
-- 別扱いになるPostgresのunique制約の仕様上、部分indexを分ける必要がある)。

alter table public.categories drop constraint if exists categories_name_key;

create unique index categories_fixed_name_key on public.categories (group_key, name) where group_key is not null;
create unique index categories_free_name_key on public.categories (name) where group_key is null;

-- ジャンル「他の国」→「他」、料理区分「他の区分」→「他」(単純リネーム。idはそのまま)
update public.categories set name = '他' where name = '他の国'   and group_key = 'genre';
update public.categories set name = '他' where name = '他の区分' and group_key = 'role';

-- メイン「ご飯物」「麺類」を1つの「他」へ統合する。
-- 実データではどちらのカテゴリも紐付くレシピが0件だったため、単純に「麺類」側を削除し、
-- 「ご飯物」側を残して「他」にリネームする(将来レシピが増えていた場合に備え、念のため
-- 「麺類」に紐付くrecipe_categoriesがあれば「ご飯物」側へ付け替えてから削除する)。
do $$
declare
  keep_id uuid;
  drop_id uuid;
begin
  select id into keep_id from public.categories where name = 'ご飯物' and group_key = 'main_ingredient';
  select id into drop_id from public.categories where name = '麺類'   and group_key = 'main_ingredient';

  if keep_id is not null and drop_id is not null then
    insert into public.recipe_categories (recipe_id, category_id)
    select recipe_id, keep_id from public.recipe_categories where category_id = drop_id
    on conflict do nothing;

    delete from public.recipe_categories where category_id = drop_id;
    delete from public.categories where id = drop_id;

    update public.categories set name = '他' where id = keep_id;
  end if;
end $$;
