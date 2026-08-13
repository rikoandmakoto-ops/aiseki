/* ══════════════════════════════════════════════════════════════
   AISEKI — Design tokens & primitives
   Sky Blue · Pop · Friendly
   水色ベースの明るいポップなテーマ。
   ・背景は白〜薄い水色、面は白いカード（角丸大きめ・影は軽め）
   ・主役の色は水色のグラデーション、差し色はピンク／オレンジ
   ・書体は丸ゴシック（M PLUS Rounded 1c / Zen Maru Gothic）
   ══════════════════════════════════════════════════════════════ */
export const C = {
  /* surfaces */
  bg: "#f2fbff",
  bgDeep: "#e2f4fe",
  card: "#ffffff",
  panel: "linear-gradient(160deg, #ffffff 0%, #f6fcff 100%)",
  panelSoft: "linear-gradient(160deg, #fbfeff 0%, #f1faff 100%)",

  /* 薄い水色の面（入力欄・行の下地など） */
  tint: "rgba(79,195,247,0.09)",
  tintSoft: "rgba(79,195,247,0.05)",
  tintStrong: "rgba(79,195,247,0.16)",

  /* sky blue — メインカラー */
  primary: "#29b6f6",
  primaryLight: "#81d4fa",
  primaryDeep: "#0288d1",     // 白地の上で読ませる濃いめの水色
  primaryDark: "#01669b",
  primaryGrad: "linear-gradient(135deg, #7ee0ff 0%, #4fc3f7 48%, #29b6f6 100%)",
  primaryGradSoft: "linear-gradient(135deg, #d6f3ff 0%, #b3e5fc 100%)",

  /* 差し色（ピンク〜オレンジの暖色） */
  accent: "#ff5f9e",
  accentSoft: "#ff8fbb",
  accentDeep: "#e63c7f",
  accentGrad: "linear-gradient(135deg, #ffb45f 0%, #ff7aa8 55%, #ff5f9e 100%)",
  warm: "#ffa04d",

  /* ink */
  text: "#123541", // 深い青みグレー（黒より柔らかい）
  textSec: "rgba(18,53,65,0.66)",
  textMuted: "rgba(18,53,65,0.46)",
  textFaint: "rgba(18,53,65,0.30)",

  /* strokes */
  line: "rgba(79,195,247,0.26)",
  linePrimary: "rgba(79,195,247,0.55)",
  lineSoft: "rgba(18,53,65,0.09)",

  /* shadows（軽め・水色寄り） */
  shadow: "0 8px 22px rgba(41,182,246,0.16)",
  shadowSoft: "0 4px 14px rgba(41,182,246,0.12)",
  shadowLift: "0 16px 34px rgba(41,182,246,0.24)",
};

/* Type families … 丸ゴシック系でやわらかい印象に */
export const FONT_LOGO = "'Baloo 2', 'M PLUS Rounded 1c', sans-serif";
export const FONT_DISPLAY = "'Baloo 2', 'M PLUS Rounded 1c', sans-serif";
export const FONT_HEAD = "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif";
export const FONT_BODY = "'M PLUS Rounded 1c', 'Zen Maru Gothic', -apple-system, BlinkMacSystemFont, sans-serif";

/* ブランドカラーの文字（水色グラデーション） */
export const brandText = {
  background: C.primaryGrad,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

/* 白いカード。角丸大きめ・影は軽め。 */
export const card = {
  background: C.panel,
  border: `1.5px solid ${C.line}`,
  borderRadius: 24,
  boxShadow: C.shadow,
};

/* 主ボタン（水色グラデーション・丸み強め） */
export const popBtn = {
  background: C.primaryGrad,
  color: "#ffffff",
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: 0.4,
  fontFamily: FONT_BODY,
  borderRadius: 999,
  textShadow: "0 1px 1px rgba(2,90,135,0.25)",
  boxShadow: "0 8px 18px rgba(41,182,246,0.42), inset 0 2px 0 rgba(255,255,255,0.5)",
};

/* 副ボタン（白地＋水色の枠） */
export const ghostBtn = {
  background: "#ffffff",
  border: `1.5px solid ${C.line}`,
  color: C.primaryDeep,
  cursor: "pointer",
  fontWeight: 700,
  fontFamily: FONT_BODY,
  borderRadius: 999,
};

export const fieldStyle = {
  width: "100%", padding: "13px 16px", borderRadius: 16, fontSize: 14, outline: "none", boxSizing: "border-box",
  background: C.tintSoft, border: `1.5px solid ${C.line}`, color: C.text, fontWeight: 500,
  transition: "border-color .2s ease, box-shadow .2s ease, background .2s ease",
};

export const labelStyle = {
  fontSize: 11.5, fontWeight: 800, color: C.primaryDeep, display: "block", marginBottom: 8,
  letterSpacing: 0.4,
};

/* 見出しの上に置く小さなラベル */
export const Eyebrow = ({ children, color = C.primaryDeep, style }) => (
  <div style={{
    fontSize: 10.5, fontWeight: 800, color, letterSpacing: 1.4, ...style,
  }}>{children}</div>
);

export const img = (gender, n) => `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

/* Deterministic emoji avatar for host-made parties (no photo). */
export const partyEmoji = (seed = "") => {
  const set = ["🍻", "🥂", "🎉", "🍹", "🧊", "🍶", "🌈", "✨", "🍰", "🎈"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return set[h % set.length];
};

export const TreatBadge = ({ treat }) => {
  const warm = treat === "奢り";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, whiteSpace: "nowrap",
      padding: "5px 12px", borderRadius: 999, fontFamily: FONT_BODY,
      color: warm ? "#ffffff" : C.primaryDeep,
      // 濃い水色の上に置かれることもあるため、割り勘は白地にする
      background: warm ? C.accentGrad : "#ffffff",
      border: warm ? "none" : `1.5px solid ${C.line}`,
      boxShadow: warm ? "0 4px 10px rgba(255,95,158,0.3)" : "none",
    }}>{warm ? "🎁 奢り" : "割り勘"}</span>
  );
};

export const Tag = ({ children }) => (
  <span style={{
    fontSize: 11, fontWeight: 700, color: C.primaryDeep, whiteSpace: "nowrap", letterSpacing: 0.2,
    padding: "4px 12px", borderRadius: 999,
    background: C.tint, border: `1.5px solid ${C.line}`,
  }}>{children}</span>
);

export const AvatarBubble = ({ children, size = 46 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.46,
    background: "linear-gradient(140deg, #e3f6ff 0%, #cfeeff 100%)",
    border: `2px solid ${C.linePrimary}`,
    boxShadow: C.shadowSoft,
  }}>{children}</div>
);

export const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 18 }}>
    {sub && <Eyebrow style={{ marginBottom: 4 }}>{sub}</Eyebrow>}
    <div style={{ fontFamily: FONT_HEAD, fontSize: 23, fontWeight: 700, letterSpacing: 0.3, color: C.text }}>{children}</div>
  </div>
);

/* Loading / empty states */
export const Spinner = ({ label = "読み込み中…" }) => (
  <div style={{ padding: "52px 0", textAlign: "center", color: C.textMuted, fontSize: 12.5, letterSpacing: 0.8, fontWeight: 700 }}>
    <div style={{
      width: 30, height: 30, margin: "0 auto 16px", borderRadius: "50%",
      border: `3px solid ${C.tintStrong}`, borderTopColor: C.primary,
      animation: "spin 0.85s linear infinite",
    }} />
    {label}
  </div>
);

export const EmptyState = ({ children, icon }) => (
  <div style={{ padding: "44px 24px", textAlign: "center", color: C.textMuted, fontSize: 13, letterSpacing: 0.2, lineHeight: 1.9, fontWeight: 500 }}>
    {icon && (
      <div style={{
        width: 62, height: 62, margin: "0 auto 18px", borderRadius: 31,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: C.primaryGradSoft, border: `2px solid ${C.line}`, color: C.primaryDeep,
      }}>{icon}</div>
    )}
    {children}
  </div>
);
