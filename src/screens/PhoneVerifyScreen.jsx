/* ══════════════════════════════════════════════════════════════
   AISEKI — SMS（電話番号）認証

   メール確認 → 初回ログイン → **この画面** → 参加許可（HANDOFF §28）。

   ・確認コードを送るのも照合するのも Twilio Verify（サーバ側）。
     この画面はコードを預からないし、認証済みの印も立てない。
   ・番号が未登録の人（電話番号を取る前に登録した既存ユーザー）は、
     ここで入力してから送信できる。
   ・「あとで」で閉じられる。ただし会の作成・参加申込・相方の同意は
     DB 側の関門で止まるので、そのときにまたここへ戻ってくる。

   🚨 この画面を通らずに認証済みにする道は無い（phone_verified に
     authenticated の UPDATE 権限が無く、立てられるのは
     service_role 専用の sms_verify_mark() だけ）。UIで隠しているのではない。
   ══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Smartphone, ShieldCheck, Check, RefreshCw } from "lucide-react";
import * as api from "../lib/api.js";
import {
  C, FONT_DISPLAY, FONT_HEAD, FONT_BODY,
  brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle, Eyebrow, Spinner,
} from "../lib/theme.jsx";

const CODE_LENGTH = 6;

/* +819012345678 → 090-1234-5678（自分の番号を確かめてもらうための表示） */
function displayPhone(e164) {
  const s = String(e164 || "");
  const m = s.match(/^\+81(\d0)(\d{4})(\d{4})$/);
  return m ? `0${m[1]}-${m[2]}-${m[3]}` : s;
}

export default function PhoneVerifyScreen({ onBack, onVerified }) {
  const [status, setStatus] = useState(null);      // { phone_number, verified }
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);    // サーバ側の設定が入っているか

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);         // コードを送った直後か
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);     // 再送までの残り秒
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  const codeRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, cfg] = await Promise.all([api.getMyPhoneStatus(), api.smsStatus()]);
      setEnabled(cfg.enabled);
      setStatus(s);
      if (s?.verified) setDone(true);
      /* 登録済みの番号は編集できる形で出す（掛け違いに気づけるように）。 */
      if (s?.phone_number) setPhone(displayPhone(s.phone_number));
    } catch (e) {
      console.error(e);
      setError(e.message || "認証の状態を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* 再送までの待ち時間。0 になったら止める。 */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => Math.max(n - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]);

  const send = async () => {
    setError("");
    setNotice("");
    /* 画面でも形を見る（DB の normalize_phone_jp と同じ規則）。
       ⚠ ここを通っても、送り先を決めるのはサーバ側で保存し直した番号。 */
    if (phone && !api.isValidPhone(phone)) {
      setError("携帯電話番号（070/080/090）を正しくご入力ください。");
      return;
    }
    setBusy(true);
    try {
      const res = await api.sendPhoneCode(phone || undefined);
      if (res?.verified) { setDone(true); onVerified?.(); return; }
      setSent(true);
      setSentTo(res?.phone || "");
      setCode("");
      setCooldown(Number(res?.retryAfter) || 60);
      setNotice("確認コードを送信しました。届いた6桁の数字をご入力ください。");
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (e) {
      if (e.retryAfter) setCooldown(Number(e.retryAfter));
      setError(e.message || "確認コードを送信できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    setError("");
    setNotice("");
    if (code.replace(/\D/g, "").length < 4) {
      setError(`確認コード（${CODE_LENGTH}桁の数字）をご入力ください。`);
      return;
    }
    setBusy(true);
    try {
      await api.verifyPhoneCode(code);
      setDone(true);
      onVerified?.();
    } catch (e) {
      /* 期限切れは「間違い」ではないので、送り直しへ誘導する。 */
      if (e.expired) { setSent(false); setCooldown(0); }
      setError(e.message || "確認コードを照合できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <button className="press" onClick={onBack} style={{
      display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
      fontSize: 13.5, color: C.primaryDeep, cursor: "pointer",
      padding: "20px 0 14px", fontWeight: 600, letterSpacing: 0.4,
    }}>
      <ChevronLeft size={17} /> 戻る
    </button>
  );

  if (loading) {
    return (
      <div className="app-body" style={{ padding: "0 22px 30px" }}>
        {header}
        <Spinner label="読み込み中…" />
      </div>
    );
  }

  /* ── 認証済み ── */
  if (done || status?.verified) {
    return (
      <div className="app-body" style={{ padding: "0 22px 30px" }}>
        {header}
        <div style={{ ...card, padding: 26, textAlign: "center" }}>
          <div style={{
            width: 58, height: 58, borderRadius: "50%", margin: "0 auto 16px",
            display: "grid", placeItems: "center",
            background: "rgba(120,190,140,0.12)", border: "1px solid rgba(120,190,140,0.35)",
          }}>
            <Check size={26} color="#7dbe8c" />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 19, marginBottom: 8 }}>
            電話番号の認証が完了しました
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.85 }}>
            会の作成とお申し込みがご利用いただけます。<br />
            {(status?.phone_number || sentTo) && (
              <span style={{ color: C.text }}>{displayPhone(status?.phone_number || sentTo)}</span>
            )}
          </div>
          <button className="press" onClick={onBack} style={{
            ...popBtn, width: "100%", padding: "13px 0", fontSize: 14.5, marginTop: 22,
          }}>
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-body" style={{ padding: "0 22px 34px" }}>
      {header}

      <Eyebrow>SECURITY</Eyebrow>
      <h1 style={{
        fontFamily: FONT_DISPLAY, fontSize: 27, fontWeight: 600, margin: "6px 0 10px",
        letterSpacing: 0.5, ...brandText,
      }}>
        電話番号の認証
      </h1>
      <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.9, margin: "0 0 22px" }}>
        安心してご参加いただくために、SMSで電話番号のご確認をお願いしています。
        認証が済むまで、会の作成とお申し込みはご利用いただけません。
      </p>

      {!enabled && (
        <div style={{
          ...card, padding: 16, marginBottom: 18, fontSize: 12.5, lineHeight: 1.8,
          color: C.textMuted, borderColor: "rgba(226,160,120,0.35)",
        }}>
          ただいまSMS認証をご利用いただけません。お手数ですが、時間をおいてからお試しください。
        </div>
      )}

      {/* ── 電話番号 ── */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Smartphone size={16} color={C.primaryDeep} />
          <span style={{ fontFamily: FONT_HEAD, fontSize: 15 }}>携帯電話番号</span>
        </div>

        <label style={labelStyle}>電話番号（携帯）</label>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setSent(false); }}
          placeholder="090-1234-5678"
          disabled={busy}
          style={fieldStyle}
        />
        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.75, marginTop: 8 }}>
          070／080／090 で始まる携帯電話番号をご入力ください。
          お客様の電話番号が他の会員に表示されることはありません。
        </div>

        <button
          className="press"
          onClick={send}
          disabled={busy || !enabled || (sent && cooldown > 0)}
          style={{
            ...(sent ? ghostBtn : popBtn), width: "100%", padding: "13px 0", fontSize: 14.5,
            marginTop: 18, opacity: busy || !enabled || (sent && cooldown > 0) ? 0.55 : 1,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          {sent ? <RefreshCw size={15} /> : <ShieldCheck size={16} />}
          {busy && !sent ? "送信中…"
            : sent ? (cooldown > 0 ? `再送する（${cooldown}秒）` : "確認コードを再送する")
            : "確認コードを送信する"}
        </button>
      </div>

      {/* ── コードの入力 ── */}
      {sent && (
        <form onSubmit={verify} style={{ ...card, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <ShieldCheck size={16} color={C.primaryDeep} />
            <span style={{ fontFamily: FONT_HEAD, fontSize: 15 }}>確認コード</span>
          </div>
          {sentTo && (
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
              {displayPhone(sentTo)} に送信しました
            </div>
          )}

          <input
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9０-９]/g, ""))}
            placeholder="000000"
            disabled={busy}
            style={{
              ...fieldStyle, textAlign: "center", fontSize: 26, letterSpacing: 10,
              fontWeight: 600, padding: "15px 16px",
            }}
          />

          <button
            type="submit"
            className="press"
            disabled={busy || code.replace(/\D/g, "").length < 4}
            style={{
              ...popBtn, width: "100%", padding: "13px 0", fontSize: 14.5, marginTop: 16,
              opacity: busy || code.replace(/\D/g, "").length < 4 ? 0.55 : 1,
            }}
          >
            {busy ? "確認中…" : "認証する"}
          </button>

          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.75, marginTop: 12 }}>
            確認コードは10分で無効になります。届かないときは、迷惑SMSの設定と
            電話番号のお間違いがないかをご確認のうえ、再送してください。
          </div>
        </form>
      )}

      {(error || notice) && (
        <div style={{
          ...card, padding: 14, marginBottom: 16, fontSize: 12.5, lineHeight: 1.8,
          color: error ? "#e8a09a" : C.textMuted,
          borderColor: error ? "rgba(226,150,150,0.35)" : C.line,
        }}>
          {error || notice}
        </div>
      )}

      <button className="press" onClick={onBack} style={{
        ...ghostBtn, width: "100%", padding: "12px 0", fontSize: 13.5, fontFamily: FONT_BODY,
      }}>
        あとで認証する
      </button>
    </div>
  );
}
