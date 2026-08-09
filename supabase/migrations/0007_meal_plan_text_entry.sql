-- レシピ箱: 献立カレンダーにレシピ登録なしのテキストのみの献立を追加できるようにする(②)
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 「魚を焼く」のようにレシピURLを保存するほどでもない献立を、テキストだけで登録できるようにする。
-- recipe_idをnullable化し、テキスト本文用のnote列を追加。recipe_id/noteのどちらか一方は必須とする。

alter table public.meal_plan alter column recipe_id drop not null;
alter table public.meal_plan add column note text;
alter table public.meal_plan add constraint meal_plan_recipe_or_note_chk check (recipe_id is not null or note is not null);
