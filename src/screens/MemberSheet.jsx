import { useState, useEffect } from "react";
import {
  X, Crown, User, Utensils, Wine, Briefcase, MapPin, Ban, ShieldAlert, Lock,
} from "lucide-react";
import * as api from "../lib/api.js";
import { C, FONT_HEAD, FONT_BODY, ghostBtn, Tag } from "../lib/theme.jsx";
import { useToast } from "../lib/toast.jsx";

/* ══════════════════════════════════════════════════════════════
   参加メンバーのプロフィール（下から出るシート）

   ここに出る内容は、同じ会に参加が承認されたメンバーだけが取得できる
   （profiles の RLS と shares_party() で担保。UI で隠しているのではない）。

   ブロック・通報の入口も、相手を見ているこの場所に置く。
   困ったときに探し回らせない。
   ══════════════════════════════════════════════════════════════ */

const DetailRow = ({ icon: Icon, label, value }) => {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 0", borderTop: `1px solid ${C.lineSoft}` }}>
      <span style={{ flexShrink: 0, display: "flex", color: C.primary, marginTop: 1 }}>
        <Icon size={14} strokeWidth={1.9} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 0.6, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, wordBreak: "break-word" }}>{value}</div>
      </div>
    </div>
  );
};

export default function MemberSheet({ member, isSelf, onClose, onBlocked, onReport }) {
  const { toast, confirm } = useToast();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const profile = member?.profiles || {};
  const claimed = !!member?.user_id;
  const name = profile.username || member?.display_name || "メンバー";
  const photos = [profile.avatar_url, ...(profile.photos ?? [])].filter(Boolean);

  /* Esc で閉じられるようにする（デスクトップでの操作） */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const block = async () => {
    const ok = await confirm({
      title: `${name}さんをブロックしますか？`,
      message:
        "ブロックすると、この方が主催する会は一覧に表示されなくなり、参加の申し込みもできなくなります。" +
        "すでに参加が決まっている会のグループチャットは、当日の待ち合わせのため残ります。",
      confirmLabel: "ブロックする",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.blockUser(member.user_id);
      toast.success(`${name}さんをブロックしました。`);
      onBlocked?.();
      onClose();
    } catch (e) {
      toast.error("ブロックできませんでした: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!member) return null;

  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${name}さんのプロフィール`}
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
        {/* つまみ */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <span style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(232,201,135,0.35)" }} />
        </div>

        <button className="press" onClick={onClose} aria-label="閉じる" style={{
          position: "absolute", top: 14, right: 16, width: 30, height: 30, borderRadius: 15,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          background: "rgba(255,255,255,0.06)", border: `1px solid ${C.lineSoft}`, color: C.textSec,
        }}><X size={15} strokeWidth={2.2} /></button>

        <div style={{ padding: "12px 22px 26px" }}>
          {/* ── 写真 ── */}
          {photos.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                width: "100%", aspectRatio: "4 / 5", maxHeight: 340, borderRadius: 20, overflow: "hidden",
                background: "#141c33", border: `1px solid ${C.line}`, position: "relative",
              }}>
                <img
                  key={photos[photoIndex]}
                  src={photos[photoIndex]}
                  alt={`${name}さんの写真 ${photoIndex + 1}枚目`}
                  className="fade"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {member.role === "host" && (
                  <span style={{
                    position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 10.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
                    color: "#241a06", background: C.primaryGrad, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                  }}><Crown size={11} strokeWidth={2.4} /> ホスト</span>
                )}
              </div>
              {photos.length > 1 && (
                <div style={{ display: "flex", gap: 7, marginTop: 9, justifyContent: "center" }}>
                  {photos.map((p, i) => (
                    <button
                      key={p}
                      className="press"
                      onClick={() => setPhotoIndex(i)}
                      aria-label={`${i + 1}枚目を見る`}
                      style={{
                        width: 44, height: 44, borderRadius: 10, padding: 0, cursor: "pointer", overflow: "hidden",
                        border: `1px solid ${i === photoIndex ? C.primary : C.lineSoft}`,
                        opacity: i === photoIndex ? 1 : 0.55, background: "#141c33",
                      }}
                    >
                      <img src={p} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              width: 92, height: 92, margin: "6px auto 16px", borderRadius: 46,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#141c33", border: `1px ${claimed ? "solid" : "dashed"} ${C.lineSoft}`, color: C.textMuted,
            }}>
              {member.role === "host" ? <Crown size={34} strokeWidth={1.6} /> : <User size={34} strokeWidth={1.6} />}
            </div>
          )}

          {/* ── 名前・年齢 ── */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 21, fontWeight: 600, color: C.text, letterSpacing: 0.5 }}>{name}</div>
            <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, letterSpacing: 0.4 }}>
              {!claimed ? "招待中（まだアプリに登録していません）"
                : [profile.age ? `${profile.age}歳` : null, member.role === "host" ? "ホスト" : member.side === "guest" ? "参加グループ" : null]
                  .filter(Boolean).join(" · ") || "メンバー"}
            </div>
          </div>

          {!claimed ? (
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              borderRadius: 14, padding: "13px 15px",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
            }}>
              <Lock size={14} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85 }}>
                代表者の方が確保した席です。ご本人が招待コードで参加すると、プロフィールが表示されます。
              </div>
            </div>
          ) : (
            <>
              {/* ── 自己紹介 ── */}
              {profile.bio && (
                <div style={{
                  borderRadius: 15, padding: "14px 16px", marginBottom: 14,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
                  fontSize: 13, color: C.textSec, lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>{profile.bio}</div>
              )}

              {/* ── 飲みスタイル ── */}
              {(profile.drinking_style?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 0.6, marginBottom: 7 }}>飲みスタイル</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {profile.drinking_style.map((s) => (
                      <span key={s} style={{
                        fontSize: 11, fontWeight: 700, color: C.primaryDeep, whiteSpace: "nowrap", letterSpacing: 0.3,
                        padding: "4px 12px", borderRadius: 999,
                        background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`,
                      }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 趣味 ── */}
              {(profile.hobbies?.length ?? 0) > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                  {profile.hobbies.map((h) => <Tag key={h}>{h}</Tag>)}
                </div>
              )}

              {/* ── 細かい項目 ── */}
              <div style={{ marginBottom: 18 }}>
                <DetailRow icon={Utensils} label="好きな食べもの" value={profile.favorite_food} />
                <DetailRow icon={Wine} label="好きなお酒・飲みもの" value={profile.favorite_drink} />
                <DetailRow icon={Briefcase} label="お仕事" value={profile.occupation} />
                <DetailRow icon={MapPin} label="よく行くエリア" value={profile.home_area} />
              </div>

              {!profile.bio && (profile.hobbies?.length ?? 0) === 0 && !profile.favorite_food && (
                <div style={{ fontSize: 11.5, color: C.textMuted, textAlign: "center", lineHeight: 1.9, marginBottom: 18 }}>
                  プロフィールはまだ書かれていません。<br />当日、直接うかがってみましょう。
                </div>
              )}

              {/* ── ブロック・通報 ── */}
              {!isSelf && (
                <div style={{ display: "flex", gap: 9, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
                  <button className="press" onClick={block} disabled={busy} style={{
                    ...ghostBtn, flex: 1, padding: "11px 0", fontSize: 12, opacity: busy ? 0.5 : 1,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <Ban size={13} strokeWidth={2} /> ブロック
                  </button>
                  <button className="press" onClick={() => { onClose(); onReport?.(member.user_id); }} style={{
                    ...ghostBtn, flex: 1, padding: "11px 0", fontSize: 12,
                    color: C.accentDeep, borderColor: "rgba(200,56,79,0.34)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <ShieldAlert size={13} strokeWidth={2} /> 通報する
                  </button>
                </div>
              )}
            </>
          )}

          <div style={{ fontSize: 9.5, color: C.textFaint, textAlign: "center", marginTop: 16, lineHeight: 1.8, fontFamily: FONT_BODY }}>
            プロフィールは、同じ会に参加が承認されたメンバーにのみ表示されています
          </div>
        </div>
      </div>
    </div>
  );
}
