/* =====================================================================
   GET /api/stripe/status

   決済（Stripe）が使える状態かどうかだけを返す。
   購入画面はこれを見て「準備中」の表示に切り替える。

   キーそのものや、どの設定が欠けているかは返さない
   （鍵の有無を外から探れるようにしない）。
   ===================================================================== */
import { env, json } from "../_lib.js";

export function GET() {
  const enabled = Boolean(
    env("STRIPE_SECRET_KEY") &&
    env("STRIPE_WEBHOOK_SECRET") &&
    env("SUPABASE_SERVICE_ROLE_KEY")
  );
  return json({ enabled });
}

export function POST() {
  return json({ error: "Method Not Allowed" }, 405);
}
