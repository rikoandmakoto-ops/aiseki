/* ══════════════════════════════════════════════════════════════
   AISEKI — Design tokens & primitives
   Obsidian · Champagne Gold · Bordeaux
   ══════════════════════════════════════════════════════════════ */
export const C = {
  /* surfaces */
  bg: "#0b0809",
  bgDeep: "#070506",
  panel: "linear-gradient(158deg, rgba(255,255,255,0.066) 0%, rgba(255,255,255,0.018) 100%)",
  panelSoft: "linear-gradient(158deg, rgba(255,255,255,0.042) 0%, rgba(255,255,255,0.012) 100%)",

  /* champagne gold — desaturated, brand-grade */
  gold: "#d8bd82",
  goldBright: "#f2e4bb",
  goldDeep: "#9c7635",
  goldGrad: "linear-gradient(135deg, #f6ead0 0%, #ddc084 44%, #a9823f 100%)",
  goldGradSoft: "linear-gradient(135deg, #e8d6a6 0%, #c9a866 100%)",

  /* bordeaux accent */
  red: "#c14a5b",
  redSoft: "#ff9db0",
  redGrad: "linear-gradient(135deg, #b23a4c 0%, #6f1a28 100%)",

  /* ink */
  text: "#f4f0e6",
  textSec: "rgba(244,240,230,0.60)",
  textMuted: "rgba(244,240,230,0.38)",
  textFaint: "rgba(244,240,230,0.22)",

  /* strokes */
  line: "rgba(216,189,130,0.15)",
  lineGold: "rgba(216,189,130,0.34)",
  lineSoft: "rgba(255,255,255,0.07)",
};

/* Type families */
export const FONT_LOGO = "'Playfair Display', 'Shippori Mincho', serif";
export const FONT_DISPLAY = "'Cormorant Garamond', 'Shippori Mincho', serif";
export const FONT_SERIF_JP = "'Noto Serif JP', 'Shippori Mincho', serif";
export const FONT_BODY = "'Zen Kaku Gothic New', -apple-system, BlinkMacSystemFont, sans-serif";

/* Metallic gold text */
export const goldText = {
  background: C.goldGrad,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

/* Frosted glass surface */
export const glass = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 20,
  backdropFilter: "blur(20px) saturate(1.2)",
  WebkitBackdropFilter: "blur(20px) saturate(1.2)",
  boxShadow: "0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
};

/* Primary gold CTA */
export const goldBtn = {
  background: C.goldGrad,
  color: "#241704",
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  letterSpacing: 0.4,
  fontFamily: FONT_BODY,
  boxShadow: "0 10px 26px rgba(169,130,63,0.42), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(120,86,30,0.35)",
};

/* Ghost / secondary button */
export const ghostBtn = {
  background: "rgba(255,255,255,0.035)",
  border: `1px solid ${C.lineSoft}`,
  color: C.textSec,
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: FONT_BODY,
};

export const fieldStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 14, outline: "none", boxSizing: "border-box",
  background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`, color: C.text,
  transition: "border-color .2s ease, box-shadow .2s ease, background .2s ease",
};

export const labelStyle = {
  fontSize: 11, fontWeight: 600, color: C.textSec, display: "block", marginBottom: 8,
  letterSpacing: 0.8, textTransform: "uppercase",
};

/* Small-caps eyebrow label */
export const Eyebrow = ({ children, color = C.gold, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, color, letterSpacing: 2.4, textTransform: "uppercase", ...style,
  }}>{children}</div>
);

export const img = (gender, n) => `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

/* Deterministic emoji avatar for host-made parties (no photo). */
export const partyEmoji = (seed = "") => {
  const set = ["🍸", "🥂", "🌙", "🍷", "🍶", "🥃", "🍾", "✦", "🍹", "❦"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return set[h % set.length];
};

export const TreatBadge = ({ treat }) => {
  const gold = treat === "奢り";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, whiteSpace: "nowrap",
      padding: "4px 11px", borderRadius: 20, fontFamily: FONT_BODY,
      color: gold ? "#241704" : C.textSec,
      background: gold ? C.goldGrad : "rgba(255,255,255,0.05)",
      border: gold ? "none" : `1px solid ${C.lineSoft}`,
      boxShadow: gold ? "inset 0 1px 0 rgba(255,255,255,0.5)" : "none",
    }}>{gold ? "◆ 奢り" : "割り勘"}</span>
  );
};

export const Tag = ({ children }) => (
  <span style={{
    fontSize: 11, fontWeight: 500, color: C.textSec, whiteSpace: "nowrap", letterSpacing: 0.3,
    padding: "3.5px 11px", borderRadius: 20,
    background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`,
  }}>{children}</span>
);

export const AvatarBubble = ({ children, size = 46 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.46,
    background: "radial-gradient(circle at 34% 28%, rgba(232,214,166,0.26), rgba(168,50,58,0.12) 78%)",
    border: `1px solid ${C.lineGold}`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 12px rgba(0,0,0,0.35)",
  }}>{children}</div>
);

export const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 18 }}>
    {sub && <Eyebrow style={{ marginBottom: 4 }}>{sub}</Eyebrow>}
    <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 23, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>{children}</div>
  </div>
);

/* Loading / empty states */
export const Spinner = ({ label = "読み込み中…" }) => (
  <div style={{ padding: "52px 0", textAlign: "center", color: C.textMuted, fontSize: 12, letterSpacing: 1.5 }}>
    <div style={{
      width: 28, height: 28, margin: "0 auto 16px", borderRadius: "50%",
      border: `2px solid ${C.lineSoft}`, borderTopColor: C.gold,
      animation: "spin 0.85s linear infinite",
    }} />
    {label}
  </div>
);

export const EmptyState = ({ children, icon }) => (
  <div style={{ padding: "44px 24px", textAlign: "center", color: C.textMuted, fontSize: 13, letterSpacing: 0.5, lineHeight: 1.8 }}>
    {icon && (
      <div style={{
        width: 56, height: 56, margin: "0 auto 18px", borderRadius: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.03)", border: `1px solid ${C.line}`, color: C.gold,
      }}>{icon}</div>
    )}
    {children}
  </div>
);
