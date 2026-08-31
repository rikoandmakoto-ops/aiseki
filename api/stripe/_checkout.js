/* =====================================================================
   POST /api/stripe/checkout

   ポイント購入の Stripe Checkout セッションを作る。
   ・購入者はログイン中のユーザー（Authorization: Bearer <access token>）
   ・買えるのは src/lib/packs.js に定義されたパックのみ。
     金額とポイント数はサーバ側で引き直すので、
     クライアントが値を書き換えても付与量は変わらない。
   ・ポイントの付与はここでは行わない。
     支払い完了の通知（/api/stripe/webhook）を受けてから付与する。
   ===================================================================== */
import { ConfigError, baseUrl, getStripe, json, requireUser } from "../_lib.js";
import { findPack, packName } from "../../src/lib/packs.js";

export async function POST(request) {
  try {
    const user = await requireUser(request);
    if (!user) return json({ error: "ログインが必要です。" }, 401);

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    const pack = findPack(String(body?.packId ?? ""));
    if (!pack) return json({ error: "ポイントパックが選択されていません。" }, 400);

    const stripe = getStripe();
    const origin = baseUrl(request);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // 領収書の送付先。Checkout の画面でも変更できる。
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: pack.price, // 円は最小単位が1円（zero-decimal）
            product_data: {
              name: packName(pack),
              description: `AISEKI のグループ飲み会への参加に使えるポイント ${pack.points.toLocaleString("ja-JP")}pt`,
            },
          },
        },
      ],
      // Webhook でポイントを付与するときに使う情報。
      // session と payment_intent の両方に載せておく。
      metadata: { user_id: user.id, pack_id: pack.id, points: String(pack.points) },
      payment_intent_data: {
        metadata: { user_id: user.id, pack_id: pack.id, points: String(pack.points) },
      },
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return json({ url: session.url, sessionId: session.id });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[stripe/checkout] 設定エラー:", e.message);
      return json({ error: "ただいま決済をご利用いただけません。時間をおいてお試しください。" }, 503);
    }
    console.error("[stripe/checkout] 失敗:", e);
    return json({ error: "決済ページを開けませんでした。" }, 500);
  }
}

/* GET などは受け付けない */
export function GET() {
  return json({ error: "Method Not Allowed" }, 405);
}
