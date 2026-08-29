/* =====================================================================
   Twilio Verify（SMS認証）の呼び出し

   先頭が "_" のファイルはエンドポイントとして公開されない。

   環境変数
     TWILIO_ACCOUNT_SID        … AC...
     TWILIO_AUTH_TOKEN         … 生の Auth Token（ブラウザに絶対渡さない）
     TWILIO_VERIFY_SERVICE_SID … VA...（Verify サービス。scripts/setup_twilio_verify.mjs が作る）

   🚨 OTP（確認コード）は Twilio が持つ。**自前で保存も照合もしない。**
     こちら側に残るのは「認証が済んだか」（profiles.phone_verified）だけ。

   ⚠ SDK は入れていない。REST を fetch で叩くだけなので依存を増やさない
     （Vercel Functions のコールドスタートも軽くなる）。
   ===================================================================== */
import { ConfigError, env } from "./_lib.js";

const API = "https://verify.twilio.com/v2";

/* Twilio が返したエラー。code は Twilio のエラーコード（60200 など）。 */
export class TwilioError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function creds() {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const service = env("TWILIO_VERIFY_SERVICE_SID");
  if (!sid || !token || !service) {
    throw new ConfigError(
      "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID が設定されていません。"
    );
  }
  return { sid, token, service };
}

/* SMS認証を使える設定になっているか（画面が入口を出すかどうかの判断に使う）。 */
export function smsConfigured() {
  try {
    creds();
    return true;
  } catch {
    return false;
  }
}

async function call(path, params) {
  const { sid, token, service } = creds();
  const res = await fetch(`${API}/Services/${service}${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TwilioError(payload?.message || "Twilio への問い合わせに失敗しました。", payload?.code, res.status);
  }
  return payload;
}

/* 確認コードを送る。Locale=ja で日本語の本文になる。
   戻り: { sid, status }（status は 'pending'）。 */
export async function sendVerification(phoneE164) {
  const r = await call("/Verifications", { To: phoneE164, Channel: "sms", Locale: "ja" });
  return { sid: r.sid, status: r.status };
}

/* コードを照合する。戻り: { approved, status }。
   ⚠ 有効期限切れ・照合しすぎのときは Twilio が 404（20404）を返す。
     「間違い」ではなく「送り直しが要る」なので、呼び出し側で区別する。 */
export async function checkVerification(phoneE164, code) {
  try {
    const r = await call("/VerificationCheck", { To: phoneE164, Code: code });
    return { approved: r.status === "approved", status: r.status };
  } catch (e) {
    if (e instanceof TwilioError && (e.status === 404 || e.code === 20404)) {
      return { approved: false, status: "expired" };
    }
    throw e;
  }
}

/* Twilio のエラーコードを画面に出せる日本語にする。
   ここに無いものは呼び出し側が既定の文言で返す。 */
export function twilioMessage(code) {
  switch (code) {
    case 60200:  // Invalid parameter
    case 60033:  // Invalid To phone number
      return "電話番号の形式が正しくありません。携帯電話番号（070/080/090）をご確認ください。";
    case 60203:  // Max send attempts reached
      return "確認コードの送信回数が上限に達しました。しばらく時間をおいてからお試しください。";
    case 60202:  // Max check attempts reached
      return "コードの入力回数が上限に達しました。確認コードを送り直してください。";
    case 60205:  // SMS is not supported by landline
      return "この番号ではSMSを受け取れません。携帯電話番号をご登録ください。";
    case 60410:  // Verification delivery attempt blocked
      return "この番号への送信がブロックされました。しばらく時間をおいてからお試しください。";
    case 20404:
      return "確認コードの有効期限が切れています。もう一度送信してください。";
    case 21608:  // トライアルアカウントは未検証の番号へ送れない
      return "ただいまSMSをお送りできません。お手数ですがサポートまでご連絡ください。";
    default:
      return null;
  }
}
