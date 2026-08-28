/* ══════════════════════════════════════════════════════════════
   AISEKI — ランディングページ（未ログイン時の入口）

   ここは「アプリの画面」ではなく、サービスを知らない人に向けた
   説明ページ。したがってアプリ本体（幅400pxの端末シェル）とは違い、
   画面幅いっぱいを使い、読み物として上から下へ流れる構成にする。

   掲載する内容は法務上の要件と一致させること。
   ・グループ同士（2名以上 × 2名以上）限定であること
   ・個室での相席は行わないこと
   ・20歳以上限定であること
   ・接待をしない／サクラを置かないこと
   ・個人間DMが存在しないこと
   文言の出典は src/lib/legal.js（規約と同じ値を参照する）。
   ══════════════════════════════════════════════════════════════ */
import { useState } from "react";
import {
  UsersRound, Wine, DoorClosed, ShieldCheck, MessageCircle, Lock, Ban,
  ArrowRight, Sparkles, Gem, ChevronDown, MapPin, Check, Menu, X, Wallet,
} from "lucide-react";
import {
  C, FONT_LOGO, FONT_HEAD, FONT_DISPLAY, FONT_BODY,
  brandText, card, popBtn, ghostBtn, Eyebrow,
} from "../lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
  SIGNUP_BONUS, SIGNUP_BONUS_SEATS, REFERRAL_BONUS,
} from "../lib/api";
import { FOOTER_NOTICE, LEGAL_UPDATED, CONTACT_EMAIL } from "../lib/legal.js";
import { POINT_PACKS, packBonus } from "../lib/packs.js";

/* ─────────────────────────────────────── 掲載データ ─────── */

const PILLARS = [
  {
    icon: UsersRound,
    title: "グループ同士だから、気楽",
    body: `会が成立するのは${MIN_GROUP_SIZE}名以上のグループ同士だけ。1対1で向き合う気まずさがなく、友人と一緒だから初対面でも自然に話せます。`,
  },
  {
    icon: DoorClosed,
    title: "オープンスペースだけ",
    body: "相席の場所は、フロア席・カウンターなど店内を見渡せる席に限定。個室・半個室での相席は、システム上そもそも選べません。",
  },
  {
    icon: Lock,
    title: "プロフィールは非公開",
    body: "名前も写真も、誰でも見られる場所には出しません。同じ会への参加が承認されたメンバーにだけ表示されます。",
  },
];

const FEATURES = [
  { icon: MessageCircle, t: "グループチャットのみ", b: "会に参加したメンバー全員のチャットだけ。個人間のダイレクトメッセージ機能はありません。" },
  { icon: ShieldCheck, t: "接待なし・サクラなし", b: "報酬を受けて客の相手をする人は一切いません。相手はいつも一般の利用者です。" },
  { icon: Wine, t: `${MIN_AGE}歳以上限定`, b: `飲酒を伴う場のため、登録時に生年月日で年齢を確認します。${MIN_AGE}歳未満の方は登録できません。` },
  { icon: Ban, t: "性別による参加条件なし", b: "会の募集・参加に性別の条件は付けられません。性別が他のユーザーに表示されることもなく、同性グループ同士の会も等しく成立します。" },
  { icon: MapPin, t: "東京の夜の主要エリア", b: "渋谷・恵比寿・中目黒・六本木・西麻布・銀座・新宿。行きたい街から探せます。" },
  { icon: Gem, t: "料金は一律", b: `募集する側は無料で、会はいくつでも立てられます。参加する側だけが1名あたり一律${JOIN_FEE.toLocaleString()}ptを使います。` },
  { icon: Wallet, t: "ホストは、おごられる", b: "当日のホストグループの飲食代は、参加グループが負担する決まりです。募集した側が支払うことはありません。" },
];

const STEPS = [
  {
    n: "01",
    t: "友人を誘って登録する",
    b: `メールアドレスと生年月日で登録（${MIN_AGE}歳以上）。一緒に行く同伴者のニックネームも登録して、グループの席を確保します。`,
  },
  {
    n: "02",
    t: "会を主催する / 参加を申し込む",
    b: `自分たちのグループで会を募集するか、募集中の会に申し込みます。会を立てる側は${MIN_GROUP_SIZE}名以上のグループが必要です。参加する側は2名でのお申し込みが基本で、お一人でも申し込めます。`,
  },
  {
    n: "03",
    t: "承認されたらグループチャットへ",
    b: "ホストが承認すると会が成立し、参加メンバー全員のグループチャットが始まります。当日の待ち合わせはここで。",
  },
];

const FAQ = [
  {
    q: "1人でも参加できますか？",
    a: `いいえ。会を立てる側は必ず${MIN_GROUP_SIZE}名以上のグループで、1対1のマッチングはシステム上どうしても作れないようになっています。参加する側はお一人でもお申し込みいただけますが、お相手は必ず${MIN_GROUP_SIZE}名以上のグループなので、1対1の席にはなりません。同伴者が当日アプリを入れていなくても、代表者が人数分の席を確保すれば参加できます。`,
  },
  {
    q: "出会い系アプリとは違うのですか？",
    a: "違います。AISEKIは、いわゆる「相席居酒屋」と同じく、グループ同士で飲食店の同じ卓に着くためのサービスです。異性交際を目的としたサービスではなく、インターネット異性紹介事業としての運営も行っていません。異性交際・1対1で会うことを目的とした利用は規約違反として対応します。",
  },
  {
    q: "個室でゆっくり話したいのですが。",
    a: "個室・半個室での相席は、いかなる場合も提供していません。相席は店内を見渡せるオープンスペースのみです。会の作成画面でも、席の種別として個室は選択できません。",
  },
  {
    q: "相手の顔写真は事前に見られますか？",
    a: "見られません。募集の一覧・詳細で表示されるのは、会の内容（エリア・お店・時間・人数）とホストのニックネームまでです。参加者の写真・年齢は、参加が承認されたあとに会の画面で確認できます。",
  },
  {
    q: "ポイントは誰が払うのですか？",
    a: `参加を申し込むグループ側だけです。金額は会にかかわらず一律で、1名あたり${JOIN_FEE.toLocaleString()}pt。参加が承認された時点で消費されます。会を募集する側にポイントはかかりませんし、募集する側がポイントを受け取ることもありません（お支払いいただいたポイントは当社が受け取ります）。`,
  },
  {
    q: "募集する側には何のメリットがありますか？",
    a: "当日のお会計です。AISEKIでは、ホストグループの飲食代を参加グループが負担する決まりになっています。募集する側はポイントも飲食代も支払わずに、必ずおごられる側になります。募集は無料で、会はいくつでも立てられます。",
  },
  {
    q: "サクラはいませんか？",
    a: "一切いません。当社および提携店舗が報酬を支払って客の相手をさせる人物は在籍していません。相手は常に一般のご利用者です。また、店舗の従業員が客席に着いて談笑・酌などを行う「接待」も行いません。",
  },
];

/* ─────────────────────────────────────── 部品 ─────── */

const Section = ({ children, style }) => (
  <section style={{ padding: "clamp(56px, 9vw, 96px) clamp(20px, 5vw, 40px)", ...style }}>
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>{children}</div>
  </section>
);

const Heading = ({ eyebrow, children, sub, align = "center" }) => (
  <div style={{ textAlign: align, marginBottom: "clamp(32px, 5vw, 52px)" }}>
    {eyebrow && <Eyebrow style={{ marginBottom: 12, letterSpacing: 2.4, textTransform: "uppercase" }}>{eyebrow}</Eyebrow>}
    <h2 style={{
      fontFamily: FONT_HEAD, fontSize: "clamp(22px, 3.6vw, 34px)", fontWeight: 600,
      color: C.text, letterSpacing: 0.6, lineHeight: 1.5, margin: 0,
    }}>{children}</h2>
    {sub && (
      <p style={{
        fontSize: "clamp(13px, 1.5vw, 15px)", color: C.textSec, lineHeight: 2,
        margin: "16px auto 0", maxWidth: 620, letterSpacing: 0.3,
      }}>{sub}</p>
    )}
  </div>
);

const Pill = ({ icon: Icon, children }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "7px 15px", borderRadius: 999, whiteSpace: "nowrap",
    fontSize: "clamp(10px, 1.2vw, 11.5px)", fontWeight: 600, letterSpacing: 0.5,
    color: C.primaryDeep, background: "rgba(232,201,135,0.09)", border: `1px solid ${C.linePrimary}`,
  }}>
    {Icon && <Icon size={13} strokeWidth={2} />}{children}
  </span>
);

const FaqItem = ({ item, open, onToggle }) => (
  <div style={{ ...card, padding: 0, marginBottom: 10, overflow: "hidden" }}>
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        width: "100%", background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 14, textAlign: "left",
        padding: "18px 20px", color: C.text, fontFamily: FONT_BODY,
      }}
    >
      <span style={{
        flexShrink: 0, fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, ...brandText,
      }}>Q</span>
      <span style={{ flex: 1, fontSize: "clamp(13px, 1.5vw, 14.5px)", fontWeight: 600, letterSpacing: 0.3, lineHeight: 1.6 }}>
        {item.q}
      </span>
      <ChevronDown
        size={17} strokeWidth={2} color={C.primaryDeep}
        style={{ flexShrink: 0, transition: "transform .28s ease", transform: open ? "rotate(180deg)" : "none" }}
      />
    </button>
    {open && (
      <div className="fade" style={{
        padding: "0 20px 20px 48px", fontSize: "clamp(12px, 1.4vw, 13.5px)",
        color: C.textSec, lineHeight: 2.05, letterSpacing: 0.2,
      }}>{item.a}</div>
    )}
  </div>
);

/* ─────────────────────────────────────── 本体 ─────── */

export default function LandingScreen({ onStart }) {
  const [openFaq, setOpenFaq] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (mode) => { setMenuOpen(false); onStart(mode); };
  const jump = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const NAV_LINKS = [
    { id: "about", label: "AISEKIとは" },
    { id: "how", label: "使い方" },
    { id: "safety", label: "安全への取り組み" },
    { id: "price", label: "ポイント" },
    { id: "faq", label: "よくある質問" },
  ];

  return (
    <div style={{ fontFamily: FONT_BODY, color: C.text, width: "100%" }}>
      {/* ══════════════════════════════ ヘッダー ══════════════════════════════ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        borderBottom: `1px solid ${C.line}`,
        background: "rgba(8,12,24,0.78)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{
          maxWidth: 1080, margin: "0 auto", padding: "13px clamp(18px, 5vw, 40px)",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "baseline", gap: 9 }}
          >
            <span style={{ fontFamily: FONT_LOGO, fontSize: 23, fontWeight: 600, letterSpacing: 3.4, ...brandText }}>AISEKI</span>
            <span className="lp-tagline" style={{ fontFamily: FONT_HEAD, fontSize: 10, color: C.textMuted, letterSpacing: 1.2 }}>
              大人のグループ相席
            </span>
          </button>

          <nav className="lp-nav" style={{ flex: 1, display: "flex", gap: 22, justifyContent: "center" }}>
            {NAV_LINKS.map((l) => (
              <button key={l.id} onClick={() => jump(l.id)} className="press" style={{
                background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                fontSize: 12.5, color: C.textSec, letterSpacing: 0.4, fontFamily: FONT_BODY, fontWeight: 500,
              }}>{l.label}</button>
            ))}
          </nav>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9 }}>
            <button className="press lp-login" onClick={() => go("login")} style={{
              ...ghostBtn, padding: "9px 18px", fontSize: 12.5,
            }}>ログイン</button>
            <button className="lux-cta" onClick={() => go("signup")} style={{
              ...popBtn, padding: "9px 20px", fontSize: 12.5,
            }}>無料ではじめる</button>
            <button
              className="lp-burger press"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="メニュー"
              style={{
                background: "rgba(255,255,255,0.05)", border: `1px solid ${C.line}`, borderRadius: 10,
                width: 36, height: 36, alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: C.primaryDeep,
              }}
            >
              {menuOpen ? <X size={17} strokeWidth={2} /> : <Menu size={17} strokeWidth={2} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="fade" style={{ borderTop: `1px solid ${C.lineSoft}`, padding: "10px 20px 16px" }}>
            {NAV_LINKS.map((l) => (
              <button key={l.id} onClick={() => jump(l.id)} style={{
                display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                padding: "12px 2px", fontSize: 13.5, color: C.textSec, cursor: "pointer",
                borderBottom: `1px solid ${C.lineSoft}`, fontFamily: FONT_BODY,
              }}>{l.label}</button>
            ))}
            <button className="press" onClick={() => go("login")} style={{
              ...ghostBtn, width: "100%", padding: "12px 0", fontSize: 13.5, marginTop: 14,
            }}>ログイン</button>
          </div>
        )}
      </header>

      {/* ══════════════════════════════ ヒーロー ══════════════════════════════ */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background:
            "radial-gradient(70% 55% at 78% -8%, rgba(168,32,58,0.30), transparent 62%)," +
            "radial-gradient(58% 46% at 8% 12%, rgba(232,201,135,0.16), transparent 62%)",
        }} />
        <Section style={{ position: "relative", paddingTop: "clamp(52px, 8vw, 88px)", paddingBottom: "clamp(48px, 7vw, 76px)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 26 }}>
              <Pill icon={UsersRound}>{MIN_GROUP_SIZE}名以上のグループ同士</Pill>
              <Pill icon={DoorClosed}>オープンスペースのみ</Pill>
              <Pill icon={Wine}>{MIN_AGE}歳以上限定</Pill>
            </div>

            <h1 style={{
              fontFamily: FONT_HEAD, fontSize: "clamp(30px, 6.2vw, 60px)", fontWeight: 600,
              letterSpacing: 1.5, lineHeight: 1.42, margin: 0, color: C.text,
            }}>
              上質な夜を、<br />
              <span style={brandText}>グループでともに。</span>
            </h1>

            <p style={{
              fontSize: "clamp(13.5px, 1.7vw, 16px)", color: C.textSec, lineHeight: 2.1,
              margin: "24px auto 0", maxWidth: 560, letterSpacing: 0.4,
            }}>
              AISEKIは、友人と一緒に行くグループ同士をつなぐ相席サービスです。<br />
              1対1で向き合う気まずさも、素性の分からない不安もありません。
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 36 }}>
              <button className="lux-cta" onClick={() => go("signup")} style={{
                ...popBtn, padding: "16px 34px", fontSize: 15,
                display: "inline-flex", alignItems: "center", gap: 9,
              }}>
                <Sparkles size={17} strokeWidth={2} /> 無料ではじめる
              </button>
              <button className="press" onClick={() => jump("how")} style={{
                ...ghostBtn, padding: "16px 30px", fontSize: 15,
                display: "inline-flex", alignItems: "center", gap: 8,
              }}>
                使い方を見る <ArrowRight size={16} strokeWidth={2} />
              </button>
            </div>

            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7, marginTop: 22,
              fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4,
            }}>
              <Gem size={13} strokeWidth={1.9} color={C.primary} />
              新規登録で <b style={{ color: C.primaryDeep, fontWeight: 700 }}>{SIGNUP_BONUS.toLocaleString()}pt</b> プレゼント · そのまま参加できます
            </div>
          </div>

          {/* 端末モックアップ風のプレビュー */}
          <div style={{ marginTop: "clamp(44px, 6vw, 68px)", display: "flex", justifyContent: "center" }}>
            <div style={{
              ...card, width: "min(340px, 100%)", padding: 0, overflow: "hidden",
              borderRadius: 28, border: `1px solid ${C.linePrimary}`,
              boxShadow: "0 40px 90px rgba(0,0,0,0.72)",
            }}>
              <div style={{
                padding: "16px 20px", borderBottom: `1px solid ${C.line}`,
                background: "linear-gradient(180deg, rgba(232,201,135,0.10), transparent)",
                display: "flex", alignItems: "baseline", gap: 8,
              }}>
                <span style={{ fontFamily: FONT_LOGO, fontSize: 20, fontWeight: 600, letterSpacing: 3, ...brandText }}>AISEKI</span>
                <span style={{ fontFamily: FONT_HEAD, fontSize: 9.5, color: C.textMuted, letterSpacing: 1 }}>本日の募集中の会</span>
              </div>
              <div style={{ padding: 16 }}>
                {[
                  { t: "金曜の夜に、静かな一軒で", a: "恵比寿 · BAR TRENCH", h: 2, g: 3 },
                  { t: "week end 前夜祭", a: "中目黒 · 目黒川沿い", h: 3, g: 3 },
                ].map((p, i) => (
                  <div key={p.t} style={{
                    ...card, padding: 14, marginBottom: i === 0 ? 10 : 0,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: 0.2 }}>{p.t}</div>
                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 5, display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <MapPin size={12} strokeWidth={1.8} style={{ opacity: 0.8 }} />{p.a}
                        </div>
                      </div>
                      <span style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: "4px 11px", borderRadius: 999,
                        background: C.primaryGrad, color: "#241a06",
                      }}>◆ ゲストのおごり</span>
                    </div>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.lineSoft}`,
                    }}>
                      <span style={{ fontSize: 11, color: C.textSec, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <UsersRound size={12} strokeWidth={1.8} />ホスト{p.h}名 × 募集{p.g}名
                      </span>
                      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, ...brandText }}>
                        {JOIN_FEE.toLocaleString()}<span style={{ fontSize: 10, fontFamily: FONT_BODY }}> pt</span>
                      </span>
                    </div>
                  </div>
                ))}
                <div style={{
                  marginTop: 12, padding: "10px 12px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
                  display: "flex", gap: 8, alignItems: "flex-start",
                }}>
                  <Lock size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.7 }}>
                    一覧に出るのは会の情報だけ。参加者の写真・年齢は承認後にのみ表示されます。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ══════════════════════════════ AISEKIとは ══════════════════════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <div id="about" style={{ scrollMarginTop: 80 }} />
        <Heading
          eyebrow="What is AISEKI"
          sub="「相席居酒屋」と同じ形を、そのままアプリにしました。お店に着いてから相手が決まるのではなく、行く前にグループ同士で約束できます。"
        >
          知らない人と、でも<span style={brandText}>ひとりじゃなく</span>。
        </Heading>

        <div className="lp-grid-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="lux-card" style={{ ...card, padding: "26px 24px" }}>
              <span style={{
                width: 44, height: 44, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
              }}><p.icon size={20} strokeWidth={1.8} /></span>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 16.5, fontWeight: 600, color: C.text, letterSpacing: 0.4, marginTop: 18 }}>
                {p.title}
              </div>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 2, marginTop: 10, letterSpacing: 0.2 }}>
                {p.body}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════ 使い方 ══════════════════════════════ */}
      <Section style={{
        borderTop: `1px solid ${C.lineSoft}`,
        background: "linear-gradient(180deg, rgba(232,201,135,0.045), transparent 60%)",
      }}>
        <div id="how" style={{ scrollMarginTop: 80 }} />
        <Heading eyebrow="How it works" sub="登録から当日の待ち合わせまで、3ステップで完結します。">
          はじめ方は、かんたん。
        </Heading>

        <div className="lp-grid-3">
          {STEPS.map((s) => (
            <div key={s.n} style={{ ...card, padding: "26px 24px", position: "relative", overflow: "hidden" }}>
              <div style={{
                position: "absolute", top: -14, right: 10, fontFamily: FONT_DISPLAY,
                fontSize: 84, fontWeight: 700, lineHeight: 1, color: "rgba(232,201,135,0.07)", pointerEvents: "none",
              }}>{s.n}</div>
              <div style={{ position: "relative" }}>
                <Eyebrow style={{ letterSpacing: 2.4 }}>STEP {s.n}</Eyebrow>
                <div style={{ fontFamily: FONT_HEAD, fontSize: 16.5, fontWeight: 600, color: C.text, letterSpacing: 0.4, marginTop: 10 }}>
                  {s.t}
                </div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 2, marginTop: 10, letterSpacing: 0.2 }}>
                  {s.b}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 40 }}>
          <button className="lux-cta" onClick={() => go("signup")} style={{
            ...popBtn, padding: "15px 32px", fontSize: 14.5, display: "inline-flex", alignItems: "center", gap: 9,
          }}>
            <Sparkles size={16} strokeWidth={2} /> 無料でアカウントを作る
          </button>
        </div>
      </Section>

      {/* ══════════════════════════════ 特徴 ══════════════════════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <Heading eyebrow="Features" sub="安心して夜を過ごしてもらうために、あえて「できないこと」を決めています。">
          AISEKIの<span style={brandText}>決めごと</span>。
        </Heading>

        <div className="lp-grid-2">
          {FEATURES.map((f) => (
            <div key={f.t} style={{
              display: "flex", gap: 15, alignItems: "flex-start",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
              borderRadius: 16, padding: "20px 22px",
            }}>
              <span style={{
                flexShrink: 0, width: 38, height: 38, borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
              }}><f.icon size={17} strokeWidth={1.85} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{f.t}</div>
                <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.95, marginTop: 6 }}>{f.b}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════ 安全への取り組み ══════════════════════════════ */}
      <Section style={{
        borderTop: `1px solid ${C.lineSoft}`,
        background: "linear-gradient(180deg, rgba(168,32,58,0.07), transparent 55%)",
      }}>
        <div id="safety" style={{ scrollMarginTop: 80 }} />
        <Heading
          eyebrow="Safety & Compliance"
          sub="AISEKIは飲食を本質とするサービスです。異性交際を目的としたサービスではなく、インターネット異性紹介事業としての運営も行っていません。"
        >
          安心して過ごしていただくために。
        </Heading>

        <div style={{ ...card, padding: "clamp(24px, 4vw, 38px)", border: `1px solid ${C.linePrimary}` }}>
          <div className="lp-grid-2" style={{ gap: 20 }}>
            {[
              { t: "許認可を受けた店舗のみ", b: "会場となる提携店舗は、食品衛生法に基づく飲食店営業許可を受けた店舗に限られます。深夜0時以降も酒類を提供する店舗は、所轄警察署への深夜酒類提供飲食店営業の届出を行っています。" },
              { t: "接待は行いません", b: "従業員が客席に着いて談笑・酌などを行うことはありません。行うのは席へのご案内、注文、提供、会計といった通常の飲食店の業務のみです。" },
              { t: "サクラは在籍していません", b: "報酬を受けて客の相手をする人物は一切置いていません。登録されているのは、すべて一般のご利用者です。" },
              { t: "年齢確認を必須にしています", b: `登録時に生年月日の届け出を必須とし、${MIN_AGE}歳未満の方は登録できません。同伴者についても、登録する方に${MIN_AGE}歳以上であることの確認をお願いしています。` },
              { t: "個室を選べません", b: "相席の場所はオープンスペースに限定しています。会の作成画面で個室を選ぶことはできず、データベース側でも保存できないようにしています。" },
              { t: "困ったときの通報窓口", b: "会の場やチャットで不適切な行為があった場合、アプリ内から通報できます。調査のうえ、利用停止を含む措置を行います。" },
            ].map((x, i, arr) => (
              <div key={x.t} style={{
                paddingBottom: i < arr.length - 1 ? 4 : 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                  <Check size={15} strokeWidth={2.6} color={C.primary} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{x.t}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 2, paddingLeft: 24 }}>{x.b}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════ ポイント ══════════════════════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <div id="price" style={{ scrollMarginTop: 80 }} />
        <Heading
          eyebrow="Points"
          sub={`会を募集する側は無料で、いくつでも会を立てられます。参加を申し込むグループだけが、会にかかわらず1名あたり一律${JOIN_FEE.toLocaleString()}ptを使います。`}
        >
          参加は、<span style={brandText}>一律{JOIN_FEE.toLocaleString()}pt</span>。
        </Heading>

        {/* 募集する側の見返りは「必ずおごられること」。ここを曖昧にしない。 */}
        <div style={{
          ...card, maxWidth: 620, margin: "0 auto 18px", padding: "18px 20px",
          background: "linear-gradient(135deg, rgba(232,201,135,0.12), rgba(168,32,58,0.14))",
          border: `1px solid ${C.linePrimary}`,
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Wallet size={18} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
                募集した側は、必ずおごられます。
              </div>
              <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.9, marginTop: 5 }}>
                当日のホストグループの飲食代は、参加グループが負担する決まりです。
                募集する側はポイントも飲食代も支払いません。かわりに、ポイントによる報酬もありません
                （お支払いいただいたポイントは当社が受け取ります）。
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...card, padding: "clamp(22px, 3.5vw, 32px)", maxWidth: 620, margin: "0 auto" }}>
          {POINT_PACKS.map((p, i, arr) => {
            const bonus = packBonus(p);
            return (
              <div key={p.id} className="lux-row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                padding: "16px 8px", margin: "0 -8px", borderRadius: 10,
                borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, color: C.text }}>
                    {p.points.toLocaleString()}<span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span>
                  </span>
                  {bonus > 0 && (
                    <span style={{
                      fontSize: 10.5, color: C.textSec, padding: "3px 11px", borderRadius: 999,
                      background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
                    }}>+{bonus.toLocaleString()} ボーナス</span>
                  )}
                  {p.popular && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: "#241a06",
                      background: C.primaryGrad, padding: "3px 11px", borderRadius: 999,
                    }}>人気</span>
                  )}
                </div>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, ...brandText, whiteSpace: "nowrap" }}>
                  ¥{p.price.toLocaleString()}
                </span>
              </div>
            );
          })}
          <div style={{
            marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}`,
            fontSize: 11.5, color: C.textMuted, lineHeight: 1.95,
          }}>
            会への参加ポイントは全ての会で一律 {JOIN_FEE.toLocaleString()}pt（1名あたり）で、ホストが金額を設定することはできません。
            当日の飲食代は、ホストグループの分を含めて参加グループがお支払いください。
            ポイントの払い戻し・換金はできません。
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════ FAQ ══════════════════════════════ */}
      <Section style={{
        borderTop: `1px solid ${C.lineSoft}`,
        background: "linear-gradient(180deg, rgba(232,201,135,0.045), transparent 60%)",
      }}>
        <div id="faq" style={{ scrollMarginTop: 80 }} />
        <Heading eyebrow="FAQ">よくあるご質問</Heading>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {FAQ.map((item, i) => (
            <FaqItem key={item.q} item={item} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? -1 : i)} />
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════ 最後のCTA ══════════════════════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <div style={{
          ...card, padding: "clamp(36px, 6vw, 60px) clamp(24px, 5vw, 48px)", textAlign: "center",
          border: `1px solid ${C.linePrimary}`, position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "radial-gradient(85% 120% at 88% -20%, rgba(168,32,58,0.28), transparent 60%)," +
              "radial-gradient(70% 110% at 6% 120%, rgba(232,201,135,0.16), transparent 62%)",
          }} />
          <div style={{ position: "relative" }}>
            <Eyebrow style={{ letterSpacing: 2.6, marginBottom: 14 }}>◆ 今夜のグループを探す</Eyebrow>
            <div style={{
              fontFamily: FONT_HEAD, fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 600,
              color: C.text, letterSpacing: 0.7, lineHeight: 1.55,
            }}>
              はじめましてを、<span style={brandText}>特別な一夜に。</span>
            </div>
            <p style={{ fontSize: 13.5, color: C.textSec, lineHeight: 2, margin: "18px auto 0", maxWidth: 460 }}>
              登録は無料。いま登録すると {SIGNUP_BONUS.toLocaleString()}pt を差し上げています
              （参加{SIGNUP_BONUS_SEATS}名分。買い足さずに、そのまま今週末の会へ）。
              友人を招待すると、お二人ともさらに {REFERRAL_BONUS.toLocaleString()}pt です。
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
              <button className="lux-cta" onClick={() => go("signup")} style={{
                ...popBtn, padding: "16px 36px", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 9,
              }}>
                <Sparkles size={17} strokeWidth={2} /> 無料ではじめる
              </button>
              <button className="press" onClick={() => go("login")} style={{
                ...ghostBtn, padding: "16px 30px", fontSize: 15,
              }}>ログイン</button>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 18, letterSpacing: 0.4 }}>
              {MIN_AGE}歳未満の方はご利用いただけません
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════ フッター ══════════════════════════════ */}
      <footer style={{
        borderTop: `1px solid ${C.line}`,
        padding: "clamp(34px, 5vw, 52px) clamp(20px, 5vw, 40px) 44px",
        background: "rgba(4,7,14,0.5)",
      }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{
            display: "flex", gap: 26, flexWrap: "wrap", alignItems: "flex-start",
            justifyContent: "space-between", marginBottom: 28,
          }}>
            <div style={{ minWidth: 200 }}>
              <div style={{ fontFamily: FONT_LOGO, fontSize: 24, fontWeight: 600, letterSpacing: 3.6, ...brandText }}>AISEKI</div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 11, color: C.textMuted, letterSpacing: 1.4, marginTop: 6 }}>
                大人のグループ相席マッチング
              </div>
            </div>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.primaryDeep, letterSpacing: 1.8, marginBottom: 12 }}>SERVICE</div>
                {NAV_LINKS.map((l) => (
                  <button key={l.id} onClick={() => jump(l.id)} style={{
                    display: "block", background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                    fontSize: 12, color: C.textSec, fontFamily: FONT_BODY, letterSpacing: 0.3,
                  }}>{l.label}</button>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.primaryDeep, letterSpacing: 1.8, marginBottom: 12 }}>LEGAL</div>
                <button onClick={() => go("terms")} style={{
                  display: "block", background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                  fontSize: 12, color: C.textSec, fontFamily: FONT_BODY, letterSpacing: 0.3,
                }}>利用規約</button>
                <button onClick={() => go("terms")} style={{
                  display: "block", background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                  fontSize: 12, color: C.textSec, fontFamily: FONT_BODY, letterSpacing: 0.3,
                }}>プライバシーポリシー</button>
                <a href={`mailto:${CONTACT_EMAIL}`} style={{
                  display: "block", padding: "4px 0", fontSize: 12, color: C.textSec,
                  textDecoration: "none", letterSpacing: 0.3,
                }}>お問い合わせ</a>
              </div>
            </div>
          </div>

          <div style={{
            padding: "16px 18px", borderRadius: 14,
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

          <div style={{
            marginTop: 22, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            fontSize: 10.5, color: C.textFaint, letterSpacing: 0.5,
          }}>
            <span>規約最終改定: {LEGAL_UPDATED}</span>
            <span>© 2026 AISEKI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
