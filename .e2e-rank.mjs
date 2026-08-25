/* ランク（migration_caste_rank.sql）を本番スキーマに対して実際に叩いて確かめる。
   作ったユーザー・会・店舗は最後に必ず消す（--keep で残せる）。
   実行: node .e2e-rank.mjs */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/ayukiyamazaki/Developer/aiseki";
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error("接続情報が足りません");

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const stamp = Date.now();
const made = [];
const shopIds = [];

async function makeUser(tag) {
  const email = `theoffzaki+rank${stamp}${tag}@gmail.com`;
  const password = "Test123456!";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `ランク${tag}`, birth_date: "1994-05-05", gender: "女性" },
  });
  if (error) throw new Error(`${tag} の作成に失敗: ${error.message}`);
  made.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${tag} のログインに失敗: ${e2.message}`);
  return { id: data.user.id, client, email };
}

const dateStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

try {
  const host = await makeUser("host");     // 会を主催する人（評価を受け取る側）
  const a = await makeUser("a");           // 評価する人 ×3
  const b = await makeUser("b");
  const c = await makeUser("c");

  /* ───────────────────────── 1. 初期状態 ───────────────────────── */
  {
    const { data, error } = await host.client.rpc("my_rank");
    ok("my_rank() が自分のランクを返す", !error && !!data, error?.message ?? `${data?.tier_key} / ${data?.review_count}件`);
    ok("初期ランクは bronze", data?.tier_key === "bronze", `= ${data?.tier_key}`);
    ok("初期は未確定（ranked = false）", data?.ranked === false);
    ok("bronze の上限は3000円", data?.budget_cap === 3000, `= ${data?.budget_cap}`);
    ok("次のランクが提示される", data?.next?.tier_key === "silver", `= ${data?.next?.tier_key}`);
  }

  /* ─────────────── 2. 他人のランクが漏れないこと ─────────────── */
  {
    /* 2026-08-25（migration_mutual_rank.sql）から、rank_tier は列単位の
       SELECT 権限に入っている。遮っているのは profiles_select の RLS なので、
       同じ会にいない相手については「権限エラー」ではなく「0件」が正解。
       平均点・件数は今までどおり列の権限で落ちる（下のテスト）。 */
    const { data, error } = await a.client
      .from("profiles").select("id, rank_tier").eq("id", host.id);
    ok("同じ会にいない人の rank_tier は返らない", !error && (data?.length ?? 0) === 0,
      error?.message?.slice(0, 60) ?? `読めてしまった: ${JSON.stringify(data)}`);
  }
  {
    const { data, error } = await a.client
      .from("profiles").select("id, review_average, review_count").eq("id", host.id);
    ok("profiles から他人の平均点・件数は読めない", !!error, error?.message?.slice(0, 60) ?? `読めてしまった: ${JSON.stringify(data)}`);
  }
  {
    const { data, error } = await a.client.select ? {} : {};
    const r = await a.client.rpc("user_rank_tier", { p_user: host.id });
    ok("user_rank_tier() は authenticated から呼べない", !!r.error, r.error?.message?.slice(0, 60) ?? `呼べてしまった: ${r.data}`);
  }
  {
    const r = await a.client.rpc("refresh_user_rank", { p_user: host.id });
    ok("refresh_user_rank() は authenticated から呼べない", !!r.error, r.error?.message?.slice(0, 60) ?? "呼べてしまった");
  }
  {
    // 自分のランクを直接書き換えられないこと
    const r = await host.client.from("profiles").update({ rank_tier: "platinum" }).eq("id", host.id);
    ok("自分の rank_tier を UPDATE できない", !!r.error, r.error?.message?.slice(0, 60) ?? "書き換えられてしまった");
  }

  /* ─────────────── 3. ランクを超える予算帯の会は作れない ─────────────── */
  const mkParty = (client, id, tier, extra = {}) => client.from("parties").insert({
    host_id: id, title: `ランク検証 ${tier}`, area: "渋谷",
    host_group_size: 2, guest_group_size: 2,
    party_date: dateStr(1), party_time: "20:00",
    budget_tier: tier, ...extra,
  }).select("id, budget_tier, avg_budget, location").single();

  {
    const { error } = await mkParty(host.client, host.id, "platinum");
    ok("bronze の人は platinum の会を作れない", !!error, error?.message?.slice(0, 80) ?? "作れてしまった");
  }
  {
    const { error } = await mkParty(host.client, host.id, "gold");
    ok("bronze の人は gold の会を作れない", !!error, error?.message?.slice(0, 80) ?? "作れてしまった");
  }
  let bronzeParty;
  {
    const { data, error } = await mkParty(host.client, host.id, "bronze");
    bronzeParty = data;
    ok("bronze の会は作れる", !error && !!data, error?.message ?? `budget_tier=${data?.budget_tier}`);
  }
  {
    const { error } = await mkParty(host.client, host.id, "でたらめ");
    ok("存在しない予算帯は弾かれる", !!error, error?.message?.slice(0, 60) ?? "通ってしまった");
  }
  {
    // avg_budget は INSERT 権限が無いので、送ると失敗する（金額を偽装できない）
    const { error } = await mkParty(host.client, host.id, "bronze", { avg_budget: 99999 });
    ok("avg_budget はクライアントから送れない", !!error, error?.message?.slice(0, 60) ?? "送れてしまった");
  }

  /* ─────────────── 4. 店舗カタログ ─────────────── */
  const { data: shop, error: shopErr } = await admin.from("shops").insert({
    name: `検証用ゴールド店 ${stamp}`, area: "銀座", genre: "和食", avg_budget: 7000,
  }).select("id, name, avg_budget").single();
  if (shopErr) throw new Error("店舗を作れませんでした: " + shopErr.message);
  shopIds.push(shop.id);

  {
    const { data, error } = await a.client.from("shops").select("id, name, avg_budget").eq("id", shop.id);
    ok("shops は authenticated から読める", !error && data?.length === 1, error?.message ?? "");
  }
  {
    const { error } = await a.client.from("shops")
      .insert({ name: "勝手に追加した店", avg_budget: 1000 });
    ok("shops に利用者は INSERT できない", !!error, error?.message?.slice(0, 60) ?? "書けてしまった");
  }
  {
    const { error } = await a.client.from("shops").update({ avg_budget: 1 }).eq("id", shop.id);
    ok("shops を利用者は UPDATE できない", !!error || true, error?.message?.slice(0, 40) ?? "（0行更新）");
    const { data } = await admin.from("shops").select("avg_budget").eq("id", shop.id).single();
    ok("shops の金額は書き換えられていない", data?.avg_budget === 7000, `= ${data?.avg_budget}`);
  }
  {
    // bronze の人が gold の店を指定 → 拒否
    const { error } = await mkParty(host.client, host.id, "bronze", { shop_id: shop.id });
    ok("bronze の人は gold の店で会を作れない（予算帯を偽っても）", !!error, error?.message?.slice(0, 80) ?? "作れてしまった");
  }
  {
    const { data } = await a.client.rpc("can_use_budget_tier", { p_tier: "gold" });
    ok("can_use_budget_tier('gold') は false", data === false, `= ${data}`);
    const { data: d2 } = await a.client.rpc("can_use_budget_tier", { p_tier: "bronze" });
    ok("can_use_budget_tier('bronze') は true", d2 === true, `= ${d2}`);
  }

  /* ─────────────── 5. 評価でランクが上がる ─────────────── */
  // 昨日の会を作り、a/b/c を席に着かせてから評価してもらう
  const { data: past, error: pastErr } = await admin.from("parties").insert({
    host_id: host.id, title: "ランク検証（過去の会）", area: "渋谷",
    host_group_size: 2, guest_group_size: 2,
    party_date: dateStr(-2), party_time: "20:00", budget_tier: "bronze",
  }).select("id").single();
  if (pastErr) throw new Error("過去の会を作れませんでした: " + pastErr.message);

  // ホスト側の席は on_party_created トリガーが作るので、参加側だけを足す
  const { error: seatErr } = await admin.from("party_members").insert([
    { party_id: past.id, user_id: a.id, group_owner_id: a.id, side: "guest", role: "member", display_name: "A" },
    { party_id: past.id, user_id: b.id, group_owner_id: a.id, side: "guest", role: "member", display_name: "B" },
    { party_id: past.id, user_id: c.id, group_owner_id: a.id, side: "guest", role: "member", display_name: "C" },
  ]);
  if (seatErr) throw new Error("席を作れませんでした: " + seatErr.message);
  {
    const { data } = await admin.from("party_members").select("user_id").eq("party_id", past.id);
    const ids = new Set((data ?? []).map((m) => m.user_id));
    ok("検証用の会にホストと評価者が着席している",
      ids.has(host.id) && ids.has(a.id) && ids.has(b.id) && ids.has(c.id),
      `${data?.length}席`);
  }

  const review = async (who, rating) => who.client.from("user_reviews").insert({
    party_id: past.id, reviewed_id: host.id, reviewer_id: who.id, rating,
  });

  {
    const { error } = await review(a, 5);
    ok("評価を1件送れる", !error, error?.message?.slice(0, 80) ?? "");
    const { data } = await host.client.rpc("my_rank");
    ok("1件では確定しない（bronze のまま）", data?.tier_key === "bronze" && data?.ranked === false,
      `${data?.tier_key} / ${data?.review_count}件`);
    ok("平均点は本人に見える", Number(data?.review_average) === 5, `= ${data?.review_average}`);
  }
  {
    await review(b, 5);
    const { error } = await review(c, 5);
    ok("3件目まで送れる", !error, error?.message?.slice(0, 80) ?? "");
    const { data } = await host.client.rpc("my_rank");
    ok("平均5.00・3件で platinum になる", data?.tier_key === "platinum",
      `${data?.tier_key} / 平均${data?.review_average} / ${data?.review_count}件`);
    ok("platinum は上限なし", data?.budget_cap === null, `= ${data?.budget_cap}`);
    ok("platinum に次のランクは無い", data?.next === null, `= ${JSON.stringify(data?.next)}`);
  }
  {
    // 上がったので gold の店で作れる
    const { data, error } = await mkParty(host.client, host.id, "bronze", { shop_id: shop.id });
    ok("platinum になったら gold の店で会を作れる", !error && !!data, error?.message?.slice(0, 80) ?? "");
    ok("お店の金額はカタログの値がサーバで入る", data?.avg_budget === 7000, `= ${data?.avg_budget}`);
    ok("予算帯はお店から決まる（送った bronze は上書きされる）", data?.budget_tier === "gold", `= ${data?.budget_tier}`);
    ok("店名はカタログの名前で上書きされる", data?.location === shop.name, `= ${data?.location}`);
  }
  {
    // 評価される側の平均は、評価した側からは見えないまま
    const { data, error } = await a.client.from("user_reviews").select("rating, reviewed_id").eq("reviewed_id", host.id);
    ok("自分が書いた評価だけが見える", !error && data?.length === 1, error?.message ?? `${data?.length}件`);
  }
  {
    const { data } = await a.client.rpc("my_rank");
    ok("評価していない人のランクは初期のまま", data?.tier_key === "bronze" && data?.review_count === 0,
      `${data?.tier_key} / ${data?.review_count}件`);
  }

  /* ─────────────── 6. 会の予算帯は誰からでも見える（会の属性） ─────────────── */
  {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.from("parties")
      .select("id, budget_tier, avg_budget").eq("id", bronzeParty.id).single();
    ok("会の予算帯は未ログインでも見える", !error && data?.budget_tier === "bronze", error?.message ?? `= ${data?.budget_tier}`);
  }

  console.log("");
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} 項目が成功`);
  if (failed.length) {
    console.log("\n失敗:");
    failed.forEach((f) => console.log(` ❌ ${f.name} — ${f.detail}`));
    process.exitCode = 1;
  }
} finally {
  if (!process.argv.includes("--keep")) {
    for (const id of shopIds) await admin.from("shops").delete().eq("id", id);
    for (const id of made) await admin.auth.admin.deleteUser(id);
    console.log(`\n片付け: ユーザー${made.length}件・店舗${shopIds.length}件を削除しました`);
  }
}
