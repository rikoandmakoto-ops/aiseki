/* =====================================================================
   POST /api/stripe/webhook

   Stripe からの支払い完了通知を受けて、ポイントを付与する。
   ポイントが増えるのはこの経路だけ（purchase_points は service_role 専用）。

   ・署名（Stripe-Signature）を検証できないリクエストは受け付けない。
     検証しないと、誰でもこの URL を叩いてポイントを増やせてしまう。
   ・Stripe は同じイベントを再送することがあるため、
     付与は grant_purchased_points() 側で
     Checkout セッションIDを一意キーにして冪等にしている。

   Vercel のダッシュボード / Stripe CLI で、この URL をエンドポイントに登録する:
     stripe listen --forward-to localhost:3000/api/stripe/webhook
   ===================================================================== */
import { ConfigError, env, getStripe, json, serviceClient } from "../_lib.js";

/* 支払い済みとみなすイベント（コンビニ決済などは後から確定する） */
const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

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
