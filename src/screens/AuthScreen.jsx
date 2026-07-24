import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  C, FONT_LOGO, FONT_SERIF_JP, FONT_BODY, goldText, glass, goldBtn, ghostBtn, fieldStyle, labelStyle,
} from "../lib/theme.jsx";
import { signIn, signUp } from "../lib/api";

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("男性");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn({ email, password });
        // 成功後は App の onAuthStateChange が画面を切り替える
      } else {
        const data = await signUp({ email, password, username, gender, age: age ? Number(age) : null });
        if (!data.session) {
          // メール確認が有効な場合
          setNotice("確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。");
          setMode("login");
        }
      }
    } catch (err) {
      setError(translateError(err?.message || "エラーが発生しました"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: 400, width: "100%", margin: "0 auto", minHeight: 720, display: "flex", flexDirection: "column",
      borderRadius: 30, overflow: "hidden",
      background:
        "radial-gradient(120% 80% at 85% -5%, rgba(178,58,76,0.30), transparent 55%)," +
        "radial-gradient(100% 60% at 0% 5%, rgba(216,189,130,0.1), transparent 50%)," +
        "linear-gradient(180deg, #100c0e 0%, #070506 100%)",
      border: `1px solid ${C.line}`,
      boxShadow: "0 44px 96px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)",
      fontFamily: FONT_BODY,
    }}>
      {/* ── Brand / hero ── */}
      <div style={{ position: "relative", padding: "62px 30px 34px", textAlign: "center", overflow: "hidden" }}>
        {/* ambient glow */}
        <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 240, height: 240, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(216,189,130,0.16), transparent 66%)", animation: "floatGlow 7s ease-in-out infinite", pointerEvents: "none" }} />

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 9, letterSpacing: 5, color: C.textMuted, textTransform: "uppercase", marginBottom: 14 }}>Premium Lounge Matching</div>
          {/* hairline · logo · hairline */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
            <span style={{ height: 1, width: 34, background: `linear-gradient(90deg, transparent, ${C.gold})` }} />
            <span style={{ fontFamily: FONT_LOGO, fontSize: 46, fontWeight: 700, letterSpacing: 7, ...goldText, lineHeight: 1 }}>AISEKI</span>
            <span style={{ height: 1, width: 34, background: `linear-gradient(90deg, ${C.gold}, transparent)` }} />
          </div>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 15, color: C.text, letterSpacing: 4, marginTop: 12, opacity: 0.85 }}>相 席</div>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 13.5, color: C.textSec, letterSpacing: 0.8, marginTop: 18, lineHeight: 1.7 }}>
            夜の街で、「会」と「会」がめぐり逢う。<br />大人のための、上質な相席ラウンジ。
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "0 24px 30px" }}>
        <div style={{ ...glass, padding: 24 }}>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 17, fontWeight: 600, color: C.text, letterSpacing: 0.5, marginBottom: 4 }}>
            {mode === "login" ? "おかえりなさい" : "ようこそ"}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20, letterSpacing: 0.3 }}>
            {mode === "login" ? "アカウントにログインしてください" : "アカウントを作成して始めましょう"}
          </div>

          {/* タブ切替 */}
          <div style={{ display: "flex", gap: 7, marginBottom: 22, background: "rgba(255,255,255,0.028)", padding: 4, borderRadius: 13, border: `1px solid ${C.lineSoft}` }}>
            {[{ k: "login", l: "ログイン" }, { k: "signup", l: "新規登録" }].map((t) => {
              const on = mode === t.k;
              return (
                <button key={t.k} type="button" className="press" onClick={() => { setMode(t.k); setError(""); setNotice(""); }} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: "none",
                  ...(on
                    ? { background: C.goldGrad, color: "#241704", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }
                    : { background: "transparent", color: C.textSec }),
                }}>{t.l}</button>
              );
            })}
          </div>

          <form onSubmit={submit}>
            {mode === "signup" && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>ニックネーム</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例: ザキ" style={fieldStyle} />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>メールアドレス</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={fieldStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>パスワード</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6文字以上" style={fieldStyle} />
            </div>

            {mode === "signup" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>性別</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ ...fieldStyle, colorScheme: "dark" }}>
                    {["男性", "女性", "その他"].map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>年齢</label>
                  <input type="number" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} placeholder="28" style={fieldStyle} />
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12, color: C.redSoft, background: "rgba(178,58,76,0.14)", border: "1px solid rgba(178,58,76,0.35)", borderRadius: 11, padding: "10px 13px", marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
            )}
            {notice && (
              <div style={{ fontSize: 12, color: C.goldBright, background: "rgba(216,189,130,0.1)", border: `1px solid ${C.lineGold}`, borderRadius: 11, padding: "10px 13px", marginBottom: 14, lineHeight: 1.5 }}>{notice}</div>
            )}

            <button type="submit" className="gold-cta" disabled={loading} style={{
              ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15,
              opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer",
            }}>
              {loading ? "処理中…" : mode === "login" ? "ログイン" : "登録して始める"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
            {mode === "signup"
              ? <><Sparkles size={13} strokeWidth={1.8} color={C.gold} /> 新規登録で <b style={{ color: C.goldBright, fontWeight: 700 }}>1,000pt</b> プレゼント</>
              : "アカウントをお持ちでない方は「新規登録」から"}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 9.5, color: C.textFaint, letterSpacing: 2, textTransform: "uppercase" }}>
          20歳以上限定 · 会員制ラウンジ
        </div>
      </div>
    </div>
  );
}

function translateError(msg) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "メールアドレスまたはパスワードが正しくありません。";
  if (m.includes("already registered") || m.includes("already exists")) return "このメールアドレスは既に登録されています。";
  if (m.includes("email not confirmed")) return "メールアドレスが未確認です。確認メールのリンクを開いてください。";
  if (m.includes("password should be")) return "パスワードは6文字以上で入力してください。";
  return msg;
}
