/* =====================================================================
   /api/dm/templates — 営業DMの文面ひな形（運営専用）

     GET    … 一覧
     POST   … 追加
     PATCH  … 変更（name / body / is_default）
     DELETE … 削除

   差し込めるのは {{username}} / {{display_name}} / {{category}} の3つ
   （実際に差し込むのは api/dm/_dm.js の renderTemplate）。

   ⚠ 文面は §1 の業態上の制約に沿わせる。「出会い」を訴求する文面にしない。
     名乗り・用件・断りたいときの導線を必ず入れること。
   ===================================================================== */
import { ConfigError, json, requireAdminUnlocked, serviceClient } from "../_lib.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = "id,name,body,is_default,created_at,updated_at";

const MAX_NAME = 80;
const MAX_BODY = 1000;

export async function GET(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    const db = serviceClient();
    const { data, error } = await db
      .from("dm_templates").select(SELECT)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;

    return json({ items: data ?? [] });
  } catch (e) {
    return fail("取得", e, "ひな形を取得できませんでした。");
  }
}

export async function POST(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    const name = String(body?.name ?? "").trim();
    const text = String(body?.body ?? "").trim();
    const invalid = validate(name, text);
    if (invalid) return json({ error: invalid }, 400);

    const db = serviceClient();

    /* 既定にするなら、先に他の既定を降ろす（部分一意索引に当たるため）。 */
    if (body?.is_default) await clearDefault(db);

    const { data, error } = await db
      .from("dm_templates")
      .insert({ name, body: text, is_default: !!body?.is_default })
      .select(SELECT)
      .single();
    if (error) throw error;

    return json({ item: data });
  } catch (e) {
    return fail("追加", e, "ひな形を追加できませんでした。");
  }
}

export async function PATCH(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    let body = {};
    try { body = await request.json(); } catch { /* 空ボディは下で弾く */ }

    const id = String(body?.id ?? "").trim();
    if (!UUID_RE.test(id)) return json({ error: "対象のひな形が指定されていません。" }, 400);

    const patch = {};
    if (body?.name !== undefined) patch.name = String(body.name).trim();
    if (body?.body !== undefined) patch.body = String(body.body).trim();
    if (body?.is_default !== undefined) patch.is_default = !!body.is_default;

    if (Object.keys(patch).length === 0) return json({ error: "変更する項目がありません。" }, 400);

    const invalid = validate(
      patch.name ?? "ok",
      patch.body ?? "ok",
      { name: patch.name !== undefined, body: patch.body !== undefined }
    );
    if (invalid) return json({ error: invalid }, 400);

    const db = serviceClient();
    if (patch.is_default) await clearDefault(db, id);

    const { data, error } = await db
      .from("dm_templates").update(patch).eq("id", id).select(SELECT).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "対象のひな形が見つかりません。" }, 404);

    return json({ item: data });
  } catch (e) {
    return fail("変更", e, "ひな形を変更できませんでした。");
  }
}

export async function DELETE(request) {
  try {
    const { error: denied } = await requireAdminUnlocked(request);
    if (denied) return denied;

    const id = String(new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!UUID_RE.test(id)) return json({ error: "対象のひな形が指定されていません。" }, 400);

    const db = serviceClient();

    /* 最後の1つは消させない（払い出しが文面を引けなくなる）。 */
    const { count, error: countError } = await db
      .from("dm_templates").select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if ((count ?? 0) <= 1) {
      return json({ error: "ひな形が1つしかありません。先に別の文面を登録してください。" }, 409);
    }

    const { data, error } = await db
      .from("dm_templates").delete().eq("id", id).select("id,is_default").maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "対象のひな形が見つかりません。" }, 404);

    /* 既定を消したら、残りのどれかを既定に繰り上げる（既定が無いと払い出せない）。 */
    if (data.is_default) {
      const { data: next } = await db
        .from("dm_templates").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (next) await db.from("dm_templates").update({ is_default: true }).eq("id", next.id);
    }

    return json({ ok: true });
  } catch (e) {
    return fail("削除", e, "ひな形を削除できませんでした。");
  }
}

function validate(name, body, present = { name: true, body: true }) {
  if (present.name && (name.length < 1 || name.length > MAX_NAME)) {
    return `ひな形の名前は1〜${MAX_NAME}文字で入力してください。`;
  }
  if (present.body && (body.length < 1 || body.length > MAX_BODY)) {
    return `文面は1〜${MAX_BODY}文字で入力してください。`;
  }
  return null;
}

/* is_default は部分一意索引（dm_templates_default_uniq）で1つに絞ってあるので、
   立てる前に降ろす。except があればそれは触らない。 */
async function clearDefault(db, exceptId = null) {
  let q = db.from("dm_templates").update({ is_default: false }).eq("is_default", true);
  if (exceptId) q = q.neq("id", exceptId);
  const { error } = await q;
  if (error) throw error;
}

function fail(what, e, message) {
  if (e instanceof ConfigError) {
    console.error(`[dm/templates] 設定エラー(${what}):`, e.message);
    return json({ error: "サーバーの設定が済んでいません。" }, 503);
  }
  console.error(`[dm/templates] ${what}に失敗:`, e);
  return json({ error: message }, 500);
}

export const PUT = () => json({ error: "Method Not Allowed" }, 405);
