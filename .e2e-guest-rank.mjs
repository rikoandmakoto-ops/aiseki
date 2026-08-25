/* 「参加する側（ゲスト＝主に男性）にも評価が付き、ランクが上がり、
   そのランクが実際に効くか」を本番スキーマに対して確かめる。

   既存の .e2e-rank.mjs は「ホストが評価を受け取る」経路しか通していないため、
   ゲスト側が同じように扱われることを別途確認する必要がある。

   作ったユーザー・会は最後に必ず消す（--keep で残せる）。
   実行: node .e2e-guest-rank.mjs */
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
console.log(`接続先: ${URL}\n`);

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const stamp = Date.now();
const made = [];

async function makeUser(tag, gender) {
  const email = `theoffzaki+g${stamp}${tag}@gmail.com`;
  const password = "Test123456!";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `検証${tag}`, birth_date: "1994-05-05", gender },
  });
  if (error) throw new Error(`${tag} の作成に失敗: ${error.message}`);
  made.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${tag} のログインに失敗: ${e2.message}`);
  return { id: data.user.id, client, email, gender };
}

const dateStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

try {
  /* 会を主催した人（女性）と、参加した側の3人（男性）。
     評価を受け取るのは参加側の g。 */
  const host = await makeUser("host", "女性");
  const g = await makeUser("guest", "男性");   // ← 評価を受け取る参加側
  const r1 = await makeUser("r1", "男性");     // 同じ参加グループの仲間
  const r2 = await makeUser("r2", "女性");     // ホスト側のもう1人

  /* ─────────── 1. 参加側が最初はランクを持っていること ─────────── */
  {
    const { data, error } = await g.client.rpc("my_rank");
    ok("参加側（男性）も my_rank() を呼べる", !error && !!data, error?.message ?? "");
    ok("初期状態は bronze・0件", data?.tier_key === "bronze" && data?.review_count === 0,
      `${data?.tier_key} / ${data?.review_count}件`);
    ok("性別によってランクの扱いが変わらない（ホストと同じ初期値）", data?.tier_key === "bronze");
  }

  /* ─────────── 2. 終わった会に、参加側として着席させる ─────────── */
  const { data: past, error: pastErr } = await admin.from("parties").insert({
    host_id: host.id, title: "参加側ランク検証（過去の会）", area: "渋谷",
    host_group_size: 2, guest_group_size: 2,
    party_date: dateStr(-2), party_time: "20:00", budget_tier: "bronze",
  }).select("id").single();
  if (pastErr) throw new Error("過去の会を作れませんでした: " + pastErr.message);

  // ホストの席は on_party_created トリガーが作る。残りを足す。
  const { error: seatErr } = await admin.from("party_members").insert([
    { party_id: past.id, user_id: r2.id, group_owner_id: host.id, side: "host", role: "member", display_name: "R2" },
    { party_id: past.id, user_id: g.id, group_owner_id: g.id, side: "guest", role: "member", display_name: "G" },
    { party_id: past.id, user_id: r1.id, group_owner_id: g.id, side: "guest", role: "member", display_name: "R1" },
  ]);
  if (seatErr) throw new Error("席を作れませんでした: " + seatErr.message);
  {
    const { data } = await admin.from("party_members").select("user_id, side").eq("party_id", past.id);
    const g_ = (data ?? []).find((m) => m.user_id === g.id);
    ok("評価を受け取る本人が『参加する側（guest）』で着席している", g_?.side === "guest", `side=${g_?.side}`);
  }

  /* ─────────── 3. ホスト側 → 参加側 に評価が書けること ─────────── */
  const review = (who, target, rating) => who.client.from("user_reviews").insert({
    party_id: past.id, reviewed_id: target.id, reviewer_id: who.id, rating,
  });

  {
    const { error } = await review(host, g, 5);
    ok("ホストが参加側を評価できる", !error, error?.message?.slice(0, 90) ?? "");
  }
  {
    const { error } = await review(r2, g, 5);
    ok("ホスト側のもう1人も参加側を評価できる", !error, error?.message?.slice(0, 90) ?? "");
  }
  {
    // 同じ参加グループの仲間からも書ける（側を問わない）
    const { error } = await review(r1, g, 5);
    ok("同じ参加グループの仲間も評価できる（側を問わない）", !error, error?.message?.slice(0, 90) ?? "");
  }
  {
    // 逆向き（参加側 → ホスト）も従来どおり書ける
    const { error } = await review(g, host, 4);
    ok("参加側からホストへの評価も従来どおり書ける", !error, error?.message?.slice(0, 90) ?? "");
  }

  /* ─────────── 4. 参加側のランクが実際に上がること ─────────── */
  {
    const { data } = await g.client.rpc("my_rank");
    ok("参加側の平均点・件数が集計されている",
      Number(data?.review_average) === 5 && data?.review_count === 3,
      `平均${data?.review_average} / ${data?.review_count}件`);
    ok("参加側でも 3件・平均5.00 で platinum に上がる", data?.tier_key === "platinum",
      `${data?.tier_key}`);
    ok("ランクが確定している（ranked = true）", data?.ranked === true, `= ${data?.ranked}`);
  }

  /* ─────────── 5. 上がったランクが実際に効くこと ─────────── */
  {
    const { data, error } = await g.client.rpc("can_use_budget_tier", { p_tier: "platinum" });
    ok("参加して得たランクで platinum の予算帯が解禁される", !error && data === true, `= ${data}`);
  }
  {
    // 参加側として評価を集めた人が、今度は自分が主催する会で上の予算帯を選べる
    const { data, error } = await g.client.from("parties").insert({
      host_id: g.id, title: "参加側ランク検証（主催）", area: "渋谷",
      host_group_size: 2, guest_group_size: 2,
      party_date: dateStr(7), party_time: "20:00", budget_tier: "platinum",
    }).select("id, budget_tier").single();
    ok("参加で得たランクで、上位の予算帯の会を主催できる", !error && data?.budget_tier === "platinum",
      error?.message?.slice(0, 90) ?? `= ${data?.budget_tier}`);
  }

  /* ─────────── 6. 見え方は変わっていないこと（§13の担保） ─────────── */
  {
    const { data, error } = await host.client
      .from("profiles").select("id, rank_tier").eq("id", g.id);
    ok("他人のランクは読めないまま（列単位で遮断）", !!error || !data?.[0]?.rank_tier,
      error?.message?.slice(0, 60) ?? JSON.stringify(data));
  }
  {
    const { data, error } = await host.client
      .from("profiles").select("id, review_average, review_count").eq("id", g.id);
    ok("他人の平均点・件数も読めないまま", !!error || !data?.[0]?.review_average,
      error?.message?.slice(0, 60) ?? JSON.stringify(data));
  }
  {
    const { data } = await host.client.from("user_reviews").select("rating, reviewed_id");
    // ホストが書いたのは g への1件だけ。g が host に書いた分は見えない。
    ok("自分が書いた評価しか見えないまま", (data ?? []).every((r) => r.reviewed_id === g.id),
      `${data?.length}件`);
  }
  {
    const { error } = await g.client.rpc("user_rank_tier", { p_user: host.id });
    ok("他人のランクを引く関数は呼べないまま", !!error, error?.message?.slice(0, 60) ?? "呼べてしまった");
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
    for (const id of made) await admin.auth.admin.deleteUser(id);
    console.log(`\n片付け: ユーザー${made.length}件を削除しました`);
  }
}
