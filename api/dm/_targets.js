/* =====================================================================
   /api/dm/targets — 営業リストの読み書き（運営専用）

     GET    … 一覧（status / 検索で絞り込み）＋ 集計
     POST   … 取り込み（CSV本文 or 1件ずつ）
     PATCH  … 送信状況の変更（pending / sent / failed / skipped）
     DELETE … 1件削除

   ・dm_* は RLS でポリシーを1つも作っていない（＝ anon / authenticated は
     何も読めない）。運営の読み書きは service_role でしか通らないので、
     必ずこのエンドポイントを経由する。
   ・運営かどうかの判定は requireAdminUnlocked()（api/_lib.js）。
     運営のメール（ADMIN_EMAILS）に加えて、管理者パスワード（ADMIN_PASSWORD）を
     通した証明が要る。/api/dm/* は全てこの2段。合言葉が無い／切れたときは 423。

   ⚠ ここは送信を行わない。理由は api/dm/_dm.js の冒頭を読むこと。
   ===================================================================== */
import { ConfigError, json, requireAdminUnlocked, serviceClient } from "../_lib.js";
import { DM_STATUSES, MAX_IMPORT_ROWS, csvToTargets, normalizeUsername } from "./_dm.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT =
  "id,username,display_name,category,follower_count,note,template_id,status,sent_at,last_error,attempts,created_at,updated_at";

/* PostgREST の or=() に渡す値。カンマと括弧が区切りとして効いてしまうので落とす。 */
const safeSearch = (v) => String(v).replace(/[,()*]/g, " ").trim();

export async function GET(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    const db = serviceClient();
    const params = new URL(request.url).searchParams;

    const status = DM_STATUSES.includes(params.get("status")) ? params.get("status") : null;
    const search = safeSearch(params.get("q") ?? "");
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT));

    let q = db.from("dm_targets").select(SELECT).order("created_at", { ascending: false }).limit(limit);
    if (status) q = q.eq("status", status);
    if (search) q = q.or(`username.ilike.%${search}%,display_name.ilike.%${search}%,category.ilike.%${search}%`);

    const [{ data, error }, { data: stats, error: statsError }] = await Promise.all([
      q,
      db.rpc("dm_stats"),
    ]);
    if (error) throw error;
    if (statsError) throw statsError;

    return json({ items: data ?? [], stats: stats ?? null, filters: { status, q: search, limit } });
  } catch (e) {
    return fail("一覧", e, "営業リストを取得できませんでした。");
  }
}

/* 取り込み。
     { csv: "..." }                     … CSV本文をまとめて
     { targets: [{ username, ... }] }   … 画面から1件ずつ

   ⚠ 既にある username は**上書きしない**（ignoreDuplicates）。
     上書きすると、送信済みの相手が pending に戻って二重送信になる。 */
export async function POST(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    let rows = [];
    let skipped = [];

    if (typeof body?.csv === "string" && body.csv.trim()) {
      ({ rows, skipped } = csvToTargets(body.csv));
    } else if (Array.isArray(body?.targets)) {
      for (const [i, t] of body.targets.entries()) {
        const username = normalizeUsername(t?.username);
        if (!username) {
          skipped.push({ line: i + 1, value: String(t?.username ?? "").trim(), reason: "ユーザー名として読めません" });
          continue;
        }
        rows.push({
          username,
          display_name: str(t?.display_name),
          category: str(t?.category),
          follower_count: Number.isFinite(Number(t?.follower_count)) && Number(t?.follower_count) >= 0
            ? Math.floor(Number(t.follower_count)) : null,
          note: str(t?.note),
        });
      }
    } else {
      return json({ error: "取り込む内容がありません。CSV を貼り付けてください。" }, 400);
    }

    if (rows.length === 0) {
      return json({ inserted: 0, duplicated: 0, skipped, error: "取り込める行がありませんでした。" }, 400);
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return json({ error: `一度に取り込めるのは${MAX_IMPORT_ROWS}件までです（${rows.length}件ありました）。` }, 413);
    }

    const db = serviceClient();

    /* 既にあるものを先に数えておく（upsert は「入らなかった件数」を返さないため）。 */
    const usernames = rows.map((r) => r.username);
    const existing = new Set();
    for (let i = 0; i < usernames.length; i += 500) {
      const { data, error } = await db
        .from("dm_targets").select("username").in("username", usernames.slice(i, i + 500));
      if (error) throw error;
      for (const r of data ?? []) existing.add(r.username);
    }

    const fresh = rows.filter((r) => !existing.has(r.username));
    let inserted = 0;
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500);
      const { data, error } = await db
        .from("dm_targets")
        .upsert(chunk, { onConflict: "username", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      inserted += data?.length ?? 0;
    }

    const { data: stats } = await db.rpc("dm_stats");
    return json({ inserted, duplicated: existing.size, skipped, stats: stats ?? null });
  } catch (e) {
    return fail("取り込み", e, "営業リストを取り込めませんでした。");
  }
}

/* 送信状況の変更。実際に送ったかどうかは人にしか分からないので、
   画面の操作をそのまま受けて dm_mark() に流す（履歴も向こうで残る）。 */
export async function PATCH(request) {
  try {
    const { user, error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    const id = String(body?.id ?? "").trim();
    const status = String(body?.status ?? "").trim();
    if (!UUID_RE.test(id)) return json({ error: "対象が指定されていません。" }, 400);
    if (!DM_STATUSES.includes(status)) return json({ error: "状況の値が正しくありません。" }, 400);

    const db = serviceClient();
    const { data, error } = await db.rpc("dm_mark", {
      p_id: id,
      p_status: status,
      p_note: str(body?.note),
      p_actor: user.email ?? null,
    });
    if (error) {
      if (error.code === "P0002" || /見つかりません/.test(error.message ?? "")) {
        return json({ error: "対象が見つかりません。" }, 404);
      }
      throw error;
    }

    const { data: stats } = await db.rpc("dm_stats");
    return json({ item: data ?? null, stats: stats ?? null });
  } catch (e) {
    return fail("状況の変更", e, "送信状況を変更できませんでした。");
  }
}

export async function DELETE(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    const id = String(new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!UUID_RE.test(id)) return json({ error: "対象が指定されていません。" }, 400);

    const db = serviceClient();
    const { data, error } = await db.from("dm_targets").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "対象が見つかりません。" }, 404);

    const { data: stats } = await db.rpc("dm_stats");
    return json({ ok: true, stats: stats ?? null });
  } catch (e) {
    return fail("削除", e, "削除できませんでした。");
  }
}

const str = (v) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, 500);
};

function fail(what, e, message) {
  if (e instanceof ConfigError) {
    console.error(`[dm/targets] 設定エラー(${what}):`, e.message);
    return json({ error: "サーバーの設定が済んでいません。" }, 503);
  }
  console.error(`[dm/targets] ${what}に失敗:`, e);
  return json({ error: message }, 500);
}

export const PUT = () => json({ error: "Method Not Allowed" }, 405);
