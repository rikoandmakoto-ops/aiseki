/* ══════════════════════════════════════════════════════════════
   CAPTCHA（Cloudflare Turnstile）— 画面側

   ・スクリプトは必要になったときだけ読み込む（カード登録の画面を
     開いたときだけ）。アプリの初回表示を重くしない。
   ・explicit モードで描く。自動描画（data-sitekey の走査）だと
     React が差し替えた DOM に追随しないため。
   ・トークンは一度きり。使ったら reset() して取り直す。

   サーバ側の検証は `api/_captcha.js`。
   **ここを迂回されても意味が無いように、ポイントの付与は
     サーバがトークンを検証してからしか起きない。**
   ══════════════════════════════════════════════════════════════ */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile";

let loading = null;

/* window.turnstile が使えるようになるまで待つ。 */
export function loadTurnstile(timeoutMs = 12000) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ブラウザでのみ利用できます。"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);

  loading ??= new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error("認証の読み込みに失敗しました。通信環境をご確認ください。"));
    }, timeoutMs);

    const done = () => {
      // onload コールバックを使わず、読み込み後に window.turnstile を待つ
      // （script の load と API の露出にわずかなずれがある）。
      const started = Date.now();
      const poll = setInterval(() => {
        if (window.turnstile) {
          clearInterval(poll); clearTimeout(timer); resolve(window.turnstile);
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(poll); clearTimeout(timer); loading = null;
          reject(new Error("認証の読み込みに失敗しました。"));
        }
      }, 50);
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) { done(); return; }

    const el = document.createElement("script");
    el.id = SCRIPT_ID;
    el.src = SCRIPT_URL;
    el.async = true;
    el.defer = true;
    el.onload = done;
    el.onerror = () => {
      clearTimeout(timer);
      loading = null;
      el.remove();
      reject(new Error("認証の読み込みに失敗しました。通信環境をご確認ください。"));
    };
    document.head.appendChild(el);
  });

  return loading;
}

/* ウィジェットを描いて、トークンが取れたら callbacks.onToken に渡す。
   返り値は { reset, remove }。
     reset  … トークンを取り直す（サーバに弾かれたとき・期限切れのとき）
     remove … 片付け（画面を閉じるとき） */
export async function renderTurnstile(container, siteKey, { onToken, onError, onExpire } = {}) {
  const turnstile = await loadTurnstile();
  if (!container) return { reset: () => {}, remove: () => {} };

  const id = turnstile.render(container, {
    sitekey: siteKey,
    // 暗い地に合わせる。日本語で表示する。
    theme: "dark",
    language: "ja",
    size: "flexible",
    callback: (token) => onToken?.(token),
    "error-callback": () => { onError?.(); return true; },
    "expired-callback": () => onExpire?.(),
    "timeout-callback": () => onExpire?.(),
  });

  return {
    reset: () => { try { turnstile.reset(id); } catch { /* 描き直し中なら何もしない */ } },
    remove: () => { try { turnstile.remove(id); } catch { /* 既に消えている */ } },
  };
}
