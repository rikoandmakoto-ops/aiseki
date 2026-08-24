/* ══════════════════════════════════════════════════════════════
   AISEKI — 広告用ランディングページの共通部品

   アプリ本体の LandingScreen（未ログイン時の入口）とは別物。
   こちらは広告からの流入を受ける単体のページで、
     ・アプリのバンドル（supabase / 認証）を一切読み込まない
     ・ボタンは <a> で、リンク先はアプリの登録画面（別ページ）
   という作りにしてある。表示は速いほうがいい。

   ⚠ 掲載内容は法務上の要件と一致させること（src/lib/legal.js が出典）。
     ・グループ同士（2名以上 × 2名以上）限定であること
     ・個室での相席は行わないこと
     ・20歳以上限定であること
     ・接待をしない／サクラを置かないこと
     ・個人間DMが存在しないこと

   ⚠ 見た目の方針（2026-08-24 に作り直した。戻さないこと）
     以前は「光る・脈打つ・流れる」装飾を重ねていたが、
     いかにも生成物めいて見えるので全部落とした。今の決まりは:

       1. 常時動くものを置かない。動くのは触れたとき（hover）だけ。
          パルス・ドリフト・光沢の走り・登場アニメーションは無し。
       2. グラデーションはロゴの文字だけ。面・ボタン・罫・バッジは単色。
          光の玉（radial-gradient）を背景に敷かない。
       3. 罫は 1px の直線1種類だけ。両端が消える金の罫は使わない。
       4. 中央揃えを既定にしない。見出しもリストも左に置き、
          右側に余白を残す。左右対称に整えない。
       5. 面（カード）を並べない。区切りは罫と余白でつくる。
       6. 金は「CTA・ロゴ・数字ひとつ」だけに使う。文章には使わない。

     インラインスタイル（CSS-in-JS）で書く。hover とキーフレームだけは
     インラインで書けないので、下の LP_CSS に集約して <style> で
     1回だけ流し込む（LpPage が出す）。2枚のLPで唯一の CSS。
   ══════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, FONT_LOGO, FONT_HEAD, FONT_DISPLAY, FONT_BODY, brandText } from "../src/lib/theme.jsx";
import { FOOTER_NOTICE, CONTACT_EMAIL, SERVICE_URL } from "../src/lib/legal.js";
import { MIN_AGE } from "../src/lib/pricing.js";

/* ─────────────────────────────────── リンク先 ───────────────────────────────
   CTA はすべてアプリの登録画面へ送る。?auth=signup を App.jsx が読んで
   ランディングを飛ばし、いきなり登録フォームを開く。
   from= はどのLPから来たのかを見るための印（アプリ側の動作は変えない）。 */
export const signupUrl = (from) => `${SERVICE_URL}/?auth=signup&from=${from}`;
export const loginUrl = () => `${SERVICE_URL}/?auth=login`;
export const APP_URL = `${SERVICE_URL}/`;

/* 罫は1種類だけ。太さも色も変えない（変えると装飾に見える） */
export const RULE = "rgba(244,239,227,0.13)";
export const RULE_SOFT = "rgba(244,239,227,0.08)";

/* 面。ガラス調（blur + 内側ハイライト + 深い影）はやめて、
   ほんの少し明るいだけの箱にしてある。 */
export const panel = {
  background: "rgba(255,255,255,0.026)",
  border: `1px solid ${RULE}`,
  borderRadius: 10,
};

/* ══════════════════════════════════════════════════════════════
   LP_CSS — hover と、レイアウトのうちメディアクエリが要るものだけ
   ══════════════════════════════════════════════════════════════ */
const LP_CSS = `
.lp-root{
  background:#0b1020;                    /* body の光の玉を隠して単色にする */
  min-height:100dvh;
  font-feature-settings:"palt" 1;        /* 日本語の詰め。字間が間延びしない */
  text-rendering:optimizeLegibility;
}

/* ───────────────── 主CTA ─────────────────
   単色の箔。常時は動かさず、触れたときだけ明るくする。 */
.lp-cta{ transition: background .15s ease }
.lp-cta:hover{ background:#e9d09a }
.lp-cta:active{ background:#c9a865 }

/* ───────────────── 文中のリンク ───────────────── */
.lp-tlink{ transition: color .15s ease, border-color .15s ease }
.lp-tlink:hover{ color:#f4efe3; border-color:rgba(244,239,227,.55) }
.lp-flink{ transition: color .15s ease }
.lp-flink:hover{ color:#f4efe3 }

/* ───────────────── よくある質問 ─────────────────
   高さを 0fr → 1fr で動かす。display の切り替えでは滑らかにならない。 */
.lp-faq-q{ transition: color .15s ease }
.lp-faq-q:hover{ color:#f4efe3 }
.lp-faq-panel{ display:grid; grid-template-rows:0fr; transition: grid-template-rows .24s ease }
.lp-faq[data-open="true"] .lp-faq-panel{ grid-template-rows:1fr }
.lp-faq-panel > div{ overflow:hidden; min-height:0 }

/* ───────────────── ヒーロー ─────────────────
   左（文）を広く、右（画面）を狭く。天地も揃えず、右を少し下げる。
   半々で上下も揃えると、置きに行った絵に見える。 */
.lph{
  display:grid; grid-template-columns:minmax(0,1.34fr) minmax(0,1fr);
  gap:clamp(30px,5vw,66px); align-items:start;
}
.lph-visual{ padding-top:38px }

/* ───────────────── 見出しを左に置く2段組み ─────────────────
   見出しを上に載せて中央に置くより、脇に寄せたほうが読む幅が締まる。 */
.lp-split{
  display:grid; grid-template-columns:minmax(0,.76fr) minmax(0,1.42fr);
  gap:clamp(24px,4.5vw,60px); align-items:start;
}

/* ───────────────── 罫で区切る一覧（特徴・手順） ───────────────── */
.lp-row{
  display:grid; grid-template-columns:24px minmax(0,1fr); gap:18px;
  padding:26px 0; border-top:1px solid ${RULE_SOFT};
}
.lp-row-first{ border-top:none; padding-top:0 }

/* ───────────────── 締めのCTA ───────────────── */
.lp-close{
  display:flex; flex-wrap:wrap; gap:clamp(26px,5vw,56px);
  justify-content:space-between; align-items:flex-end;
}

/* ───────────────── 画面が狭いとき ───────────────── */
@media (max-width:940px){
  .lph, .lp-split{ grid-template-columns:1fr }
  .lph-visual{ padding-top:4px }
}
@media (max-width:560px){
  .lp-row{ grid-template-columns:1fr; gap:12px; padding:22px 0 }
}
`;

/* CSS は1ページにつき1回だけ流す（LpPage が出す） */
const LpStyles = () => <style>{LP_CSS}</style>;

/* ─────────────────────────────────── 部品 ───────────────────────────────── */

/* セクション。地は「素」と「沈める」の2つだけ。
   縦の間隔は pad で個別に指定する（全部同じにすると単調になる）。 */
export const Section = ({ children, style, id, tone = "plain", divider = false, pad }) => (
  <section
    id={id}
    style={{
      padding: `${pad || "clamp(58px, 8vw, 96px)"} clamp(20px, 5vw, 40px)`,
      scrollMarginTop: 62,
      background: tone === "sunken" ? "rgba(0,0,0,0.22)" : "transparent",
      borderTop: divider ? `1px solid ${RULE_SOFT}` : "none",
      ...style,
    }}
  >
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>{children}</div>
  </section>
);

/* 見出し。左寄せ・罫なし。上に置く小さなラベルは金にしない。 */
export const Heading = ({ eyebrow, children, sub, style }) => (
  <div style={{ maxWidth: 660, ...style }}>
    {eyebrow && (
      <div style={{
        fontSize: 10.5, fontWeight: 500, color: C.textMuted,
        letterSpacing: 1.7, marginBottom: 13,
      }}>{eyebrow}</div>
    )}
    <h2 style={{
      fontFamily: FONT_HEAD, fontSize: "clamp(20px, 2.9vw, 29px)", fontWeight: 600,
      color: C.text, letterSpacing: 0.7, lineHeight: 1.62, margin: 0,
    }}>{children}</h2>
    {sub && (
      <p style={{
        fontSize: 13.5, color: C.textSec, lineHeight: 1.95,
        margin: "15px 0 0", maxWidth: 520, letterSpacing: 0.3,
      }}>{sub}</p>
    )}
  </div>
);

/* ヒーローの上に置く条件書き。枠も地も付けない（ただの但し書き） */
export const Pill = ({ icon: Icon, children }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
    fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4,
  }}>
    {Icon && <Icon size={13} strokeWidth={1.7} color={C.textFaint} />}{children}
  </span>
);

/* 主CTA。ボタンではなくリンク（別ページのアプリへ移る）。
   単色・角は小さく・影なし。 */
export const CtaLink = ({ href, children, size = "md", style }) => {
  const pad = size === "lg" ? "15px 30px" : size === "sm" ? "9px 17px" : "13px 25px";
  const fs = size === "lg" ? 15 : size === "sm" ? 12.5 : 14;
  return (
    <a
      className="lp-cta"
      href={href}
      style={{
        display: "inline-block", padding: pad, fontSize: fs, fontWeight: 700,
        letterSpacing: 0.6, color: "#1a1206", background: C.primary,
        borderRadius: 4, textDecoration: "none", fontFamily: FONT_BODY,
        ...style,
      }}
    >
      {children}
    </a>
  );
};

/* 副導線。ボタンの形にすると主CTAと張り合うので、下線だけの文字にする。 */
export const GhostLink = ({ href, children, style }) => (
  <a
    className="lp-tlink"
    href={href}
    style={{
      fontSize: 13.5, color: C.textSec, textDecoration: "none", letterSpacing: 0.4,
      borderBottom: `1px solid rgba(244,239,227,0.28)`, paddingBottom: 3, ...style,
    }}
  >
    {children}
  </a>
);

/* 特徴。カードを3枚並べず、罫で区切った一覧にする。 */
export const FeatureList = ({ items }) => (
  <div>
    {items.map(({ icon: Icon, title, body, note }, i) => (
      <div key={title} className={`lp-row${i === 0 ? " lp-row-first" : ""}`}>
        <div style={{ paddingTop: 3 }}>
          <Icon size={18} strokeWidth={1.6} color={C.primary} />
        </div>
        <div>
          <h3 style={{
            fontFamily: FONT_HEAD, fontSize: 16.5, fontWeight: 600, color: C.text,
            letterSpacing: 0.4, lineHeight: 1.62, margin: 0,
          }}>{title}</h3>
          <p style={{
            fontSize: 13, color: C.textSec, lineHeight: 1.98,
            margin: "10px 0 0", letterSpacing: 0.25,
          }}>{body}</p>
          {note && (
            <p style={{
              fontSize: 11.5, color: C.textMuted, lineHeight: 1.85,
              margin: "9px 0 0", letterSpacing: 0.2,
            }}>{note}</p>
          )}
        </div>
      </div>
    ))}
  </div>
);

/* 手順。番号は小さく脇に垂らすだけ。背後に線を通したり節を光らせたりしない。
   本文の幅を絞って、右側に余白を残す。 */
export const StepList = ({ items }) => (
  <ol style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 720 }}>
    {items.map(({ n, title, body }, i) => (
      <li key={n} className={`lp-row${i === 0 ? " lp-row-first" : ""}`}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 600,
          color: "rgba(232,201,135,0.5)", paddingTop: 2, letterSpacing: 0.5,
        }}>{n}</div>
        <div>
          <h3 style={{
            fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: C.text,
            letterSpacing: 0.4, lineHeight: 1.62, margin: 0,
          }}>{title}</h3>
          <p style={{
            fontSize: 13, color: C.textSec, lineHeight: 1.98,
            margin: "10px 0 0", letterSpacing: 0.25,
          }}>{body}</p>
        </div>
      </li>
    ))}
  </ol>
);

/* 守っていること（個室なし・DMなし等）。
   4つの箱に入れて並べると飾りに見えるので、ただの一行にする。 */
export const TrustBadges = ({ items, style }) => (
  <div style={{
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "9px 16px",
    marginTop: 34, paddingTop: 17, borderTop: `1px solid ${RULE_SOFT}`, ...style,
  }}>
    {items.map((t, i) => (
      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
        {i > 0 && <span style={{ color: C.textFaint, fontSize: 11 }}>/</span>}
        <span style={{ fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4 }}>{t}</span>
      </span>
    ))}
  </div>
);

/* よくある質問。最初の1つだけ開いておく（何が書いてあるか分かるように）。
   答えは常に描画しておき、高さ（0fr → 1fr）だけを動かす。 */
export const Faq = ({ items }) => {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ maxWidth: 730 }}>
      {items.map((item, i) => (
        <div
          key={item.q}
          className="lp-faq"
          data-open={open === i}
          style={{
            borderTop: `1px solid ${RULE_SOFT}`,
            borderBottom: i === items.length - 1 ? `1px solid ${RULE_SOFT}` : "none",
          }}
        >
          <button
            className="lp-faq-q"
            onClick={() => setOpen(open === i ? -1 : i)}
            aria-expanded={open === i}
            style={{
              width: "100%", background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "flex-start", gap: 18, textAlign: "left",
              padding: "17px 0", color: C.text, fontFamily: FONT_BODY,
              fontSize: 13.8, fontWeight: 600, letterSpacing: 0.3, lineHeight: 1.65,
            }}
          >
            <span style={{ flex: 1 }}>{item.q}</span>
            <ChevronDown
              size={16} strokeWidth={1.8} color={C.textMuted}
              style={{
                flexShrink: 0, marginTop: 3, transition: "transform .22s ease",
                transform: open === i ? "rotate(180deg)" : "none",
              }}
            />
          </button>
          <div className="lp-faq-panel" aria-hidden={open !== i}>
            <div>
              <p style={{
                margin: 0, padding: "0 34px 20px 0", fontSize: 13,
                color: C.textSec, lineHeight: 2.05, letterSpacing: 0.25,
              }}>{item.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────── ヘッダー ───────────────────────────────
   広告から来た人向けなので、ページ内のリンクは置かない。
   出口はひとつ（登録）に絞る。 */
export const LpHeader = ({ tagline, ctaLabel, ctaHref }) => (
  <header style={{
    position: "sticky", top: 0, zIndex: 40,
    borderBottom: `1px solid ${RULE_SOFT}`,
    background: "rgba(11,16,32,0.92)",
    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
  }}>
    <div style={{
      maxWidth: 1040, margin: "0 auto", padding: "11px clamp(18px, 5vw, 40px)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <a href={APP_URL} style={{ display: "flex", alignItems: "baseline", gap: 10, textDecoration: "none" }}>
        <span style={{ fontFamily: FONT_LOGO, fontSize: 21, fontWeight: 700, letterSpacing: 3.4, ...brandText }}>
          AISEKI
        </span>
        <span className="lp-tagline" style={{ fontFamily: FONT_HEAD, fontSize: 10, color: C.textMuted, letterSpacing: 1.5 }}>
          {tagline}
        </span>
      </a>
      <div style={{ marginLeft: "auto" }}>
        <CtaLink href={ctaHref} size="sm">{ctaLabel}</CtaLink>
      </div>
    </div>
  </header>
);

/* ─────────────────────────── 最後のCTA（締め） ───────────────────────────
   囲って中央に置くとバナーに見えるので、地に直接書いて左右に振り分ける。 */
export const CtaSection = ({ eyebrow, title, body, ctaLabel, ctaHref }) => (
  <Section tone="sunken" divider pad="clamp(52px, 7vw, 82px)">
    <div className="lp-close">
      <div style={{ maxWidth: 540 }}>
        {eyebrow && (
          <div style={{ fontSize: 10.5, fontWeight: 500, color: C.textMuted, letterSpacing: 1.7, marginBottom: 13 }}>
            {eyebrow}
          </div>
        )}
        <div style={{
          fontFamily: FONT_HEAD, fontSize: "clamp(20px, 2.9vw, 28px)", fontWeight: 600,
          color: C.text, letterSpacing: 0.7, lineHeight: 1.6,
        }}>{title}</div>
        <p style={{
          fontSize: 13, color: C.textSec, lineHeight: 1.98,
          margin: "15px 0 0", maxWidth: 470, letterSpacing: 0.3,
        }}>{body}</p>
      </div>
      <div>
        <CtaLink href={ctaHref} size="lg">{ctaLabel}</CtaLink>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 13, letterSpacing: 0.4 }}>
          {MIN_AGE}歳未満の方はご利用いただけません
        </div>
      </div>
    </div>
  </Section>
);

/* ─────────────────────────────── フッター ─────────────────────────────── */
export const LpFooter = () => (
  <footer style={{
    borderTop: `1px solid ${RULE_SOFT}`,
    padding: "clamp(32px, 4.5vw, 46px) clamp(20px, 5vw, 40px) 40px",
  }}>
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div style={{
        display: "flex", gap: 22, flexWrap: "wrap",
        justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28,
      }}>
        <div>
          <div style={{ fontFamily: FONT_LOGO, fontSize: 22, fontWeight: 700, letterSpacing: 3.6, ...brandText }}>
            AISEKI
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, color: C.textMuted, letterSpacing: 1.6, marginTop: 7 }}>
            大人のグループ相席マッチング
          </div>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          {[
            { label: "サービスについて", href: APP_URL },
            { label: "はじめる", href: signupUrl("lp-footer") },
            { label: "ログイン", href: loginUrl() },
            { label: "お問い合わせ", href: `mailto:${CONTACT_EMAIL}` },
          ].map((l) => (
            <a key={l.label} className="lp-flink" href={l.href} style={{
              fontSize: 12, color: C.textSec, textDecoration: "none", letterSpacing: 0.5, fontWeight: 500,
            }}>{l.label}</a>
          ))}
        </div>
      </div>

      {/* 守っていることの列挙。囲わず、罫の下にそのまま置く。 */}
      <div style={{ paddingTop: 18, borderTop: `1px solid ${RULE_SOFT}` }}>
        {FOOTER_NOTICE.map((line) => (
          <div key={line} style={{
            fontSize: 11, color: C.textMuted, lineHeight: 1.95, letterSpacing: 0.2, maxWidth: 760,
          }}>{line}</div>
        ))}
      </div>

      <div style={{ marginTop: 22, fontSize: 10.5, color: C.textFaint, letterSpacing: 0.7 }}>
        © 2026 AISEKI
      </div>
    </div>
  </footer>
);

/* ───────────────────── ページの外枠 ───────────────────── */
export const LpPage = ({ children }) => (
  <div className="lp-root" style={{ fontFamily: FONT_BODY, color: C.text, width: "100%" }}>
    <LpStyles />
    {children}
  </div>
);
