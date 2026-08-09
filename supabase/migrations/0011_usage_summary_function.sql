-- レシピ箱: 左下メニューの「DB使用容量を確認」で使う集計関数
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- anon/authenticatedロールは通常pg_catalogのサイズ関数にRLS越しでアクセスできないため、
-- SECURITY DEFINER関数(所有者=マイグレーション実行者、通常postgres)としてラップし、
-- authenticatedロールにだけEXECUTEを許可する。個人利用の2人共有アプリのため、
-- テーブル単位の内訳・Storageバケット単位の内訳まで含めて返して構わない設計とする。

create or replace function public.db_usage_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'tables', (
      select coalesce(jsonb_agg(t order by (t->>'bytes')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', c.relname,
          'row_estimate', c.reltuples::bigint,
          'bytes', pg_total_relation_size(c.oid)
        ) as t
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      ) sub
    ),
    'storage_buckets', (
      select coalesce(jsonb_agg(b order by (b->>'bytes')::bigint desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'bucket_id', bucket_id,
          'file_count', count(*),
          'bytes', coalesce(sum((metadata->>'size')::bigint), 0)
        ) as b
        from storage.objects
        group by bucket_id
      ) sub2
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.db_usage_summary() to authenticated;
