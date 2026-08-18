/* ══════════════════════════════════════════════════════════════
   AISEKI — Design tokens & primitives
   Midnight · Lime · Social
   夜の街と待ち合わせを想起させる、落ち着いたネイビー基調のテーマ。
   ・背景は深いネイビー、アプリ面は温かみのあるオフホワイト
   ・主役の色はライム、注意や温度感はコーラルで表現
   ・書体は Manrope / Noto Sans JP の現代的なサンセリフ
   ══════════════════════════════════════════════════════════════ */
export const C = {
  /* surfaces */
  bg: "#f4f5f1",
  bgDeep: "#e8ebe4",
  card: "#ffffff",
  panel: "linear-gradient(160deg, #ffffff 0%, #fafbf8 100%)",
  panelSoft: "linear-gradient(160deg, #ffffff 0%, #f4f6f0 100%)",

  /* 控えめな色面（入力欄・行の下地など） */
  tint: "rgba(180, 244, 86, 0.12)",
  tintSoft: "rgba(12, 24, 27, 0.035)",
  tintStrong: "rgba(180, 244, 86, 0.24)",

  /* lime — メインカラー */
  primary: "#a5e64a",
  primaryLight: "#d9ff99",
  primaryDeep: "#355e08",
  primaryDark: "#162e05",
  primaryGrad: "linear-gradient(135deg, #c8fa74 0%, #a5e64a 52%, #86ce2e 100%)",
  primaryGradSoft: "linear-gradient(135deg, #efffd4 0%, #ddf9b3 100%)",

  /* 差し色（ピンク〜オレンジの暖色） */
  accent: "#ff6b5f",
  accentSoft: "#ff9b91",
  accentDeep: "#c53e35",
  accentGrad: "linear-gradient(135deg, #ffad66 0%, #ff806f 55%, #ff6258 100%)",
  warm: "#ff9f43",

  /* ink */
  text: "#101d20",
  textSec: "rgba(16,29,32,0.68)",
  textMuted: "rgba(16,29,32,0.48)",
  textFaint: "rgba(16,29,32,0.30)",

  /* strokes */
  line: "rgba(16,29,32,0.12)",
  linePrimary: "rgba(118,179,36,0.48)",
  lineSoft: "rgba(16,29,32,0.08)",

  /* shadows（軽め・水色寄り） */
  shadow: "0 10px 30px rgba(10,24,27,0.08)",
  shadowSoft: "0 5px 16px rgba(10,24,27,0.07)",
  shadowLift: "0 18px 44px rgba(10,24,27,0.14)",
};

/* Type families … 丸ゴシック系でやわらかい印象に */
export const FONT_LOGO = "'Manrope', 'Noto Sans JP', sans-serif";
export const FONT_DISPLAY = "'Manrope', 'Noto Sans JP', sans-serif";
export const FONT_HEAD = "'Manrope', 'Noto Sans JP', sans-serif";
export const FONT_BODY = "'Noto Sans JP', 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";

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
  borderRadius: 20,
  boxShadow: C.shadow,
};

/* 主ボタン（水色グラデーション・丸み強め） */
export const popBtn = {
  background: C.primaryGrad,
  color: "#142006",
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: 0.4,
  fontFamily: FONT_BODY,
  borderRadius: 999,
  textShadow: "none",
  boxShadow: "0 8px 20px rgba(123,181,43,0.28), inset 0 1px 0 rgba(255,255,255,0.6)",
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
  width: "100%", padding: "13px 15px", borderRadius: 12, fontSize: 14, outline: "none", boxSizing: "border-box",
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
