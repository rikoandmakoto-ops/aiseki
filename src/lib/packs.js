/* =====================================================================
   ポイントパック（購入プラン）の定義

   ここが価格とポイント数の唯一の出典。
   クライアント（購入画面）とサーバ（/api/stripe/checkout）の両方から読み、
   購入するポイント数は必ずサーバ側でこの表から引き直す。
   （クライアントから金額・ポイント数を受け取ると、
     少額の支払いで大量のポイントを得られてしまうため）

   price … 支払額（日本円 / 税込 / Stripe の unit_amount と同値）
   points … 付与するポイント数（1pt = 1円 + ボーナス）
   ===================================================================== */
export const POINT_PACKS = [
  { id: "starter", points: 500, price: 500 },
  { id: "light", points: 1200, price: 1000 },
  { id: "standard", points: 3000, price: 2000, popular: true },
  { id: "plus", points: 8000, price: 5000 },
  { id: "premium", points: 17000, price: 10000 },
];

/* おまけ分（支払額を超えて付与されるポイント） */
export const packBonus = (pack) => Math.max(pack.points - pack.price, 0);

/* 商品名（Stripe の明細・領収書にそのまま出る） */
export const packName = (pack) =>
  `AISEKI ポイント ${pack.points.toLocaleString("ja-JP")}pt`;

export const findPack = (id) => POINT_PACKS.find((p) => p.id === id) ?? null;
