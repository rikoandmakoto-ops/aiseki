/* ══════════════════════════════════════════════════════════════
   AISEKI — 広告用ランディングページの共通部品

   アプリ本体の LandingScreen（未ログイン時の入口）とは別物。
   こちらは広告からの流入を受ける単体のページで、
     ・アプリのバンドル（supabase / 認証）を一切読み込まない
     ・ボタンは <a> で、リンク先はアプリの登録画面（別ページ）
   という作りにしてある。表示は速いほうがいい。

   見た目はアプリと同じダークネイビー×ゴールド（src/lib/theme.jsx）。
   ページごとの差は accent（光の色）だけで、骨格は共有する。

   ⚠ 掲載内容は法務上の要件と一致させること（src/lib/legal.js が出典）。
     ・グループ同士（2名以上 × 2名以上）限定であること
     ・個室での相席は行わないこと
     ・20歳以上限定であること
     ・接待をしない／サクラを置かないこと
     ・個人間DMが存在しないこと
   ══════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { ChevronDown, ShieldCheck, ArrowRight } from "lucide-react";
import {
  C, FONT_LOGO, FONT_HEAD, FONT_DISPLAY, FONT_BODY,
  brandText, card, popBtn, ghostBtn, Eyebrow,
} from "../lib/theme.jsx";
import { FOOTER_NOTICE, CONTACT_EMAIL, SERVICE_URL } from "../lib/legal.js";
import { MIN_AGE } from "../lib/pricing.js";

/* ─────────────────────────────────── リンク先 ───────────────────────────────
   CTA はすべてアプリの登録画面へ送る。?auth=signup を App.jsx が読んで
   ランディングを飛ばし、いきなり登録フォームを開く。
   from= はどのLPから来たのかを見るための印（アプリ側の動作は変えない）。 */
export const signupUrl = (from) => `${SERVICE_URL}/?auth=signup&from=${from}`;
export const loginUrl = () => `${SERVICE_URL}/?auth=login`;
export const APP_URL = `${SERVICE_URL}/`;

/* ─────────────────────────────────── 部品 ───────────────────────────────── */

export const Section = ({ children, style, id }) => (
  <section
    id={id}
    style={{
      padding: "clamp(48px, 8vw, 92px) clamp(18px, 5vw, 40px)",
      scrollMarginTop: 68,
      ...style,
    }}
  >
    <div style={{ maxWidth: 1020, margin: "0 auto" }}>{children}</div>
  </section>
);

export const Heading = ({ eyebrow, children, sub, align = "center" }) => (
  <div style={{ textAlign: align, marginBottom: "clamp(28px, 5vw, 48px)" }}>
    {eyebrow && (
      <Eyebrow style={{ marginBottom: 12, letterSpacing: 2.4, textTransform: "uppercase" }}>
        {eyebrow}
      </Eyebrow>
    )}
    <h2 style={{
      fontFamily: FONT_HEAD, fontSize: "clamp(21px, 3.6vw, 33px)", fontWeight: 600,
      color: C.text, letterSpacing: 0.6, lineHeight: 1.5, margin: 0,
    }}>{children}</h2>
    {sub && (
      <p style={{
        fontSize: "clamp(12.5px, 1.5vw, 14.5px)", color: C.textSec, lineHeight: 2,
        margin: "14px auto 0", maxWidth: 600, letterSpacing: 0.3,
      }}>{sub}</p>
    )}
  </div>
);

export const Pill = ({ icon: Icon, children }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "7px 14px", borderRadius: 999, whiteSpace: "nowrap",
    fontSize: "clamp(10px, 1.2vw, 11.5px)", fontWeight: 600, letterSpacing: 0.5,
    color: C.primaryDeep, background: "rgba(232,201,135,0.09)", border: `1px solid ${C.linePrimary}`,
  }}>
    {Icon && <Icon size={13} strokeWidth={2} />}{children}
  </span>
);

/* 主CTA。ボタンではなくリンク（別ページのアプリへ移る） */
export const CtaLink = ({ href, children, icon: Icon, size = "md", style }) => {
  const pad = size === "lg" ? "17px 34px" : size === "sm" ? "10px 19px" : "15px 30px";
  const fs = size === "lg" ? 15.5 : size === "sm" ? 12.5 : 14.5;
  return (
    <a
      className="lux-cta"
      href={href}
      style={{
        ...popBtn, padding: pad, fontSize: fs, textDecoration: "none",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
        ...style,
      }}
    >
      {Icon && <Icon size={size === "lg" ? 17 : 15} strokeWidth={2} />}{children}
    </a>
  );
};

export const GhostLink = ({ href, children, style }) => (
  <a
    className="press"
    href={href}
    style={{
      ...ghostBtn, padding: "15px 26px", fontSize: 14.5, textDecoration: "none",
      display: "inline-flex", alignItems: "center", gap: 8, ...style,
    }}
  >
    {children}<ArrowRight size={15} strokeWidth={2} />
  </a>
);

/* 特徴カード（3つ並び） */
export const FeatureCard = ({ icon: Icon, title, body, note }) => (
  <div className="lux-card" style={{ ...card, padding: "26px 24px" }}>
    <span style={{
      width: 44, height: 44, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
    }}><Icon size={20} strokeWidth={1.8} /></span>
    <div style={{
      fontFamily: FONT_HEAD, fontSize: 16.5, fontWeight: 600, color: C.text,
      letterSpacing: 0.4, marginTop: 18, lineHeight: 1.6,
    }}>{title}</div>
    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 2, marginTop: 10, letterSpacing: 0.2 }}>
      {body}
    </div>
    {note && (
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}`,
        fontSize: 11.5, color: C.textMuted, lineHeight: 1.85,
      }}>{note}</div>
    )}
  </div>
);

/* 使い方のステップ */
export const StepCard = ({ n, title, body }) => (
  <div style={{ ...card, padding: "26px 24px", position: "relative", overflow: "hidden" }}>
    <div style={{
      position: "absolute", top: -14, right: 10, fontFamily: FONT_DISPLAY,
      fontSize: 84, fontWeight: 700, lineHeight: 1, color: "rgba(232,201,135,0.07)", pointerEvents: "none",
    }}>{n}</div>
    <div style={{ position: "relative" }}>
      <Eyebrow style={{ letterSpacing: 2.4 }}>STEP {n}</Eyebrow>
      <div style={{
        fontFamily: FONT_HEAD, fontSize: 16.5, fontWeight: 600, color: C.text,
        letterSpacing: 0.4, marginTop: 10, lineHeight: 1.6,
      }}>{title}</div>
      <div style={{ fontSize: 13, color: C.textSec, lineHeight: 2, marginTop: 10, letterSpacing: 0.2 }}>
        {body}
      </div>
    </div>
  </div>
);

/* よくある質問。最初の1つだけ開いておく（何が書いてあるか分かるように） */
export const Faq = ({ items }) => {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ maxWidth: 740, margin: "0 auto" }}>
      {items.map((item, i) => (
        <div key={item.q} style={{ ...card, padding: 0, marginBottom: 10, overflow: "hidden" }}>
          <button
            onClick={() => setOpen(open === i ? -1 : i)}
            aria-expanded={open === i}
            style={{
              width: "100%", background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 14, textAlign: "left",
              padding: "17px 18px", color: C.text, fontFamily: FONT_BODY,
            }}
          >
            <span style={{ flexShrink: 0, fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, ...brandText }}>Q</span>
            <span style={{ flex: 1, fontSize: "clamp(13px, 1.5vw, 14.5px)", fontWeight: 600, letterSpacing: 0.3, lineHeight: 1.6 }}>
              {item.q}
            </span>
            <ChevronDown
              size={17} strokeWidth={2} color={C.primaryDeep}
              style={{ flexShrink: 0, transition: "transform .28s ease", transform: open === i ? "rotate(180deg)" : "none" }}
            />
          </button>
          {open === i && (
            <div className="fade" style={{
              padding: "0 18px 20px 46px", fontSize: "clamp(12px, 1.4vw, 13.5px)",
              color: C.textSec, lineHeight: 2.05, letterSpacing: 0.2,
            }}>{item.a}</div>
          )}
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
    borderBottom: `1px solid ${C.line}`,
    background: "rgba(8,12,24,0.82)",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  }}>
    <div style={{
      maxWidth: 1020, margin: "0 auto", padding: "11px clamp(16px, 5vw, 40px)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <a href={APP_URL} style={{ display: "flex", alignItems: "baseline", gap: 9, textDecoration: "none" }}>
        <span style={{ fontFamily: FONT_LOGO, fontSize: 22, fontWeight: 600, letterSpacing: 3.2, ...brandText }}>
          AISEKI
        </span>
        <span className="lp-tagline" style={{ fontFamily: FONT_HEAD, fontSize: 10, color: C.textMuted, letterSpacing: 1.2 }}>
          {tagline}
        </span>
      </a>
      <div style={{ marginLeft: "auto" }}>
        <CtaLink href={ctaHref} size="sm">{ctaLabel}</CtaLink>
      </div>
    </div>
  </header>
);

/* ─────────────────────────── 最後のCTA（締め） ─────────────────────────── */
export const CtaSection = ({ eyebrow, title, body, ctaLabel, ctaHref, icon, glow }) => (
  <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
    <div style={{
      ...card, padding: "clamp(34px, 6vw, 58px) clamp(22px, 5vw, 48px)", textAlign: "center",
      border: `1px solid ${C.linePrimary}`, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: glow }} />
      <div style={{ position: "relative" }}>
        <Eyebrow style={{ letterSpacing: 2.6, marginBottom: 14 }}>{eyebrow}</Eyebrow>
        <div style={{
          fontFamily: FONT_HEAD, fontSize: "clamp(21px, 3.6vw, 31px)", fontWeight: 600,
          color: C.text, letterSpacing: 0.7, lineHeight: 1.55,
        }}>{title}</div>
        <p style={{ fontSize: 13.5, color: C.textSec, lineHeight: 2, margin: "16px auto 0", maxWidth: 460 }}>
          {body}
        </p>
        <div style={{ marginTop: 28 }}>
          <CtaLink href={ctaHref} size="lg" icon={icon}>{ctaLabel}</CtaLink>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 16, letterSpacing: 0.4 }}>
          {MIN_AGE}歳未満の方はご利用いただけません
        </div>
      </div>
    </div>
  </Section>
);

/* ─────────────────────────────── フッター ─────────────────────────────── */
export const LpFooter = () => (
  <footer style={{
    borderTop: `1px solid ${C.line}`,
    padding: "clamp(30px, 5vw, 46px) clamp(18px, 5vw, 40px) 40px",
    background: "rgba(4,7,14,0.5)",
  }}>
    <div style={{ maxWidth: 1020, margin: "0 auto" }}>
      <div style={{
        display: "flex", gap: 22, flexWrap: "wrap",
        justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24,
      }}>
        <div>
          <div style={{ fontFamily: FONT_LOGO, fontSize: 23, fontWeight: 600, letterSpacing: 3.4, ...brandText }}>
            AISEKI
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, color: C.textMuted, letterSpacing: 1.4, marginTop: 6 }}>
            大人のグループ相席マッチング
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "サービスについて", href: APP_URL },
            { label: "はじめる", href: signupUrl("lp-footer") },
            { label: "ログイン", href: loginUrl() },
            { label: "お問い合わせ", href: `mailto:${CONTACT_EMAIL}` },
          ].map((l) => (
            <a key={l.label} href={l.href} style={{
              fontSize: 12, color: C.textSec, textDecoration: "none", letterSpacing: 0.3,
            }}>{l.label}</a>
          ))}
        </div>
      </div>

      <div style={{
        padding: "15px 17px", borderRadius: 14,
        background: "rgba(255,255,255,0.03)", border: `1px solid ${C.lineSoft}`,
      }}>
        {FOOTER_NOTICE.map((line, i) => (
          <div key={line} style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            fontSize: 10.5, color: C.textMuted, lineHeight: 1.85, marginTop: i === 0 ? 0 : 6,
          }}>
            <ShieldCheck size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{line}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, fontSize: 10.5, color: C.textFaint, letterSpacing: 0.5, textAlign: "right" }}>
        © 2026 AISEKI
      </div>
    </div>
  </footer>
);

/* ───────────────────── ページの外枠（背景の光を差し替える） ───────────────── */
export const LpPage = ({ children }) => (
  <div style={{ fontFamily: FONT_BODY, color: C.text, width: "100%" }}>{children}</div>
);

/* ヒーローの後ろに敷く光。ページごとに色みを変えるために props で受け取る。 */
export const HeroGlow = ({ background }) => (
  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background }} />
);
