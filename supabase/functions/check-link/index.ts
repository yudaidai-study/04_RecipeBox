// レシピ箱: 「元のレシピを見る」で開いたリンクが今も生きているかを判定するEdge Function。
// クライアント(ブラウザ)から任意サイトへ直接fetchするとCORSでレスポンスの中身(status等)を読めないため、
// サーバー側からHEAD(必要ならGET)リクエストを送って生死だけを判定する。本文の取得・DBアクセスは行わない。

const PRODUCTION_ORIGINS = ['https://yudaidai-study.github.io'];
const FETCH_TIMEOUT_MS = 6_000;
const UA = 'Mozilla/5.0 (compatible; RecipeBoxLinkChecker/1.0; +personal-use)';

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

// HEADを拒否するサイト(405/501)はGETで取り直す。ネットワークエラー・タイムアウトは「リンク切れ」扱いにする。
async function checkReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': UA },
    });
    if (res.status === 405 || res.status === 501) {
      const res2 = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': UA },
      });
      return res2.ok;
    }
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') {
    return jsonRes({ ok: false, message: 'POSTメソッドのみ対応しています' }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.url !== 'string') {
      return jsonRes({ ok: false, message: 'リクエストの形式が正しくありません' }, 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      return jsonRes({ ok: false, message: '有効なURLではありません' }, 400);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
      return jsonRes({ ok: false, message: '有効なURLではありません' }, 400);
    }

    const reachable = await checkReachable(parsed.href);
    return jsonRes({ ok: true, reachable });
  } catch (e) {
    console.error(e);
    return jsonRes({ ok: false, message: 'サーバーエラーが発生しました' }, 500);
  }
});
