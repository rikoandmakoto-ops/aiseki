/* ══════════════════════════════════════════════════════════════
   AISEKI — ランディングページ / 参加する側（相席する側）向け

   訴求は「好みの相手を選んでから、確実に相席できる」。
   募集中の会を条件（エリア・日時・お店・人数・飲みスタイル）で絞り、
   行きたい会にだけ申し込む。お店に着いてから相手が決まる相席居酒屋と
   違って、席に着く前にグループ同士で決まっている。

   ⚠ 「確実」の中身を誇張しないこと。
     申し込みはホストの承認制で、必ず通るわけではない。
     嘘にならない担保はこの2つで、どちらも DB 側の実装が根拠:
       ・ポイントが減るのは承認された時点だけ（accept_join_request）。
         承認されなければ 1pt も減らない ＝ 空振りの費用がゼロ。
       ・成立した会は必ず MIN_GROUP_SIZE 名以上のグループ同士。
     「必ずマッチする」「相手を指名できる」とは書かないこと。

   ⚠ 隠さないこと（あとで揉めるため、ここに全部書く）
     ・当日のホストグループの飲食代は、参加グループが負担する。
     ・ポイントは承認された時点で消費される（未承認なら消費されない）。
     ・払い戻し・換金はできない。
     ・「出会い」はグループ同士の相席のこと。1対1の紹介は行わない
       （インターネット異性紹介事業としての運営は行っていない）。

   ⚠ 選べる条件に性別は無い（入れてはいけない）。絞れるのは
     エリア・日時・人数・お店の予算帯・飲みスタイルタグまで。
     src/lib/pricing.js §性別 と HANDOFF.md §1 を読み合わせること。

   ⚠ 見た目は LpKit.jsx の方針に従う（光らせない・並べない・中央に置かない）。
     レイアウトはスマホが既定で、広い画面に min-width で足していく。
   ══════════════════════════════════════════════════════════════ */
import { ListFilter, CalendarCheck, Wallet, UsersRound, MapPin } from "lucide-react";
import { C, FONT_HEAD, FONT_DISPLAY, FONT_BODY } from "../src/lib/theme.jsx";
import {
  MIN_AGE, MIN_GROUP_SIZE, JOIN_FEE_PER_PERSON as JOIN_FEE,
  SIGNUP_BONUS, SIGNUP_BONUS_SEATS, DRINKING_STYLES, RANK_TIERS,
} from "../src/lib/pricing.js";
import { POINT_PACKS, packBonus } from "../src/lib/packs.js";
import {
  LpPage, LpHeader, LpFooter, Section, Heading, Kicker, HeroTitle, HeroFacts,
  CtaLink, GhostLink, FeatureList, StepList, TrustBadges, Faq, CtaSection,
  Chips, MobileCtaBar, signupUrl, panel, RULE, RULE_SOFT,
} from "./LpKit.jsx";

const FROM = "lp-guest";
const CTA = "相席を始める";
const CTA_HREF = signupUrl(FROM);

/* 募集中の会を絞れる条件。性別は無い（入れてはいけない）。
   飲みスタイルと予算帯は pricing.js が唯一の出典なので、そこから読む。 */
const AREAS = ["渋谷", "恵比寿", "中目黒", "六本木", "西麻布", "銀座", "新宿"];
const STYLE_TAGS = DRINKING_STYLES.map((s) => s.key);
const BUDGET_TAGS = RANK_TIERS.map((t) => t.budgetLabel);

const FEATURES = [
  {
    icon: ListFilter,
    title: "条件で絞ってから、申し込む。",
    body: "エリア・日時・人数・お店の予算帯・飲みスタイルで、募集中の会を絞り込めます。行きたいと思った会にだけ申し込むので、その場の運任せになりません。",
    note: "会の参加条件に性別を指定することはできません（絞れるのは上記の条件までです）。",
  },
  {
    icon: CalendarCheck,
    title: "お店に着く前に、相手が決まっている。",
    body: "承認された時点で会が成立し、参加メンバー全員のグループチャットが開きます。待ち合わせも到着前に決められるので、店頭で相手を待つ時間がありません。",
    note: `相席のお相手は必ず${MIN_GROUP_SIZE}名以上のグループです。1対1にはなりません。`,
  },
  {
    icon: Wallet,
    title: "空振りでは、1ptも減りません。",
    body: `ポイントが減るのは、ホストが承認した瞬間だけ。申し込んだ時点では動かず、承認されなければ消費されません。取り下げたときも同じです。`,
    note: `参加ポイントはどの会でも1名あたり一律${JOIN_FEE.toLocaleString()}pt。ホストが金額を上乗せすることはできません。`,
  },
  {
    icon: UsersRound,
    title: "グループ同士だから、ハードルが低い。",
    body: `会が成立するのは${MIN_GROUP_SIZE}名以上のグループ同士だけ。1対1で向き合う気まずさがなく、友だちと一緒だから初対面でも会話が続きます。`,
    note: "相席は店内を見渡せるオープンスペースのみ。個室・半個室は選べません。",
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
    title: "会を絞り込んで、リクエストする",
    body: "エリア・日時・人数・お店・飲みスタイルで募集中の会を絞り、行きたい会にだけ申し込みます。同伴者はニックネームの登録だけでよく、アプリを入れていなくても大丈夫です。",
  },
  {
    n: "03",
    title: "承認されたら、当日お店で",
    body: "ホストが承認した時点で会が成立し、グループチャットが始まります。ポイントが減るのもこのときです。あとは待ち合わせて、席に着くだけ。",
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
    q: "申し込めば、必ず相席できますか？",
    a: "いいえ。参加リクエストはホストの承認制なので、必ず成立するわけではありません。ただし承認されなければポイントは1ptも減らないので、申し込んで空振りになっても費用はかかりません。条件を絞って行きたい会にだけ申し込めるぶん、当日お店で待つ相席居酒屋より見込みは立てやすくなっています。",
  },
  {
    q: "相手を条件で選べますか？",
    a: "募集中の会を、エリア・日時・人数・お店の予算帯・飲みスタイルのタグで絞り込めます。一方で、性別を会の参加条件に指定することはできません。AISEKIは性別を他のユーザーに表示せず、会の条件にも使わない設計です。",
  },
  {
    q: "ポイントはいつ減りますか？ 断られたら？",
    a: "ポイントが消費されるのは、ホストが参加を承認した時点です。承認されなかった場合や、承認前に取り下げた場合は消費されません。なお、購入済みポイントの払い戻し・換金はできません。",
  },
  {
    q: "ひとりで申し込めますか？",
    a: `お申し込みいただけます。参加はお二人が基本ですが、お一人でも申し込めます（その場合のポイントは2名分の${(JOIN_FEE * 2).toLocaleString()}ptです）。なお相席のお相手は必ず${MIN_GROUP_SIZE}名以上のグループなので、席が1対1になることはありません。1対1のマッチングは、システム上どうしても作れないようになっています。`,
  },
  {
    q: "相方はどうやって決めますか？",
    a: "招待リンクを送って呼ぶか、すでに会員のお友だちを会員コードで指定します。招待リンクからのお友だちは、お名前・年齢確認・お写真だけのかんたんな登録で参加できます。すでに会員のお友だちなら、お支払いを「各自払い」にすることもできます。",
  },
  {
    q: "相手の顔写真は事前に見られますか？",
    a: "マッチが成立するまでは、薄くぼかしたお写真だけが表示されます（配信されるのはぼかした画像そのもので、画面の演出ではありません）。お名前・お写真・年齢がそのまま見えるのは、ホストが承認してマッチが成立したあとです。これはお互いさまの仕組みです。",
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
      <span style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.4 }}>
        東京 · {AREAS.length}エリア
      </span>
    </div>

    {[
      { t: "金曜の夜に、静かな一軒で", a: "恵比寿 · BAR TRENCH", h: 2, g: 2, tags: ["まったり派", "〜5,000円"] },
      { t: "week end 前夜祭", a: "中目黒 · 目黒川沿い", h: 3, g: 3, tags: ["2件目OK", "〜3,000円"] },
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
        <Chips items={p.tags} style={{ marginTop: 10 }} />
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 10, letterSpacing: 0.3 }}>
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

/* 絞り込みの条件。ラベルを小さく置いて、値をチップで並べるだけ。 */
const FilterGroup = ({ label, items }) => (
  <div style={{ paddingTop: 20, marginTop: 20, borderTop: `1px solid ${RULE_SOFT}` }}>
    <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 0.6, marginBottom: 11 }}>{label}</div>
    <Chips items={items} />
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

export default function GuestPage() {
  return (
    <LpPage>
      <LpHeader tagline="グループで行く相席" ctaLabel={CTA} ctaHref={CTA_HREF} />

      {/* ══════════════ ヒーロー ══════════════
          読ませる順は 何のサービスか → 見出し → 一文 → CTA → 料金。
          見出しは折り返さない大きさに収める。
          いちばん長い行は「相手を選ぶ。」の6文字。 */}
      <Section pad="clamp(44px, 7.5vw, 104px)">
        <div className="lph">
          <div>
            <Kicker>グループ同士の相席マッチング</Kicker>

            <HeroTitle>
              行く前に、<br />
              <span style={{ color: C.primary }}>相手を選ぶ。</span>
            </HeroTitle>

            <p style={{
              fontSize: "clamp(14.5px, 1.7vw, 16.5px)", color: C.textSec, lineHeight: 1.95,
              margin: "24px 0 0", maxWidth: 520, letterSpacing: 0.4,
            }}>
              {/* ⚠ 日本語は1行で書く。JSX が改行を半角スペースに畳むので、
                    行を分けると文の途中に空きが出る。 */}
              エリア・日時・お店・飲みスタイルで募集中の会を絞り込んで、行きたい会にだけ申し込むだけ。お店に着いてから決まるのではなく、行く前にグループ同士で約束できます。
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", marginTop: 34 }}>
              <CtaLink href={CTA_HREF} size="xl">{CTA}</CtaLink>
              <GhostLink href="#price">ポイントを見る</GhostLink>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: C.textMuted, letterSpacing: 0.4 }}>
              登録1分・{MIN_AGE}歳以上限定・承認されるまで0pt
            </div>

            <HeroFacts
              items={[
                { label: "参加費（1名）", value: JOIN_FEE.toLocaleString(), unit: "pt 一律" },
                { label: "新規登録で", value: SIGNUP_BONUS.toLocaleString(), unit: `pt（参加${SIGNUP_BONUS_SEATS}名分）`, accent: true },
                { label: "お相手", value: MIN_GROUP_SIZE, unit: "名以上のグループ" },
              ]}
            />
          </div>

          <div className="lph-visual">
            <PartyPreview />
          </div>
        </div>
      </Section>

      {/* ══════════════ 特徴 ══════════════ */}
      <Section tone="sunken" divider pad="clamp(50px, 7.5vw, 92px)">
        <div className="lp-split">
          <Heading
            eyebrow="Why AISEKI"
            sub="相席居酒屋の「行ってみないと分からない」を、先に分かるようにしただけです。"
          >
            {/* 見出しを脇に寄せた分だけ幅が狭い。読点のところで自分で折る
                （任せると「探せ／る、」のような割れ方をする） */}
            待たない、選べる、<br />明朗会計。
          </Heading>
          <div>
            <FeatureList items={FEATURES} />
            <TrustBadges
              items={["個室での相席なし", "個人間DMなし", "接待・サクラなし", `${MIN_AGE}歳以上限定`]}
            />
          </div>
        </div>
      </Section>

      {/* ══════════════ 絞り込める条件 ══════════════
          「好みの会を選べる」を、実際の条件そのままで見せる。
          ⚠ ここに性別を足さないこと（会の参加条件にできない）。 */}
      <Section divider pad="clamp(48px, 7vw, 88px)">
        <div className="lp-split">
          <Heading
            eyebrow="Filters"
            sub="募集中の会は、この条件で絞り込めます。気になる会にだけ申し込めばよく、当日その場で決まるということがありません。"
          >
            条件で、絞れる。
          </Heading>
          <div style={{ maxWidth: 640 }}>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 0.6, marginBottom: 11 }}>エリア</div>
              <Chips items={AREAS} />
            </div>
            <FilterGroup label="お店の予算帯（1名あたり）" items={BUDGET_TAGS} />
            <FilterGroup label="飲みスタイル" items={STYLE_TAGS} />
            <FilterGroup label="そのほか" items={["日付", "時間帯", "募集人数"]} />
            <p style={{
              marginTop: 22, paddingTop: 16, borderTop: `1px solid ${RULE}`,
              fontSize: 11.5, color: C.textMuted, lineHeight: 1.95, letterSpacing: 0.2,
            }}>
              性別を会の参加条件に指定することはできません。AISEKIは性別を他のユーザーに表示せず、会の条件にも使わない設計です。
            </p>
            <div style={{ marginTop: 28 }}>
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

      {/* ══════════════ ポイント ══════════════ */}
      <Section id="price" divider pad="clamp(48px, 7vw, 88px)">
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
      <Section tone="sunken" divider pad="clamp(46px, 6.5vw, 80px)">
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

      {/* スマホだけ、下に固定のCTA（721px 以上では CSS で消える）。
          ⚠ note は1行が 375px に収まる長さにする。長いと「0pt」だけが折れて残る。 */}
      <MobileCtaBar
        href={CTA_HREF}
        label={CTA}
        note={<>参加は一律{JOIN_FEE.toLocaleString()}pt・承認まで0pt<br />新規登録で{SIGNUP_BONUS.toLocaleString()}pt・{MIN_AGE}歳以上限定</>}
      />
    </LpPage>
  );
}
