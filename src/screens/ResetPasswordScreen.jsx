/* ══════════════════════════════════════════════════════════════
   AISEKI — 新しいパスワードの設定

   パスワード再設定メールのリンクを開くと、supabase-js が URL の
   トークンを読んで「復旧用のセッション」を張った状態でアプリが起動する
   （supabase.js の detectSessionInUrl: true）。
   その状態でのみこの画面を表示し、新しいパスワードを保存させる。
   ══════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { Lock, Check, Eye, EyeOff } from "lucide-react";
import {
  C, FONT_LOGO, FONT_HEAD, brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle,
} from "../lib/theme.jsx";
import { updatePassword, signOut } from "../lib/api";

const MIN_LEN = 8;

export default function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  /* 強度の目安。厳しく弾くのではなく、弱いときに気づけるようにする。 */
  const strength = (() => {
    let s = 0;
    if (password.length >= MIN_LEN) s++;
    if (password.length >= 12) s++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^\w\s]/.test(password)) s++;
    return Math.min(s, 4);
  })();
  const STRENGTH_LABEL = ["", "弱い", "ふつう", "強い", "とても強い"];

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LEN) {
      setError(`パスワードは${MIN_LEN}文字以上で入力してください。`);
      return;
    }
    if (password !== confirm) {
      setError("確認用のパスワードが一致しません。");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      const m = String(err?.message || "").toLowerCase();
      if (m.includes("same") || m.includes("should be different")) {
        setError("現在お使いのものとは違うパスワードを設定してください。");
      } else if (m.includes("session") || m.includes("expired") || m.includes("token")) {
        setError("再設定用のリンクの有効期限が切れています。もう一度メールを送信してください。");
      } else {
        setError(err?.message || "パスワードを変更できませんでした。");
      }
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    // 復旧セッションのまま使い続けさせず、必ずログインし直してもらう
    await signOut().catch(() => {});
    onDone?.();
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 30px" }}>
      <div style={{ textAlign: "center", padding: "56px 0 30px" }}>
        <span style={{ fontFamily: FONT_LOGO, fontSize: 38, fontWeight: 600, letterSpacing: 4.5, ...brandText }}>AISEKI</span>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 12, color: C.textSec, letterSpacing: 3, marginTop: 10 }}>
          パスワードの再設定
        </div>
      </div>

      {done ? (
        <div className="fade" style={{ ...card, padding: 26, textAlign: "center" }}>
          <div style={{
            width: 54, height: 54, borderRadius: 27, margin: "0 auto 18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: C.primaryGrad, color: "#241a06", boxShadow: "0 10px 24px rgba(176,138,60,0.4)",
          }}>
            <Check size={26} strokeWidth={2.6} />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 600, color: C.text, letterSpacing: 0.4 }}>
            パスワードを変更しました
          </div>
          <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.9, marginTop: 10 }}>
            新しいパスワードでログインしてください。
          </div>
          <button className="lux-cta" onClick={finish} style={{
            ...popBtn, width: "100%", padding: "15px 0", fontSize: 15, marginTop: 22,
          }}>
            ログイン画面へ
          </button>
        </div>
      ) : (
        <form className="fade" onSubmit={submit} style={{ ...card, padding: 24 }}>
          <div style={{
            display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 22,
            padding: "13px 15px", borderRadius: 14,
            background: "rgba(232,201,135,0.08)", border: `1px solid ${C.linePrimary}`,
          }}>
            <Lock size={15} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.8 }}>
              新しいパスワードを設定してください。設定後は、新しいパスワードでのログインが必要になります。
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>新しいパスワード（{MIN_LEN}文字以上）</label>
            <div style={{ position: "relative" }}>
              <input
                type={show ? "text" : "password"}
                required
                minLength={MIN_LEN}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                style={{ ...fieldStyle, paddingRight: 46 }}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
                style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 4,
                }}
              >
                {show ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
              </button>
            </div>

            {password && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                <div style={{ flex: 1, display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i <= strength
                        ? (strength <= 1 ? C.accent : strength === 2 ? C.warm : C.primary)
                        : "rgba(255,255,255,0.10)",
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
                  {STRENGTH_LABEL[strength]}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>確認のためもう一度</label>
            <input
              type={show ? "text" : "password"}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              style={fieldStyle}
            />
            {confirm && password !== confirm && (
              <div style={{ fontSize: 10.5, color: C.accentDeep, marginTop: 7 }}>
                パスワードが一致していません。
              </div>
            )}
          </div>

          {error && (
            <div style={{
              fontSize: 12, color: C.accentDeep, background: "rgba(168,32,58,0.18)",
              border: "1px solid rgba(200,56,79,0.42)", borderRadius: 11,
              padding: "10px 13px", marginBottom: 14, lineHeight: 1.6,
            }}>{error}</div>
          )}

          <button type="submit" className="lux-cta" disabled={loading} style={{
            ...popBtn, width: "100%", padding: "15px 0", fontSize: 15, opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "変更中…" : "パスワードを変更する"}
          </button>

          <button type="button" className="press" onClick={finish} style={{
            ...ghostBtn, width: "100%", padding: "13px 0", fontSize: 13.5, marginTop: 10,
          }}>
            キャンセルしてログイン画面へ
          </button>
        </form>
      )}
    </div>
  );
}
