/* ══════════════════════════════════════════════════════════════
   AISEKI — Design tokens & primitives
   Dark Navy · Gold · Luxe
   ダークネイビー×ゴールドの高級ラウンジ調テーマ。
   ・背景は深いネイビー、面はガラス調のパネル（金の細線・深い影）
   ・主役の色はゴールドのグラデーション、差し色はボルドー
   ・書体は明朝／セリフ体（Playfair Display / Shippori Mincho）
   ══════════════════════════════════════════════════════════════ */
export const C = {
  /* surfaces */
  bg: "#0b1020",
  bgDeep: "#05080f",
  card: "#111a2e",
  panel: "linear-gradient(155deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.022) 100%)",
  panelSoft: "linear-gradient(155deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.015) 100%)",

  /* 金を薄く敷いた面（入力欄・行の下地など） */
  tint: "rgba(232,201,135,0.08)",
  tintSoft: "rgba(255,255,255,0.045)",
  tintStrong: "rgba(232,201,135,0.17)",

  /* gold — メインカラー */
  primary: "#d9b877",
  primaryLight: "#f4e3ba",
  primaryDeep: "#e8c987",     // 暗い地の上で読ませる明るいゴールド
  primaryDark: "#8a6a2f",
  primaryGrad: "linear-gradient(135deg, #f7e6b0 0%, #dfbc6c 48%, #b08a3c 100%)",
  primaryGradSoft: "linear-gradient(135deg, rgba(232,201,135,0.22) 0%, rgba(176,138,60,0.10) 100%)",

  /* 差し色（ボルドー〜深紅） */
  accent: "#c8455c",
  accentSoft: "#e08b9c",
  accentDeep: "#f0a3b1",      // 暗い地の上で読ませる明るい紅
  accentGrad: "linear-gradient(135deg, #c8384f 0%, #7c1626 100%)",
  warm: "#c9974a",

  /* ink */
  text: "#f4efe3",            // 温かみのあるオフホワイト
  textSec: "rgba(244,239,227,0.66)",
  textMuted: "rgba(244,239,227,0.44)",
  textFaint: "rgba(244,239,227,0.28)",

  /* strokes */
  line: "rgba(232,201,135,0.20)",
  linePrimary: "rgba(232,201,135,0.46)",
  lineSoft: "rgba(255,255,255,0.09)",

  /* shadows（深く沈める） */
  shadow: "0 14px 34px rgba(0,0,0,0.52)",
  shadowSoft: "0 6px 18px rgba(0,0,0,0.4)",
  shadowLift: "0 24px 52px rgba(0,0,0,0.62)",
};

/* Type families … 明朝／セリフ体で品を出す */
export const FONT_LOGO = "'Playfair Display', 'Shippori Mincho', serif";
export const FONT_DISPLAY = "'Playfair Display', 'Shippori Mincho', serif";
export const FONT_HEAD = "'Shippori Mincho', 'Noto Serif JP', serif";
export const FONT_BODY = "'Zen Kaku Gothic New', -apple-system, BlinkMacSystemFont, sans-serif";

/* ブランドカラーの文字（ゴールドのグラデーション） */
export const brandText = {
  background: C.primaryGrad,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

/* ガラス調のパネル。金の細線と内側のハイライトで厚みを出す。 */
export const card = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 18,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  boxShadow: `${C.shadow}, inset 0 1px 0 rgba(255,255,255,0.09)`,
};

/* 主ボタン（ゴールドの箔押し） */
export const popBtn = {
  background: C.primaryGrad,
  color: "#241a06",
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  letterSpacing: 0.5,
  fontFamily: FONT_BODY,
  borderRadius: 999,
  boxShadow: "0 10px 24px rgba(176,138,60,0.36), inset 0 1px 0 rgba(255,255,255,0.55)",
};

/* 副ボタン（地は透かし、金の枠） */
export const ghostBtn = {
  background: "rgba(255,255,255,0.045)",
  border: `1px solid ${C.line}`,
  color: C.primaryDeep,
  cursor: "pointer",
  fontWeight: 600,
  letterSpacing: 0.4,
  fontFamily: FONT_BODY,
  borderRadius: 999,
};

export const fieldStyle = {
  width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 14, outline: "none", boxSizing: "border-box",
  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.line}`, color: C.text, fontWeight: 400,
  transition: "border-color .2s ease, box-shadow .2s ease, background .2s ease",
};

export const labelStyle = {
  fontSize: 11, fontWeight: 600, color: C.primaryDeep, display: "block", marginBottom: 8,
  letterSpacing: 1,
};

/* 見出しの上に置く小さなラベル */
export const Eyebrow = ({ children, color = C.primaryDeep, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 600, color, letterSpacing: 1.8, ...style,
  }}>{children}</div>
);

/* Deterministic emoji avatar for host-made parties (no photo). */
export const partyEmoji = (seed = "") => {
  const set = ["🥂", "🍷", "🍸", "🥃", "🍾", "✨", "🕯️", "🎴", "🍶", "◆"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return set[h % set.length];
};

export const TreatBadge = ({ treat }) => {
  const gold = treat === "奢り";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, whiteSpace: "nowrap",
      padding: "4px 12px", borderRadius: 999, fontFamily: FONT_BODY,
      color: gold ? "#241a06" : C.textSec,
      background: gold ? C.primaryGrad : "rgba(255,255,255,0.07)",
      border: gold ? "none" : `1px solid ${C.lineSoft}`,
      boxShadow: gold ? "inset 0 1px 0 rgba(255,255,255,0.5)" : "none",
    }}>{gold ? "◆ 奢り" : "割り勘"}</span>
  );
};

export const Tag = ({ children }) => (
  <span style={{
    fontSize: 11, fontWeight: 400, color: C.textSec, whiteSpace: "nowrap", letterSpacing: 0.4,
    padding: "4px 12px", borderRadius: 999,
    background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
  }}>{children}</span>
);

export const AvatarBubble = ({ children, size = 46 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.44,
    background: "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)",
    border: `1px solid ${C.linePrimary}`,
    boxShadow: `${C.shadowSoft}, inset 0 1px 0 rgba(255,255,255,0.12)`,
  }}>{children}</div>
);

export const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 18 }}>
    {sub && <Eyebrow style={{ marginBottom: 6, textTransform: "uppercase" }}>{sub}</Eyebrow>}
    <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>{children}</div>
  </div>
);

/* Loading / empty states */
export const Spinner = ({ label = "読み込み中…" }) => (
  <div style={{ padding: "52px 0", textAlign: "center", color: C.textMuted, fontSize: 12, letterSpacing: 1.2, fontWeight: 500 }}>
    <div style={{
      width: 30, height: 30, margin: "0 auto 16px", borderRadius: "50%",
      border: `2px solid ${C.tintStrong}`, borderTopColor: C.primary,
      animation: "spin 0.85s linear infinite",
    }} />
    {label}
  </div>
);

/* 読み込み中の骨組み。回転するだけのスピナーより、
   これから何が出るかが伝わるぶん体感が軽くなる。 */
export const Skeleton = ({ w = "100%", h = 12, r = 8, style }) => (
  <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />
);

export const SkeletonCard = () => (
  <div style={{ ...card, padding: 15, marginBottom: 12 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Skeleton w={48} h={48} r={24} />
      <div style={{ flex: 1 }}>
        <Skeleton w="72%" h={13} />
        <Skeleton w="46%" h={10} style={{ marginTop: 8 }} />
      </div>
    </div>
    <div style={{ display: "flex", gap: 7, marginTop: 13 }}>
      <Skeleton w={88} h={22} r={999} />
      <Skeleton w={104} h={22} r={999} />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 13, paddingTop: 11, borderTop: `1px solid ${C.lineSoft}` }}>
      <Skeleton w={110} h={11} />
      <Skeleton w={48} h={13} />
    </div>
  </div>
);

export const SkeletonList = ({ count = 3 }) => (
  <div aria-busy="true" aria-label="読み込み中">
    {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
  </div>
);

export const EmptyState = ({ children, icon, action }) => (
  <div style={{ padding: "44px 24px", textAlign: "center", color: C.textMuted, fontSize: 13, letterSpacing: 0.4, lineHeight: 1.9, fontWeight: 400 }}>
    {icon && (
      <div style={{
        width: 62, height: 62, margin: "0 auto 18px", borderRadius: 31,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: C.primaryGradSoft, border: `1px solid ${C.line}`, color: C.primaryDeep,
      }}>{icon}</div>
    )}
    {children}
    {action && <div style={{ marginTop: 20 }}>{action}</div>}
  </div>
);
