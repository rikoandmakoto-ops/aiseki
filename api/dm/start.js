/* =====================================================================
   /api/dm/start — 「次に出す分」を払い出す（運営専用）

     POST { limit?, templateId? }
       → 未送信（pending）の相手を古い順に取り出し、
         文面を差し込んだ状態で返す。1日の上限を超える分は返さない。

   🚨 **このエンドポイントは送信しない。**
     Instagram の初回DM（相手からの接触が無い状態）は
       ・Messaging API … 24時間ウィンドウの外なので API が受け付けない
       ・ブラウザ自動化 … Meta Platform Terms が禁じている
     どちらの経路でも自動送信できない。ここが返すのは
     「誰に・何を送るか」までで、送るのは運営が管理画面から1件ずつ行う。

     ⚠ ここに Playwright / Puppeteer などの自動送信を足さないこと。
       足した時点で上の前提が崩れ、アカウント停止の対象になる。

   返すもの:
     { batch: [{ target, message, dmUrl, profileUrl, warnings }], remainingToday, stats }
   ===================================================================== */
import { ConfigError, json, requireAdmin, serviceClient } from "../_lib.js";
import { DEFAULT_BATCH, MAX_BATCH, renderTemplate, unresolvedKeys } from "./_dm.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Instagram の「この人にDMを送る」画面。
   ig.me はプロフィールを経由せずスレッドを開く公式の入口。 */
const dmUrl = (username) => `https://ig.me/m/${encodeURIComponent(username)}`;
const profileUrl = (username) => `https://www.instagram.com/${encodeURIComponent(username)}/`;

export async function POST(request) {
  try {
    const { error: denied } = await requireAdmin(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 既定値で進む */ }

    const limit = Math.min(MAX_BATCH, Math.max(1, Number(body?.limit) || DEFAULT_BATCH));
    const templateId = String(body?.templateId ?? "").trim();
    if (templateId && !UUID_RE.test(templateId)) {
      return json({ error: "ひな形の指定が正しくありません。" }, 400);
    }

    const db = serviceClient();

    /* 使う文面。指定が無ければ既定のひな形。 */
    let tq = db.from("dm_templates").select("id,name,body").limit(1);
    tq = templateId ? tq.eq("id", templateId) : tq.eq("is_default", true);
    const { data: template, error: templateError } = await tq.maybeSingle();
    if (templateError) throw templateError;
    if (!template) {
      return json({ error: "送信に使うひな形がありません。先に文面を登録してください。" }, 400);
    }

    /* 払い出し。1日の上限は dm_next_batch() の中で見ている。 */
    const { data: targets, error } = await db.rpc("dm_next_batch", { p_limit: limit });
    if (error) throw error;

    const batch = (targets ?? []).map((target) => {
      const message = renderTemplate(template.body, target);
      const warnings = [];

      const missing = unresolvedKeys(message);
      if (missing.length) warnings.push(`差し込めない項目があります: ${[...new Set(missing)].join(", ")}`);
      if (!target.display_name) warnings.push("表示名が未登録のため、ユーザー名で差し込んでいます。");
      if (message.length > 1000) warnings.push("1000文字を超えています。Instagram 側で分割されます。");

      return {
        target: {
          id: target.id,
          username: target.username,
          display_name: target.display_name,
          category: target.category,
          follower_count: target.follower_count,
          note: target.note,
          status: target.status,
        },
        message,
        dmUrl: dmUrl(target.username),
        profileUrl: profileUrl(target.username),
        warnings,
      };
    });

    const { data: stats } = await db.rpc("dm_stats");
    const cap = Number(stats?.daily_cap ?? 0);
    const remainingToday = Math.max(0, cap - Number(stats?.sent_today ?? 0));

    return json({
      batch,
      template: { id: template.id, name: template.name },
      remainingToday,
      stats: stats ?? null,
      /* 上限に当たって0件になったのか、単に pending が無いのかを画面が
         書き分けられるようにする（どちらも batch は空になるため）。 */
      capReached: batch.length === 0 && remainingToday === 0,
    });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[dm/start] 設定エラー:", e.message);
      return json({ error: "サーバーの設定が済んでいません。" }, 503);
    }
    console.error("[dm/start] 払い出しに失敗:", e);
    return json({ error: "次の送信先を取得できませんでした。" }, 500);
  }
}

const notAllowed = () => json({ error: "Method Not Allowed" }, 405);
export const GET = notAllowed;
export const PATCH = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
