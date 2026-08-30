/* ══════════════════════════════════════════════════════════════
   AISEKI — ランディングページ / 募集する側（おごられる側）向け

   訴求は「0円で相席できて、あたらしい出会いが見つかる」。
   AISEKI では、会を募集するホストグループはポイントを使わず、
   当日の飲食代も相席する参加グループが負担する（＝必ずおごられる）。
   その「0円」を土台に、届いたリクエストから選べることを押す。

   ⚠ 誠実さの線引き
     AISEKI は登録時に性別を選ぶが、それは「募集中の会へメッセージを
     送れるか」の判定に使うだけで、料金にも参加条件にも一切関係しない。
     したがって「女性は無料」ではなく「募集する側は無料」が事実。
     広告の宛先は分けていても、ページ上の説明は必ず
     「募集する側（ホスト）／参加する側（ゲスト）」で書くこと。
     FAQ にもその旨を明記してある（消さないこと）。

   ⚠ 「出会い」の書き方（HANDOFF.md §10 / src/lib/legal.js と読み合わせること）
     ここで言う出会いは「グループ同士で同じ卓に着くこと」。
     1対1の紹介ではなく、異性交際を目的としたサービスでもない
     （インターネット異性紹介事業としての運営は行っていない）。
     FAQ の「出会い系アプリとは違うのですか？」は必ず残す。

   ⚠ 見た目は LpKit.jsx の方針に従う（光らせない・並べない・中央に置かない）。
     レイアウトはスマホが既定で、広い画面に min-width で足していく。
   ══════════════════════════════════════════════════════════════ */
import { Wallet, Sparkles, UsersRound, ShieldCheck, Lock, EyeOff } from "lucide-react";
import { C, FONT_HEAD, FONT_DISPLAY, FONT_BODY } from "../src/lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
} from "../src/lib/pricing.js";
import {
  LpPage, LpHeader, LpFooter, Section, Heading, Kicker, HeroTitle, HeroFacts,
  CtaLink, GhostLink, FeatureList, StepList, TrustBadges, Faq, CtaSection,
  Chips, MobileCtaBar, signupUrl, panel, RULE, RULE_SOFT,
} from "./LpKit.jsx";

const FROM = "lp-host";
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
    icon: Sparkles,
    title: "会いたいと思った相手とだけ、会う。",
    body: "会を出しておくと、参加リクエストがまとまって届きます。エリア・お店・人数・飲みスタイルを見て、いいなと思ったグループだけを承認してください。断った相手には何も伝わりません。",
    note: "お店に着いてから相手が決まるのではなく、行く前にグループ同士で決まります。",
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
    body: `メールアドレスと生年月日だけ（${MIN_AGE}歳以上）。カードの登録も要りません。一緒に行く友だちはニックネームを登録するだけでよく、その場にアプリが入っていなくても参加できます。`,
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
    q: "どんな人からリクエストが届きますか？",
    a: "すべて一般のご利用者です。当社および提携店舗が報酬を支払って客の相手をさせる、いわゆる「サクラ」やキャストは一切在籍していません。リクエストには相手グループの人数・エリア・飲みスタイルのタグが付いていて、それを見てから承認するかどうかを決められます。承認するまで、相手にはあなたの名前も写真も表示されません。",
  },
  {
    q: "「おごられる側」とありますが、性別で料金が変わるのですか？",
    a: "いいえ。無料になるのは「募集する側（ホスト）」で、性別は関係ありません。このページで「おごられる側」と呼んでいるのは、会を募集するホストグループのことです。登録時に性別は選んでいただきますが、これは募集中の会へメッセージ（アプローチ）を送れるかどうかの判定にのみ使います。性別が他のユーザーに表示されることはなく、会の参加条件にもならないため、同性グループ同士の会も等しく成立します。",
  },
  {
    q: "ひとりでも募集できますか？",
    a: `いいえ。会を募集する側は必ず${MIN_GROUP_SIZE}名以上です。1対1のマッチングは、システム上どうしても作れないようになっています。同伴者が当日アプリを入れていなくても、代表者がニックネームを登録すれば大丈夫です。`,
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
          flexShrink: 0, fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: C.text,
        }}>{r.v}</span>
      </div>
    ))}

    {/* 金を使うのはこの1行だけ。ページで最も強い数字。 */}
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10,
      paddingTop: 15, marginTop: 4, borderTop: `1px solid ${RULE}`,
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>合計</span>
      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 36, fontWeight: 700, color: C.primary, lineHeight: 1 }}>¥0</span>
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

/* 届いた参加リクエストの見え方。「選べる」を文章で言うより、
   受信箱をそのまま1枚見せたほうが早い。飾りは足さない。 */
const RequestInbox = () => (
  <div style={{ ...panel, padding: "18px 20px 20px", maxWidth: 560 }}>
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
      paddingBottom: 14, borderBottom: `1px solid ${RULE}`,
    }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>
        届いた参加リクエスト
      </span>
      <span style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.4 }}>承認制</span>
    </div>

    {[
      { n: "2名のグループ", s: "恵比寿 · 金曜 19:30", tags: ["まったり派", "食事メイン"] },
      { n: "2名のグループ", s: "中目黒 · 土曜 20:00", tags: ["2件目OK", "オールナイトOK"] },
    ].map((r, i) => (
      <div key={r.s} style={{ padding: "16px 0", borderTop: i === 0 ? "none" : `1px solid ${RULE_SOFT}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: 0.2 }}>
              {r.n}
            </div>
            <div style={{ fontSize: 11, color: C.textSec, marginTop: 6, letterSpacing: 0.3 }}>{r.s}</div>
          </div>
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.primary,
            fontFamily: FONT_BODY, letterSpacing: 0.5,
          }}>承認する</span>
        </div>
        <Chips items={r.tags} style={{ marginTop: 11 }} />
      </div>
    ))}

    <div style={{
      marginTop: 4, paddingTop: 14, borderTop: `1px solid ${RULE}`,
      display: "flex", gap: 8, alignItems: "flex-start",
      fontSize: 10.5, color: C.textMuted, lineHeight: 1.8,
    }}>
      <EyeOff size={12} strokeWidth={1.7} color={C.textFaint} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>承認するまで、相手にあなたの名前・写真は表示されません。見送っても相手に通知は届きません。</span>
    </div>
  </div>
);

export default function HostPage() {
  return (
    <LpPage>
      <LpHeader tagline="おごられる側の相席" ctaLabel={CTA} ctaHref={CTA_HREF} />

      {/* ══════════════ ヒーロー ══════════════
          読ませる順は 何のサービスか → 見出し → 一文 → CTA → 得な数字。
          見出しは折り返さない大きさに収める（日本語は途中で折れると読みにくい）。
          いちばん長い行は「出会いも見つかる。」の9文字。 */}
      <Section pad="clamp(44px, 7.5vw, 104px)">
        <div className="lph">
          <div>
            <Kicker>グループ同士の相席マッチング</Kicker>

            <HeroTitle>
              0円で飲んで、<br />
              <span style={{ color: C.primary }}>出会いも見つかる。</span>
            </HeroTitle>

            <p style={{
              fontSize: "clamp(14.5px, 1.7vw, 16.5px)", color: C.textSec, lineHeight: 1.95,
              margin: "24px 0 0", maxWidth: 520, letterSpacing: 0.4,
            }}>
              {/* ⚠ 日本語は1行で書く。JSX が改行を半角スペースに畳むので、
                    行を分けると文の途中に空きが出る。 */}
              友だちと{MIN_GROUP_SIZE}名以上で「会」を立てるだけ。募集する側は、参加ポイントも当日の飲食代も払いません。相席するのは、同じように友だちと来ているグループです。
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", marginTop: 34 }}>
              <CtaLink href={CTA_HREF} size="xl">{CTA}</CtaLink>
              <GhostLink href="#how">使い方を見る</GhostLink>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: C.textMuted, letterSpacing: 0.4 }}>
              登録1分・カード不要・{MIN_AGE}歳以上限定
            </div>

            {/* ここに「0pt / 0円」を並べると、右の伝票と同じことを2回言うことになる。
                数字は伝票に任せて、こちらは条件（誰と・どこで）だけ置く。 */}
            <HeroFacts
              items={[
                { label: "相席のお相手", value: MIN_GROUP_SIZE, unit: "名以上のグループ" },
                { label: "相席する席", value: "オープン席", unit: "のみ" },
                { label: "個人間のDM", value: "なし" },
              ]}
            />
          </div>

          <div className="lph-visual">
            <BillCard />
          </div>
        </div>
      </Section>

      {/* ══════════════ 特徴 ══════════════ */}
      <Section tone="sunken" divider pad="clamp(50px, 7.5vw, 92px)">
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

      {/* ══════════════ 届いたリクエストから選ぶ ══════════════
          「出会いが見つかる」を、受信箱の実物で見せる。 */}
      <Section divider pad="clamp(48px, 7vw, 88px)">
        <div className="lp-split">
          <Heading
            eyebrow="Requests"
            sub="会を出しておくだけで、参加したいグループから声がかかります。誰と過ごすかを決めるのは、いつでも募集した側です。"
          >
            選ぶのは、<br />こちら側。
          </Heading>
          <div>
            <RequestInbox />
            <div style={{ marginTop: 26 }}>
              <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 0.6, marginBottom: 11 }}>
                承認する前に分かること
              </div>
              <Chips items={["人数", "エリア", "日時", "お店", "飲みスタイル", "ニックネーム"]} />
            </div>
            <div style={{ marginTop: 30 }}>
              <CtaLink href={CTA_HREF}>{CTA}</CtaLink>
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════ 使い方 ══════════════ */}
      <Section id="how" tone="sunken" divider pad="clamp(48px, 7vw, 88px)">
        <Heading eyebrow="How it works" sub="登録から当日の待ち合わせまで、3ステップで完結します。">
          はじめ方は、かんたん。
        </Heading>
        <div style={{ marginTop: 38 }}>
          <StepList items={STEPS} />
        </div>
      </Section>

      {/* ══════════════ よくある質問 ══════════════ */}
      <Section divider pad="clamp(46px, 6.5vw, 80px)">
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

      {/* スマホだけ、下に固定のCTA（721px 以上では CSS で消える） */}
      <MobileCtaBar
        href={CTA_HREF}
        label={CTA}
        note={<>参加ポイント0pt・当日の飲食代0円<br />{MIN_AGE}歳以上限定・登録無料</>}
      />
    </LpPage>
  );
}
