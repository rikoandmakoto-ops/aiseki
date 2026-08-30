/* =====================================================================
   /api/dm/status — 全体の状況と、作業ペースの設定（運営専用）

     GET   … 件数の集計・本日の送信数・上限・残り
     PATCH … daily_cap / min_interval_seconds の変更

   ⚠ daily_cap は「1日にどれだけ営業をかけるか」の運用上の上限。
     Instagram の検知を避けるためのものではない（そういう使い方はしない）。
     出しすぎを運営側で止めるための歯止めとして置いてある。
   ===================================================================== */
import { ConfigError, json, requireAdminUnlocked, serviceClient } from "../_lib.js";

export async function GET(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    const db = serviceClient();
    const [{ data: stats, error }, { data: recent, error: recentError }] = await Promise.all([
      db.rpc("dm_stats"),
      db.from("dm_events")
        .select("id,target_id,from_status,to_status,note,actor_email,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (error) throw error;
    if (recentError) throw recentError;

    const cap = Number(stats?.daily_cap ?? 0);
    const sentToday = Number(stats?.sent_today ?? 0);

    return json({
      stats: stats ?? null,
      remainingToday: Math.max(0, cap - sentToday),
      recent: recent ?? [],
    });
  } catch (e) {
    return fail("取得", e, "状況を取得できませんでした。");
  }
}

export async function PATCH(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    const patch = {};
    if (body?.daily_cap !== undefined) {
      const v = Number(body.daily_cap);
      if (!Number.isInteger(v) || v < 0 || v > 200) {
        return json({ error: "1日の上限は 0〜200 の整数で指定してください。" }, 400);
      }
      patch.daily_cap = v;
    }
    if (body?.min_interval_seconds !== undefined) {
      const v = Number(body.min_interval_seconds);
      if (!Number.isInteger(v) || v < 0 || v > 3600) {
        return json({ error: "最短間隔は 0〜3600 秒で指定してください。" }, 400);
      }
      patch.min_interval_seconds = v;
    }
    if (Object.keys(patch).length === 0) {
      return json({ error: "変更する項目がありません。" }, 400);
    }
    patch.updated_at = new Date().toISOString();

    const db = serviceClient();
    const { error } = await db.from("dm_settings").update(patch).eq("id", true);
    if (error) throw error;

    const { data: stats } = await db.rpc("dm_stats");
    const cap = Number(stats?.daily_cap ?? 0);
    return json({ stats: stats ?? null, remainingToday: Math.max(0, cap - Number(stats?.sent_today ?? 0)) });
  } catch (e) {
    return fail("変更", e, "設定を変更できませんでした。");
  }
}

function fail(what, e, message) {
  if (e instanceof ConfigError) {
    console.error(`[dm/status] 設定エラー(${what}):`, e.message);
    return json({ error: "サーバーの設定が済んでいません。" }, 503);
  }
  console.error(`[dm/status] ${what}に失敗:`, e);
  return json({ error: message }, 500);
}

const notAllowed = () => json({ error: "Method Not Allowed" }, 405);
export const POST = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
