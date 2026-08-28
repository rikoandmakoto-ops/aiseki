/* ══════════════════════════════════════════════════════════════
   AISEKI — 料金・人数・年齢の定数（唯一の出典）

   ここに置いてある理由:
     アプリ本体（api.js）だけでなく、広告用のランディングページ
     （src/lp/*）からも同じ値を読む。api.js は supabase クライアントを
     生成するため、LP から読むと不要な依存が丸ごと入ってしまう。
     数字だけをこのファイルに切り出し、api.js は再輸出する。

   ⚠ DB 側にも同じ値がある。片方だけ変えると表示と実際がずれる。
     ・JOIN_FEE_PER_PERSON → supabase の join_fee_per_person()
     ・SIGNUP_BONUS / REFERRAL_BONUS → migration_launch2.sql の
       signup_bonus() / referral_bonus()
       （SIGNUP_BONUS は「カード登録後に付与」に変わった。下の注記を読むこと）
   ══════════════════════════════════════════════════════════════ */

/* 会が成立する最小人数（ホスト側・参加側ともに）。1対1は作れない。 */
export const MIN_GROUP_SIZE = 2;

/* ===================== 料金（一律・変更不可） =====================
   ・募集する側（ホスト）は無料。会はいくつでも自由に立てられる。
   ・参加する側は 1人あたり一律 3,800pt。会ごとの金額設定は無い。
   ・支払われたポイントは全額が運営の収益で、ホストへの報酬は無い。
   ・そのかわり、当日のホストグループの飲食代は参加グループが負担する。
   ================================================================= */
export const JOIN_FEE_PER_PERSON = 3800;

/* 登録ボーナス。参加は1人あたり 3,800pt。

   ⚠ 自動では付かない。カードを登録したあとに付与する。
     アカウントを作っただけでは 0pt のまま（migration_card_bonus.sql で
     handle_new_user() から付与を外した）。付けるのは grant_card_bonus() で、
     呼ぶのは /api/stripe/webhook（setup_intent.succeeded）と
     /api/stripe/confirm-card の2経路だけ。どちらも service_role。
     ここに残しているのは金額の表示用（DB 側の出典は signup_bonus()）。 */
export const SIGNUP_BONUS = 5000;

/* 友達紹介ボーナス（紹介した側・された側の双方に付与）。参加1名分。 */
export const REFERRAL_BONUS = 3800;

/* 新規登録ボーナスで何名分の参加ができるか（LP・登録画面の訴求に使う） */
export const SIGNUP_BONUS_SEATS = Math.floor(SIGNUP_BONUS / JOIN_FEE_PER_PERSON);

/* 20歳未満は利用禁止（飲酒を伴う業態のため）。 */
export const MIN_AGE = 20;

/* ===================== 性別 =====================
   会への「参加条件」として性別を指定することはできない（今までどおり）。
   性別を集めているのは、募集中の会へのアプローチ（下記）の可否を
   判定するためだけで、他のユーザーに表示することはない。

   ⚠ DB 側にも同じ値がある（migration_reviews_approach_style.sql の
     gender_options() / approach_gender()）。片方だけ変えると保存に失敗する。
   ================================================ */
export const GENDER_OPTIONS = ["女性", "男性", "その他"];

/* アプローチを送れる性別。DB の approach_gender() と一致させる。 */
export const APPROACH_GENDER = "女性";

/* 1つの会に送れるアプローチの上限。DB の approach_message_limit() と一致させる。 */
export const APPROACH_LIMIT = 5;

/* ================ 飲みスタイルタグ ================
   性別フィルタではなく、全ユーザーが設定できる自己紹介タグ。
   選択式（自由入力は受け付けない）。値は DB の
   drinking_style_options() と一字一句一致していること。
   ================================================== */
export const DRINKING_STYLES = [
  { key: "オールナイトOK", note: "朝まで飲みたい！" },
  { key: "終電で帰る", note: "終電にはおいとまします" },
  { key: "2件目OK", note: "流れで2軒目もぜひ" },
  { key: "2件目NG", note: "1軒だけで" },
  { key: "まったり派", note: "ゆっくり話したい" },
  { key: "ガンガン飲む派", note: "しっかり飲みます" },
  { key: "お酒は少なめ", note: "ソフトドリンク中心でも" },
  { key: "食事メイン", note: "美味しいものが目当て" },
];

/* 1人が設定できるタグの数。DB の drinking_style_limit() と一致させる。 */
export const MAX_DRINKING_STYLES = 4;

/* ================ ランクと予算帯 ================
   会の終了後に受け取った評価（user_reviews）の平均点でランクが決まる。
   ランクは主催する側にも参加する側にも同じように効く。

     ・主催するとき … 選べるお店の予算帯の上限（budgetCap）
     ・参加するとき … 申し込める会（会ごとの min_guest_tier）

   ⚠ この仕組みは性別で分けていない。全ユーザーに同じ規則が適用される。
     評価も最初から双方向で、同じ会にいた相手なら誰から誰へでも書ける。
     理由は supabase/migration_caste_rank.sql と
     supabase/migration_mutual_rank.sql の冒頭コメントに書いてある
     （性別を会の条件に使うと、業態上の前提が崩れるため）。

   ⚠ DB 側にも同じ値がある（rank_tiers() / rank_min_reviews()）。
     片方だけ変えると、画面に出ている予算帯が保存時に弾かれる。

   budgetCap … 1人あたりの平均予算の上限（円）。null は上限なし。
   minAvg    … このランクになる平均星数の下限。
   =============================================== */
export const RANK_TIERS = [
  {
    key: "bronze",
    label: "ブロンズ",
    order: 1,
    minAvg: 0,
    budgetCap: 3000,
    budgetLabel: "〜3,000円",
    note: "まずはここから。気軽な居酒屋・バル",
  },
  {
    key: "silver",
    label: "シルバー",
    order: 2,
    minAvg: 2,
    budgetCap: 5000,
    budgetLabel: "〜5,000円",
    note: "ゆっくり話せる、少し落ち着いた一軒",
  },
  {
    key: "gold",
    label: "ゴールド",
    order: 3,
    minAvg: 3,
    budgetCap: 8000,
    budgetLabel: "〜8,000円",
    note: "料理もお酒も、しっかり楽しめるお店",
  },
  {
    key: "platinum",
    label: "プラチナ",
    order: 4,
    minAvg: 4,
    budgetCap: null,
    budgetLabel: "8,000円〜",
    note: "上限なし。10,000円クラスのお店も選べます",
  },
];

/* ランクが確定するまでに必要な評価の件数。
   これに満たないあいだは、平均が高くても最下位の予算帯から始まる
   （1件の評価でランクが跳ねないようにするため）。
   DB の rank_min_reviews() と一致させる。 */
export const RANK_MIN_REVIEWS = 3;

/* 予算帯の既定値（ランクが無くても必ず選べるもの） */
export const DEFAULT_RANK_KEY = RANK_TIERS[0].key;

export const rankTier = (key) =>
  RANK_TIERS.find((t) => t.key === key) ?? RANK_TIERS[0];

/* 平均星数と件数からランクを求める（DB の rank_for() と同じ規則） */
export function rankForReviews(average, count) {
  if (!(Number(count) >= RANK_MIN_REVIEWS)) return RANK_TIERS[0];
  const avg = Number(average) || 0;
  return [...RANK_TIERS].reverse().find((t) => avg >= t.minAvg) ?? RANK_TIERS[0];
}

/* 1人あたりの平均予算（円）が、どの予算帯にあたるか（DB の budget_tier_for() と同じ） */
export function budgetTierFor(avgBudget) {
  const v = Number(avgBudget);
  if (!Number.isFinite(v)) return null;
  return RANK_TIERS.find((t) => t.budgetCap != null && v <= t.budgetCap) ?? RANK_TIERS[RANK_TIERS.length - 1];
}

/* 自分のランクで、その予算帯を選べるか */
export const canUseBudgetTier = (myKey, tierKey) =>
  rankTier(myKey).order >= rankTier(tierKey).order;

/* ============ 会が参加者に求めるランク（min_guest_tier） ============
   会ごとにホストが決める。既定は最下位＝誰でも申し込める。
   ⚠ 性別・年齢その他の属性を参加条件にすることはできない。
     条件にできるのはランクだけで、ランクの算出に性別は入らない
     （supabase/migration_mutual_rank.sql の冒頭）。
   ⚠ DB 側にも同じ規則がある（enforce_group_join / can_join_party）。
     ここで通しても、条件を満たさない申し込みは DB が弾く。
   ================================================================= */
export const DEFAULT_GUEST_TIER = RANK_TIERS[0].key;

/* 自分のランクで、その条件を参加者に求められるか。
   自分より上のランクは条件にできない（ゴールドの人が求められるのは
   ゴールド以下だけで、プラチナは選べない）。予算帯を自分のランクより
   上に設定できないのと同じ考え方（canUseBudgetTier）。
   ⚠ DB 側（enforce_group_party）にも同じ規則がある。
     画面での出し分けは案内にすぎず、実際の可否は DB が判定する。 */
export const canRequireGuestTier = (myKey, tierKey) =>
  rankTier(myKey).order >= rankTier(tierKey).order;

/* 自分のランクで参加条件にできるランクだけを並べる（低い順） */
export const requirableGuestTiers = (myKey) =>
  RANK_TIERS.filter((t) => canRequireGuestTier(myKey, t.key));

/* 自分のランクで、その会に申し込めるか（DB の can_join_party と同じ規則） */
export const canJoinWithTier = (myKey, minGuestTier) =>
  rankTier(myKey).order >= rankTier(minGuestTier ?? DEFAULT_GUEST_TIER).order;

/* 会に参加条件が付いているか（最下位＝条件なし） */
export const hasGuestTierGate = (minGuestTier) =>
  rankTier(minGuestTier ?? DEFAULT_GUEST_TIER).order > RANK_TIERS[0].order;
