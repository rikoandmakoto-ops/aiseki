/* ══════════════════════════════════════════════════════════════
   AISEKI — ランディングページ / 募集する側（おごられる側）向け

   訴求は「0円で、いい店のごはん」。
   AISEKI では、会を募集するホストグループはポイントを使わず、
   当日の飲食代も相席する参加グループが負担する（＝必ずおごられる）。
   その一点だけを最後まで押す。

   ⚠ 誠実さの線引き
     AISEKI は登録時に性別を選ぶが、それは「募集中の会へメッセージを
     送れるか」の判定に使うだけで、料金にも参加条件にも一切関係しない。
     したがって「女性は無料」ではなく「募集する側は無料」が事実。
     広告の宛先は女性だが、ページ上の説明は必ず
     「募集する側（ホスト）／参加する側（ゲスト）」で書くこと。
     FAQ にもその旨を明記してある（消さないこと）。

   ⚠ 見た目は LpKit.jsx の方針に従う（光らせない・並べない・中央に置かない）。
   ══════════════════════════════════════════════════════════════ */
import { Wallet, UsersRound, ShieldCheck, Wine, Lock } from "lucide-react";
import { C, FONT_HEAD, FONT_DISPLAY } from "../src/lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
} from "../src/lib/pricing.js";
import {
  LpPage, LpHeader, LpFooter, Section, Heading, Pill, CtaLink, GhostLink,
  FeatureList, StepList, TrustBadges, Faq, CtaSection, signupUrl, panel, RULE, RULE_SOFT,
} from "./LpKit.jsx";

const FROM = "lp-women";
const CTA = "無料で始める";
const CTA_HREF = signupUrl(FROM);

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
    q: "「女性向け」とありますが、性別で料金が変わるのですか？",
    a: "いいえ。無料になるのは「募集する側（ホスト）」で、性別は関係ありません。このページで「おごられる側」と呼んでいるのは、会を募集するホストグループのことです。登録時に性別は選んでいただきますが、これは募集中の会へメッセージ（アプローチ）を送れるかどうかの判定にのみ使います。性別が他のユーザーに表示されることはなく、会の参加条件にもならないため、同性グループ同士の会も等しく成立します。",
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

/* ヒーローの横に置く「支払い0円」の内訳。文章より、数字を並べたほうが早い。
   伝票のつもりなので、飾らずに罫と数字だけで組む。 */
const BillCard = () => (
  <div style={{ ...panel, padding: "20px 22px 22px" }}>
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
      paddingBottom: 14, borderBottom: `1px solid ${RULE}`,
    }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>
        募集した側のお支払い
      </span>
      <span style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.4 }}>ゲストのおごり</span>
    </div>

    {[
      { t: "会をつくる", v: "無料", s: "いくつ立てても0pt" },
      { t: "参加ポイント", v: "0 pt", s: `支払うのは参加する側（1名 ${JOIN_FEE.toLocaleString()}pt）` },
      { t: "当日の飲食代", v: "0 円", s: "ホストグループの分は参加グループが負担" },
    ].map((r, i) => (
      <div key={r.t} style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14,
        padding: "13px 0", borderTop: i === 0 ? "none" : `1px solid ${RULE_SOFT}`,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, letterSpacing: 0.3 }}>{r.t}</div>
          <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.7, marginTop: 4 }}>{r.s}</div>
        </div>
        <span style={{
          flexShrink: 0, fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, color: C.text,
        }}>{r.v}</span>
      </div>
    ))}

    {/* 金を使うのはこの1行だけ。ページで最も強い数字。 */}
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10,
      paddingTop: 15, marginTop: 4, borderTop: `1px solid ${RULE}`,
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>合計</span>
      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: C.primary }}>¥0</span>
    </div>

    <div style={{
      marginTop: 15, display: "flex", gap: 8, alignItems: "flex-start",
      fontSize: 10.5, color: C.textMuted, lineHeight: 1.75,
    }}>
      <Lock size={12} strokeWidth={1.7} color={C.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>写真・年齢が表示されるのは、参加が承認されたメンバーの間だけです。</span>
    </div>
  </div>
);

export default function WomenPage() {
  return (
    <LpPage>
      <LpHeader tagline="おごられる側の相席" ctaLabel={CTA} ctaHref={CTA_HREF} />

      {/* ══════════════ ヒーロー ══════════════ */}
      <Section pad="clamp(48px, 7vw, 92px)">
        <div className="lph">
          <div>
            <h1 style={{
              /* 1行が折り返さない大きさに収める（日本語は途中で折れると読みにくい） */
              fontFamily: FONT_HEAD, fontSize: "clamp(24px, 4.6vw, 38px)", fontWeight: 600,
              letterSpacing: 0.8, lineHeight: 1.52, margin: 0, color: C.text,
            }}>
              今夜のごはんは、<br />
              <span style={{ color: C.primary }}>ぜんぶ、おごられる。</span>
            </h1>

            <p style={{
              fontSize: "clamp(13.5px, 1.6vw, 15px)", color: C.textSec, lineHeight: 2.05,
              margin: "22px 0 0", maxWidth: 500, letterSpacing: 0.4,
            }}>
              AISEKIは、友だちと{MIN_GROUP_SIZE}名以上で「会」を立てて、相席するグループを迎えるサービス。
              募集する側は、ポイントも当日の飲食代も払いません。登録はもちろん無料です。
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap", marginTop: 32 }}>
              <CtaLink href={CTA_HREF} size="lg">{CTA}</CtaLink>
              <GhostLink href="#how">使い方を見る</GhostLink>
            </div>

            <div style={{ marginTop: 18, fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4 }}>
              登録1分・カード不要・募集する側は0pt
            </div>

            <div style={{
              display: "flex", flexWrap: "wrap", gap: "8px 20px", marginTop: 30,
              paddingTop: 17, borderTop: `1px solid ${RULE_SOFT}`,
            }}>
              <Pill icon={Wallet}>参加ポイント 0pt</Pill>
              <Pill icon={UsersRound}>{MIN_GROUP_SIZE}名以上のグループで</Pill>
              <Pill icon={Wine}>{MIN_AGE}歳以上限定</Pill>
            </div>
          </div>

          <div className="lph-visual">
            <BillCard />
          </div>
        </div>
      </Section>

      {/* ══════════════ 特徴 ══════════════ */}
      <Section tone="sunken" divider pad="clamp(56px, 7.5vw, 92px)">
        <div className="lp-split">
          <Heading
            eyebrow="Why AISEKI"
            sub="お金の心配も、二人きりの気まずさも、素性の分からない不安も。先に全部なくしてあります。"
          >
            気楽なほうの、相席。
          </Heading>
          <div>
            <FeatureList items={FEATURES} />
            <TrustBadges
              items={["個室での相席なし", "個人間DMなし", "接待・サクラなし", `${MIN_AGE}歳以上限定`]}
            />
          </div>
        </div>
      </Section>

      {/* ══════════════ 使い方 ══════════════ */}
      <Section id="how" divider pad="clamp(52px, 7vw, 88px)">
        <Heading eyebrow="How it works" sub="登録から当日の待ち合わせまで、3ステップで完結します。">
          はじめ方は、かんたん。
        </Heading>
        <div style={{ marginTop: 38 }}>
          <StepList items={STEPS} />
        </div>
        <div style={{ marginTop: 34 }}>
          <CtaLink href={CTA_HREF}>{CTA}</CtaLink>
        </div>
      </Section>

      {/* ══════════════ よくある質問 ══════════════ */}
      <Section divider pad="clamp(50px, 6.5vw, 80px)">
        <div className="lp-split">
          <Heading eyebrow="FAQ">よくあるご質問</Heading>
          <Faq items={FAQ} />
        </div>
      </Section>

      {/* ══════════════ 最後のCTA ══════════════ */}
      <CtaSection
        eyebrow="今夜の予定を"
        title="ごはん代0円で、はじめまして。"
        body="登録は無料。友だちと会を立てて、気に入ったグループのリクエストだけを承認してください。当日のお会計は、相席するグループが持ちます。"
        ctaLabel={CTA}
        ctaHref={CTA_HREF}
      />

      <LpFooter />
    </LpPage>
  );
}
