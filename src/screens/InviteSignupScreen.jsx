import { useState, useEffect } from "react";
import { Sparkles, UsersRound, ShieldCheck, Eye, EyeOff, Check, ChevronLeft } from "lucide-react";
import {
  C, FONT_LOGO, FONT_HEAD, brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle,
} from "../lib/theme.jsx";
import * as api from "../lib/api.js";
import { FOOTER_NOTICE } from "../lib/legal.js";
import { TermsBody } from "./TermsScreen.jsx";

/* ══════════════════════════════════════════════════════════════
   招待リンクからの簡易登録

   ホストの友達がここに来る。集めるのは
     ・お名前（ニックネーム）
     ・生年月日（年齢確認。20歳以上）
     ・お写真（ログイン後に設定してもらう）
   だけ。性別は聞かない（アプローチ機能を使えないため必要が無い）。
   カードの登録も要らず、費用は一切かからない。

   ⚠ 年齢確認だけは通常登録とまったく同じ。飲酒を伴うため、
     ここを緩めることはできない（DB 側の handle_new_user でも弾く）。

   ⚠ メール確認が有効なので、登録した直後にはセッションが張られない。
     招待コードは端末に控えておき、確認メールから戻ってログインした
     時点で App が引き受ける（api.claimGroupInvite）。
   ══════════════════════════════════════════════════════════════ */

const MIN_PASSWORD = 8;
const PENDING_KEY = "aiseki:pendingInvite";

export const savePendingInvite = (code) => {
  try { window.localStorage.setItem(PENDING_KEY, String(code || "").toUpperCase()); } catch { /* 使えなくても登録は進む */ }
};
export const readPendingInvite = () => {
  try { return window.localStorage.getItem(PENDING_KEY) || ""; } catch { return ""; }
};
export const clearPendingInvite = () => {
  try { window.localStorage.removeItem(PENDING_KEY); } catch { /* 消せなくても実害は無い */ }
};

export default function InviteSignupScreen({ code, onBack, onLogin }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    let alive = true;
    api.groupInvitePreview(code)
      .then((p) => {
        if (!alive) return;
        if (!p) { setLoadError("この招待リンクは使えません。リンクが正しいか、招待した方にご確認ください。"); return; }
        setPreview(p);
        if (p.display_name) setUsername(p.display_name);
      })
      .catch((e) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, [code]);

  const age = api.ageFromBirthDate(birthDate);
  const adult = age !== null && age >= api.MIN_AGE;

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");

    if (!username.trim()) { setError("お名前（ニックネーム）を入力してください。"); return; }
    if (password.length < MIN_PASSWORD) { setError(`パスワードは${MIN_PASSWORD}文字以上で入力してください。`); return; }
    if (!birthDate) { setError("年齢確認のため、生年月日を入力してください。"); return; }
    if (age === null) { setError("生年月日を正しく入力してください。"); return; }
    if (!adult) { setError(`本サービスは${api.MIN_AGE}歳未満の方はご利用いただけません（飲酒を伴うため）。`); return; }
    if (!agreed) { setError(`利用規約への同意と、${api.MIN_AGE}歳以上であることの確認が必要です。`); return; }

    setLoading(true);
    try {
      /* 招待コードは先に控える。確認メールから戻ってきた時点で引き受ける。 */
      savePendingInvite(code);
      const data = await api.signUp({
        email, password, username: username.trim(), birthDate,
        gender: null, ageConfirmed: agreed,
        accountType: api.ACCOUNT_SIMPLE,
      });
      if (!data.session) {
        setNotice(
          "確認メールを送信しました。メール内のリンクを開いてからログインすると、" +
          "グループへの参加が完了します。"
        );
      }
    } catch (err) {
      clearPendingInvite();
      setError(err?.message || "登録できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  if (showTerms) {
    return (
      <div className="app-body" style={{ padding: "0 22px 30px" }}>
        <button className="press" onClick={() => setShowTerms(false)} style={{
          display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
          fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "20px 0 14px", fontWeight: 600,
        }}>
          <ChevronLeft size={18} strokeWidth={2} /> 戻る
        </button>
        <TermsBody />
      </div>
    );
  }

  return (
    <div className="app-body" style={{ padding: "0 22px 34px" }}>
      <div style={{ textAlign: "center", padding: "30px 0 20px" }}>
        <div style={{ fontFamily: FONT_LOGO, fontSize: 30, letterSpacing: 5, ...brandText }}>AISEKI</div>
      </div>

      {loadError ? (
        <div style={{ ...card, padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.accentDeep, lineHeight: 1.8 }}>{loadError}</div>
          {onBack && (
            <button className="press" onClick={onBack} style={{
              ...ghostBtn, marginTop: 18, padding: "12px 26px", borderRadius: 999, fontSize: 13,
            }}>アプリを開く</button>
          )}
        </div>
      ) : !preview ? (
        <div style={{ ...card, padding: 22, fontSize: 13, color: C.textMuted, textAlign: "center" }}>
          招待を確認しています…
        </div>
      ) : preview.claimed ? (
        <div style={{ ...card, padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.8 }}>
            この招待リンクは既に使われています。<br />
            心当たりが無い場合は、招待した方にご確認ください。
          </div>
          {onLogin && (
            <button className="press" onClick={onLogin} style={{
              ...ghostBtn, marginTop: 18, padding: "12px 26px", borderRadius: 999, fontSize: 13,
            }}>ログインする</button>
          )}
        </div>
      ) : (
        <>
          <div className="fade" style={{
            borderRadius: 18, padding: "18px 18px 17px", marginBottom: 16, textAlign: "center",
            background: "linear-gradient(135deg, rgba(232,201,135,0.14), rgba(168,32,58,0.16))",
            border: `1px solid ${C.linePrimary}`,
          }}>
            <span style={{
              display: "inline-flex", width: 38, height: 38, borderRadius: 19, marginBottom: 9,
              alignItems: "center", justifyContent: "center",
              background: "rgba(232,201,135,0.14)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
            }}><UsersRound size={17} strokeWidth={1.9} /></span>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 600, color: C.text, letterSpacing: 0.3, lineHeight: 1.5 }}>
              {preview.owner_name}さんから<br />「{preview.group_name}」に招待されています
            </div>
            <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.8, marginTop: 8 }}>
              お名前・年齢確認・お写真だけの<b style={{ color: C.primaryDeep, fontWeight: 700 }}>かんたんな登録</b>で参加できます。
              費用は一切かかりません（カードの登録も不要です）。
            </div>
          </div>

          {notice ? (
            <div className="fade" style={{ ...card, padding: 22, textAlign: "center" }}>
              <Check size={26} strokeWidth={2.2} color={C.primary} />
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.85, marginTop: 12 }}>{notice}</div>
              {onLogin && (
                <button className="lux-cta" onClick={onLogin} style={{
                  ...popBtn, marginTop: 18, width: "100%", padding: "13px 0", borderRadius: 999, fontSize: 14,
                }}>ログイン画面へ</button>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="fade" style={{ ...card, padding: 22 }}>
              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>お名前（ニックネーム）</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  maxLength={api.LIMITS.username} placeholder="例: ゆうと" style={fieldStyle} />
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>生年月日（年齢確認）</label>
                <input type="date" value={birthDate} max={api.maxBirthDate()}
                  onChange={(e) => setBirthDate(e.target.value)}
                  style={{ ...fieldStyle, colorScheme: "dark" }} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
                  <ShieldCheck size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    飲酒を伴うため{api.MIN_AGE}歳以上の方限定です。
                    {birthDate && (adult
                      ? <b style={{ color: C.primaryDeep, fontWeight: 700 }}>（{age}歳・ご利用いただけます）</b>
                      : <b style={{ color: C.accentDeep, fontWeight: 700 }}>（{age}歳・ご利用いただけません）</b>)}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>メールアドレス</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email" placeholder="you@example.com" style={fieldStyle} />
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>パスワード（{MIN_PASSWORD}文字以上）</label>
                <div style={{ position: "relative" }}>
                  <input type={showPw ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                    style={{ ...fieldStyle, paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
                    style={{
                      position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 8,
                    }}>
                    {showPw ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
                  </button>
                </div>
              </div>

              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", marginBottom: 16 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                  style={{ marginTop: 3, width: 16, height: 16, accentColor: C.primary, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.textSec, lineHeight: 1.75 }}>
                  <button type="button" onClick={() => setShowTerms(true)} style={{
                    background: "none", border: "none", padding: 0, color: C.primaryDeep,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline",
                  }}>利用規約</button>
                  に同意します。{api.MIN_AGE}歳以上であることを確認しました。
                  本サービスは{api.MIN_HOST_GROUP_SIZE}名以上のグループ同士で飲食店のオープンスペースを共にする相席サービスであり、
                  異性交際を目的としたサービスではありません。
                </span>
              </label>

              {error && (
                <div style={{ fontSize: 12, color: C.accentDeep, lineHeight: 1.7, marginBottom: 13 }}>{error}</div>
              )}

              <button type="submit" className="lux-cta" disabled={loading} style={{
                ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: loading ? 0.7 : 1,
              }}>
                {loading ? "登録中…" : <><Sparkles size={16} strokeWidth={2} /> 登録してグループに参加する</>}
              </button>

              <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.75, marginTop: 13 }}>
                登録のあと、マイページからお写真を1枚設定してください。
                お写真は<b style={{ color: C.textSec, fontWeight: 700 }}>お一人で写っているもの</b>をお願いします。
                マッチが成立するまで、お相手には薄くぼかした状態でのみ表示されます。
              </div>
            </form>
          )}

          <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.8, marginTop: 18, textAlign: "center" }}>
            {FOOTER_NOTICE}
          </div>
        </>
      )}
    </div>
  );
}
