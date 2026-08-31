/* =====================================================================
   /api/admin/gate — 運営画面の入口（メール ＋ 管理者パスワードの2段）

     GET  … 「このアカウントは運営か」「合言葉を通しているか」を返す。
            運営でなければ 403。画面はこれを見てトップへ帰す。
     POST … { password } を照合し、通ったら証明（token）を発行する。

   ⚠ 判定の材料はすべてサーバにある。
     ・運営かどうか … api/_lib.js の ADMIN_EMAILS
     ・合言葉        … 環境変数 ADMIN_PASSWORD（ブラウザには配らない）
     画面側にどちらも持たせない（ブラウザに配る値は書き換えられる）。

   ⚠ 総当たり対策はプロセス内のカウンタで行う。Fluid Compute は
     インスタンスを使い回すので実際にはよく効くが、**インスタンスが
     増えればその分だけ試行できる**ので、これは補助でしかない。
     本体は「そもそも運営のアカウントでログインしていないと POST まで
     辿り着けない（requireAdmin が先）」という作りのほう。
   ===================================================================== */
import {
  ConfigError, json, requireAdmin,
  adminPassword, adminPasswordMatches, adminUnlockValid, adminUnlockFromRequest, issueAdminUnlock,
} from "../_lib.js";

const MAX_ATTEMPTS = 5;              // 連続失敗をここまで
const LOCKOUT_MS = 10 * 60 * 1000;   // 超えたら10分間は受け付けない
const attempts = new Map();          // user.id → { count, until }

function throttleState(userId) {
  const rec = attempts.get(userId);
  if (!rec) return null;
  if (rec.until && rec.until <= Date.now()) { attempts.delete(userId); return null; }
  return rec;
}

export async function GET(request) {
  try {
    const { user, error: denied } = await requireAdmin(request);
    if (denied) return denied;

    return json({
      admin: true,
      configured: !!adminPassword(),
      unlocked: adminUnlockValid(adminUnlockFromRequest(request), user),
    });
  } catch (e) {
    return fail("確認", e);
  }
}

export async function POST(request) {
  try {
    const { user, error: denied } = await requireAdmin(request);
    if (denied) return denied;

    if (!adminPassword()) {
      console.error("[admin/gate] ADMIN_PASSWORD が設定されていません。");
      return json({ error: "サーバーの設定が済んでいません（ADMIN_PASSWORD）。" }, 503);
    }

    const rec = throttleState(user.id);
    if (rec && rec.count >= MAX_ATTEMPTS) {
      const mins = Math.max(1, Math.ceil((rec.until - Date.now()) / 60000));
      return json({ error: `入力を続けて間違えたため、約${mins}分お待ちください。` }, 429);
    }

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }
    const password = String(body?.password ?? "");
    if (!password) return json({ error: "管理者パスワードを入力してください。" }, 400);

    if (!adminPasswordMatches(password)) {
      const count = (rec?.count ?? 0) + 1;
      attempts.set(user.id, { count, until: Date.now() + LOCKOUT_MS });
      console.warn(`[admin/gate] 管理者パスワードの不一致（${user.email} / ${count}回目）`);
      // 401/403 は「運営のアカウントではない」の意味で使っているので、
      // 合言葉の不一致には別のコードを当てる（画面が行き先を取り違えないように）
      return json({ error: "管理者パスワードが違います。", remaining: Math.max(0, MAX_ATTEMPTS - count) }, 422);
    }

    attempts.delete(user.id);
    const { token, expiresAt } = issueAdminUnlock(user);
    return json({ token, expiresAt });
  } catch (e) {
    return fail("照合", e);
  }
}

function fail(what, e) {
  if (e instanceof ConfigError) {
    console.error(`[admin/gate] 設定エラー(${what}):`, e.message);
    return json({ error: "サーバーの設定が済んでいません。" }, 503);
  }
  console.error(`[admin/gate] ${what}に失敗:`, e);
  return json({ error: "管理者の確認に失敗しました。" }, 500);
}

const notAllowed = () => json({ error: "Method Not Allowed" }, 405);
export const PUT = notAllowed;
export const PATCH = notAllowed;
export const DELETE = notAllowed;
