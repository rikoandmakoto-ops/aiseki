/* =====================================================================
   POST /api/sms/start   { phone? }

   SMS認証の確認コードを送る。

   ・**ログイン必須。** メール確認 → 初回ログイン → ここ、という順番
     （HANDOFF §25-a の案A）。登録の途中はセッションが無いので送れない。
   ・送り先は **profiles.phone_number（本人の番号）だけ。**
     🚨 body の phone は「自分の番号を登録／変更する」ためだけに使い、
       正規化して自分の profiles に保存してから、その保存済みの値へ送る。
       任意の番号をそのまま To にすると、ログインするだけで
       他人の携帯へSMSを送りつける口になる。
   ・回数制限は DB 側（sms_verify_begin）で数える。Twilio を呼ぶ前に通す。

   POST 応答:
     { ok, phone, retryAfter, remaining }          … 送信した
     { ok:true, verified:true }                     … 既に認証済み（送らない）
   ===================================================================== */
import { ConfigError, json, requireUser, serviceClient } from "../_lib.js";
import { TwilioError, sendVerification, twilioMessage } from "../_twilio.js";

export async function POST(request) {
  try {
    const user = await requireUser(request);
    if (!user) return json({ error: "ログインが必要です。" }, 401);

    let body = {};
    try { body = await request.json(); } catch { /* phone 無しは「登録済みの番号へ送る」 */ }

    const db = serviceClient();

    /* いまの状態を見る。認証済みならSMSを出さない（費用と誤送信を避ける）。 */
    const { data: profile, error: readError } = await db
      .from("profiles")
      .select("id, phone_number, phone_verified")
      .eq("id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!profile) return json({ error: "プロフィールが見つかりません。" }, 404);
    if (profile.phone_verified) return json({ ok: true, verified: true, phone: profile.phone_number });

    /* 番号の指定があれば、DB の正規化関数に通してから保存する。
       画面の normalizePhone と同じ規則だが、REST を直接叩かれると
       何でも送れるのでサーバ側で必ず通し直す（§24 と同じ考え方）。 */
    let phone = profile.phone_number;
    const raw = String(body?.phone ?? "").trim();
    if (raw) {
      const { data: normalized, error: normError } = await db.rpc("normalize_phone_jp", { p_raw: raw });
      if (normError) throw normError;
      if (!normalized) {
        return json({ error: "携帯電話番号（070/080/090）を正しくご入力ください。" }, 400);
      }
      if (normalized !== phone) {
        /* 番号が変わると on_profile_phone_verify_reset が認証を外す。 */
        const { error: saveError } = await db
          .from("profiles").update({ phone_number: normalized }).eq("id", user.id);
        if (saveError) throw saveError;
      }
      phone = normalized;
    }

    if (!phone) {
      return json({ error: "携帯電話番号をご入力ください。", needPhone: true }, 400);
    }

    /* 🚨 同じ番号で別のアカウントが認証済みなら、SMSを送る前に止める
       （番号1つ＝1アカウント。送ってから弾くとSMS代だけ掛かる）。 */
    const { count: dup, error: dupError } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("phone_number", phone)
      .eq("phone_verified", true)
      .neq("id", user.id);
    if (dupError) throw dupError;
    if (dup && dup > 0) {
      return json({
        error: "この電話番号は既に別のアカウントでご利用されています。",
        duplicatePhone: true,
      }, 409);
    }

    /* 回数制限。Twilio を呼ぶ前に予約する（失敗しても枠は消費する＝連打の抑止）。 */
    const { data: gate, error: gateError } = await db.rpc("sms_verify_begin", {
      p_user: user.id, p_phone: phone,
    });
    if (gateError) throw gateError;
    if (!gate?.ok) {
      const retry = Number(gate?.retry_after ?? 60);
      const message = gate?.reason === "daily_limit"
        ? "本日の送信回数の上限に達しました。時間をおいてからお試しください。"
        : `確認コードの再送は${retry}秒後から可能です。`;
      return json({ error: message, retryAfter: retry, reason: gate?.reason }, 429);
    }

    await sendVerification(phone);

    return json({
      ok: true,
      phone,
      retryAfter: Number(gate?.retry_after ?? 60),
      remaining: Number(gate?.remaining ?? 0),
    });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[sms/start] 設定エラー:", e.message);
      return json({ error: "ただいまSMS認証をご利用いただけません。" }, 503);
    }
    if (e instanceof TwilioError) {
      console.error("[sms/start] Twilio エラー:", e.code, e.message);
      return json({ error: twilioMessage(e.code) || "確認コードを送信できませんでした。" }, 400);
    }
    console.error("[sms/start] 失敗:", e);
    return json({ error: "確認コードの送信に失敗しました。" }, 500);
  }
}

export function GET() {
  return json({ error: "Method Not Allowed" }, 405);
}
