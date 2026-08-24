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

   ⚠ 見た目は LpKit.jsx の方針に従う（光らせない・並べない・中央に置かない）。
   ══════════════════════════════════════════════════════════════ */
import { UsersRound, Search, Wallet, MapPin } from "lucide-react";
import { C, FONT_HEAD, FONT_DISPLAY, FONT_BODY } from "../src/lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
  SIGNUP_BONUS, SIGNUP_BONUS_SEATS,
} from "../src/lib/pricing.js";
import { POINT_PACKS, packBonus } from "../src/lib/packs.js";
import {
  LpPage, LpHeader, LpFooter, Section, Heading, Kicker, HeroTitle, HeroFacts,
  CtaLink, GhostLink, FeatureList, StepList, TrustBadges, Faq, CtaSection,
  signupUrl, panel, RULE, RULE_SOFT,
} from "./LpKit.jsx";

const FROM = "lp-men";
const CTA = "相席を始める";
const CTA_HREF = signupUrl(FROM);

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

/* 募集中の会の見え方。文章より、これを1枚見せたほうが早い。
   アプリの一覧を切り取ってきたつもりで、飾りは足さない。 */
const PartyPreview = () => (
  <div style={{ ...panel, padding: "18px 20px 20px" }}>
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
      paddingBottom: 14, borderBottom: `1px solid ${RULE}`,
    }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>
        本日、募集中の会
      </span>
      <span style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.4 }}>東京 · 7エリア</span>
    </div>

    {[
      { t: "金曜の夜に、静かな一軒で", a: "恵比寿 · BAR TRENCH", h: 2, g: 2 },
      { t: "week end 前夜祭", a: "中目黒 · 目黒川沿い", h: 3, g: 3 },
    ].map((p, i) => (
      <div key={p.t} style={{
        padding: "16px 0", borderTop: i === 0 ? "none" : `1px solid ${RULE_SOFT}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: 0.2 }}>
              {p.t}
            </div>
            <div style={{ fontSize: 11, color: C.textSec, marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <MapPin size={12} strokeWidth={1.7} style={{ opacity: 0.7 }} />{p.a}
            </div>
          </div>
          <span style={{
            flexShrink: 0, fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 600, color: C.text,
          }}>
            {JOIN_FEE.toLocaleString()}
            <span style={{ fontSize: 10, fontFamily: FONT_BODY, color: C.textMuted, fontWeight: 500 }}> pt / 1名</span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 9, letterSpacing: 0.3 }}>
          ホスト{p.h}名 × 募集{p.g}名 · 当日のお会計はゲスト負担
        </div>
      </div>
    ))}

    <div style={{
      marginTop: 4, paddingTop: 14, borderTop: `1px solid ${RULE}`,
      fontSize: 10.5, color: C.textMuted, lineHeight: 1.8,
    }}>
      ポイントが減るのは、ホストに承認されたときだけ。申し込んだ時点では減りません。
    </div>
  </div>
);

/* ポイントの表。単価の出典は src/lib/packs.js（アプリの購入画面と同じ）。 */
const PointTable = () => (
  <div style={{ maxWidth: 560 }}>
    {POINT_PACKS.map((p, i) => (
      <div key={p.id} style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14,
        padding: "15px 0", borderTop: i === 0 ? "none" : `1px solid ${RULE_SOFT}`,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: C.text }}>
            {p.points.toLocaleString()}
            <span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 500, color: C.textMuted }}> pt</span>
          </span>
          {packBonus(p) > 0 && (
            <span style={{ fontSize: 11, color: C.textMuted, letterSpacing: 0.3 }}>
              +{packBonus(p).toLocaleString()} ボーナス
            </span>
          )}
          {p.popular && (
            <span style={{ fontSize: 10.5, color: C.primary, letterSpacing: 0.5 }}>人気</span>
          )}
        </div>
        <span style={{
          fontFamily: FONT_DISPLAY, fontSize: 16.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap",
        }}>¥{p.price.toLocaleString()}</span>
      </div>
    ))}
    <p style={{
      marginTop: 16, paddingTop: 15, borderTop: `1px solid ${RULE}`,
      fontSize: 11.5, color: C.textMuted, lineHeight: 1.95, letterSpacing: 0.2,
    }}>
      参加ポイントは全ての会で一律 {JOIN_FEE.toLocaleString()}pt（1名あたり）で、ホストが金額を設定することはできません。
      当日の飲食代は、ホストグループの分を含めて参加グループがお支払いください。
      ポイントの払い戻し・換金はできません。
    </p>
  </div>
);

export default function MenPage() {
  return (
    <LpPage>
      <LpHeader tagline="グループで行く相席" ctaLabel={CTA} ctaHref={CTA_HREF} />

      {/* ══════════════ ヒーロー ══════════════
          読ませる順は 何のサービスか → 見出し → 一文 → CTA → 料金。
          見出しは折り返さない大きさに収める（いちばん長い行は
          「グループだから、気軽に。」の12文字）。 */}
      <Section pad="clamp(52px, 7.5vw, 104px)">
        <div className="lph">
          <div>
            <Kicker>グループ同士の相席マッチング</Kicker>

            {/* 「グループだから、気軽に。」が12文字。女性向け（10文字）より1段小さい */}
            <HeroTitle size="clamp(26px, 4.2vw, 46px)">
              相席で、<span style={{ color: C.primary }}>出会う。</span><br />
              グループだから、気軽に。
            </HeroTitle>

            <p style={{
              fontSize: "clamp(14.5px, 1.7vw, 16.5px)", color: C.textSec, lineHeight: 1.95,
              margin: "24px 0 0", maxWidth: 520, letterSpacing: 0.4,
            }}>
              友だちと{MIN_GROUP_SIZE}名以上で、募集中の会にリクエストするだけ。
              お店に着いてから決まるのではなく、行く前にグループ同士で約束できます。
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", marginTop: 34 }}>
              <CtaLink href={CTA_HREF} size="xl">{CTA}</CtaLink>
              <GhostLink href="#price">ポイントを見る</GhostLink>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: C.textMuted, letterSpacing: 0.4 }}>
              登録1分・カード不要・{MIN_AGE}歳以上限定
            </div>

            <HeroFacts
              items={[
                { label: "参加費（1名）", value: JOIN_FEE.toLocaleString(), unit: "pt 一律" },
                { label: "新規登録で", value: SIGNUP_BONUS.toLocaleString(), unit: `pt（参加${SIGNUP_BONUS_SEATS}名分）`, accent: true },
                { label: "参加の単位", value: MIN_GROUP_SIZE, unit: "名以上のグループ" },
              ]}
            />
          </div>

          <div className="lph-visual">
            <PartyPreview />
          </div>
        </div>
      </Section>

      {/* ══════════════ 特徴 ══════════════ */}
      <Section tone="sunken" divider pad="clamp(56px, 7.5vw, 92px)">
        <div className="lp-split">
          <Heading
            eyebrow="Why AISEKI"
            sub="相席居酒屋の「行ってみないと分からない」を、先に分かるようにしただけです。"
          >
            {/* 見出しを脇に寄せた分だけ幅が狭い。読点のところで自分で折る
                （任せると「探せ／る、」のような割れ方をする） */}
            待たない、探せる、<br />明朗会計。
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
      </Section>

      {/* ══════════════ ポイント ══════════════ */}
      <Section id="price" tone="sunken" divider pad="clamp(52px, 7vw, 88px)">
        <div className="lp-split">
          <Heading
            eyebrow="Points"
            sub={`会にかかわらず、参加は1名あたり一律${JOIN_FEE.toLocaleString()}pt（1pt = 1円）。まとめて買うほど1ptあたりが安くなります。`}
          >
            参加は、一律{JOIN_FEE.toLocaleString()}pt。
          </Heading>
          <div>
            <PointTable />
            <div style={{ marginTop: 30 }}>
              <CtaLink href={CTA_HREF}>{CTA}</CtaLink>
            </div>
          </div>
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
        eyebrow="今夜のグループを探す"
        title="はじめましてを、特別な一夜に。"
        body={`登録は無料。いま登録すると${SIGNUP_BONUS.toLocaleString()}pt（参加${SIGNUP_BONUS_SEATS}名分）を差し上げています。友だちを招待すると、お二人ともさらにポイントが増えます。`}
        ctaLabel={CTA}
        ctaHref={CTA_HREF}
      />

      <LpFooter />
    </LpPage>
  );
}
