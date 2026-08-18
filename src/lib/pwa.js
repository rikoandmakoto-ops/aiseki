/* ══════════════════════════════════════════════════════════════
   AISEKI — PWA（ホーム画面への追加）まわり

   ・Service Worker の登録は本番だけ。開発中に登録すると、
     古いビルドがキャッシュから返って変更が反映されなくなる。
   ・「ホーム画面に追加」の案内を出すため、ブラウザが投げる
     beforeinstallprompt を捕まえて取っておく。
     （このイベントは一度しか飛ばないので、React の描画より前に
       受け取れるよう、ここでモジュールとして待ち構える）
   ══════════════════════════════════════════════════════════════ */

let deferredPrompt = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(Boolean(deferredPrompt));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // 既定のミニ情報バーは出さず、アプリ内の案内から出す
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/* インストール可能かどうかの変化を受け取る。解除用の関数を返す。 */
export function onInstallAvailable(fn) {
  listeners.add(fn);
  fn(Boolean(deferredPrompt));
  return () => listeners.delete(fn);
}

/* インストールの確認ダイアログを出す。
   戻り値は実際に追加されたかどうか。 */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const e = deferredPrompt;
  deferredPrompt = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === "accepted";
}

/* 既にホーム画面から起動しているか（案内を出すかの判断に使う） */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/* iOS Safari は beforeinstallprompt を投げない。
   「共有 → ホーム画面に追加」を手順として案内する必要がある。 */
export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && safari;
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // 開発中は登録しない（キャッシュで変更が見えなくなるのを防ぐ）
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[aiseki] Service Worker の登録に失敗しました:", err);
    });
  });
}
