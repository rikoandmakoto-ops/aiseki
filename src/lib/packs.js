/* =====================================================================
   ポイントパック（購入プラン）の定義

   ここが価格とポイント数の唯一の出典。
   クライアント（購入画面）とサーバ（/api/stripe/checkout）の両方から読み、
   購入するポイント数は必ずサーバ側でこの表から引き直す。
   （クライアントから金額・ポイント数を受け取ると、
     少額の支払いで大量のポイントを得られてしまうため）

   1pt = 1円 が基準。参加は1名あたり 3,800pt なので、
   プランは「何名分の参加になるか」で区切っている。
   まとめて買うほど1ptあたりの単価が下がる（＝おまけが増える）。

   price  … 支払額（日本円 / 税込 / Stripe の unit_amount と同値）
   points … 付与するポイント数
   seats  … このパックで参加できる人数の目安（3,800pt = 1名）
   ===================================================================== */
/* 参加ポイント（1名あたり）。api.js の JOIN_FEE_PER_PERSON と同じ値。
   このファイルは /api（サーバ）からも読むため、
   supabase クライアントを作る api.js は読み込まない。 */
const JOIN_FEE_PER_PERSON = 3800;

export const POINT_PACKS = [
  { id: "single",   points: 3800,  price: 3800 },
  { id: "pair",     points: 7600,  price: 7200 },
  { id: "trio",     points: 11400, price: 10600, popular: true },
  { id: "group",    points: 19000, price: 17100 },
  { id: "premium",  points: 38000, price: 32300 },
];

/* ── 動作確認用の少額プラン（テスト用） ────────────────────────────
   live モードの決済が「支払い → Webhook → ポイント付与」まで
   本当に通るかを、最小の金額で1回試すためのもの。

   🚨 1円にはできない。Stripe の JPY の最低請求額は 50円。
      unit_amount: 1 で Checkout セッションを作ると、その場で
      amount_too_small（"must add up to at least ¥50 JPY"）で落ちる。
      2026-08-27 に本番キーで実際に確認した。50 が下限。

   POINT_PACKS には**入れていない**。入れると購入画面の一覧にも
   ランディングの料金表にも並んでしまうため。
   findPack() だけがこれを引けるので、/api/stripe/checkout は
   packId="test50" を受け付ける（金額とポイント数はサーバ側で
   この定義から引き直すので、クライアントからは変えられない）。

   画面に出るのは ?test=pay 付きで開いたときだけ（src/App.jsx）。 */
export const TEST_PACK = {
  id: "test50",
  points: 50,
  price: 50,
  test: true,
  name: "AISEKI 決済テスト 50pt",
};

/* おまけ分（支払額を超えて付与されるポイント） */
export const packBonus = (pack) => Math.max(pack.points - pack.price, 0);

/* 割引率（％）。まとめ買いのお得さは、こちらのほうが伝わる。 */
export const packDiscount = (pack) =>
  pack.points > 0 ? Math.round((1 - pack.price / pack.points) * 100) : 0;

/* このパックで参加できる人数（3,800pt で1名） */
export const packSeats = (pack) => Math.floor(pack.points / JOIN_FEE_PER_PERSON);

/* 1ptあたりの単価（円）。小数第2位まで。 */
export const packUnitPrice = (pack) =>
  pack.points > 0 ? Math.round((pack.price / pack.points) * 100) / 100 : 0;

/* 商品名（Stripe の明細・領収書にそのまま出る） */
export const packName = (pack) =>
  pack.name ?? `AISEKI ポイント ${pack.points.toLocaleString("ja-JP")}pt`;

/* テスト用プランもここから引ける（一覧には出さないが購入はできる）。 */
export const findPack = (id) =>
  POINT_PACKS.find((p) => p.id === id) ?? (id === TEST_PACK.id ? TEST_PACK : null);
