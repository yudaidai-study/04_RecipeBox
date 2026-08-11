const CACHE = 'recipebox-v40';
const SUPABASE_JS_URL = 'https://esm.sh/@supabase/supabase-js@2.111.0';

const ASSETS = [
  './',
  './index.html',
  './add.html',
  './calendar.html',
  './manifest.json',
  './css/app.css',
  './js/config.js',
  './js/supabase-client.js',
  './js/auth.js',
  './js/api.js',
  './js/ui.js',
  './js/app.js',
  './js/add.js',
  './js/calendar.js',
  './js/dateutils.js',
  './js/sw-register.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  SUPABASE_JS_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase(DB / Auth / Edge Function)への通信は常にネットワークへ通す。キャッシュ対象外。
  if (url.hostname.endsWith('.supabase.co')) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isPinnedCdn = req.url === SUPABASE_JS_URL;
  if (!isSameOrigin && !isPinnedCdn) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200) return res;
          // add.html?url=... のようにクエリ違いで無数に生まれるnavigationはキャッシュに追加しない(肥大化防止)
          if (req.mode === 'navigate' && url.search) return res;
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') {
            const fallback = url.pathname.endsWith('/add.html') ? './add.html' : './index.html';
            return caches.match(fallback);
          }
        });
    })
  );
});
