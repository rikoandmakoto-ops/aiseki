import { useState, useEffect, useRef } from "react";
import { Sparkles, UsersRound, ShieldCheck, Eye, EyeOff, Check, ChevronLeft, Camera, X } from "lucide-react";
import {
  C, FONT_LOGO, FONT_HEAD, brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle,
} from "../lib/theme.jsx";
import * as api from "../lib/api.js";
import { FOOTER_NOTICE } from "../lib/legal.js";
import { TermsBody } from "./TermsScreen.jsx";

/* ══════════════════════════════════════════════════════════════
   招待リンクからの簡易登録

   3種類の招待リンクが、すべてここに来る（DB 側の invite_preview が振り分ける）。
     group … ホストが友達を集めるグループへの招待
     join  … 参加申請の「招待して呼ぶ」（相席のお誘い）
     seat  … 承認済みの会の席（同伴者として）

   集めるのは
     ・メールアドレス／パスワード（アカウントを作るため）
     ・お名前（ニックネーム）
     ・ご本名・電話番号（後日の年齢確認・本人確認用）
     ・生年月日（年齢確認。20歳以上）
     ・お写真（任意）
   だけ。性別は聞かない（アプローチ機能を使えないため必要が無い）。
   カードの登録も要らず、費用は一切かからない。

   ⚠ ご本名は他のユーザーには一切見せない。画面に出るのはニックネームだけで、
     同じ会のメンバーからも読めない（DB 側で列の SELECT 権限を付けていない。
     supabase/migration_real_name.sql）。ここを緩めないこと。

   ⚠ 年齢確認だけは通常登録とまったく同じ。飲酒を伴うため、
     ここを緩めることはできない（DB 側の handle_new_user でも弾く）。

   ⚠ メール確認が有効なので、登録した直後にはセッションが張られない。
     招待コードと、選んでもらった写真は端末に控えておき、
     確認メールから戻ってログインした時点で App が引き受ける
     （api.claimInvite ＋ 写真のアップロード）。
   ══════════════════════════════════════════════════════════════ */

const MIN_PASSWORD = 8;
const PENDING_KEY = "aiseki:pendingInvite";
const PENDING_PHOTO_KEY = "aiseki:pendingInvitePhoto";

export const savePendingInvite = (code) => {
  try { window.localStorage.setItem(PENDING_KEY, String(code || "").toUpperCase()); } catch { /* 使えなくても登録は進む */ }
};
export const readPendingInvite = () => {
  try { return window.localStorage.getItem(PENDING_KEY) || ""; } catch { return ""; }
};
export const clearPendingInvite = () => {
  try { window.localStorage.removeItem(PENDING_KEY); window.localStorage.removeItem(PENDING_PHOTO_KEY); } catch { /* 消せなくても実害は無い */ }
};

/* 登録前に選んでもらった写真（縮小済みの data URL）。任意なので、
   保存に失敗しても登録は止めない（あとからマイページで設定できる）。 */
export const savePendingPhoto = (dataUrl) => {
  try { window.localStorage.setItem(PENDING_PHOTO_KEY, String(dataUrl || "")); } catch { /* 容量超過など */ }
};
export const readPendingPhoto = () => {
  try { return window.localStorage.getItem(PENDING_PHOTO_KEY) || ""; } catch { return ""; }
};
export const clearPendingPhoto = () => {
  try { window.localStorage.removeItem(PENDING_PHOTO_KEY); } catch { /* 実害は無い */ }
};

/* 招待の種類ごとの見出し。返ってくるのは「誰に招かれたか」だけで、
   招いた人のプロフィールは含まれない（§1）。 */
const inviteHeading = (p) => {
  if (p?.kind === "join") {
    return {
      title: <>{p.owner_name}さんから<br />相席のお誘いが届いています</>,
      note: <>「{p.group_name}」にお二人で参加します。お支払いは<b style={{ fontWeight: 700 }}>{p.owner_name}さん</b>が済ませるので、あなたの費用は一切かかりません。</>,
    };
  }
  if (p?.kind === "seat") {
    return {
      title: <>{p.owner_name}さんから<br />「{p.group_name}」に招待されています</>,
      note: <>参加は承認済みです。かんたんな登録でグループチャットに参加できます（費用はかかりません）。</>,
    };
  }
  return {
    title: <>{p?.owner_name}さんから<br />「{p?.group_name}」に招待されています</>,
    note: <>お名前・年齢確認・お写真だけの<b style={{ fontWeight: 700 }}>かんたんな登録</b>で参加できます。費用は一切かかりません（カードの登録も不要です）。</>,
  };
};

export default function InviteSignupScreen({ code, onBack, onLogin }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [photo, setPhoto] = useState("");        // 縮小済みの data URL（任意）
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.invitePreview(code)
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

  /* 写真は任意。ここではまだアップロードできない（セッションが無い）ので、
     縮小して端末に控えるだけにする。上げるのは確認メールから戻ったあと。 */
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const small = await api.shrinkImageFile(file);
      setPhoto(await api.fileToDataUrl(small));
      setError("");
    } catch (err) {
      setError(err?.message || "画像を読み込めませんでした。");
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");

    /* メールアドレスは先に見る。ここを通していると Supabase の英語のエラーが
       そのまま出て、何を直せばいいのか分からない。 */
    if (!api.isValidEmail(email.trim())) { setError("メールアドレスを正しく入力してください。"); return; }
    if (!username.trim()) { setError("お名前（ニックネーム）を入力してください。"); return; }
    if (!realName.trim()) { setError("ご本名を入力してください。"); return; }
    if (!api.isValidPhone(phone)) { setError("電話番号を正しく入力してください。"); return; }
    if (password.length < MIN_PASSWORD) { setError(`パスワードは${MIN_PASSWORD}文字以上で入力してください。`); return; }
    if (!birthDate) { setError("年齢確認のため、生年月日を入力してください。"); return; }
    if (age === null) { setError("生年月日を正しく入力してください。"); return; }
    if (!adult) { setError(`本サービスは${api.MIN_AGE}歳未満の方はご利用いただけません（飲酒を伴うため）。`); return; }
    if (!agreed) { setError(`利用規約への同意と、${api.MIN_AGE}歳以上であることの確認が必要です。`); return; }

    setLoading(true);
    try {
      /* 招待コードと写真は先に控える。確認メールから戻ってきた時点で引き受ける。 */
      savePendingInvite(code);
      if (photo) savePendingPhoto(photo); else clearPendingPhoto();
      const data = await api.signUp({
        email: email.trim(), password, username: username.trim(), birthDate,
        gender: null, ageConfirmed: agreed,
        accountType: api.ACCOUNT_SIMPLE,
        realName: realName.trim(),
        phoneNumber: phone,
        /* 確認メールの戻り先にもコードを載せる（別のブラウザで開かれても
           引き受けられるように）。控えの localStorage は残したまま。 */
        inviteCode: code,
      });
      if (!data.session) {
        setNotice(
          "確認メールを送信しました。メール内のリンクを開いてからログインすると、" +
          "参加の手続きが完了します。"
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
              {inviteHeading(preview).title}
            </div>
            <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.8, marginTop: 8 }}>
              {inviteHeading(preview).note}
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
              {/* 入力の順番は「アカウントを作る → あなたのこと」。
                  先にメールとパスワードを置くと、途中で離脱しても
                  確認メールから戻って続きができる。 */}
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

              <div style={{ height: 1, background: C.lineSoft, margin: "19px 0 17px" }} />

              {/* 画面に出るのはニックネームだけ。ご本名は当日の本人確認用として
                  預かるだけで、他のユーザーには一切表示しない。 */}
              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>お名前（ニックネーム）</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  maxLength={api.LIMITS.username} placeholder="例: ゆうと" style={fieldStyle} />
                <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 7, lineHeight: 1.7 }}>
                  当日お呼びする名前です。本名でなくてかまいません。
                </div>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>ご本名</label>
                <input value={realName} onChange={(e) => setRealName(e.target.value)}
                  maxLength={60} autoComplete="name" placeholder="例: 山田 悠人" style={fieldStyle} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 7, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
                  <ShieldCheck size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    後日年齢確認に使用することがあるため正確にご入力ください。
                    <b style={{ color: C.textSec, fontWeight: 700 }}>他の参加者には表示されません</b>
                    （お相手に見えるのは上のニックネームだけです）。
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>電話番号</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  maxLength={20} autoComplete="tel" inputMode="tel"
                  placeholder="例: 090-1234-5678" style={fieldStyle} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 7, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
                  <ShieldCheck size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    後日年齢確認に使用することがあるため正確にご入力ください。
                    <b style={{ color: C.textSec, fontWeight: 700 }}>他の参加者には表示されません</b>。
                  </span>
                </div>
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

              {/* お写真（任意）。ここではまだ上げられない（セッションが無い）ので、
                  縮小して端末に控え、確認メールから戻った時点で上げる。 */}
              <div style={{ marginBottom: 15 }}>
                <label style={labelStyle}>お写真（任意）</label>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={pickPhoto} style={{ display: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button type="button" className="press" onClick={() => fileRef.current?.click()}
                    disabled={photoBusy}
                    style={{
                      ...ghostBtn, width: 64, height: 64, borderRadius: 16, padding: 0, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                      backgroundImage: photo ? `url(${photo})` : undefined,
                      backgroundSize: "cover", backgroundPosition: "center",
                    }}>
                    {!photo && <Camera size={19} strokeWidth={1.8} color={C.primaryDeep} />}
                  </button>
                  <div style={{ minWidth: 0, flex: 1, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
                    {photoBusy ? "読み込み中…" : photo
                      ? <>登録後に自動で設定されます。<button type="button" onClick={() => setPhoto("")} style={{
                          background: "none", border: "none", padding: 0, marginLeft: 4, color: C.accentDeep,
                          fontSize: 10.5, cursor: "pointer", textDecoration: "underline",
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}><X size={10} strokeWidth={2.2} />取り消す</button></>
                      : <>あとからマイページでも設定できます。<b style={{ color: C.textSec, fontWeight: 700 }}>お一人で写っているもの</b>をお願いします。</>}
                  </div>
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
                {loading ? "登録中…" : (
                  <><Sparkles size={16} strokeWidth={2} /> {
                    preview.kind === "group" ? "登録してグループに参加する" : "登録して参加する"
                  }</>
                )}
              </button>

              <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.75, marginTop: 13 }}>
                {photo
                  ? "お写真は、ご登録の完了後に自動で設定されます。"
                  : "お写真は、登録のあとマイページからいつでも設定できます。"}
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
