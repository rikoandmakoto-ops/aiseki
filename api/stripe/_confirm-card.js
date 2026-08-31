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
     ・**そのカードが既に別のアカウントで使われていないかも見る**
       （Stripe の fingerprint。判定は api/_card.js → grant_card_bonus()）。
     ・付与は grant_card_bonus()（service_role 専用・冪等）。
       Webhook と両方から呼ばれても二重には付かない。
   ===================================================================== */
import { DUPLICATE_CARD_MESSAGE, grantCardBonus } from "../_card.js";
import { hasCaptchaStamp } from "../_captcha.js";
import { ConfigError, getStripe, json, requireUser } from "../_lib.js";

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
    /* payment_method を展開して取る。カードの fingerprint を見るため
       （同じカードでボーナスを何度も受け取らせない。api/_card.js）。 */
    const intent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });

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

    const result = await grantCardBonus(stripe, intent, user.id);

    /* カード1枚につき1アカウント。既に別の方が使っているカードだった。
       カードの登録そのもの（Stripe 側）は成立しているので、
       「登録に失敗した」ではなく「ボーナスは付かない」と伝える。
       profiles.card_registered は false のままなので、
       別の未使用カードで登録し直せば受け取れる。 */
    if (result.reason === "duplicate") {
      return json({
        error: DUPLICATE_CARD_MESSAGE,
        duplicateCard: true,
        granted: false,
        points: 0,
        balance: result.balance,
      }, 409);
    }

    /* カードの識別子が取れなかった。付与しない（api/_card.js の fail-closed）。
       通常の登録では起きない。 */
    if (result.reason === "no_fingerprint") {
      return json({ error: "カード情報を確認できませんでした。お手数ですがもう一度お試しください。" }, 409);
    }

    console.log(`[stripe/confirm-card] ${setupIntentId} → granted=${result.granted} balance=${result.balance}`);
    return json({
      granted: result.granted,
      points: result.points,
      balance: result.balance,
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
