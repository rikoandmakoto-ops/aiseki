import { useState } from "react";
import { Sparkles, Users, ChevronLeft, Check } from "lucide-react";
import {
  C, FONT_LOGO, FONT_SERIF_JP, FONT_BODY, goldText, glass, goldBtn, ghostBtn, fieldStyle, labelStyle,
} from "../lib/theme.jsx";
import { signIn, signUp, MIN_AGE } from "../lib/api";
import { TermsBody } from "./TermsScreen.jsx";

const shellStyle = {
  maxWidth: 400, width: "100%", margin: "0 auto", minHeight: 720,
  display: "flex", flexDirection: "column",
  borderRadius: 30, overflow: "hidden",
  background:
    "radial-gradient(120% 80% at 85% -5%, rgba(178,58,76,0.30), transparent 55%)," +
    "radial-gradient(100% 60% at 0% 5%, rgba(216,189,130,0.1), transparent 50%)," +
    "linear-gradient(180deg, #100c0e 0%, #070506 100%)",
  border: `1px solid ${C.line}`,
  boxShadow: "0 44px 96px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)",
  fontFamily: FONT_BODY,
};

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (mode === "signup") {
      if (!agreed) {
        setError("利用規約への同意と、18歳以上であることの確認が必要です。");
        return;
      }
      if (!(Number(age) >= MIN_AGE)) {
        setError(`本サービスは${MIN_AGE}歳未満の方はご利用いただけません。`);
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await signIn({ email, password });
        // 成功後は App の onAuthStateChange が画面を切り替える
      } else {
        const data = await signUp({ email, password, username, age: Number(age) });
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

  if (showTerms) {
    return (
      <div style={shellStyle}>
        <div style={{ padding: "0 22px 30px" }}>
          <button className="press" onClick={() => setShowTerms(false)} style={{
            display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
            fontSize: 13.5, color: C.gold, cursor: "pointer", padding: "20px 0 14px", fontWeight: 600, letterSpacing: 0.4,
          }}>
            <ChevronLeft size={18} strokeWidth={2} /> 戻る
          </button>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, letterSpacing: 2.4, textTransform: "uppercase", marginBottom: 4 }}>Terms of Service</div>
            <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 23, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>利用規約</div>
          </div>
          <TermsBody />
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      {/* ── Brand / hero ── */}
      <div style={{ position: "relative", padding: "62px 30px 34px", textAlign: "center", overflow: "hidden" }}>
        {/* ambient glow */}
        <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 240, height: 240, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(216,189,130,0.16), transparent 66%)", animation: "floatGlow 7s ease-in-out infinite", pointerEvents: "none" }} />

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 9, letterSpacing: 5, color: C.textMuted, textTransform: "uppercase", marginBottom: 14 }}>Group Dining Matching</div>
          {/* hairline · logo · hairline */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
            <span style={{ height: 1, width: 34, background: `linear-gradient(90deg, transparent, ${C.gold})` }} />
            <span style={{ fontFamily: FONT_LOGO, fontSize: 46, fontWeight: 700, letterSpacing: 7, ...goldText, lineHeight: 1 }}>AISEKI</span>
            <span style={{ height: 1, width: 34, background: `linear-gradient(90deg, ${C.gold}, transparent)` }} />
          </div>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 15, color: C.text, letterSpacing: 4, marginTop: 12, opacity: 0.85 }}>グループ飲み会</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14,
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
            color: C.goldBright, background: "rgba(216,189,130,0.09)", border: `1px solid ${C.lineGold}`,
          }}>
            <Users size={13} strokeWidth={2} /> 2名以上のグループ同士でマッチング
          </div>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 13.5, color: C.textSec, letterSpacing: 0.8, marginTop: 16, lineHeight: 1.7 }}>
            夜の街で、「グループ」と「グループ」が卓を囲む。<br />大人のための、上質な飲み会マッチング。
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
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例: 山田太郎" style={fieldStyle} />
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
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>年齢（18歳以上）</label>
                  <input type="number" required min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} placeholder="28" style={fieldStyle} />
                </div>

                {/* 年齢確認 & 規約同意（インターネット異性紹介事業に該当しないための必須要件） */}
                <div
                  onClick={() => setAgreed((v) => !v)}
                  style={{
                    display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer", marginBottom: 16,
                    padding: "13px 15px", borderRadius: 14,
                    background: agreed ? "rgba(216,189,130,0.08)" : "rgba(255,255,255,0.028)",
                    border: `1px solid ${agreed ? C.lineGold : C.lineSoft}`,
                    transition: "background .2s ease, border-color .2s ease",
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: 6, marginTop: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    ...(agreed
                      ? { background: C.goldGrad, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }
                      : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}` }),
                  }}>
                    {agreed && <Check size={13} strokeWidth={3} color="#241704" />}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75 }}>
                    私は<b style={{ color: C.text, fontWeight: 700 }}>18歳以上</b>であり、
                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowTerms(true); }} style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      color: C.gold, fontWeight: 700, fontSize: 11.5, textDecoration: "underline", textUnderlineOffset: 3,
                    }}>利用規約</button>
                    に同意します。本サービスはグループでの飲み会・食事会のマッチングサービスであり、異性交際・1対1の出会いを目的とした利用が禁止されていることを理解しました。
                  </span>
                </div>
              </>
            )}

            {error && (
              <div style={{ fontSize: 12, color: C.redSoft, background: "rgba(178,58,76,0.14)", border: "1px solid rgba(178,58,76,0.35)", borderRadius: 11, padding: "10px 13px", marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
            )}
            {notice && (
              <div style={{ fontSize: 12, color: C.goldBright, background: "rgba(216,189,130,0.1)", border: `1px solid ${C.lineGold}`, borderRadius: 11, padding: "10px 13px", marginBottom: 14, lineHeight: 1.5 }}>{notice}</div>
            )}

            {(() => {
              const blocked = loading || (mode === "signup" && !agreed);
              return (
            <button type="submit" className="gold-cta" disabled={blocked} style={{
              ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15,
              opacity: blocked ? 0.5 : 1, cursor: blocked ? "default" : "pointer",
            }}>
              {loading ? "処理中…" : mode === "login" ? "ログイン" : "登録して始める"}
            </button>
              );
            })()}
          </form>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
            {mode === "signup"
              ? <><Sparkles size={13} strokeWidth={1.8} color={C.gold} /> 新規登録で <b style={{ color: C.goldBright, fontWeight: 700 }}>1,000pt</b> プレゼント</>
              : "アカウントをお持ちでない方は「新規登録」から"}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button type="button" className="press" onClick={() => setShowTerms(true)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: C.textSec, letterSpacing: 0.6, textDecoration: "underline", textUnderlineOffset: 3,
          }}>利用規約を読む</button>
          <div style={{ marginTop: 10, fontSize: 9.5, color: C.textFaint, letterSpacing: 2, textTransform: "uppercase" }}>
            18歳未満利用禁止 · グループ飲み会マッチング
          </div>
        </div>
      </div>
    </div>
  );
}

function translateError(msg) {
  const m = msg.toLowerCase();
  // ネットワーク／バックエンド不通。ブラウザごとに文言が違うのでまとめて拾う。
  // （Chrome: Failed to fetch / Safari: Load failed / Firefox: NetworkError）
  if (
    m.includes("failed to fetch") || m.includes("load failed") ||
    m.includes("networkerror") || m.includes("network error") ||
    m.includes("err_name_not_resolved") || m.includes("fetch failed")
  ) {
    return "サーバーに接続できませんでした。通信環境をご確認のうえ、しばらく経ってから再度お試しください。";
  }
  if (m.includes("invalid login")) return "メールアドレスまたはパスワードが正しくありません。";
  if (m.includes("already registered") || m.includes("already exists")) return "このメールアドレスは既に登録されています。";
  if (m.includes("email not confirmed")) return "メールアドレスが未確認です。確認メールのリンクを開いてください。";
  if (m.includes("password should be")) return "パスワードは6文字以上で入力してください。";
  if (m.includes("rate limit") || m.includes("too many requests")) return "試行回数が上限に達しました。しばらく時間をおいてからお試しください。";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "現在、新規登録を受け付けていません。";
  return msg;
}
