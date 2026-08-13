import { useState } from "react";
import { ChevronLeft, ShieldCheck, Users, MessageCircle, Ban, Lock, ScrollText, DoorClosed, Wine } from "lucide-react";
import {
  C, FONT_SERIF_JP, FONT_LOGO, goldText, glass, Eyebrow,
} from "../lib/theme.jsx";
import {
  TERMS, TERMS_INTRO, PRIVACY, PRIVACY_INTRO, LEGAL_UPDATED, LEGAL_VERSION,
  LEGAL_MIN_AGE, COMPLIANCE_NOTES, FOOTER_NOTICE,
} from "../lib/legal.js";

/* ══════════════════════════════════════════════════════════════
   利用規約 / プライバシーポリシー
   ・本サービスはグループでの飲み会・食事会（相席）のマッチングサービス
   ・異性交際を目的とした利用の禁止
   ・20歳未満の利用の禁止（飲酒を伴うため）
   ・個室での相席の禁止（オープンスペースのみ）
   ・接待をしない／サクラを置かない（風営法上の風俗営業に該当しない）
   ・1対1の出会いを目的とした利用は規約違反
   条文の本文は src/lib/legal.js が単一の出典（改定はそちらを編集）。
   ══════════════════════════════════════════════════════════════ */

export const TERMS_UPDATED = LEGAL_UPDATED;

const HIGHLIGHTS = [
  { icon: Users, title: "グループ限定", body: "2名以上のグループ同士でのみ会が成立します。1対1のマッチングは行えません。" },
  { icon: Wine, title: `${LEGAL_MIN_AGE}歳以上限定`, body: `飲酒を伴うため、${LEGAL_MIN_AGE}歳未満の方はご利用いただけません。登録時に生年月日で年齢を確認します。` },
  { icon: DoorClosed, title: "個室での相席なし", body: "相席は、店内を見渡せるオープンスペースでのみ行います。個室・半個室での相席は提供しません。" },
  { icon: ShieldCheck, title: "接待なし・サクラなし", body: "店側は接待を行わず、客同士を同席させるのみです。報酬を受けて客の相手をするサクラは一切在籍していません。" },
  { icon: MessageCircle, title: "グループチャットのみ", body: "会に参加したメンバー全員のチャットのみを提供します。個人間のダイレクトメッセージ機能はありません。" },
  { icon: Lock, title: "プロフィール非公開", body: "参加者の氏名・写真などは、会への参加が承認されたメンバーだけが閲覧できます。" },
  { icon: Ban, title: "出会い目的の禁止", body: "異性交際・1対1の出会いを目的とした利用は禁止です。" },
];

/* ── 条文ブロック（legal.js の { t, p, l, p2, hot } を描画） ── */
const Article = ({ s }) => (
  <div style={{ paddingTop: 18 }}>
    <div style={{
      fontFamily: FONT_SERIF_JP, fontSize: 14, fontWeight: 700, letterSpacing: 0.4,
      color: s.hot ? C.goldBright : C.text, marginBottom: 8,
      display: "flex", alignItems: "center", gap: 7, lineHeight: 1.5,
    }}>
      <span style={{
        width: 3, height: 14, borderRadius: 2, flexShrink: 0,
        background: s.hot ? C.goldGrad : C.lineGold,
      }} />
      {s.t}
    </div>

    {s.p?.map((para, i) => (
      <p key={i} style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.95, margin: "0 0 7px", letterSpacing: 0.2 }}>{para}</p>
    ))}

    {s.l && (
      <ol style={{ margin: "9px 0 0", padding: 0, listStyle: "none" }}>
        {s.l.map((item, i) => (
          <li key={i} style={{
            display: "flex", gap: 9, fontSize: 12.5, lineHeight: 1.9,
            color: C.textSec, marginBottom: 6, letterSpacing: 0.2,
          }}>
            <span style={{
              flexShrink: 0, minWidth: 19, height: 19, borderRadius: 10, marginTop: 2,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 9.5, fontWeight: 700, color: C.gold,
              background: "rgba(216,189,130,0.09)", border: `1px solid ${C.line}`,
            }}>{i + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    )}

    {s.p2?.map((para, i) => (
      <p key={i} style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.95, margin: "9px 0 0", letterSpacing: 0.2 }}>{para}</p>
    ))}
  </div>
);

/* 規約本文（画面内・ログイン前どちらからも使う） */
export const TermsBody = () => {
  const [tab, setTab] = useState("terms");
  const isTerms = tab === "terms";
  const sections = isTerms ? TERMS : PRIVACY;
  const intro = isTerms ? TERMS_INTRO : PRIVACY_INTRO;

  const TABS = [
    { key: "terms", label: "利用規約", icon: ScrollText },
    { key: "privacy", label: "プライバシー", icon: ShieldCheck },
  ];

  return (
    <div>
      {/* サービスの性質（出会い系ではないこと）を最初に明示 */}
      <div className="fade" style={{
        ...glass, padding: 20, marginBottom: 14, position: "relative", overflow: "hidden",
        border: `1px solid ${C.lineGold}`,
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 88% -20%, rgba(216,189,130,0.12), transparent 58%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <Eyebrow style={{ marginBottom: 8 }}>◆ 本サービスについて</Eyebrow>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 15.5, fontWeight: 600, color: C.text, lineHeight: 1.7, letterSpacing: 0.3 }}>
            AISEKIは、<span style={{ ...goldText, fontWeight: 700 }}>グループでの飲み会・食事会</span>の
            マッチングサービスです。
          </div>
          <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.8, marginTop: 10 }}>
            異性交際を目的としたサービスではありません。1対1の出会いを目的とした利用は、規約違反として対応します。
            相席はオープンスペースのみで行い、{LEGAL_MIN_AGE}歳以上の方のみご利用いただけます。
          </div>
        </div>
      </div>

      {/* 営業形態と許認可（風営法上の風俗営業に該当しないことの明示） */}
      <div className="fade" style={{ ...glass, padding: 20, marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 10 }}>◆ 営業形態と許認可</Eyebrow>
        {COMPLIANCE_NOTES.map((n, i) => (
          <div key={n.t} style={{
            paddingTop: i === 0 ? 0 : 12, marginTop: i === 0 ? 0 : 12,
            borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <ShieldCheck size={13} strokeWidth={2} color={C.gold} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{n.t}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85 }}>{n.b}</div>
          </div>
        ))}
      </div>

      {/* 要点 */}
      <div style={{ display: "grid", gap: 9, marginBottom: 18 }}>
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            background: "rgba(255,255,255,0.028)", border: `1px solid ${C.lineSoft}`,
            borderRadius: 14, padding: "13px 15px",
          }}>
            <span style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(216,189,130,0.09)", border: `1px solid ${C.lineGold}`, color: C.gold,
            }}><h.icon size={15} strokeWidth={1.9} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{h.title}</div>
              <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>{h.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 利用規約 / プライバシーポリシー 切替 */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 14, background: "rgba(255,255,255,0.028)",
        padding: 4, borderRadius: 13, border: `1px solid ${C.lineSoft}`,
      }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" className="press" onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", border: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              ...(on
                ? { background: C.goldGrad, color: "#241704", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }
                : { background: "transparent", color: C.textSec }),
            }}>
              <t.icon size={14} strokeWidth={2} />{t.label}
            </button>
          );
        })}
      </div>

      {/* 条文 */}
      <div className="fade" style={{ ...glass, padding: "6px 20px 20px" }}>
        <p style={{
          fontSize: 11.5, color: C.textMuted, lineHeight: 1.9, letterSpacing: 0.2,
          margin: "18px 0 0", paddingBottom: 16, borderBottom: `1px solid ${C.lineSoft}`,
        }}>{intro}</p>

        {sections.map((s) => <Article key={s.t} s={s} />)}

        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted }}>
            <ShieldCheck size={13} strokeWidth={1.8} color={C.gold} /> 最終改定: {LEGAL_UPDATED}（v{LEGAL_VERSION}）
          </span>
          <span style={{ fontFamily: FONT_LOGO, fontSize: 13, letterSpacing: 2.5, ...goldText }}>AISEKI</span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 9.5, color: C.textFaint, letterSpacing: 0.8, lineHeight: 1.9 }}>
        {FOOTER_NOTICE.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
};

/* アプリ内の1画面として表示するラッパー */
export default function TermsScreen({ onBack }) {
  return (
    <div style={{ padding: "0 20px 24px" }}>
      {onBack && (
        <button className="press" onClick={onBack} style={{
          display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
          fontSize: 13.5, color: C.gold, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4,
        }}>
          <ChevronLeft size={18} strokeWidth={2} /> 戻る
        </button>
      )}
      <div style={{ marginBottom: 16 }}>
        <Eyebrow style={{ marginBottom: 4 }}>Terms & Privacy</Eyebrow>
        <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 23, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>利用規約</div>
      </div>
      <TermsBody />
    </div>
  );
}
