/* =====================================================================
   POST /api/sms/check   { code }

   届いた確認コードを照合して、通れば profiles.phone_verified を立てる。

   🚨 **認証済みにする経路はここだけ。**
     phone_verified には authenticated の列単位 UPDATE 権限が無く、
     立てられるのは service_role 専用の sms_verify_mark() だけ
     （＝ SMS を受け取らずに自分を認証済みにはできない）。
   ・照合するのは Twilio。こちらにコードは保存しない。
   ・総当たり対策の回数制限は DB 側（sms_verify_touch_check）。

   POST 応答:
     { ok:true, verified:true, phone }
     { ok:false, verified:false, wrong:true }   … コードが違う（入力し直し）
   ===================================================================== */
import { ConfigError, json, requireUser, serviceClient } from "../_lib.js";
import { TwilioError, checkVerification, twilioMessage } from "../_twilio.js";

export async function POST(request) {
  try {
    const user = await requireUser(request);
    if (!user) return json({ error: "ログインが必要です。" }, 401);

    let body = {};
    try { body = await request.json(); } catch { /* 下の検証で弾く */ }

    /* 全角で入力されることがあるので半角に寄せてから見る。 */
    const code = String(body?.code ?? "")
      .replace(/[０-９]/g, (c) => String("０１２３４５６７８９".indexOf(c)))
      .replace(/[^0-9]/g, "");
    if (!/^[0-9]{4,10}$/.test(code)) {
      return json({ error: "確認コード（6桁の数字）をご入力ください。" }, 400);
    }

    const db = serviceClient();

    const { data: profile, error: readError } = await db
      .from("profiles")
      .select("id, phone_number, phone_verified")
      .eq("id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!profile) return json({ error: "プロフィールが見つかりません。" }, 404);
    if (profile.phone_verified) {
      return json({ ok: true, verified: true, phone: profile.phone_number });
    }
    if (!profile.phone_number) {
      return json({ error: "電話番号がご登録されていません。", needPhone: true }, 400);
    }

    /* 総当たりの抑止。Twilio 側にも上限はあるが、こちらでも数える。 */
    const { data: gate, error: gateError } = await db.rpc("sms_verify_touch_check", { p_user: user.id });
    if (gateError) throw gateError;
    if (!gate?.ok) {
      return json({
        error: "コードの入力回数が上限に達しました。しばらく時間をおいてからお試しください。",
        retryAfter: Number(gate?.retry_after ?? 3600),
      }, 429);
    }

    const result = await checkVerification(profile.phone_number, code);

    if (result.status === "expired") {
      return json({
        ok: false, verified: false, expired: true,
        error: "確認コードの有効期限が切れています。もう一度送信してください。",
      }, 400);
    }
    if (!result.approved) {
      return json({
        ok: false, verified: false, wrong: true,
        error: "確認コードが正しくありません。",
      }, 400);
    }

    /* ここまで来たら Twilio が approved を返している。 */
    const { data: marked, error: markError } = await db.rpc("sms_verify_mark", { p_user: user.id });
    if (markError) throw markError;

    if (!marked?.ok) {
      if (marked?.reason === "duplicate") {
        return json({
          error: "この電話番号は既に別のアカウントでご利用されています。",
          duplicatePhone: true,
        }, 409);
      }
      return json({ error: "電話番号がご登録されていません。", needPhone: true }, 400);
    }

    return json({ ok: true, verified: true, phone: marked.phone_number });
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error("[sms/check] 設定エラー:", e.message);
      return json({ error: "ただいまSMS認証をご利用いただけません。" }, 503);
    }
    if (e instanceof TwilioError) {
      console.error("[sms/check] Twilio エラー:", e.code, e.message);
      return json({ error: twilioMessage(e.code) || "確認コードを照合できませんでした。" }, 400);
    }
    console.error("[sms/check] 失敗:", e);
    return json({ error: "確認コードの照合に失敗しました。" }, 500);
  }
}

export function GET() {
  return json({ error: "Method Not Allowed" }, 405);
}
