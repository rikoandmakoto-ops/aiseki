/* =====================================================================
   POST /api/stripe/webhook

   Stripe からの通知を受けて、ポイントを付与する。
   ポイントが増えるのはサーバ側のこの経路だけ
   （purchase_points / grant_card_bonus は service_role 専用）。

   受けるのは2種類:
     ・支払い完了（checkout.session.completed …） → 購入したポイント
     ・カード登録の完了（setup_intent.succeeded） → 登録ボーナス 5,000pt

   ・署名（Stripe-Signature）を検証できないリクエストは受け付けない。
     検証しないと、誰でもこの URL を叩いてポイントを増やせてしまう。
   ・Stripe は同じイベントを再送することがあるため、
     付与は grant_purchased_points() 側で
     Checkout セッションIDを一意キーにして冪等にしている。

   Vercel のダッシュボード / Stripe CLI で、この URL をエンドポイントに登録する:
     stripe listen --forward-to localhost:3000/api/stripe/webhook
   ===================================================================== */
import { grantCardBonus } from "../_card.js";
import { hasCaptchaStamp } from "../_captcha.js";
import { ConfigError, env, getStripe, json, serviceClient } from "../_lib.js";

/* 支払い済みとみなすイベント（コンビニ決済などは後から確定する） */
const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/* カード登録の完了。5,000pt（signup_bonus）の付与はここが正規の経路。
   付与は grant_card_bonus() 側で profiles.card_registered を使って
   冪等にしているので、再送されても増えない。

   カードの fingerprint も見る（api/_card.js）。既に別のアカウントで
   使われているカードにはボーナスを付けない。 */
async function handleSetupIntent(stripe, event) {
  const intent = event.data.object;
  const userId = intent.metadata?.user_id;

  if (!userId) {
    console.error("[stripe/webhook] setup_intent に user_id がありません:", intent.id);
    // 200 で返す。再送されても直らないため。
    return json({ received: true, skipped: "no user_id" });
  }

  /* CAPTCHA を通って作られた SetupIntent でなければ付与しない（api/_captcha.js）。
     印を押すのは /api/stripe/setup-intent だけ。ここが抜けていると、
     Stripe 側で直接作った SetupIntent を成功させるだけでボーナスが取れてしまう。
     200 を返す（再送されても結果は変わらないため）。 */
  if (!hasCaptchaStamp(intent)) {
    console.error("[stripe/webhook] CAPTCHA の印がない setup_intent:", intent.id, userId);
    return json({ received: true, skipped: "no captcha stamp" });
  }

  try {
    const result = await grantCardBonus(stripe, intent, userId);

    /* 既に別のアカウントで使われているカード、または識別子が取れなかった。
       どちらも 200 で返す（再送されても結果は変わらないため）。
       画面から /api/stripe/confirm-card も呼ばれていて、
       そちらが利用者に理由を伝えている。 */
    if (result.ok === false) {
      return json({ received: true, skipped: result.reason });
    }

    console.log(`[stripe/webhook] ${event.type} ${intent.id} → granted=${result.granted} balance=${result.balance}`);
    return json({ received: true, granted: result.granted });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[stripe/webhook] 設定エラー:", e.message);
      return json({ error: "not configured" }, 503);
    }
    // 500 を返すと Stripe が再送してくれる（付与は冪等なので二重付与にならない）
    console.error("[stripe/webhook] カード登録ボーナスの付与に失敗:", e);
    return json({ error: "grant failed" }, 500);
  }
}

export async function POST(request) {
  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("[stripe/webhook] 設定エラー:", e.message);
    return json({ error: "not configured" }, 503);
  }

  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET が設定されていません。");
    return json({ error: "not configured" }, 503);
  }

  // 署名検証には生のボディが必要（パース済みの JSON では検証できない）
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (e) {
    console.error("[stripe/webhook] 署名の検証に失敗:", e.message);
    return json({ error: "invalid signature" }, 400);
  }

  if (event.type === "setup_intent.succeeded") {
    return handleSetupIntent(stripe, event);
  }

  if (!PAID_EVENTS.has(event.type)) {
    return json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    // 未払い（async 決済の待ち）。確定時に別のイベントが届く。
    return json({ received: true, pending: true });
  }

  const userId = session.client_reference_id || session.metadata?.user_id;
  const points = Number(session.metadata?.points);
  const packId = session.metadata?.pack_id || "unknown";

  if (!userId || !Number.isInteger(points) || points <= 0) {
    console.error("[stripe/webhook] metadata が不正です:", session.id, session.metadata);
    // 200 で返す。再送されても直らないため。
    return json({ received: true, skipped: "invalid metadata" });
  }

  try {
    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("grant_purchased_points", {
      p_user: userId,
      p_points: points,
      p_session: session.id,
      p_pack: packId,
      p_amount_jpy: Number(session.amount_total ?? 0),
      p_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
    });
    if (error) throw error;

    // granted=false は「同じセッションで既に付与済み」（再送）を意味する
    console.log(`[stripe/webhook] ${event.type} ${session.id} → granted=${data?.granted} balance=${data?.balance}`);
    return json({ received: true, granted: data?.granted ?? false });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[stripe/webhook] 設定エラー:", e.message);
      return json({ error: "not configured" }, 503);
    }
    // 500 を返すと Stripe が再送してくれる（付与は冪等なので二重付与にならない）
    console.error("[stripe/webhook] ポイント付与に失敗:", e);
    return json({ error: "grant failed" }, 500);
  }
}

export function GET() {
  return json({ error: "Method Not Allowed" }, 405);
}
