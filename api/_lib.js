/* =====================================================================
   /api 共通のヘルパー（Vercel Functions · Node.js ランタイム）

   先頭が "_" のファイルはエンドポイントとして公開されない。

   環境変数（Vercel のプロジェクト設定 / ローカルは .env）
     STRIPE_SECRET_KEY          … sk_test_... （テストモード）
     STRIPE_WEBHOOK_SECRET      … whsec_...
     SUPABASE_URL               … 未設定なら VITE_SUPABASE_URL を使う
     SUPABASE_ANON_KEY          … 未設定なら VITE_SUPABASE_ANON_KEY を使う
     SUPABASE_SERVICE_ROLE_KEY  … Webhook からポイントを付与するために必須。
                                  ブラウザには絶対に渡さない（VITE_ を付けない）。
   ===================================================================== */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/* 運営（/admin の管理画面）を使えるメールアドレス。**ここが唯一の出典。**
   画面側には持たせない（ブラウザに配る値は書き換えられるので判定に使えない）。
   AdminScreen は API が 403 を返すかどうかだけで可否を決めている。

   ⚠ 完全一致で比べる。Gmail の +エイリアス（theoffzaki+xxx@gmail.com）は
     同じ受信箱に届くが、別アカウントとして登録できてしまうため運営とは見なさない
     （実際にテスト用の +ui... アカウントが存在する）。 */
export const ADMIN_EMAILS = ["theoffzaki@gmail.com"];

/* 未設定と placeholder のままの値を同じ「未設定」として扱う。
   （.env / .env.example にはサンプル値を置いてあるため、値の有無だけでは判定できない。
     sk_test_placeholder のように接頭辞の後ろに置かれる形も拾う） */
const PLACEHOLDER = /(^|[_-])(your|placeholder|changeme|example|xxx)/i;

export function env(...names) {
  for (const name of names) {
    const v = String(process.env[name] ?? "").trim();
    if (v && !PLACEHOLDER.test(v)) return v;
  }
  return "";
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* 設定漏れは 503 で返す。画面には「決済の準備ができていない」と表示する。 */
export class ConfigError extends Error {}

export function getStripe() {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new ConfigError("STRIPE_SECRET_KEY が設定されていません。");
  // API バージョンは SDK が固定しているものをそのまま使う（明示指定しない）。
  return new Stripe(key);
}

/* service_role クライアント。RLS を迂回できるのでサーバ内でのみ使う。 */
export function serviceClient() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new ConfigError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません。");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* Authorization: Bearer <access token> を検証して、ログイン中のユーザーを返す。 */
export async function requireUser(request) {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) throw new ConfigError("Supabase の接続情報が設定されていません。");

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data?.user ?? null;
}

/* 管理画面用。ログイン中のユーザーが運営かどうかまで見る。
   拒否のときは、そのまま返せる Response を error に入れて返す
   （呼び出し側で 401 と 403 を書き分けなくて済むようにする）。 */
export async function requireAdmin(request) {
  const user = await requireUser(request);
  if (!user) return { user: null, error: json({ error: "ログインが必要です。" }, 401) };

  const email = String(user.email ?? "").trim().toLowerCase();
  const allowed = ADMIN_EMAILS.some((a) => a.toLowerCase() === email);
  // メール未確認のアカウントは運営として扱わない（確認 ON の今は起こらないが、
  // 設定が変わったときに素通しにならないようにしておく）
  if (!allowed || !user.email_confirmed_at) {
    return { user: null, error: json({ error: "この画面を利用する権限がありません。" }, 403) };
  }
  return { user, error: null };
}

/* success_url / cancel_url の組み立て。
   Origin ヘッダをそのまま信用すると外部サイトへ飛ばせてしまうため、
   Host ヘッダから組み立てる（PUBLIC_BASE_URL があればそちらを優先）。 */
export function baseUrl(request) {
  const configured = env("PUBLIC_BASE_URL");
  if (configured) return configured.replace(/\/+$/, "");
  const host = request.headers.get("host") || "localhost:3000";
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}
