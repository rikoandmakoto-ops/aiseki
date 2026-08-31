/* =====================================================================
   /api/stripe/* の入口（1関数にまとめてある。理由は api/_router.js）

     /api/stripe/checkout     … api/stripe/_checkout.js
     /api/stripe/confirm-card … api/stripe/_confirm-card.js
     /api/stripe/setup-intent … api/stripe/_setup-intent.js
     /api/stripe/status       … api/stripe/_status.js
     /api/stripe/webhook      … api/stripe/_webhook.js

   ⚠ Webhook の URL（/api/stripe/webhook）は Stripe 側に登録済みなので変えない。
     署名の検証は生のボディで行う。ここは request をそのまま渡すだけで、
     ボディを読まない（読むと _webhook.js の request.text() が空になる）。
   ===================================================================== */
import { createDispatcher } from "../_router.js";
import * as checkout from "./_checkout.js";
import * as confirmCard from "./_confirm-card.js";
import * as setupIntent from "./_setup-intent.js";
import * as status from "./_status.js";
import * as webhook from "./_webhook.js";

const dispatch = createDispatcher("/api/stripe", {
  checkout,
  "confirm-card": confirmCard,
  "setup-intent": setupIntent,
  status,
  webhook,
});

export const GET = (request) => dispatch("GET", request);
export const POST = (request) => dispatch("POST", request);
export const PUT = (request) => dispatch("PUT", request);
export const PATCH = (request) => dispatch("PATCH", request);
export const DELETE = (request) => dispatch("DELETE", request);
