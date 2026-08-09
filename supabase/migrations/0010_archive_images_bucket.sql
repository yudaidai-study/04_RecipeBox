-- レシピ箱: アーカイブHTML内の画像をミラーリングして保存するStorageバケットを作成する
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 元サイトが消えるとアーカイブHTML内の<img>も表示できなくなる問題への対策(③の発展)。
-- archive-recipe Edge Functionが、アーカイブ取得時に画像本体もこのバケットへ複製し、
-- HTML内のsrcをStorageの公開URLへ書き換えることで、アーカイブを自己完結させる。
-- 個人利用の2人共有アプリのため、シンプルにpublicバケットとする。

insert into storage.buckets (id, name, public)
values ('recipe-archives', 'recipe-archives', true)
on conflict (id) do nothing;

create policy "authenticated_select_recipe_archives" on storage.objects
  for select to authenticated using (bucket_id = 'recipe-archives');
create policy "authenticated_insert_recipe_archives" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-archives');
create policy "authenticated_update_recipe_archives" on storage.objects
  for update to authenticated using (bucket_id = 'recipe-archives');
create policy "authenticated_delete_recipe_archives" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-archives');
