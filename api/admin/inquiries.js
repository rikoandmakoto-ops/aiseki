/* =====================================================================
   /api/admin/inquiries — 運営がお問い合わせ・通報を見て、対応状況を動かす

     GET   … 全件を service_role で取得（kind / status で絞り込み）
     PATCH … status を更新（open → in_review → resolved → closed）

   ・inquiries の RLS は「本人が自分の分だけ読める」「status は書けない」なので、
     運営の読み書きは service_role でしか通らない（＝必ずここを経由する）。
   ・運営かどうかの判定は requireAdmin()。ADMIN_EMAILS（api/_lib.js）が唯一の出典で、
     画面側には同じリストを置いていない。

   ⚠ profiles への埋め込みは外部キー名を明示する。
     inquiries は user_id と target_user_id の2本が profiles を指しているため、
     名前を書かないと PGRST201（Could not embed … more than one relationship）で落ちる
     （HANDOFF.md §7 と同じ形）。
   ===================================================================== */
import { ConfigError, json, requireAdmin, serviceClient } from "../_lib.js";

const KINDS = ["question", "report", "feedback"];
const STATUSES = ["open", "in_review", "resolved", "closed"];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* 一覧・詳細で使う列。通報の調査には「誰が・誰を・どの会について」が要るので、
   送信者・対象者・対象の会をまとめて引く。 */
const SELECT = [
  "id",
  "user_id",
  "kind",
  "subject",
  "body",
  "reply_email",
  "target_user_id",
  "target_party_id",
  "status",
  "created_at",
  "sender:profiles!inquiries_user_id_fkey(id,username,avatar_url)",
  "target:profiles!inquiries_target_user_id_fkey(id,username,avatar_url)",
  "party:parties!inquiries_target_party_id_fkey(id,title,location,area,status,party_date)",
].join(",");

/* profiles にメールアドレスは無い（auth.users にある）。
   Admin API で1人ずつ引き、同じ人は1回で済ませる。
   一覧は最大 200 件なので、多くても 400 人ぶん。少しずつ投げる。 */
async function attachEmails(db, rows) {
  const ids = new Set();
  for (const r of rows) {
    if (r.user_id) ids.add(r.user_id);
    if (r.target_user_id) ids.add(r.target_user_id);
  }

  const emails = new Map();
  const list = [...ids];
  for (let i = 0; i < list.length; i += 8) {
    const found = await Promise.all(
      list.slice(i, i + 8).map(async (id) => {
        try {
          const { data, error } = await db.auth.admin.getUserById(id);
          if (error) return null;
          return [id, data?.user?.email ?? null];
        } catch {
          // 退会直後などで引けなくても、一覧そのものは出せるようにする
          return null;
        }
      })
    );
    for (const f of found) if (f) emails.set(f[0], f[1]);
  }

  const person = (id, profile) => {
    if (!id && !profile) return null;
    return {
      id: id ?? profile?.id ?? null,
      display_name: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      email: emails.get(id) ?? null,
    };
  };

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    body: r.body,
    reply_email: r.reply_email,
    status: r.status,
    created_at: r.created_at,
    sender: person(r.user_id, r.sender),
    target: person(r.target_user_id, r.target),
    party: r.party ?? null,
  }));
}

/* ステータスごとの件数。種別の絞り込みは効かせる（状態のタブに出す数なので）。 */
async function countByStatus(db, kind) {
  const counts = {};
  await Promise.all(
    STATUSES.map(async (s) => {
      let q = db.from("inquiries").select("id", { count: "exact", head: true }).eq("status", s);
      if (kind) q = q.eq("kind", kind);
      const { count, error } = await q;
      if (error) throw error;
      counts[s] = count ?? 0;
    })
  );
  counts.total = STATUSES.reduce((a, s) => a + counts[s], 0);
  return counts;
}

const pick = (allowed, v) => (allowed.includes(v) ? v : null);

export async function GET(request) {
  try {
    const { error: denied } = await requireAdmin(request);
    if (denied) return denied;

    const db = serviceClient();
    const params = new URL(request.url).searchParams;
    const kind = pick(KINDS, params.get("kind"));
    const status = pick(STATUSES, params.get("status"));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT));

    let q = db.from("inquiries").select(SELECT).order("created_at", { ascending: false }).limit(limit);
    if (kind) q = q.eq("kind", kind);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw error;

    const [items, counts] = await Promise.all([attachEmails(db, data ?? []), countByStatus(db, kind)]);
    return json({ items, counts, filters: { kind, status, limit } });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[admin/inquiries] 設定エラー:", e.message);
      return json({ error: "サーバーの設定が済んでいません。" }, 503);
    }
    console.error("[admin/inquiries] 取得に失敗:", e);
    return json({ error: "お問い合わせを取得できませんでした。" }, 500);
  }
}

export async function PATCH(request) {
  try {
    const { error: denied } = await requireAdmin(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    const id = String(body?.id ?? "").trim();
    const status = String(body?.status ?? "").trim();
    if (!UUID_RE.test(id)) return json({ error: "対象のお問い合わせが指定されていません。" }, 400);
    if (!STATUSES.includes(status)) return json({ error: "対応状況の値が正しくありません。" }, 400);

    const db = serviceClient();
    const { data, error } = await db
      .from("inquiries")
      .update({ status })
      .eq("id", id)
      .select(SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "対象のお問い合わせが見つかりません。" }, 404);

    const [item] = await attachEmails(db, [data]);
    return json({ item });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[admin/inquiries] 設定エラー:", e.message);
      return json({ error: "サーバーの設定が済んでいません。" }, 503);
    }
    console.error("[admin/inquiries] 更新に失敗:", e);
    return json({ error: "対応状況を変更できませんでした。" }, 500);
  }
}

/* 想定していないメソッドは受け付けない */
const notAllowed = () => json({ error: "Method Not Allowed" }, 405);
export const POST = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
