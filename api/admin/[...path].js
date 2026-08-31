/* =====================================================================
   /api/admin/* の入口（1関数にまとめてある。理由は api/_router.js）

     /api/admin/gate      … api/admin/_gate.js
     /api/admin/inquiries … api/admin/_inquiries.js

   ここでは判定を一切しない。運営かどうか（requireAdmin）は
   それぞれのハンドラの中で今まで通り見ている。
   ===================================================================== */
import { createDispatcher } from "../_router.js";
import * as gate from "./_gate.js";
import * as inquiries from "./_inquiries.js";

const dispatch = createDispatcher("/api/admin", { gate, inquiries });

export const GET = (request) => dispatch("GET", request);
export const POST = (request) => dispatch("POST", request);
export const PUT = (request) => dispatch("PUT", request);
export const PATCH = (request) => dispatch("PATCH", request);
export const DELETE = (request) => dispatch("DELETE", request);
