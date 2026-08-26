/* =====================================================================
   CAPTCHA（Cloudflare Turnstile）の検証

   なぜ要るか:
     カードを登録すると 5,000pt（signup_bonus）が付く。自動化された
     登録を繰り返されるとポイントを量産できる（HANDOFF §5 の 9-b）。
     ポイントは現金で売るものなので、付与経路の入口に人手の確認を挟む。

   どこで効かせているか（ここが設計の要点）:
     ボーナスの付与経路は2つある。
       ・POST /api/stripe/confirm-card（画面から）
       ・setup_intent.succeeded の Webhook（Stripe から）
     どちらも「SetupIntent が存在すること」が前提で、SetupIntent を作れるのは
     POST /api/stripe/setup-intent だけ。**だから検証はそこで1回だけ行う。**
     検証を通った SetupIntent には metadata に印（CAPTCHA_STAMP）を押し、
     付与する2経路はその印が無ければポイントを付けない。
     こうすると画面から2回トークンを取らずに、付与の直前で確かめられる。

   環境変数
     TURNSTILE_SECRET_KEY   … Cloudflare のシークレットキー（サーバ専用）
     VITE_TURNSTILE_SITE_KEY … サイトキー（公開前提。画面に配る）

   🚨 シークレットが未設定なら **カード登録を止める**（ConfigError → 503）。
     ここを「未設定なら素通し」にすると、環境変数が消えた瞬間に
     穴が開いたことに誰も気づけない。Vercel の環境変数を消すときは
     カード登録が止まることを承知の上で消すこと。

   テスト用のキー（Cloudflare が公開しているもの・常に成功する）:
     サイトキー   1x00000000000000000000AA
     シークレット 1x0000000000000000000000000000000AA
   本番キーは Cloudflare ダッシュボード（Turnstile）で発行して差し替える。
   ===================================================================== */
import { ConfigError, env } from "./_lib.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/* SetupIntent の metadata に押す印。付与する側（confirm-card / webhook）が見る。 */
export const CAPTCHA_STAMP = "captcha_verified_at";

/* 検証に落ちたとき（＝人手の確認が取れなかった）。呼び出し側で 400 にする。 */
export class CaptchaError extends Error {}

/* 画面に配るサイトキー。公開前提の値。
   VITE_ の値はビルド時に焼き込まれるが、--prebuilt デプロイでは空のまま
   出てしまうことがある（HANDOFF §15）。だから API からも返す。 */
export function captchaSiteKey() {
  return env("VITE_TURNSTILE_SITE_KEY", "TURNSTILE_SITE_KEY");
}

export function captchaConfigured() {
  return Boolean(env("TURNSTILE_SECRET_KEY") && captchaSiteKey());
}

/* Turnstile のトークンを Cloudflare に問い合わせる。
   成功したら何も返さない。失敗したら CaptchaError / ConfigError を投げる。

   ⚠ remoteip は送っていない。省略可の項目で、送ると
     「ウィジェットを解いた IP」と「この関数を実行している Vercel から見える IP」が
     食い違ったときに正規の利用者まで弾いてしまう。得られるものが小さいので送らない。 */
export async function verifyCaptcha(token) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) throw new ConfigError("TURNSTILE_SECRET_KEY が設定されていません。");

  const response = String(token ?? "").trim();
  // Turnstile のトークンは 2048 文字以下。長すぎるものは問い合わせる前に捨てる。
  if (!response || response.length > 2048) {
    throw new CaptchaError("認証が確認できませんでした。");
  }

  let body;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response }),
      signal: AbortSignal.timeout(8000),
    });
    body = await res.json();
  } catch (e) {
    // Cloudflare に届かなかった場合。ここで通してしまうと検証の意味が無いので落とす。
    console.error("[captcha] siteverify に到達できませんでした:", e.message);
    throw new CaptchaError("認証を確認できませんでした。通信環境をご確認ください。");
  }

  if (body?.success === true) return;

  const codes = Array.isArray(body?.["error-codes"]) ? body["error-codes"] : [];
  console.warn("[captcha] 検証に失敗:", codes.join(",") || "(理由なし)");

  // 期限切れ・使い回しは画面側でやり直せる。文面を分けて、その旨を伝える。
  if (codes.includes("timeout-or-duplicate")) {
    throw new CaptchaError("認証の有効期限が切れました。もう一度お試しください。");
  }
  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    // これは利用者のせいではなく設定の誤り。503 にして原因を分ける。
    throw new ConfigError("TURNSTILE_SECRET_KEY が正しくありません。");
  }
  throw new CaptchaError("認証を確認できませんでした。もう一度お試しください。");
}

/* 付与する側で使う。CAPTCHA を通って作られた SetupIntent かどうか。 */
export function hasCaptchaStamp(intent) {
  return Boolean(intent?.metadata?.[CAPTCHA_STAMP]);
}
