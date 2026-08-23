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

/* 新規登録ボーナス。参加が1人あたり 3,800pt のため、
   登録したその日にグループで参加できる額にしてある。 */
export const SIGNUP_BONUS = 10000;

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
