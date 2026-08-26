/* =====================================================================
   POST /api/stripe/confirm-card   { setupIntentId }

   カード登録の完了をサーバ側で確かめて、5,000pt を付与する。

   なぜ Webhook だけに任せないか:
     STRIPE_WEBHOOK_SECRET が入るまで /api/stripe/webhook は 503 を返す
     （署名を検証できないリクエストは受け付けない）。その間ボーナスは
     一度も付かない。この経路があれば、Webhook の登録前でも成立する。

   ブラウザの言い分は一切信じない:
     ・受け取るのは SetupIntent の ID だけ。
     ・その ID を Stripe から引き直し、status が succeeded で、
       metadata.user_id がログイン中の本人であることを確かめる。
     ・**CAPTCHA を通って作られた SetupIntent かどうかも見る**
       （metadata の印。押すのは /api/stripe/setup-intent だけ）。
     ・付与は grant_card_bonus()（service_role 専用・冪等）。
       Webhook と両方から呼ばれても二重には付かない。
   ===================================================================== */
import { hasCaptchaStamp } from "../_captcha.js";
import { ConfigError, getStripe, json, requireUser, serviceClient } from "../_lib.js";

export async function POST(request) {
  try {
    const user = await requireUser(request);
    if (!user) return json({ error: "ログインが必要です。" }, 401);

    let body = {};
    try { body = await request.json(); } catch { /* 下で弾く */ }

    const setupIntentId = String(body?.setupIntentId ?? "").trim();
    if (!/^seti_[A-Za-z0-9_]+$/.test(setupIntentId)) {
      return json({ error: "カード登録の情報が読み取れませんでした。" }, 400);
    }

    const stripe = getStripe();
    const intent = await stripe.setupIntents.retrieve(setupIntentId);

    if (intent.status !== "succeeded") {
      return json({ error: "カードのご登録がまだ完了していません。" }, 409);
    }
    /* 他人の SetupIntent の ID を渡してボーナスだけ受け取る、を防ぐ。 */
    if (intent.metadata?.user_id !== user.id) {
      console.error("[stripe/confirm-card] user_id が一致しません:", setupIntentId, user.id);
      return json({ error: "カード登録の情報が一致しませんでした。" }, 403);
    }
    /* CAPTCHA を通っていない SetupIntent にはボーナスを付けない。
       印を押すのは /api/stripe/setup-intent だけなので、通常の画面操作では必ず付いている。
       付いていないのは、CAPTCHA を入れる前に作られたものか、
       Stripe 側で直接作られたもの（＝経路を迂回している）。 */
    if (!hasCaptchaStamp(intent)) {
      console.error("[stripe/confirm-card] CAPTCHA の印がありません:", setupIntentId, user.id);
      return json({ error: "カードのご登録をやり直してください。" }, 403);
    }

    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("grant_card_bonus", { p_user: user.id });
    if (error) throw error;

    console.log(`[stripe/confirm-card] ${setupIntentId} → granted=${data?.granted} balance=${data?.balance}`);
    return json({
      granted: data?.granted ?? false,
      points: data?.points ?? 0,
      balance: data?.balance ?? 0,
    });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[stripe/confirm-card] 設定エラー:", e.message);
      return json({ error: "ただいまカードのご登録をご利用いただけません。" }, 503);
    }
    console.error("[stripe/confirm-card] 失敗:", e);
    return json({ error: "カード登録の確認に失敗しました。" }, 500);
  }
}

export function GET() {
  return json({ error: "Method Not Allowed" }, 405);
}
