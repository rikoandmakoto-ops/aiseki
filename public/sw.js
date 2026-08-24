/* =====================================================================
   AISEKI — Service Worker

   目的は「ホーム画面に追加して、アプリのように起動できること」。
   オフラインで機能させることは狙っていない（会の一覧もチャットも
   その場のデータが要る）。したがってキャッシュするのは
   アプリの外枠（HTML / JS / CSS / アイコン）だけにする。

   方針:
     ・ナビゲーション   … ネットワーク優先。失敗したらキャッシュ済みの
                          index.html を返し、真っ白な画面にしない。
     ・同一オリジンの静的ファイル … キャッシュ優先＋背後で更新
     ・API（Supabase / /api）… 一切キャッシュしない。
       残高やメッセージが古いまま表示されると事故になる。
   ===================================================================== */

/* ⚠ PRECACHE の中身を差し替えたら、必ずここを上げること。
   上げないと、すでにインストール済みの端末は古いキャッシュを返し続ける
   （2026-08-24 のファビコン差し替えで v2 に上げた）。 */
const VERSION = "aiseki-v2";
const SHELL = `${VERSION}-shell`;

/* 事前に持っておくもの。ビルドのたびにファイル名が変わる JS/CSS は
   ここに書けないので、実際に取りに行ったときに拾う（下の stale-while-revalidate）。 */
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon-64.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* キャッシュしてはいけないもの */
function isBypassed(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/storage/") ||
    url.pathname.startsWith("/realtime/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase・決済API など、別オリジンや API は素通し
  if (url.origin !== self.location.origin || isBypassed(url)) return;

  // 画面遷移 … 常に最新を取りに行き、通信できないときだけ手元の枠を出す
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // 枠として保存するのはアプリ本体（"/"）だけ。広告用のLP（/lp/*）は
          // 別のページなので、これを "/" として持つとオフライン起動で
          // アプリの代わりにLPが出てしまう。
          if (url.pathname === "/") {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put("/", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  // 静的ファイル … 手元にあれば即返し、裏で新しいものを取っておく
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
