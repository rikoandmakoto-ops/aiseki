/* ══════════════════════════════════════════════════════════════
   ひとつ上のランク帯の会（ホーム画面の「もう少しで届く会」）

   何のための仕組みか:
     ランクは「相席した会の終了後に受け取る評価」で上がる。
     ところがブロンズの人には、上のランクで何が起きているのかが
     まったく見えないため、ランクを上げる意味が伝わらない。
     そこで【自分のランクのひとつ上】の帯を常にホームに出す。
     参加はできない（DB 側の enforce_group_join が弾く）。

   🚨 ここに「実在しない会を、実在するかのように」出してはいけない。
     ・本サービスは規約（src/lib/legal.js 第9条）と、全画面のフッター
       （FOOTER_NOTICE「接待行為・個室での相席・サクラは一切ありません」）で
       サクラを置かないことを明示している。実在しない募集を本物として
       並べると、この掲示が同じ画面の中で嘘になる。
     ・有料サービスなので、「賑わって見えるかどうか」は購入の判断に
       直接効く。実態より良く見せる表示は景品表示法（5条）の
       有利誤認にあたりうる。
     ・実務上も破綻する。ブロンズの人がシルバーに上がった瞬間、
       見えていた会が1件も無いことに気づく。

     そのため、実在の募集が足りないときに並べるものは
     **「例」であることを明示した見本**にしてある（isSample: true）。
     カードにも「例」のバッジが出て、押すと見本である旨の説明が出る。
     店舗カタログで先に決めた作法（supabase/seed_shops_sample.sql の
     【サンプル】表記）と同じ考え方。

     ⚠ isSample を落としたり、バッジを消したりしないこと。
       それをした時点で、上の3点すべてに抵触する。
   ══════════════════════════════════════════════════════════════ */
import { RANK_TIERS, rankTier, DEFAULT_RANK_KEY, GUEST_SLOT_SIZE } from "./pricing.js";

/* 自分のランクのひとつ上。最上位（プラチナ）なら null。 */
export function nextTierOf(myTierKey) {
  const mine = rankTier(myTierKey ?? DEFAULT_RANK_KEY);
  return RANK_TIERS.find((t) => t.order === mine.order + 1) ?? null;
}

/* ホームに並べる件数の上限（実在の募集 + 見本の合計） */
export const NEXT_TIER_SLOTS = 3;

/* ── 見本の材料 ───────────────────────────────────
   実在の店名・人物は使わない。「どんな会か」の雰囲気だけが伝わればよい。 */
const SAMPLE_AREAS = ["渋谷", "恵比寿", "中目黒", "六本木", "西麻布", "銀座", "新宿"];
const SAMPLE_TITLES = [
  "静かな一軒で、ゆっくり",
  "金曜の夜に、軽く一杯",
  "料理のおいしい店で",
  "week end の前夜祭",
  "日本酒をすこし丁寧に",
  "半年ぶりの集まりに",
  "気楽に、いつもの二人で",
];
const SAMPLE_STYLES = [
  ["まったり派", "食事メイン"],
  ["2件目OK", "ガンガン飲む派"],
  ["終電で帰る", "お酒は少なめ"],
  ["オールナイトOK", "2件目OK"],
  ["まったり派", "お酒は少なめ"],
];
const SAMPLE_TIMES = ["19:00", "19:30", "20:00", "20:30", "21:00"];

/* 種から決まる擬似乱数（mulberry32）。
   毎回の描画で並びが変わると「壊れている」ように見えるので、
   同じ人・同じ日・同じランク帯なら同じ見本が出るようにする。 */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* 見本の会をつくる。

   ⚠ 返る値には必ず isSample: true が入る。画面はこれを見て
     「例」のバッジを出し、詳細を開かせない。
   ⚠ id は "sample:" で始まる文字列。実在の会の UUID とは絶対に衝突しない。
     取り違えて api.getParty() に渡しても、UUID ではないので落ちる。 */
export function makeSampleParties(tierKey, { seed = "", count = NEXT_TIER_SLOTS } = {}) {
  const tier = rankTier(tierKey);
  const rand = seededRandom(hashString(`${seed}|${tier.key}|${count}`));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const hostSize = 2 + Math.floor(rand() * 2);        // 2〜3名
    return {
      id: `sample:${tier.key}:${i}`,
      isSample: true,
      title: pick(SAMPLE_TITLES),
      area: pick(SAMPLE_AREAS),
      location: null,                                    // 実在の店名は出さない
      party_time: pick(SAMPLE_TIMES),
      party_date: null,
      host_group_size: hostSize,
      guest_group_size: GUEST_SLOT_SIZE,
      current_members: hostSize,
      max_members: hostSize + GUEST_SLOT_SIZE,
      budget_tier: tier.key,
      min_guest_tier: tier.key,
      host_drinking_style: pick(SAMPLE_STYLES),
      host_avatar_blur_url: null,                        // 見本に人の写真は使わない
      avg_budget: null,
    };
  });
}

/* 実在の募集を先に並べ、足りない分だけ見本で埋める。
   実在のものは見本より必ず前に出す（本物を埋もれさせない）。 */
export function mixWithSamples(realParties, tierKey, { seed = "", slots = NEXT_TIER_SLOTS } = {}) {
  const real = (realParties ?? []).slice(0, slots);
  const shortfall = Math.max(0, slots - real.length);
  if (shortfall === 0) return { items: real, sampleCount: 0 };
  const samples = makeSampleParties(tierKey, { seed, count: shortfall });
  return { items: [...real, ...samples], sampleCount: samples.length };
}
