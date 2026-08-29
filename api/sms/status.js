/* =====================================================================
   GET /api/sms/status

   SMS認証を使える設定になっているか。ログイン不要（鍵は一切返さない）。

   画面はこれを見て「認証してください」の案内を出すかどうかを決める。
   🚨 設定が入っていないのに案内だけ出すと、DB 側の関門
     （assert_phone_verified）で参加が止まったまま、利用者には
     どうにもできない状態になる。そのための入口の確認。
   ===================================================================== */
import { json } from "../_lib.js";
import { smsConfigured } from "../_twilio.js";

export function GET() {
  return json({ enabled: smsConfigured() });
}

export function POST() {
  return json({ error: "Method Not Allowed" }, 405);
}
