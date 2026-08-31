/* =====================================================================
   /api/dm/* の入口（1関数にまとめてある。理由は api/_router.js）

     /api/dm/start     … api/dm/_start.js
     /api/dm/status    … api/dm/_status.js
     /api/dm/targets   … api/dm/_targets.js
     /api/dm/templates … api/dm/_templates.js

   ⚠ api/dm/_dm.js は前から helper。ここでは読み込まない
     （それぞれのハンドラが今まで通り読んでいる）。

   運営かどうか＋合言葉（requireAdminUnlocked）の2段は、
   ここではなく各ハンドラの中で見ている。まとめても関門は減っていない。
   ===================================================================== */
import { createDispatcher } from "../_router.js";
import * as start from "./_start.js";
import * as status from "./_status.js";
import * as targets from "./_targets.js";
import * as templates from "./_templates.js";

const dispatch = createDispatcher("/api/dm", { start, status, targets, templates });

export const GET = (request) => dispatch("GET", request);
export const POST = (request) => dispatch("POST", request);
export const PUT = (request) => dispatch("PUT", request);
export const PATCH = (request) => dispatch("PATCH", request);
export const DELETE = (request) => dispatch("DELETE", request);
