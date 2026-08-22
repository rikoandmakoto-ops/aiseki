/* ══════════════════════════════════════════════════════════════
   AISEKI — ランディングページ / 参加する側（相席する側）向け

   訴求は「グループだから気軽に相席できる」。
   会は募集中の一覧から選んでリクエストする。料金は会にかかわらず
   1名あたり一律 3,800pt で、ホストが金額を上乗せすることはできない。

   ⚠ 隠さないこと（あとで揉めるため、ここに全部書く）
     ・当日のホストグループの飲食代は、参加グループが負担する。
     ・ポイントは承認された時点で消費される（未承認なら消費されない）。
     ・払い戻し・換金はできない。
     ・「出会い」はグループ同士の相席のこと。1対1の紹介は行わない
       （インターネット異性紹介事業としての運営は行っていない）。
   ══════════════════════════════════════════════════════════════ */
import {
  UsersRound, Search, Wallet, Sparkles, MapPin, Wine, Check,
  MessageCircle, DoorClosed, ShieldCheck,
} from "lucide-react";
import { C, FONT_HEAD, FONT_DISPLAY, FONT_BODY, brandText, card } from "../lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
  SIGNUP_BONUS, SIGNUP_BONUS_SEATS,
} from "../lib/pricing.js";
import { POINT_PACKS, packBonus } from "../lib/packs.js";
import {
  LpPage, LpHeader, LpFooter, Section, Heading, Pill, CtaLink, GhostLink,
  FeatureCard, StepCard, Faq, CtaSection, HeroGlow, signupUrl,
} from "./LpKit.jsx";

const FROM = "lp-men";
const CTA = "相席を始める";
const CTA_HREF = signupUrl(FROM);

const GLOW =
  "radial-gradient(70% 54% at 12% -8%, rgba(168,32,58,0.30), transparent 62%)," +
  "radial-gradient(62% 50% at 90% 16%, rgba(232,201,135,0.18), transparent 62%)";

const FEATURES = [
  {
    icon: UsersRound,
    title: "グループ同士だから、ハードルが低い。",
    body: `会が成立するのは${MIN_GROUP_SIZE}名以上のグループ同士だけ。1対1で向き合う気まずさがなく、友だちと一緒だから初対面でも会話が続きます。`,
    note: "相席は店内を見渡せるオープンスペースのみ。個室・半個室は選べません。",
  },
  {
    icon: Search,
    title: "好みのグループを見つけて、リクエスト。",
    body: "渋谷・恵比寿・中目黒・六本木・西麻布・銀座・新宿。エリアと日時、人数から募集中の会を探して、行きたい会にだけ人数を選んで申し込みます。",
    note: "承認されるとグループチャットが開き、待ち合わせもそこで決められます。",
  },
  {
    icon: Wallet,
    title: "料金は一律。会ごとの上乗せなし。",
    body: `参加ポイントは、どの会でも1名あたり一律${JOIN_FEE.toLocaleString()}pt。ホストが金額を設定することはできません。承認された時点で消費され、承認されなければ消費されません。`,
    note: `当日のお会計は、ホストグループの分を含めて参加グループの負担です（1pt = 1円）。`,
  },
];

const STEPS = [
  {
    n: "01",
    title: "友だちと登録する",
    body: `メールアドレスと生年月日だけ（${MIN_AGE}歳以上）。いま登録すると${SIGNUP_BONUS.toLocaleString()}pt（参加${SIGNUP_BONUS_SEATS}名分）を差し上げているので、買い足さずにそのまま申し込めます。`,
  },
  {
    n: "02",
    title: "会を探して、リクエストする",
    body: "募集中の会からエリア・日時で絞り込み、参加する人数を選んで申し込みます。同伴者はニックネームの登録だけでよく、アプリを入れていなくても大丈夫です。",
  },
  {
    n: "03",
    title: "承認されたら、当日お店で",
    body: "ホストが承認した時点で会が成立し、参加メンバー全員のグループチャットが始まります。あとは待ち合わせて、席に着くだけ。",
  },
];

const FAQ = [
  {
    q: "いくらかかりますか？",
    a: `参加ポイントは、会にかかわらず1名あたり一律${JOIN_FEE.toLocaleString()}pt（1pt = 1円）です。新規登録で${SIGNUP_BONUS.toLocaleString()}pt（参加${SIGNUP_BONUS_SEATS}名分）を差し上げているので、はじめの何回かは買い足さずに参加できます。`,
  },
  {
    q: "ポイント以外に、当日かかるお金はありますか？",
    a: "当日の飲食代がかかります。AISEKIでは、ホストグループの飲食代を参加グループが負担する決まりです。お店でのお会計は、ホストの分を含めて参加グループでお支払いください。金額はお店とご注文によります。",
  },
  {
    q: "ポイントはいつ減りますか？ 断られたら？",
    a: "ポイントが消費されるのは、ホストが参加を承認した時点です。承認されなかった場合や、承認前に取り下げた場合は消費されません。なお、購入済みポイントの払い戻し・換金はできません。",
  },
  {
    q: "ひとりで申し込めますか？",
    a: `いいえ。参加は${MIN_GROUP_SIZE}名以上のグループ単位です。1対1のマッチングは、システム上どうしても作れないようになっています。同伴者が当日アプリを入れていなくても、代表者が人数分の席を確保すれば参加できます。`,
  },
  {
    q: "相手の顔写真は事前に見られますか？",
    a: "見られません。募集の一覧・詳細で表示されるのは、会の内容（エリア・お店・時間・人数）とホストのニックネームまでです。参加者の写真・年齢は、参加が承認されたあとに会の画面で確認できます。これはお互いさまの仕組みです。",
  },
  {
    q: "サクラや、キャストはいませんか？",
    a: "一切いません。当社および提携店舗が報酬を支払って客の相手をさせる人物は在籍していません。相手は常に一般のご利用者です。店舗の従業員が客席に着いて談笑・酌などを行う「接待」も行いません。",
  },
  {
    q: "出会い系アプリとは違うのですか？",
    a: "違います。AISEKIは、いわゆる「相席居酒屋」と同じく、グループ同士で飲食店の同じ卓に着くためのサービスです。異性交際を目的としたサービスではなく、インターネット異性紹介事業としての運営も行っていません。1対1で会うことを目的とした利用は規約違反として対応します。",
  },
];

/* 募集中の会の見え方。文章より、これを1枚見せたほうが早い。 */
const PartyPreview = () => (
  <div style={{
    ...card, width: "min(360px, 100%)", padding: 0, overflow: "hidden",
    borderRadius: 24, border: `1px solid ${C.linePrimary}`,
    boxShadow: "0 36px 84px rgba(0,0,0,0.7)",
  }}>
    <div style={{
      padding: "15px 20px", borderBottom: `1px solid ${C.line}`,
      background: "linear-gradient(180deg, rgba(232,201,135,0.12), transparent)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, letterSpacing: 0.6, color: C.text }}>
        本日、募集中の会
      </span>
      <span style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.4 }}>東京 · 7エリア</span>
    </div>

    <div style={{ padding: 16 }}>
      {[
        { t: "金曜の夜に、静かな一軒で", a: "恵比寿 · BAR TRENCH", h: 2, g: 2 },
        { t: "week end 前夜祭", a: "中目黒 · 目黒川沿い", h: 3, g: 3 },
      ].map((p, i) => (
        <div key={p.t} style={{ ...card, padding: 14, marginBottom: i === 0 ? 10 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: 0.2 }}>
                {p.t}
              </div>
              <div style={{ fontSize: 11, color: C.textSec, marginTop: 5, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <MapPin size={12} strokeWidth={1.8} style={{ opacity: 0.8 }} />{p.a}
              </div>
            </div>
            <span style={{
              flexShrink: 0, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: "4px 11px",
              borderRadius: 999, background: C.primaryGrad, color: "#241a06",
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
              <span style={{ fontSize: 10, fontFamily: FONT_BODY, color: C.textMuted, fontWeight: 500 }}> /1名</span>
            </span>
          </div>
        </div>
      ))}

      <div style={{
        marginTop: 12, padding: "10px 12px", borderRadius: 12,
        background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
        display: "flex", gap: 8, alignItems: "flex-start",
      }}>
        <Check size={12} strokeWidth={2.2} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.7 }}>
          ポイントが減るのは、ホストに承認されたときだけ。申し込んだ時点では減りません。
        </span>
      </div>
    </div>
  </div>
);

/* ポイントの表。単価の出典は src/lib/packs.js（アプリの購入画面と同じ）。 */
const PointTable = () => (
  <div style={{ ...card, padding: "clamp(20px, 3.5vw, 30px)", maxWidth: 620, margin: "0 auto" }}>
    {POINT_PACKS.map((p, i, arr) => {
      const bonus = packBonus(p);
      return (
        <div key={p.id} className="lux-row" style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          padding: "15px 8px", margin: "0 -8px", borderRadius: 10,
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
      marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`,
      fontSize: 11.5, color: C.textMuted, lineHeight: 1.95,
    }}>
      参加ポイントは全ての会で一律 {JOIN_FEE.toLocaleString()}pt（1名あたり）で、ホストが金額を設定することはできません。
      当日の飲食代は、ホストグループの分を含めて参加グループがお支払いください。
      ポイントの払い戻し・換金はできません。
    </div>
  </div>
);

export default function MenPage() {
  return (
    <LpPage>
      <LpHeader tagline="グループで行く相席" ctaLabel={CTA} ctaHref={CTA_HREF} />

      {/* ══════════════ ヒーロー ══════════════ */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <HeroGlow background={GLOW} />
        <Section style={{ position: "relative", paddingTop: "clamp(44px, 7vw, 78px)", paddingBottom: "clamp(40px, 6vw, 68px)" }}>
          <div className="lp-hero">
            <div className="lp-hero-copy">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
                <Pill icon={UsersRound}>{MIN_GROUP_SIZE}名以上のグループ同士</Pill>
                <Pill icon={Wallet}>1名 一律{JOIN_FEE.toLocaleString()}pt</Pill>
                <Pill icon={Wine}>{MIN_AGE}歳以上限定</Pill>
              </div>

              <h1 style={{
                /* 1行が折り返さない大きさに収める（日本語は途中で折れると読みにくい）。
                   いちばん長い行は「グループだから、気軽に。」の12文字。 */
                fontFamily: FONT_HEAD, fontSize: "clamp(23px, 5.4vw, 40px)", fontWeight: 600,
                letterSpacing: 1, lineHeight: 1.5, margin: 0, color: C.text,
              }}>
                相席で、<span style={brandText}>出会う。</span><br />
                グループだから、気軽に。
              </h1>

              <p style={{
                fontSize: "clamp(13.5px, 1.7vw, 15.5px)", color: C.textSec, lineHeight: 2.1,
                margin: "22px 0 0", maxWidth: 520, letterSpacing: 0.4,
              }}>
                友だちと{MIN_GROUP_SIZE}名以上で、募集中の会にリクエストするだけ。
                お店に着いてから相手が決まるのではなく、行く前にグループ同士で約束できます。
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
                <CtaLink href={CTA_HREF} size="lg" icon={Sparkles}>{CTA}</CtaLink>
                <GhostLink href="#price">ポイントを見る</GhostLink>
              </div>

              {/* 文の途中で折り返しても崩れないよう、アイコン以外は1つの span にまとめる */}
              <div style={{
                display: "flex", alignItems: "center", gap: 7, marginTop: 20,
                fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4, lineHeight: 1.9,
              }}>
                <Check size={13} strokeWidth={2.2} color={C.primary} style={{ flexShrink: 0 }} />
                <span>
                  新規登録で <b style={{ color: C.primaryDeep, fontWeight: 700 }}>{SIGNUP_BONUS.toLocaleString()}pt</b>
                  （参加{SIGNUP_BONUS_SEATS}名分）· そのまま申し込めます
                </span>
              </div>
            </div>

            <div className="lp-hero-visual">
              <PartyPreview />
            </div>
          </div>
        </Section>
      </div>

      {/* ══════════════ 特徴3つ ══════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <Heading
          eyebrow="Why AISEKI"
          sub="相席居酒屋の「行ってみないと分からない」を、先に分かるようにしただけです。"
        >
          待たない、探せる、<span style={brandText}>明朗会計。</span>
        </Heading>
        <div className="lp-grid-3">
          {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>

        <div style={{
          ...card, marginTop: 22, padding: "18px 20px",
          display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center",
        }}>
          {[
            { icon: DoorClosed, t: "個室での相席なし" },
            { icon: MessageCircle, t: "個人間DMなし" },
            { icon: ShieldCheck, t: "接待・サクラなし" },
            { icon: Wine, t: `${MIN_AGE}歳以上限定` },
          ].map((x) => (
            <span key={x.t} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 12, color: C.textSec, letterSpacing: 0.3,
            }}>
              <x.icon size={14} strokeWidth={1.9} color={C.primary} />{x.t}
            </span>
          ))}
        </div>
      </Section>

      {/* ══════════════ 使い方 ══════════════ */}
      <Section
        id="how"
        style={{
          borderTop: `1px solid ${C.lineSoft}`,
          background: "linear-gradient(180deg, rgba(232,201,135,0.05), transparent 60%)",
        }}
      >
        <Heading eyebrow="How it works" sub="登録から当日の待ち合わせまで、3ステップで完結します。">
          はじめ方は、かんたん。
        </Heading>
        <div className="lp-grid-3">
          {STEPS.map((s) => <StepCard key={s.n} {...s} />)}
        </div>
      </Section>

      {/* ══════════════ ポイント ══════════════ */}
      <Section id="price" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <Heading
          eyebrow="Points"
          sub={`会にかかわらず、参加は1名あたり一律${JOIN_FEE.toLocaleString()}pt（1pt = 1円）。まとめて買うほど1ptあたりが安くなります。`}
        >
          参加は、<span style={brandText}>一律{JOIN_FEE.toLocaleString()}pt</span>。
        </Heading>
        <PointTable />
        <div style={{ textAlign: "center", marginTop: 34 }}>
          <CtaLink href={CTA_HREF} icon={Sparkles}>{CTA}</CtaLink>
        </div>
      </Section>

      {/* ══════════════ よくある質問 ══════════════ */}
      <Section style={{
        borderTop: `1px solid ${C.lineSoft}`,
        background: "linear-gradient(180deg, rgba(232,201,135,0.045), transparent 60%)",
      }}>
        <Heading eyebrow="FAQ">よくあるご質問</Heading>
        <Faq items={FAQ} />
      </Section>

      {/* ══════════════ 最後のCTA ══════════════ */}
      <CtaSection
        eyebrow="◆ 今夜のグループを探す"
        title={<>はじめましてを、<span style={brandText}>特別な一夜に。</span></>}
        body={`登録は無料。いま登録すると${SIGNUP_BONUS.toLocaleString()}pt（参加${SIGNUP_BONUS_SEATS}名分）を差し上げています。友だちを招待すると、お二人ともさらにポイントが増えます。`}
        ctaLabel={CTA}
        ctaHref={CTA_HREF}
        icon={Sparkles}
        glow={GLOW}
      />

      <LpFooter />
    </LpPage>
  );
}
