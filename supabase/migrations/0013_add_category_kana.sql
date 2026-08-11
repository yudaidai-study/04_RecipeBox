-- レシピ箱: タグの五十音インデックス用に読みがな(kana)列を追加
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。

alter table public.categories add column if not exists kana text;

comment on column public.categories.kana is
  '検索・ランダム・追加画面の五十音インデックス用に手動設定する読みがな(ひらがな)。'
  '未設定の場合はタグ名自体(ひらがな/カタカナのタグのみ判定可)から行を判定し、漢字タグは「他」に入る。';
