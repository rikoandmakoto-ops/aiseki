/* =====================================================================
   GET /api/stripe/status

   決済（Stripe）が使える状態かどうかを返す。
   購入画面・カード登録バナーはこれを見て「準備中」の表示に切り替える。

   返すもの:
     enabled        … ポイント購入・カード登録を出してよいか
     publishableKey … Stripe.js に渡す公開可能キー（公開前提の値）
     captchaSiteKey … Turnstile のサイトキー（公開前提の値）。
                      カード登録の画面がウィジェットを描くのに要る。
                      VITE_ の値はビルド時に焼き込まれるが --prebuilt では
                      空で出ることがあるので、ここからも配る（HANDOFF §15）。

   シークレットキーや、どの設定が欠けているかは返さない
   （鍵の有無を外から探れるようにしない）。

   ⚠ STRIPE_WEBHOOK_SECRET は enabled の条件に入れない。
     署名シークレットは Stripe 側にエンドポイントを登録して初めて手に入るので、
     これを必須にすると「登録するまで画面に何も出ない」で堂々巡りになる。
     ポイント購入の付与は Webhook 経由だけなので、シークレットが入るまでは
     支払いだけ通ってポイントが付かない。先に Webhook を登録すること。
     （カード登録のボーナスは /api/stripe/confirm-card からも付くため、
       Webhook が未登録でも成立する）
   ===================================================================== */
import { captchaSiteKey } from "../_captcha.js";
import { env, json } from "../_lib.js";

export function GET() {
  const publishableKey = env("VITE_STRIPE_PUBLISHABLE_KEY", "STRIPE_PUBLISHABLE_KEY");
  const siteKey = captchaSiteKey();

  const enabled = Boolean(
    env("STRIPE_SECRET_KEY") &&
    env("SUPABASE_SERVICE_ROLE_KEY")
  );

  return json({
    enabled,
    /* カード登録はブラウザ側で Stripe.js と Turnstile を動かすので、
       公開可能キーとサイトキーの両方が要る。
       ⚠ サイトキーが無いのに画面を出すと、CAPTCHA を解けないまま
         /api/stripe/setup-intent が 400 を返し続ける（＝登録できない）。
         最初から「準備中」にしておく。 */
    cardEnabled: enabled && Boolean(publishableKey) && Boolean(siteKey),
    publishableKey: publishableKey || null,
    captchaSiteKey: siteKey || null,
  });
}

export function POST() {
  return json({ error: "Method Not Allowed" }, 405);
}
