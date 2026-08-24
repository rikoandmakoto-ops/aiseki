import { useState, useEffect } from "react";
import { X, Star, Lock, Check, Crown, User } from "lucide-react";
import * as api from "../lib/api.js";
import { C, FONT_HEAD, FONT_DISPLAY, brandText, popBtn, ghostBtn, fieldStyle, labelStyle } from "../lib/theme.jsx";
import { useToast } from "../lib/toast.jsx";

/* ══════════════════════════════════════════════════════════════
   相席の評価（内部評価）

   ・相手には一切見えない。相手が自分に付けた評価も見られない。
     蓄積されたスコアを見るのは運営だけ（user_reviews の RLS で担保）。
   ・書けるのは「同じ会に参加していた相手」に対して、
     会の開催日を過ぎたあとだけ。同じ会・同じ相手には1回まで。
   ・見えないからこそ、正直に書いてよいことを画面で必ず伝える。
   ══════════════════════════════════════════════════════════════ */

const StarRow = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
    {[1, 2, 3, 4, 5].map((n) => {
      const on = n <= value;
      return (
        <button
          key={n}
          type="button"
          className="press"
          onClick={() => onChange(n)}
          aria-label={`${n}点`}
          aria-pressed={on}
          style={{
            background: "none", border: "none", padding: 4, cursor: "pointer",
            color: on ? C.primary : C.textFaint, display: "flex",
          }}
        >
          <Star size={30} strokeWidth={1.8} fill={on ? C.primary : "none"} />
        </button>
      );
    })}
  </div>
);

export default function ReviewSheet({ member, party, existing, onClose, onSaved }) {
  const { toast } = useToast();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);

  const profile = member?.profiles || {};
  const name = profile.username || member?.display_name || "メンバー";
  const done = !!existing;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!rating) { toast.error("評価を選んでください。"); return; }
    setBusy(true);
    try {
      const saved = await api.submitReview({
        partyId: party.id,
        reviewedId: member.user_id,
        rating,
        comment,
      });
      toast.success("評価を送信しました。相手には表示されません。");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast.error("送信できませんでした: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!member) return null;

  const label = api.REVIEW_RATINGS.find((r) => r.value === rating)?.label;

  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${name}さんの評価`}
      style={{
        position: "absolute", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end",
        background: "rgba(4,7,14,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "88%", overflowY: "auto",
          borderTopLeftRadius: 26, borderTopRightRadius: 26,
          background: "linear-gradient(180deg, #16203a 0%, #0a0e1c 100%)",
          border: `1px solid ${C.linePrimary}`, borderBottom: "none",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <span style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(232,201,135,0.35)" }} />
        </div>

        <button className="press" onClick={onClose} aria-label="閉じる" style={{
          position: "absolute", top: 14, right: 16, width: 30, height: 30, borderRadius: 15,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          background: "rgba(255,255,255,0.06)", border: `1px solid ${C.lineSoft}`, color: C.textSec,
        }}><X size={15} strokeWidth={2.2} /></button>

        <div style={{ padding: "12px 22px 26px" }}>
          {/* ── 相手 ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
            <div style={{ width: 68, height: 68, borderRadius: 34, padding: 2, background: C.primaryGrad, marginBottom: 10 }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: 32, objectFit: "cover", display: "block", background: "#141c33" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "#141c33", color: C.primary }}>
                  {member.role === "host" ? <Crown size={26} strokeWidth={1.7} /> : <User size={26} strokeWidth={1.7} />}
                </div>
              )}
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 600, color: C.text, letterSpacing: 0.4 }}>{name}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, textAlign: "center", lineHeight: 1.7 }}>
              「{party.title}」でご一緒した方
            </div>
          </div>

          {/* ── 相手には見えないことを、書く前に伝える ── */}
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18,
            borderRadius: 14, padding: "13px 15px",
            background: "rgba(232,201,135,0.08)", border: `1px solid ${C.linePrimary}`,
          }}>
            <Lock size={14} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85 }}>
              この評価は<b style={{ color: C.text, fontWeight: 700 }}>相手には表示されません</b>。
              点数もコメントも、あなたが評価したことも相手には伝わりません。
              <br />
              ただし、受け取った評価の<b style={{ color: C.text, fontWeight: 700 }}>平均点</b>は、
              その方が会を主催するときに選べるお店の予算帯（ランク）に反映されます。
              相手に見えるのはこの平均点だけで、誰がどう付けたかは分かりません。
            </div>
          </div>

          {done ? (
            <div style={{
              borderRadius: 15, padding: "16px 18px",
              background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`,
            }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: C.primaryDeep, marginBottom: 10 }}>
                <Check size={14} strokeWidth={2.6} /> 送信済みです
              </div>
              <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={17} strokeWidth={1.8}
                    color={n <= existing.rating ? C.primary : C.textFaint}
                    fill={n <= existing.rating ? C.primary : "none"} />
                ))}
              </div>
              {existing.comment && (
                <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.85, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {existing.comment}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 10, lineHeight: 1.7 }}>
                送信した評価は取り消し・編集ができません。
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}>
                <label style={{ ...labelStyle, textAlign: "center", display: "block" }}>この方との相席はいかがでしたか</label>
                <StarRow value={rating} onChange={setRating} />
                <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, minHeight: 20, ...(rating ? brandText : { color: C.textMuted }), fontFamily: FONT_DISPLAY }}>
                  {label ?? "タップして選んでください"}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>コメント（任意）</label>
                <textarea
                  value={comment}
                  rows={4}
                  maxLength={api.LIMITS.reviewComment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="気持ちよく過ごせた点、気になった点など。困ったことがあれば具体的にお書きください。"
                  style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.85 }}
                />
                <div style={{ textAlign: "right", fontSize: 10, color: C.textFaint, marginTop: 5 }}>
                  {comment.length} / {api.LIMITS.reviewComment}
                </div>
              </div>

              <div style={{ display: "flex", gap: 9 }}>
                <button className="press" onClick={onClose} disabled={busy} style={{
                  ...ghostBtn, flex: 1, padding: "13px 0", borderRadius: 999, fontSize: 13.5, opacity: busy ? 0.5 : 1,
                }}>あとで</button>
                <button className="lux-cta" onClick={submit} disabled={busy || !rating} style={{
                  ...popBtn, flex: 1.4, padding: "13px 0", borderRadius: 999, fontSize: 14,
                  opacity: busy || !rating ? 0.5 : 1, cursor: busy || !rating ? "default" : "pointer",
                }}>{busy ? "送信中…" : "評価を送信する"}</button>
              </div>

              <div style={{ fontSize: 10, color: C.textFaint, textAlign: "center", marginTop: 12, lineHeight: 1.8 }}>
                送信すると取り消し・編集はできません。
                <br />緊急性の高い違反は、評価ではなく「通報」からお知らせください。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
