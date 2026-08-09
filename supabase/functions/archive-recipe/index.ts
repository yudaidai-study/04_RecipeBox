// レシピ箱: レシピ詳細画面のアーカイブトグルをONにした時に呼ばれるEdge Function(③)。
// 保存済みレシピのURLを改めて取得し、raw_htmlとarchive_enabled=trueをDBへ反映する。
// fetch-recipeのページ取得・サニタイズ処理と同じロジックを使うが、Edge Functionはダッシュボードから
// 個別にデプロイする単一ファイル構成のため、必要な関数群をこのファイルにも複製している。

import { createClient } from 'npm:@supabase/supabase-js@2';

const PRODUCTION_ORIGINS = ['https://yudaidai-study.github.io'];
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; RecipeBoxArchiver/1.0; +personal-use)';

const PRIVATE_HOST_RE = [
  /^localhost$/i, /^127\./, /^0\.0\.0\.0$/, /^::1$/, /^\[::1\]$/,
  /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./,
];

function corsHeadersFor(req: Request): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = isLocalDev || PRODUCTION_ORIGINS.includes(origin) ? origin : PRODUCTION_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function isBlockedHost(hostname: string): boolean {
  return PRIVATE_HOST_RE.some((re) => re.test(hostname));
}

function injectBaseTag(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl.replace(/"/g, '&quot;')}">`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const idx = headMatch.index + headMatch[0].length;
    return html.slice(0, idx) + baseTag + html.slice(idx);
  }
  return baseTag + html;
}

// アーカイブ表示は sandbox="" のiframeで開き、スクリプト実行そのものをブラウザ側で禁止する設計。
// ここでの<script>除去はあくまで保存サイズ削減とハイジーン目的の多層防御であり、主たる防御ではない。
function stripScriptTags(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  let charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : 'utf-8';
  if (charset === 'shift-jis' || charset === 'sjis' || charset === 'x-sjis') charset = 'shift_jis';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function readWithLimit(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        const allowed = value.length - (total - maxBytes);
        if (allowed > 0) chunks.push(value.slice(0, allowed));
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  const size = Math.min(total, maxBytes);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

interface FetchResult {
  ok: boolean;
  html?: string;
  error?: string;
}

async function fetchArchiveHtml(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !contentType.includes('html')) {
      return { ok: false, error: `not html: ${contentType}` };
    }

    const bytes = await readWithLimit(res.body, MAX_BODY_BYTES);
    const rawHtml = decodeHtml(bytes, contentType);
    const finalUrl = res.url || url;
    const archived = stripScriptTags(injectBaseTag(rawHtml, finalUrl));

    return { ok: true, html: archived };
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'TimeoutError';
    return { ok: false, error: isTimeout ? 'timeout' : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const jsonError = (code: string, message: string, status = 400) =>
    jsonRes({ ok: false, code, message }, status);

  if (req.method !== 'POST') {
    return jsonError('method_not_allowed', 'POSTメソッドのみ対応しています', 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.recipeId !== 'string') {
      return jsonError('invalid_request', 'リクエストの形式が正しくありません', 400);
    }
    const { recipeId } = body as { recipeId: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: recipe, error: fetchError } = await supabase
      .from('recipes')
      .select('id, url')
      .eq('id', recipeId)
      .single();
    if (fetchError || !recipe) return jsonError('not_found', 'レシピが見つかりません', 404);

    let parsed: URL;
    try {
      parsed = new URL(recipe.url);
    } catch {
      return jsonError('invalid_url', 'URLが不正です', 400);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
      return jsonError('invalid_url', 'URLが不正です', 400);
    }

    const page = await fetchArchiveHtml(parsed.href);
    if (!page.ok) {
      return jsonError('fetch_failed', 'ページの取得に失敗したため、アーカイブを保存できませんでした', 502);
    }

    const { data: updated, error: updateError } = await supabase
      .from('recipes')
      .update({ raw_html: page.html, archive_enabled: true, fetch_status: 'ok', fetch_error: null })
      .eq('id', recipeId)
      .select('id, archive_enabled, raw_html, fetch_status')
      .single();
    if (updateError) return jsonError('db_update_failed', updateError.message, 500);

    return jsonRes({ ok: true, recipe: updated });
  } catch (e) {
    console.error(e);
    return jsonError('unexpected', 'サーバーエラーが発生しました', 500);
  }
});
