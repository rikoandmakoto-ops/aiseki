/* =====================================================================
   /api/sms/* の入口（1関数にまとめてある。理由は api/_router.js）

     /api/sms/start  … api/sms/_start.js   確認コードを送る
     /api/sms/check  … api/sms/_check.js   照合して phone_verified を立てる
     /api/sms/status … api/sms/_status.js  設定が入っているか（ログイン不要）

   ⚠ 認証済みにする経路が /api/sms/check だけであることは変わらない。
     ここは振り分けるだけで、Twilio も DB も触らない。
   ===================================================================== */
import { createDispatcher } from "../_router.js";
import * as check from "./_check.js";
import * as start from "./_start.js";
import * as status from "./_status.js";

const dispatch = createDispatcher("/api/sms", { check, start, status });

export const GET = (request) => dispatch("GET", request);
export const POST = (request) => dispatch("POST", request);
export const PUT = (request) => dispatch("PUT", request);
export const PATCH = (request) => dispatch("PATCH", request);
export const DELETE = (request) => dispatch("DELETE", request);
