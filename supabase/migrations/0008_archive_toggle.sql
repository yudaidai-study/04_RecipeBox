-- レシピ箱: アーカイブ保存を選択制にする(③)
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 既定では新規保存時にアーカイブHTML(raw_html)を保持しない。
-- レシピ詳細画面のトグルをONにした時だけ取得・保持する運用にする。

alter table public.recipes add column archive_enabled boolean not null default false;

-- 既存レシピは、既にraw_htmlを保持しているものだけ「アーカイブ有効」として引き継ぐ
update public.recipes set archive_enabled = true where raw_html is not null;
