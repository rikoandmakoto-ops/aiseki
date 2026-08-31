/* =====================================================================
   api/_router.js — catch-all の入口から、元のハンドラへ振り分ける

   なぜこれがあるか:
     Vercel の Hobby プランは Serverless Function を12個までしか作れない。
     api/<dir>/<name>.js を1本ずつ関数にすると15個になり、
       「No more than 12 Serverless Functions」
     でデプロイが落ちる。そこでディレクトリごとに [...path].js を1本だけ置き、
     中身は今まで通り _<name>.js に残したまま、ここで振り分ける。
     → 関数は admin / dm / sms / stripe / cron の5個。

   ⚠ 先頭が "_" のファイルは Vercel が関数として公開しない。
     ハンドラを _<name>.js に置き換えてあるのはそのため。
     名前から "_" を外すと、その時点でまた関数が1つ増える。

   ⚠ URL は一切変えていない。/api/dm/start は /api/dm/start のまま。
     画面側（src/lib/api.js · src/lib/adminApi.js · src/screens/*）も
     Stripe に登録した Webhook の URL も、そのままで動く。

   ⚠ 振り分けの材料は request.url の pathname だけ。
     Vercel が [...path] を query に載せる挙動には依存しない。
   ===================================================================== */
import { json } from "./_lib.js";

const notFound = () => json({ error: "Not Found" }, 404);
const notAllowed = () => json({ error: "Method Not Allowed" }, 405);

/* "/api/dm/start" → "start"。
   入口の直下1階層だけを受ける（"/api/dm/start/x" や "/api/dm" は 404）。
   もとの api/dm/start.js も、その形でしか呼べなかった。 */
function routeName(prefix, url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(`${prefix}/`)) return null;

  const rest = pathname.slice(prefix.length + 1).replace(/\/+$/, "");
  if (!rest || rest.includes("/")) return null;

  try {
    return decodeURIComponent(rest);
  } catch {
    // 壊れた %エスケープ。該当する経路は無いので 404 に落とす。
    return null;
  }
}

/* routes は { "start": import * as _start.js, ... }。
   モジュールが持っていないメソッドは 405。
   もとのファイルでも、書いていないメソッドは Vercel が 405 を返していた。 */
export function createDispatcher(prefix, routes) {
  return function dispatch(method, request) {
    const name = routeName(prefix, request.url);
    if (!name) return notFound();

    const mod = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
    if (!mod) return notFound();

    const handler = mod[method];
    if (typeof handler !== "function") return notAllowed();

    return handler(request);
  };
}
