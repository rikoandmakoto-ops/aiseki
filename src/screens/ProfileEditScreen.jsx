import { useState, useRef, useMemo } from "react";
import {
  Camera, Lock, ShieldCheck, Plus, Check, X,
  Utensils, Wine, Briefcase, MapPin, Sparkles, ChevronLeft,
} from "lucide-react";
import * as api from "../lib/api.js";
import {
  C, FONT_DISPLAY, FONT_HEAD, FONT_BODY,
  brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle, Eyebrow,
} from "../lib/theme.jsx";
import { useToast } from "../lib/toast.jsx";

/* ══════════════════════════════════════════════════════════════
   プロフィール編集

   相手に見えるのは「同じ会に参加が承認されたメンバー」だけ。
   一覧・募集画面には一切出ない（RLS でも担保している）。
   そのため、ここでは安心して書ける旨を各所で明示する。
   ══════════════════════════════════════════════════════════════ */

/* ─────────── 充実度バー ───────────
   数字だけを出すと「減点されている」ように読めるので、
   達成した項目も、残っている項目も同じ大きさで並べる。 */
export const CompletionMeter = ({ profile, compact = false, onJump }) => {
  const { percent, items, missing } = useMemo(() => api.profileCompletion(profile), [profile]);
  const rank = api.completionRank(percent);
  const barColor =
    rank.tone === "gold" ? C.primaryGrad
      : rank.tone === "mid" ? "linear-gradient(90deg, #c9974a, #dfbc6c)"
        : "linear-gradient(90deg, #7c1626, #c8384f)";

  return (
    <div style={{
      borderRadius: 16, padding: compact ? "13px 15px" : "16px 17px",
      background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>
          プロフィールの充実度
        </span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, lineHeight: 1, ...brandText }}>
            {percent}
            <span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 600 }}>%</span>
          </span>
          <span style={{ fontSize: 10.5, color: C.textMuted }}>{rank.label}</span>
        </span>
      </div>

      {/* バー本体 */}
      <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div className="meter-fill" style={{
          width: `${percent}%`, height: "100%", borderRadius: 999, background: barColor,
          boxShadow: "0 0 12px rgba(232,201,135,0.45)",
        }} />
      </div>

      {!compact && missing.length > 0 && (
        <div style={{ marginTop: 13 }}>
          <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 8, lineHeight: 1.7 }}>
            あと{missing.length}項目で完成します。書くほど、当日の会話が早くはずみます。
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {items.map((i) => (
              <span key={i.key} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 10.5, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
                color: i.done ? C.primaryDeep : C.textMuted,
                background: i.done ? "rgba(232,201,135,0.10)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${i.done ? C.linePrimary : C.lineSoft}`,
              }}>
                {i.done ? <Check size={10} strokeWidth={3} /> : <Plus size={10} strokeWidth={2.6} />}
                {i.label}
              </span>
            ))}
          </div>
          {onJump && (
            <button className="press" onClick={onJump} style={{
              ...ghostBtn, width: "100%", marginTop: 13, padding: "10px 0", fontSize: 12.5,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Sparkles size={13} strokeWidth={2} /> プロフィールを仕上げる
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ─────────── 写真の枠（メイン1枚＋サブ最大5枚） ─────────── */
const PhotoSlot = ({ url, main, busy, onPick, onRemove }) => (
  <div style={{ position: "relative" }}>
    <button
      type="button"
      className="press photo-slot"
      onClick={onPick}
      disabled={busy}
      aria-label={url ? "写真を変更" : "写真を追加"}
      style={{
        width: "100%", aspectRatio: "1 / 1", borderRadius: 16, cursor: busy ? "wait" : "pointer",
        overflow: "hidden", display: "block", padding: 0, position: "relative",
        background: url ? "#141c33" : "rgba(255,255,255,0.04)",
        border: `1px ${url ? "solid" : "dashed"} ${main ? C.linePrimary : C.lineSoft}`,
      }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 5, color: C.textMuted,
        }}>
          <Camera size={19} strokeWidth={1.7} />
          <span style={{ fontSize: 9.5, letterSpacing: 0.4 }}>{main ? "メインの写真" : "追加"}</span>
        </span>
      )}
      {busy && (
        <span style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(5,8,15,0.72)",
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: "50%",
            border: `2px solid ${C.tintStrong}`, borderTopColor: C.primary,
            animation: "spin 0.85s linear infinite", display: "block",
          }} />
        </span>
      )}
    </button>

    {/* 「メイン」の印は写真が入っているときだけ。空の枠には案内文が出ているため。 */}
    {main && url && (
      <span style={{
        position: "absolute", top: 7, left: 7, fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
        padding: "3px 9px", borderRadius: 999, color: "#241a06", background: C.primaryGrad,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}>メイン</span>
    )}

    {url && !busy && (
      <button
        type="button"
        className="press"
        onClick={onRemove}
        aria-label="この写真を削除"
        style={{
          position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          background: "rgba(5,8,15,0.78)", border: `1px solid ${C.lineSoft}`, color: C.accentDeep,
        }}
      ><X size={13} strokeWidth={2.4} /></button>
    )}
  </div>
);

/* ─────────── 趣味の選択（候補から選ぶ／自由入力） ─────────── */
const HobbyPicker = ({ value, onChange }) => {
  const [text, setText] = useState("");
  const full = value.length >= api.MAX_HOBBIES;

  const toggle = (h) => {
    if (value.includes(h)) onChange(value.filter((x) => x !== h));
    else if (!full) onChange([...value, h]);
  };

  const addCustom = () => {
    const h = text.trim().slice(0, api.LIMITS.hobby);
    if (!h || value.includes(h) || full) { setText(""); return; }
    onChange([...value, h]);
    setText("");
  };

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 11 }}>
          {value.map((h) => (
            <button key={h} type="button" className="press" onClick={() => toggle(h)} style={{
              display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999,
              color: "#241a06", background: C.primaryGrad, border: "none",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
            }}>
              {h} <X size={11} strokeWidth={2.6} />
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
        <input
          value={text}
          maxLength={api.LIMITS.hobby}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addCustom(); } }}
          placeholder={full ? `登録できるのは${api.MAX_HOBBIES}個までです` : "自由に入力して追加"}
          disabled={full}
          style={{ ...fieldStyle, opacity: full ? 0.5 : 1 }}
        />
        <button type="button" className="press" onClick={addCustom} disabled={full || !text.trim()} style={{
          ...ghostBtn, padding: "0 16px", flexShrink: 0, fontSize: 13,
          opacity: full || !text.trim() ? 0.4 : 1,
        }}>追加</button>
      </div>

      <div className="scroll-x" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {api.HOBBY_SUGGESTIONS.filter((h) => !value.includes(h)).map((h) => (
          <button key={h} type="button" className="chip" onClick={() => toggle(h)} disabled={full} style={{
            fontSize: 11.5, padding: "6px 12px", borderRadius: 999, cursor: full ? "not-allowed" : "pointer",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`, color: C.textSec,
            opacity: full ? 0.35 : 1, whiteSpace: "nowrap",
          }}>{h}</button>
        ))}
      </div>
    </div>
  );
};

/* ─────────── 短い入力欄（アイコン付き） ─────────── */
const IconField = ({ icon: Icon, label, placeholder, value, onChange, max }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ ...labelStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icon size={12} strokeWidth={2} /> {label}
    </label>
    <input
      value={value}
      maxLength={max}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={fieldStyle}
    />
  </div>
);

/* ══════════════════════════════════════════════ 本体 */
export default function ProfileEditScreen({ user, profile, onBack, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({
    username: profile?.username || "",
    age: profile?.age ?? "",
    bio: profile?.bio || "",
    avatar_url: profile?.avatar_url || "",
    photos: profile?.photos ?? [],
    hobbies: profile?.hobbies ?? [],
    favorite_food: profile?.favorite_food || "",
    favorite_drink: profile?.favorite_drink || "",
    occupation: profile?.occupation || "",
    home_area: profile?.home_area || "",
  }));
  const [saving, setSaving] = useState(false);
  const [uploadingAt, setUploadingAt] = useState(null);  // 何枚目を上げているか
  const fileRef = useRef(null);
  const slotRef = useRef(null);                          // どの枠に入れるか

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  /* 枠 0 がメイン（avatar_url）、1〜5 がサブ（photos）。 */
  const photoAt = (i) => (i === 0 ? form.avatar_url : form.photos[i - 1] || "");
  const slots = Array.from({ length: api.MAX_PHOTOS }, (_, i) => photoAt(i));
  // 空の枠は「最初の1つ」だけ出す（並びが歯抜けにならないようにする）
  const firstEmpty = slots.findIndex((u) => !u);
  const visibleSlots = firstEmpty === -1 ? slots : slots.slice(0, firstEmpty + 1);

  const pick = (index) => {
    slotRef.current = index;
    fileRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const index = slotRef.current ?? 0;
    if (!file) return;
    setUploadingAt(index);
    try {
      const url = await api.uploadAvatar(user.id, file);
      const previous = photoAt(index);
      if (index === 0) set({ avatar_url: url });
      else {
        const next = [...form.photos];
        next[index - 1] = url;
        set({ photos: next.filter(Boolean) });
      }
      // 保存前に差し替えた分は、その場でストレージから消しておく
      if (previous && previous !== profile?.avatar_url && !(profile?.photos ?? []).includes(previous)) {
        api.removeAvatar(user.id, previous);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingAt(null);
    }
  };

  const removeAt = (index) => {
    const url = photoAt(index);
    if (index === 0) {
      // メインを消したら、次のサブ写真を繰り上げる（メインが空のまま残らないように）
      const [next, ...restPhotos] = form.photos;
      set({ avatar_url: next || "", photos: restPhotos });
    } else {
      set({ photos: form.photos.filter((_, i) => i !== index - 1) });
    }
    if (url && url !== profile?.avatar_url && !(profile?.photos ?? []).includes(url)) {
      api.removeAvatar(user.id, url);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(user.id, {
        username: form.username,
        age: form.age === "" ? null : form.age,
        bio: form.bio,
        avatar_url: form.avatar_url,
        photos: form.photos,
        hobbies: form.hobbies,
        favorite_food: form.favorite_food,
        favorite_drink: form.favorite_drink,
        occupation: form.occupation,
        home_area: form.home_area,
      });
      /* 保存後に使われなくなった写真をストレージから片づける
         （残しても見えないが、容量を無駄にしない） */
      const kept = new Set([updated.avatar_url, ...(updated.photos ?? [])].filter(Boolean));
      for (const old of [profile?.avatar_url, ...(profile?.photos ?? [])].filter(Boolean)) {
        if (!kept.has(old)) api.removeAvatar(user.id, old);
      }
      toast.success("プロフィールを保存しました。");
      onSaved?.(updated);
    } catch (e) {
      toast.error("保存に失敗しました: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploadingAt !== null;

  return (
    <div style={{ padding: "0 20px 24px" }}>
      <button className="press" onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
        fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4,
      }}>
        <ChevronLeft size={18} strokeWidth={2} /> 戻る
      </button>

      <div style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 6, textTransform: "uppercase" }}>Edit profile</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
          プロフィール編集
        </div>
      </div>

      {/* いま何％か。編集しながら伸びていくのが見えるようにここに置く。 */}
      <div className="fade" style={{ marginBottom: 16 }}>
        <CompletionMeter profile={form} />
      </div>

      <div className="fade" style={{ ...card, padding: 22 }}>
        {/* ── 写真 ── */}
        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>写真（最大{api.MAX_PHOTOS}枚）</label>
          <input
            ref={fileRef}
            type="file"
            accept={api.AVATAR_MIME.join(",")}
            onChange={onFile}
            style={{ display: "none" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9 }}>
            {visibleSlots.map((url, i) => (
              <PhotoSlot
                key={i}
                url={url}
                main={i === 0}
                busy={uploadingAt === i}
                onPick={() => pick(i)}
                onRemove={() => removeAt(i)}
              />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 12, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
            <Lock size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            JPEG・PNG・WebP、1枚2MBまで。写真は募集の一覧には表示されず、
            <b style={{ color: C.textSec, fontWeight: 700 }}>同じ会に参加が承認されたメンバーにだけ</b>公開されます。
          </div>
        </div>

        {/* ── 基本 ── */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>ニックネーム</label>
          <input
            value={form.username}
            maxLength={api.LIMITS.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="当日、呼ばれたい名前"
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>年齢（{api.MIN_AGE}歳以上）</label>
          <input
            type="number" min={api.MIN_AGE} max={99} inputMode="numeric"
            value={form.age}
            onChange={(e) => set({ age: e.target.value })}
            style={fieldStyle}
          />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 10.5, color: C.textMuted, lineHeight: 1.65 }}>
            <ShieldCheck size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            本サービスは飲酒を伴うため{api.MIN_AGE}歳以上限定です。登録時の生年月日で年齢を確認しています。
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>自己紹介</label>
          <textarea
            value={form.bio}
            rows={4}
            maxLength={api.LIMITS.bio}
            onChange={(e) => set({ bio: e.target.value })}
            placeholder="どんな夜が好きか、どんな話をしたいか。二言三言でも、当日の入り口になります。"
            style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.85 }}
          />
          <div style={{ textAlign: "right", fontSize: 10, color: C.textFaint, marginTop: 5 }}>
            {form.bio.length} / {api.LIMITS.bio}
          </div>
        </div>

        {/* ── 趣味 ── */}
        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>趣味・好きなこと（最大{api.MAX_HOBBIES}個）</label>
          <HobbyPicker value={form.hobbies} onChange={(hobbies) => set({ hobbies })} />
        </div>

        {/* ── 細かい項目 ── */}
        <IconField
          icon={Utensils} label="好きな食べもの" max={api.LIMITS.favoriteFood}
          placeholder="例: 焼き鳥、パクチー、蕎麦"
          value={form.favorite_food} onChange={(v) => set({ favorite_food: v })}
        />
        <IconField
          icon={Wine} label="好きなお酒・飲みもの" max={api.LIMITS.favoriteDrink}
          placeholder="例: ハイボール、白ワイン、烏龍茶でも楽しめます"
          value={form.favorite_drink} onChange={(v) => set({ favorite_drink: v })}
        />
        <IconField
          icon={Briefcase} label="お仕事" max={api.LIMITS.occupation}
          placeholder="例: デザイナー（詳しく書かなくて大丈夫です）"
          value={form.occupation} onChange={(v) => set({ occupation: v })}
        />
        <IconField
          icon={MapPin} label="よく行くエリア" max={api.LIMITS.homeArea}
          placeholder="例: 恵比寿・中目黒"
          value={form.home_area} onChange={(v) => set({ home_area: v })}
        />

        <div style={{ display: "flex", gap: 9, marginTop: 6 }}>
          <button className="press" onClick={onBack} disabled={busy} style={{
            ...ghostBtn, flex: 1, padding: "13px 0", borderRadius: 999, fontSize: 14, opacity: busy ? 0.5 : 1,
          }}>キャンセル</button>
          <button className="lux-cta" onClick={save} disabled={busy} style={{
            ...popBtn, flex: 1.4, padding: "13px 0", borderRadius: 999, fontSize: 14, opacity: busy ? 0.6 : 1,
          }}>{saving ? "保存中…" : "保存する"}</button>
        </div>
      </div>
    </div>
  );
}
