import { useState } from "react";
import { Sparkles, Users, ChevronLeft, Check, ShieldCheck, Eye, EyeOff, Mail, ArrowLeft } from "lucide-react";
import {
  C, FONT_LOGO, FONT_HEAD, brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle,
} from "../lib/theme.jsx";
import {
  signIn, signUp, sendPasswordReset, MIN_AGE, MIN_GROUP_SIZE, ageFromBirthDate, maxBirthDate, LIMITS,
  SIGNUP_BONUS, SIGNUP_BONUS_SEATS,
} from "../lib/api";
import { FOOTER_NOTICE } from "../lib/legal.js";
import { TermsBody } from "./TermsScreen.jsx";

/* 新規登録で求めるパスワードの最短長。
   Supabase 側の既定は6文字だが、ローンチにあたり8文字に引き上げる。 */
const MIN_PASSWORD = 8;

export default function AuthScreen({ initialMode = "login", onBack }) {
  // 'login' | 'signup' | 'forgot'
  const [mode, setMode] = useState(initialMode === "terms" ? "login" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");   // 年齢確認（20歳以上）の根拠
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(initialMode === "terms");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const age = ageFromBirthDate(birthDate);          // 入力済みなら満年齢、未入力・不正なら null
  const adult = age !== null && age >= MIN_AGE;

  const switchMode = (m) => { setMode(m); setError(""); setNotice(""); };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (mode === "forgot") {
      setLoading(true);
      try {
        await sendPasswordReset(email);
        setNotice(
          "パスワード再設定用のメールを送信しました。メール内のリンクを開いて、新しいパスワードを設定してください。" +
          "メールが届かない場合は、迷惑メールフォルダもご確認ください。"
        );
      } catch (err) {
        setError(translateError(err?.message || "エラーが発生しました"));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "signup") {
      if (password.length < MIN_PASSWORD) {
        setError(`パスワードは${MIN_PASSWORD}文字以上で入力してください。`);
        return;
      }
      if (!birthDate) {
        setError("年齢確認のため、生年月日を入力してください。");
        return;
      }
      if (age === null) {
        setError("生年月日を正しく入力してください。");
        return;
      }
      if (!adult) {
        setError(`本サービスは${MIN_AGE}歳未満の方はご利用いただけません（飲酒を伴うため）。`);
        return;
      }
      if (!agreed) {
        setError(`利用規約への同意と、${MIN_AGE}歳以上であることの確認が必要です。`);
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await signIn({ email, password });
        // 成功後は App の onAuthStateChange が画面を切り替える
      } else {
        const data = await signUp({ email, password, username, birthDate, ageConfirmed: agreed });
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

  /* ── 規約の全文表示 ── */
  if (showTerms) {
    return (
      <div className="app-body" style={{ padding: "0 22px 30px" }}>
        <button className="press" onClick={() => setShowTerms(false)} style={{
          display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
          fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "20px 0 14px", fontWeight: 600, letterSpacing: 0.4,
        }}>
          <ChevronLeft size={18} strokeWidth={2} /> 戻る
        </button>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.primaryDeep, letterSpacing: 2.4, textTransform: "uppercase", marginBottom: 4 }}>Terms of Service</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 23, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>利用規約</div>
        </div>
        <TermsBody />
      </div>
    );
  }

  const isForgot = mode === "forgot";

  return (
    <div className="app-body">
      {/* ── サービス紹介へ戻る ── */}
      {onBack && (
        <div style={{ padding: "16px 24px 0" }}>
          <button className="press" onClick={onBack} style={{
            display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none",
            fontSize: 12.5, color: C.textSec, cursor: "pointer", padding: 0, letterSpacing: 0.4,
          }}>
            <ArrowLeft size={15} strokeWidth={2} /> サービス紹介に戻る
          </button>
        </div>
      )}

      {/* ── Brand / hero ── */}
      <div style={{ position: "relative", padding: onBack ? "34px 30px 30px" : "56px 30px 32px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 240, height: 240, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(232,201,135,0.18), transparent 66%)", animation: "floatGlow 7s ease-in-out infinite", pointerEvents: "none" }} />

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 10, letterSpacing: 3.2, color: C.primaryDeep, fontWeight: 600, textTransform: "uppercase", marginBottom: 14 }}>Premium Group Matching</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
            <span style={{ width: 26, height: 1, background: `linear-gradient(90deg, transparent, ${C.primary})` }} />
            <span style={{ fontFamily: FONT_LOGO, fontSize: 46, fontWeight: 600, letterSpacing: 5, ...brandText, lineHeight: 1 }}>AISEKI</span>
            <span style={{ width: 26, height: 1, background: `linear-gradient(90deg, ${C.primary}, transparent)` }} />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 13, color: C.textSec, fontWeight: 500, letterSpacing: 4, marginTop: 12 }}>大人のグループ相席</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18,
            padding: "7px 16px", borderRadius: 999, fontSize: 10.5, fontWeight: 500, letterSpacing: 0.8,
            color: C.primaryDeep, background: "rgba(232,201,135,0.08)", border: `1px solid ${C.linePrimary}`, boxShadow: C.shadowSoft,
          }}>
            <Users size={13} strokeWidth={2} /> {MIN_GROUP_SIZE}名以上のグループ同士 · {MIN_AGE}歳以上限定
          </div>
        </div>
      </div>

      <div style={{ padding: "0 24px 30px" }}>
        <div style={{ ...card, padding: 24 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 600, color: C.text, letterSpacing: 0.5, marginBottom: 4 }}>
            {isForgot ? "パスワードをお忘れですか" : mode === "login" ? "おかえりなさい" : "ようこそ"}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20, letterSpacing: 0.3, lineHeight: 1.7 }}>
            {isForgot
              ? "ご登録のメールアドレスに、再設定用のリンクをお送りします。"
              : mode === "login" ? "アカウントにログインしてください" : "アカウントを作成してはじめる"}
          </div>

          {/* タブ切替（再設定中は出さない） */}
          {!isForgot && (
            <div style={{ display: "flex", gap: 7, marginBottom: 22, background: "rgba(255,255,255,0.045)", padding: 4, borderRadius: 13, border: `1px solid ${C.lineSoft}` }}>
              {[{ k: "login", l: "ログイン" }, { k: "signup", l: "新規登録" }].map((t) => {
                const on = mode === t.k;
                return (
                  <button key={t.k} type="button" className="press" onClick={() => switchMode(t.k)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: "none",
                    ...(on
                      ? { background: C.primaryGrad, color: "#241a06", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }
                      : { background: "transparent", color: C.textSec }),
                  }}>{t.l}</button>
                );
              })}
            </div>
          )}

          <form onSubmit={submit}>
            {mode === "signup" && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>ニックネーム</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={LIMITS.username}
                  placeholder="例: たろう"
                  autoComplete="nickname"
                  style={fieldStyle}
                />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>メールアドレス</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                style={fieldStyle}
              />
            </div>

            {!isForgot && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>パスワード</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={mode === "signup" ? MIN_PASSWORD : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? `${MIN_PASSWORD}文字以上` : "パスワード"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    style={{ ...fieldStyle, paddingRight: 46 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 4,
                    }}
                  >
                    {showPw ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
                  </button>
                </div>
                {mode === "login" && (
                  <div style={{ textAlign: "right", marginTop: 9 }}>
                    <button type="button" onClick={() => switchMode("forgot")} style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontSize: 11.5, color: C.primaryDeep, textDecoration: "underline", textUnderlineOffset: 3,
                    }}>パスワードをお忘れですか？</button>
                  </div>
                )}
              </div>
            )}

            {mode === "signup" && (
              <>
                {/* 年齢確認 … 生年月日から満年齢を算出し、20歳未満は登録できない */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>生年月日（{MIN_AGE}歳以上のみ登録できます）</label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    max={maxBirthDate()}
                    onChange={(e) => setBirthDate(e.target.value)}
                    style={{ ...fieldStyle, colorScheme: "dark" }}
                  />
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 10.5, lineHeight: 1.65, color: birthDate && !adult ? C.accentDeep : C.textMuted }}>
                    <ShieldCheck size={12} strokeWidth={1.9} color={birthDate && !adult ? C.accent : C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
                    {birthDate
                      ? age === null
                        ? "生年月日を正しく入力してください。"
                        : adult
                          ? `満${age}歳 — ご利用いただけます。生年月日が他のユーザーに表示されることはありません。`
                          : `満${age}歳 — 飲酒を伴うため、${MIN_AGE}歳未満の方はご利用いただけません。`
                      : `本サービスは飲酒を伴うため、${MIN_AGE}歳未満の方はご利用いただけません。生年月日で年齢を確認します。`}
                  </div>
                </div>

                {/* 年齢確認 & 規約同意（風営法上の風俗営業に該当しない運用のための必須要件） */}
                <div
                  onClick={() => setAgreed((v) => !v)}
                  style={{
                    display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer", marginBottom: 16,
                    padding: "13px 15px", borderRadius: 14,
                    background: agreed ? "rgba(232,201,135,0.10)" : "rgba(255,255,255,0.045)",
                    border: `1px solid ${agreed ? C.linePrimary : C.lineSoft}`,
                    transition: "background .2s ease, border-color .2s ease",
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: 6, marginTop: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    ...(agreed
                      ? { background: C.primaryGrad, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }
                      : { background: "rgba(232,201,135,0.09)", border: `1px solid ${C.lineSoft}` }),
                  }}>
                    {agreed && <Check size={13} strokeWidth={3} color="#241a06" />}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75 }}>
                    私は<b style={{ color: C.text, fontWeight: 700 }}>{MIN_AGE}歳以上</b>であり、
                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowTerms(true); }} style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      color: C.primaryDeep, fontWeight: 700, fontSize: 11.5, textDecoration: "underline", textUnderlineOffset: 3,
                    }}>利用規約</button>
                    に同意します。本サービスは{MIN_GROUP_SIZE}名以上のグループ同士で飲食店のオープンスペースを共にする相席サービスであり、
                    異性交際・1対1の出会いを目的とした利用と、個室での相席が禁止されていることを理解しました。
                  </span>
                </div>
              </>
            )}

            {error && (
              <div role="alert" style={{ fontSize: 12, color: C.accentDeep, background: "rgba(168,32,58,0.18)", border: "1px solid rgba(200,56,79,0.42)", borderRadius: 11, padding: "10px 13px", marginBottom: 14, lineHeight: 1.65 }}>{error}</div>
            )}
            {notice && (
              <div role="status" style={{ fontSize: 12, color: C.primaryDeep, background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, borderRadius: 11, padding: "10px 13px", marginBottom: 14, lineHeight: 1.65 }}>{notice}</div>
            )}

            {(() => {
              // 20歳未満・年齢未確認・規約未同意では登録ボタンを押せない
              const blocked = loading || (mode === "signup" && (!agreed || !adult));
              return (
                <button type="submit" className="lux-cta" disabled={blocked} style={{
                  ...popBtn, width: "100%", padding: "15px 0", fontSize: 15,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: blocked ? 0.5 : 1, cursor: blocked ? "default" : "pointer",
                }}>
                  {loading
                    ? "処理中…"
                    : isForgot
                      ? <><Mail size={16} strokeWidth={2.1} /> 再設定メールを送る</>
                      : mode === "login" ? "ログイン" : "登録して始める"}
                </button>
              );
            })()}

            {isForgot && (
              <button type="button" className="press" onClick={() => switchMode("login")} style={{
                ...ghostBtn, width: "100%", padding: "13px 0", fontSize: 13.5, marginTop: 10,
              }}>
                ログインに戻る
              </button>
            )}
          </form>

          {!isForgot && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
              {mode === "signup"
                ? <><Sparkles size={13} strokeWidth={1.8} color={C.primary} /> 新規登録で <b style={{ color: C.primaryDeep, fontWeight: 700 }}>{SIGNUP_BONUS.toLocaleString()}pt</b> プレゼント（参加{SIGNUP_BONUS_SEATS}名分）</>
                : "アカウントをお持ちでない方は「新規登録」から"}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button type="button" className="press" onClick={() => setShowTerms(true)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: C.textSec, letterSpacing: 0.6, textDecoration: "underline", textUnderlineOffset: 3,
          }}>利用規約・プライバシーポリシーを読む</button>
          {/* 法的表示（許認可・年齢制限・接待/個室/サクラなし） */}
          <div style={{ marginTop: 12, fontSize: 9.5, color: C.textFaint, letterSpacing: 0.8, lineHeight: 1.9 }}>
            {FOOTER_NOTICE.map((line) => <div key={line}>{line}</div>)}
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
  if (m.includes("already registered") || m.includes("already exists")) return "このメールアドレスは既に登録されています。「ログイン」からお進みください。";
  if (m.includes("email not confirmed")) return "メールアドレスが未確認です。確認メールのリンクを開いてください。";
  if (m.includes("password should be")) return "パスワードが短すぎます。8文字以上で入力してください。";
  // Supabase 側のメールアドレス検証。形式は正しくても、メールを受け取れない
  // ドメイン（test.com / example.com など MX レコードが無いもの）は弾かれる。
  // 生の英語メッセージ（Email address "..." is invalid）だと原因が分からないため明示する。
  if (m.includes("invalid format") || m.includes("unable to validate email")) {
    return "メールアドレスの形式が正しくありません。";
  }
  if (m.includes("is invalid") && m.includes("email")) {
    return "このメールアドレスは使用できません。test.com や example.com など、実際にメールを受信できないドメインは登録できません。受信できるメールアドレスをご入力ください。";
  }
  // 確認メールの送信数上限（Supabase 既定のSMTPは 1時間に数通まで）
  if (m.includes("email rate limit") || m.includes("over_email_send_rate_limit")) {
    return "確認メールの送信が集中しています。しばらく時間をおいてから再度お試しください。";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) return "試行回数が上限に達しました。しばらく時間をおいてからお試しください。";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "現在、新規登録を受け付けていません。";
  return msg;
}
