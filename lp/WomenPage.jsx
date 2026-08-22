/* ══════════════════════════════════════════════════════════════
   AISEKI — ランディングページ / 募集する側（おごられる側）向け

   訴求は「0円で、いい店のごはん」。
   AISEKI では、会を募集するホストグループはポイントを使わず、
   当日の飲食代も相席する参加グループが負担する（＝必ずおごられる）。
   その一点だけを最後まで押す。

   ⚠ 誠実さの線引き
     AISEKI は性別を一切登録しない（登録項目に無い）。
     したがって「女性は無料」ではなく「募集する側は無料」が事実。
     広告の宛先は女性だが、ページ上の説明は必ず
     「募集する側（ホスト）／参加する側（ゲスト）」で書くこと。
     FAQ にもその旨を明記してある（消さないこと）。
   ══════════════════════════════════════════════════════════════ */
import {
  Wallet, UsersRound, ShieldCheck, Sparkles, Lock, DoorClosed,
  Wine, Check, MessageCircle,
} from "lucide-react";
import { C, FONT_HEAD, FONT_DISPLAY, brandText, card } from "../src/lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
} from "../src/lib/pricing.js";
import {
  LpPage, LpHeader, LpFooter, Section, Heading, Pill, CtaLink, GhostLink,
  FeatureCard, StepCard, Faq, CtaSection, HeroGlow, signupUrl,
} from "./LpKit.jsx";

const FROM = "lp-women";
const CTA = "無料で始める";
const CTA_HREF = signupUrl(FROM);

const GLOW =
  "radial-gradient(72% 56% at 80% -10%, rgba(200,69,92,0.26), transparent 62%)," +
  "radial-gradient(60% 48% at 6% 10%, rgba(232,201,135,0.20), transparent 62%)";

const FEATURES = [
  {
    icon: Wallet,
    title: "0円で、いいお店へ。",
    body: "会を募集する側（ホスト）にポイントはかかりません。当日のホストグループの飲食代も、相席する参加グループが負担する決まりです。",
    note: `参加する側は1名あたり一律${JOIN_FEE.toLocaleString()}pt＋当日のお会計。募集する側は、どちらも支払いません。`,
  },
  {
    icon: UsersRound,
    title: "友だちと一緒。1対1になりません。",
    body: `会が成立するのは${MIN_GROUP_SIZE}名以上のグループ同士だけ。二人きりで向き合う気まずさがなく、相席の席はフロア席・カウンターなど店内を見渡せる場所に限られます。`,
    note: "個室・半個室での相席は、システム上そもそも選べません。",
  },
  {
    icon: ShieldCheck,
    title: "見せない。つながない。すぐ通報。",
    body: "名前も写真も、同じ会に参加が承認されたメンバーにしか表示されません。個人間のダイレクトメッセージ機能はなく、やり取りは会ごとのグループチャットだけです。",
    note: `困ったときは通報とブロック。${MIN_AGE}歳以上限定・接待なし・サクラなしで運営しています。`,
  },
];

const STEPS = [
  {
    n: "01",
    title: "友だちを誘って、登録する",
    body: `メールアドレスと生年月日だけ（${MIN_AGE}歳以上）。一緒に行く友だちはニックネームを登録するだけでよく、その場にアプリが入っていなくても参加できます。`,
  },
  {
    n: "02",
    title: "会をつくって、募集する",
    body: "行きたいエリア・日時・人数を決めて公開するだけ。会はいくつ立てても無料で、募集を取り下げるのも自由です。",
  },
  {
    n: "03",
    title: "承認した相手とだけ、当日お店へ",
    body: "届いたリクエストの中から、いいなと思ったグループだけを承認。成立するとグループチャットが開き、待ち合わせもそこで決められます。",
  },
];

const FAQ = [
  {
    q: "本当に、いっさい払わなくていいのですか？",
    a: `はい。会を募集する側（ホスト）は、ポイントを使いません。当日のホストグループの飲食代も、相席する参加グループが負担する決まりです。そのかわり、募集する側がポイントなどの報酬を受け取ることもありません（AISEKIのポイントに換金性はありません）。`,
  },
  {
    q: "「女性向け」とありますが、性別を登録するのですか？",
    a: "いいえ。AISEKIは性別を一切登録しません。このページで「おごられる側」と呼んでいるのは、会を募集するホストグループのことです。性別による制限や表示はなく、同性グループ同士の会も等しく成立します。",
  },
  {
    q: "ひとりでも参加できますか？",
    a: `いいえ。AISEKIは${MIN_GROUP_SIZE}名以上のグループ同士でのみ会が成立します。1対1のマッチングは、システム上どうしても作れないようになっています。同伴者が当日アプリを入れていなくても、代表者が人数分の席を確保すれば大丈夫です。`,
  },
  {
    q: "顔写真や名前は、誰に見られますか？",
    a: "募集の一覧や詳細に出るのは、会の内容（エリア・お店・時間・人数）とニックネームまでです。写真・年齢は、同じ会への参加が承認されたメンバーだけが見られます。誰でも見られる場所には出しません。",
  },
  {
    q: "気が進まないリクエストは、断れますか？",
    a: "断れます。参加リクエストは承認制で、承認しないかぎり相手に何も伝わりません。合わない相手はブロックでき、不適切な行為があればアプリ内から通報できます。調査のうえ、利用停止を含む措置を行います。",
  },
  {
    q: "個室で二人きり、ということはありますか？",
    a: "ありません。相席は店内を見渡せるオープンスペースのみで、個室・半個室での相席はいかなる場合も提供していません。会の作成画面で個室を選ぶことはできず、データベース側でも保存できないようにしています。",
  },
  {
    q: "出会い系アプリとは違うのですか？",
    a: "違います。AISEKIは、いわゆる「相席居酒屋」と同じく、グループ同士で飲食店の同じ卓に着くためのサービスです。異性交際を目的としたサービスではなく、インターネット異性紹介事業としての運営も行っていません。1対1で会うことを目的とした利用は規約違反として対応します。",
  },
];

/* ヒーローの横に置く「支払い0円」の内訳。数字で見せたほうが早い。 */
const BillCard = () => (
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
        募集した側のお支払い
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: "4px 11px", borderRadius: 999,
        background: C.primaryGrad, color: "#241a06",
      }}>◆ ゲストのおごり</span>
    </div>

    <div style={{ padding: "18px 20px 20px" }}>
      {[
        { t: "会をつくる", v: "無料", s: "いくつ立てても0pt" },
        { t: "参加ポイント", v: "0 pt", s: `支払うのは参加する側（1名 ${JOIN_FEE.toLocaleString()}pt）` },
        { t: "当日の飲食代", v: "0 円", s: "ホストグループの分は参加グループが負担" },
      ].map((r, i) => (
        <div key={r.t} style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
          padding: "13px 0", borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: 0.3 }}>{r.t}</div>
            <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.7, marginTop: 4 }}>{r.s}</div>
          </div>
          <span style={{
            flexShrink: 0, fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, ...brandText,
          }}>{r.v}</span>
        </div>
      ))}

      <div style={{
        marginTop: 6, padding: "12px 14px", borderRadius: 12,
        background: "rgba(232,201,135,0.09)", border: `1px solid ${C.linePrimary}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>合計</span>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 700, ...brandText }}>¥0</span>
      </div>

      <div style={{
        marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start",
        fontSize: 10.5, color: C.textMuted, lineHeight: 1.75,
      }}>
        <Lock size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>写真・年齢が表示されるのは、参加が承認されたメンバーの間だけです。</span>
      </div>
    </div>
  </div>
);

export default function WomenPage() {
  return (
    <LpPage>
      <LpHeader tagline="おごられる側の相席" ctaLabel={CTA} ctaHref={CTA_HREF} />

      {/* ══════════════ ヒーロー ══════════════ */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <HeroGlow background={GLOW} />
        <Section style={{ position: "relative", paddingTop: "clamp(44px, 7vw, 78px)", paddingBottom: "clamp(40px, 6vw, 68px)" }}>
          <div className="lp-hero">
            <div className="lp-hero-copy">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
                <Pill icon={Wallet}>参加ポイント 0pt</Pill>
                <Pill icon={UsersRound}>{MIN_GROUP_SIZE}名以上のグループで</Pill>
                <Pill icon={Wine}>{MIN_AGE}歳以上限定</Pill>
              </div>

              <h1 style={{
                /* 1行が折り返さない大きさに収める（日本語は途中で折れると読みにくい） */
                fontFamily: FONT_HEAD, fontSize: "clamp(23px, 5.4vw, 40px)", fontWeight: 600,
                letterSpacing: 1, lineHeight: 1.5, margin: 0, color: C.text,
              }}>
                今夜のごはんは、<br />
                <span style={brandText}>ぜんぶ、おごられる。</span>
              </h1>

              <p style={{
                fontSize: "clamp(13.5px, 1.7vw, 15.5px)", color: C.textSec, lineHeight: 2.1,
                margin: "22px 0 0", maxWidth: 520, letterSpacing: 0.4,
              }}>
                AISEKIは、友だちと{MIN_GROUP_SIZE}名以上で「会」を立てて、相席するグループを迎えるサービス。
                募集する側は、ポイントも当日の飲食代も払いません。登録はもちろん無料です。
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
                <CtaLink href={CTA_HREF} size="lg" icon={Sparkles}>{CTA}</CtaLink>
                <GhostLink href="#how">使い方を見る</GhostLink>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 7, marginTop: 20,
                fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4, lineHeight: 1.9,
              }}>
                <Check size={13} strokeWidth={2.2} color={C.primary} style={{ flexShrink: 0 }} />
                <span>登録1分・カード不要・性別の登録なし</span>
              </div>
            </div>

            <div className="lp-hero-visual">
              <BillCard />
            </div>
          </div>
        </Section>
      </div>

      {/* ══════════════ 特徴3つ ══════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <Heading
          eyebrow="Why AISEKI"
          sub="お金の心配も、二人きりの気まずさも、素性の分からない不安も。先に全部なくしてあります。"
        >
          気楽なほうの、<span style={brandText}>相席。</span>
        </Heading>
        <div className="lp-grid-3">
          {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>

        {/* 安全側の要点は、カードの外にもう一段だけ短く置く */}
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
        <div style={{ textAlign: "center", marginTop: 36 }}>
          <CtaLink href={CTA_HREF} icon={Sparkles}>{CTA}</CtaLink>
        </div>
      </Section>

      {/* ══════════════ よくある質問 ══════════════ */}
      <Section style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <Heading eyebrow="FAQ">よくあるご質問</Heading>
        <Faq items={FAQ} />
      </Section>

      {/* ══════════════ 最後のCTA ══════════════ */}
      <CtaSection
        eyebrow="◆ 今夜の予定を、贅沢に"
        title={<>ごはん代0円で、<span style={brandText}>はじめまして。</span></>}
        body="登録は無料。友だちと会を立てて、気に入ったグループのリクエストだけを承認してください。当日のお会計は、相席するグループが持ちます。"
        ctaLabel={CTA}
        ctaHref={CTA_HREF}
        icon={Sparkles}
        glow={GLOW}
      />

      <LpFooter />
    </LpPage>
  );
}
