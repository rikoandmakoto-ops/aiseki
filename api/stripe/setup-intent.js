/* =====================================================================
   POST /api/stripe/setup-intent

   カードを登録する（＝あとで請求できる状態にする）ための SetupIntent を作る。
   返すのは client_secret だけ。カード番号はブラウザから Stripe へ直接送られ、
   AISEKI のサーバを通らない。

   ・登録できたら 5,000pt（signup_bonus）を差し上げる。
     付与するのはサーバ側だけ（/api/stripe/webhook・/api/stripe/confirm-card）。
     この関数はポイントに触らない。
   ・Stripe の Customer はユーザーごとに1つだけ作り、
     2回目以降は metadata から引き当てて使い回す。

   POST 応答:
     { clientSecret, publishableKey }
   ===================================================================== */
import { ConfigError, env, getStripe, json, requireUser } from "../_lib.js";

/* ユーザーに対応する Stripe Customer を返す（無ければ作る）。
   検索には metadata.user_id を使う。Customer 側にも同じ値を入れておく。 */
async function findOrCreateCustomer(stripe, user) {
  try {
    const found = await stripe.customers.search({
      query: `metadata['user_id']:'${user.id}'`,
      limit: 1,
    });
    if (found.data[0]) return found.data[0];
  } catch (e) {
    // search はインデックスの反映に十数秒かかることがある。失敗しても作成に進む。
    console.warn("[stripe/setup-intent] customers.search に失敗:", e.message);
  }

  return stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { user_id: user.id },
  });
}

export async function POST(request) {
  try {
    const user = await requireUser(request);
    if (!user) return json({ error: "ログインが必要です。" }, 401);

    const stripe = getStripe();
    const customer = await findOrCreateCustomer(stripe, user);

    const intent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      // あとから本人がいない場面でも請求できるようにしておく
      usage: "off_session",
      // Webhook でボーナスを付けるときに、どのユーザーの登録かを見る
      metadata: { user_id: user.id },
    });

    return json({
      clientSecret: intent.client_secret,
      /* 公開可能キーはここからも返す。ビルド時に焼き込む
         VITE_STRIPE_PUBLISHABLE_KEY が空のまま出てしまっても、
         画面がカード登録に進めるようにするため。 */
      publishableKey: env("VITE_STRIPE_PUBLISHABLE_KEY", "STRIPE_PUBLISHABLE_KEY"),
    });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[stripe/setup-intent] 設定エラー:", e.message);
      return json({ error: "ただいまカードのご登録をご利用いただけません。" }, 503);
    }
    console.error("[stripe/setup-intent] 失敗:", e);
    return json({ error: "カード登録の準備に失敗しました。" }, 500);
  }
}

export function GET() {
  return json({ error: "Method Not Allowed" }, 405);
}
