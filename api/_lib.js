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
     ADMIN_PASSWORD             … 運営画面（/admin/dm）の2段目の合言葉。
                                  ブラウザには絶対に渡さない（VITE_ を付けない）。
   ===================================================================== */
import crypto from "node:crypto";
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

/* ─────────────────────────────────────────────────────────────
   運営画面の2段目 — 管理者パスワード（ADMIN_PASSWORD）

   メールアドレスだけだと「そのアカウントにログインできる状態」＝管理画面が開く。
   営業リスト（dm_*）はそこまで軽く出したくないので、DM の API には
   **合言葉を通したことの証明**（x-admin-unlock ヘッダ）を要求する。

   ⚠ 合言葉そのものはブラウザに配らない。照合はここ（サーバ）だけで行い、
     成功したら「誰に・いつまで」を署名した短い文字列を返す。
     鍵は ADMIN_PASSWORD から作るので、**パスワードを変えると
     発行済みの証明はすべて無効になる**（＝失効の手段でもある）。

   ⚠ ADMIN_PASSWORD が未設定のときは通さない（fail closed）。
     「設定し忘れたら素通し」にすると、環境変数の入れ忘れが即そのまま穴になる。
   ───────────────────────────────────────────────────────────── */
const ADMIN_UNLOCK_TTL_SEC = 8 * 60 * 60; // 8時間。運営が1日作業する想定
const ADMIN_UNLOCK_HEADER = "x-admin-unlock";

export const adminPassword = () => env("ADMIN_PASSWORD");

/* 署名鍵。生のパスワードを鍵にせず、一度ハッシュに通してから使う。 */
const unlockKey = () =>
  crypto.createHash("sha256").update(`aiseki.admin.unlock|${adminPassword()}`).digest();

/* 長さの違いで早く抜けないよう、両方を固定長のダイジェストにしてから比べる。 */
export function adminPasswordMatches(input) {
  const expected = adminPassword();
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(String(input ?? "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function issueAdminUnlock(user) {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_UNLOCK_TTL_SEC;
  const payload = `${user.id}.${exp}`;
  const sig = crypto.createHmac("sha256", unlockKey()).update(payload).digest("base64url");
  return {
    token: `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`,
    expiresAt: exp * 1000,
  };
}

export function adminUnlockValid(token, user) {
  if (!token || !user || !adminPassword()) return false;
  const [head, sig] = String(token).split(".");
  if (!head || !sig) return false;

  let payload = "";
  try { payload = Buffer.from(head, "base64url").toString("utf8"); } catch { return false; }

  const expected = crypto.createHmac("sha256", unlockKey()).update(payload).digest("base64url");
  const got = Buffer.from(sig, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return false;

  // 署名が合っていても、宛先と期限は別に見る（他人の証明を借りられないように）
  const [userId, exp] = payload.split(".");
  if (userId !== user.id) return false;
  return Number(exp) * 1000 > Date.now();
}

/* 運営メール（requireAdmin）＋ 管理者パスワードの両方を通ったときだけ許す。
   合言葉が要る／期限が切れたことは 423 で返し、401・403 と区別できるようにする
   （画面側は 423 なら合言葉の入力に戻り、403 ならトップへ帰す）。 */
export async function requireAdminUnlocked(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return { user: null, error };

  if (!adminPassword()) {
    console.error("[admin] ADMIN_PASSWORD が設定されていないため、管理画面を開けません。");
    return { user: null, error: json({ error: "サーバーの設定が済んでいません（ADMIN_PASSWORD）。" }, 503) };
  }
  const token = (request.headers.get(ADMIN_UNLOCK_HEADER) || "").trim();
  if (!adminUnlockValid(token, user)) {
    return { user: null, error: json({ error: "管理者パスワードの入力が必要です。", locked: true }, 423) };
  }
  return { user, error: null };
}

/* GET /api/admin/gate と共有する。ヘッダ名を2箇所に書かないため。 */
export const adminUnlockFromRequest = (request) =>
  (request.headers.get(ADMIN_UNLOCK_HEADER) || "").trim();

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
