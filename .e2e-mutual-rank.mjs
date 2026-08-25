/* ランクを参加側にも効かせた分（migration_mutual_rank.sql）を
   本番スキーマに対して実際に叩いて確かめる。
   作ったユーザー・会は最後に必ず消す（--keep で残せる）。
   実行: node .e2e-mutual-rank.mjs */
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

async function makeUser(tag, gender) {
  const email = `theoffzaki+mr${stamp}${tag}@gmail.com`;
  const password = "Test123456!";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `相互${tag}`, birth_date: "1994-05-05", gender },
  });
  if (error) throw new Error(`${tag} の作成に失敗: ${error.message}`);
  made.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${tag} のログインに失敗: ${e2.message}`);
  return { id: data.user.id, client, email, tag };
}

const dateStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* 指定した人を、過去の会 + 3件の星5評価で platinum に上げる */
async function raiseToPlatinum(target, reviewers, label) {
  const { data: past, error } = await admin.from("parties").insert({
    host_id: target.id, title: `相互検証 ${label}`, area: "渋谷",
    host_group_size: 2, guest_group_size: 2,
    party_date: dateStr(-2), party_time: "20:00", budget_tier: "bronze",
  }).select("id").single();
  if (error) throw new Error(`過去の会を作れません: ${error.message}`);
  await admin.from("party_members").insert(
    reviewers.map((r) => ({
      party_id: past.id, user_id: r.id, group_owner_id: reviewers[0].id,
      side: "guest", role: "member", display_name: r.tag,
    }))
  );
  for (const r of reviewers) {
    await r.client.from("user_reviews").insert({
      party_id: past.id, reviewed_id: target.id, reviewer_id: r.id, rating: 5,
    });
  }
  return past.id;
}

try {
  /* host = 会を主催する側（おごられる側）／guest = 参加する側 */
  const host = await makeUser("host", "女性");
  const guest = await makeUser("guest", "男性");
  const r1 = await makeUser("r1", "女性");
  const r2 = await makeUser("r2", "男性");
  const r3 = await makeUser("r3", "その他");

  /* ═══════════ 1. 評価は最初から双方向（性別も side も見ない） ═══════════ */
  const mutualParty = await (async () => {
    const { data, error } = await admin.from("parties").insert({
      host_id: host.id, title: "相互検証（終わった会）", area: "銀座",
      host_group_size: 2, guest_group_size: 2,
      party_date: dateStr(-2), party_time: "20:00", budget_tier: "bronze",
    }).select("id").single();
    if (error) throw new Error("会を作れません: " + error.message);
    await admin.from("party_members").insert([
      { party_id: data.id, user_id: guest.id, group_owner_id: guest.id, side: "guest", role: "member", display_name: "ゲスト" },
    ]);
    return data.id;
  })();

  {
    // 参加した側（男性）→ 主催した側（女性）
    const { error } = await guest.client.from("user_reviews").insert({
      party_id: mutualParty, reviewed_id: host.id, reviewer_id: guest.id, rating: 4, comment: "楽しかったです",
    });
    ok("参加した側から主催した側へ評価できる", !error, error?.message?.slice(0, 80) ?? "");
  }
  {
    // 主催した側（女性）→ 参加した側（男性）: 同じポリシー1本で通る
    const { error } = await host.client.from("user_reviews").insert({
      party_id: mutualParty, reviewed_id: guest.id, reviewer_id: host.id, rating: 5, comment: "またぜひ",
    });
    ok("主催した側から参加した側へ評価できる（双方向）", !error, error?.message?.slice(0, 80) ?? "");
  }
  {
    const { data } = await admin.from("profiles")
      .select("review_count, review_average").eq("id", guest.id).single();
    ok("参加した側にも評価が積み上がる", data?.review_count === 1 && Number(data?.review_average) === 5,
      `${data?.review_count}件 / 平均${data?.review_average}`);
  }
  {
    const { data } = await guest.client.rpc("my_rank");
    ok("参加した側も my_rank() で自分の平均を見られる", Number(data?.review_average) === 5, `= ${data?.review_average}`);
    ok("my_rank() に参加側の情報が入っている（open_parties）",
      Number.isFinite(data?.open_parties), `open=${data?.open_parties} / gated=${data?.gated_parties}`);
  }
  {
    // 相手が自分に付けた評価は、相手にも本人にも見えないまま
    const { data } = await guest.client.from("user_reviews").select("id, reviewed_id");
    const onlyMine = (data ?? []).every((r) => r.reviewed_id !== guest.id);
    ok("自分が受けた評価の行は読めないまま", onlyMine, `${data?.length}件（自分が書いた分だけ）`);
  }

  /* ═══════════ 2. ランクの見え方（今回変えたのはここだけ） ═══════════ */
  {
    // 同じ会にいる相手 → rank_tier が見える
    const { data, error } = await guest.client
      .from("profiles").select("id, rank_tier, username").eq("id", host.id);
    ok("同じ会のメンバーの rank_tier は見える", !error && data?.length === 1 && !!data[0].rank_tier,
      error?.message?.slice(0, 60) ?? `= ${data?.[0]?.rank_tier}`);
  }
  {
    // 同じ会にいない相手 → 行そのものが返らない（RLS。列の権限ではない）
    const { data, error } = await guest.client
      .from("profiles").select("id, rank_tier").eq("id", r1.id);
    ok("同じ会にいない人の rank_tier は返らない", !error && (data?.length ?? 0) === 0,
      error?.message?.slice(0, 60) ?? `${data?.length}件`);
  }
  {
    const { data, error } = await guest.client
      .from("profiles").select("id, review_average").eq("id", host.id);
    ok("同じ会のメンバーでも平均点は読めない", !!error,
      error?.message?.slice(0, 60) ?? `読めてしまった: ${JSON.stringify(data)}`);
  }
  {
    const { data, error } = await guest.client
      .from("profiles").select("id, review_count").eq("id", host.id);
    ok("同じ会のメンバーでも件数は読めない", !!error,
      error?.message?.slice(0, 60) ?? `読めてしまった: ${JSON.stringify(data)}`);
  }
  {
    const { data, error } = await guest.client
      .from("profiles").select("id, gender").eq("id", host.id);
    ok("性別は今までどおり誰にも読めない", !!error,
      error?.message?.slice(0, 60) ?? `読めてしまった: ${JSON.stringify(data)}`);
  }
  {
    const r = await guest.client.from("profiles").update({ rank_tier: "platinum" }).eq("id", guest.id);
    ok("自分の rank_tier を書き換えられない", !!r.error, r.error?.message?.slice(0, 60) ?? "書き換えられてしまった");
  }
  {
    const r = await guest.client.rpc("user_rank_tier", { p_user: host.id });
    ok("user_rank_tier() は今までどおり呼べない", !!r.error, r.error?.message?.slice(0, 50) ?? `呼べてしまった: ${r.data}`);
  }

  /* ═══════════ 3. 会の参加条件（min_guest_tier） ═══════════ */
  await raiseToPlatinum(host, [r1, r2, r3], "ホストを昇格");
  {
    const { data } = await host.client.rpc("my_rank");
    ok("ホストが platinum に上がった", data?.tier_key === "platinum",
      `${data?.tier_key} / 平均${data?.review_average} / ${data?.review_count}件`);
  }

  const mkParty = (client, id, minTier, title) => client.from("parties").insert({
    host_id: id, title, area: "銀座",
    host_group_size: 2, guest_group_size: 2,
    party_date: dateStr(3), party_time: "20:00",
    budget_tier: "bronze", min_guest_tier: minTier,
  }).select("id, min_guest_tier, budget_tier").single();

  let openParty, goldParty;
  {
    const { data, error } = await mkParty(host.client, host.id, "bronze", "条件なしの会");
    openParty = data;
    ok("条件なし（bronze）の会を作れる", !error && data?.min_guest_tier === "bronze",
      error?.message?.slice(0, 80) ?? `= ${data?.min_guest_tier}`);
  }
  {
    const { data, error } = await mkParty(host.client, host.id, "gold", "ゴールド以上の会");
    goldParty = data;
    ok("gold 以上を条件にした会を作れる", !error && data?.min_guest_tier === "gold",
      error?.message?.slice(0, 80) ?? `= ${data?.min_guest_tier}`);
  }
  {
    const { error } = await mkParty(host.client, host.id, "でたらめ", "不正な条件の会");
    ok("存在しないランクを条件にはできない", !!error, error?.message?.slice(0, 60) ?? "通ってしまった");
  }
  {
    // 既定値。min_guest_tier を送らなくても会が作れる（列を足したのに壊れていないこと）
    const { data, error } = await host.client.from("parties").insert({
      host_id: host.id, title: "既定値の会", area: "渋谷",
      host_group_size: 2, guest_group_size: 2,
      party_date: dateStr(3), party_time: "20:00", budget_tier: "bronze",
    }).select("id, min_guest_tier").single();
    ok("min_guest_tier を送らなくても会は作れる", !error && data?.min_guest_tier === "bronze",
      error?.message?.slice(0, 80) ?? `= ${data?.min_guest_tier}`);
  }
  {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.from("parties")
      .select("id, min_guest_tier").eq("id", goldParty.id).single();
    ok("会の参加条件は未ログインでも見える（会の属性）",
      !error && data?.min_guest_tier === "gold", error?.message ?? `= ${data?.min_guest_tier}`);
  }
  {
    const r = await host.client.from("parties")
      .update({ min_guest_tier: "bronze" }).eq("id", goldParty.id);
    const { data } = await admin.from("parties").select("min_guest_tier").eq("id", goldParty.id).single();
    ok("成立後に参加条件を直接 UPDATE できない",
      data?.min_guest_tier === "gold", r.error?.message?.slice(0, 50) ?? `= ${data?.min_guest_tier}`);
  }

  /* ═══════════ 4. 条件を満たさない申し込みは DB が弾く ═══════════ */
  {
    const { data } = await guest.client.rpc("can_join_party", { p_party: goldParty.id });
    ok("can_join_party(gold) は bronze の人に false", data === false, `= ${data}`);
    const { data: d2 } = await guest.client.rpc("can_join_party", { p_party: openParty.id });
    ok("can_join_party(条件なし) は true", d2 === true, `= ${d2}`);
  }
  {
    const { error } = await guest.client.from("join_requests").insert({
      user_id: guest.id, party_id: goldParty.id, group_size: 2, member_names: ["同伴者"], status: "pending",
    });
    ok("ランクが足りないと参加を申し込めない", !!error, error?.message?.slice(0, 90) ?? "申し込めてしまった");
  }
  {
    const { data, error } = await guest.client.from("join_requests").insert({
      user_id: guest.id, party_id: openParty.id, group_size: 2, member_names: ["同伴者"], status: "pending",
    }).select("id").single();
    ok("条件なしの会には申し込める", !error && !!data, error?.message?.slice(0, 90) ?? "");
  }

  /* 参加する側を platinum に上げると、同じ会に申し込めるようになる */
  await raiseToPlatinum(guest, [r1, r2, r3], "ゲストを昇格");
  {
    const { data } = await guest.client.rpc("my_rank");
    ok("参加する側も評価で platinum に上がる", data?.tier_key === "platinum",
      `${data?.tier_key} / 平均${data?.review_average} / ${data?.review_count}件`);
  }
  {
    const { data } = await guest.client.rpc("can_join_party", { p_party: goldParty.id });
    ok("昇格後は can_join_party(gold) が true", data === true, `= ${data}`);
  }
  let goldRequestId;
  {
    const { data, error } = await guest.client.from("join_requests").insert({
      user_id: guest.id, party_id: goldParty.id, group_size: 2, member_names: ["同伴者"], status: "pending",
    }).select("id").single();
    goldRequestId = data?.id;
    ok("昇格後は gold 条件の会に申し込める", !error && !!data, error?.message?.slice(0, 90) ?? "");
  }
  {
    const { data } = await guest.client.rpc("my_rank");
    ok("my_rank() の open_parties が条件付きの会を含む",
      (data?.open_parties ?? 0) >= 2, `open=${data?.open_parties} / gated=${data?.gated_parties}`);
  }
  {
    // まだ bronze の r1 から見ると、gold の会は「申し込めない側」に数えられる
    const { data } = await r1.client.rpc("my_rank");
    ok("bronze の人には gated_parties が立つ",
      (data?.gated_parties ?? 0) >= 1, `open=${data?.open_parties} / gated=${data?.gated_parties}`);
  }

  /* ═══════════ 5. ホストの受信箱に届くランク ═══════════ */
  {
    const { data, error } = await host.client.rpc("list_incoming_request_ranks");
    const hit = (data ?? []).find((r) => r.request_id === goldRequestId);
    ok("ホストは届いた申請のランクを見られる", !error && !!hit,
      error?.message?.slice(0, 60) ?? `${data?.length}件 / ${hit?.tier_label}`);
    ok("返るのは区分だけ（平均点・件数は入らない）",
      !!hit && !("review_average" in hit) && !("review_count" in hit),
      hit ? Object.keys(hit).join(",") : "—");
  }
  {
    const { data, error } = await guest.client.rpc("list_incoming_request_ranks");
    ok("ホストでない人には何も返らない", !error && (data?.length ?? 0) === 0,
      error?.message?.slice(0, 60) ?? `${data?.length}件`);
  }
  {
    const { data } = await r1.client.rpc("list_incoming_request_ranks");
    ok("無関係の第三者にも何も返らない", (data?.length ?? 0) === 0, `${data?.length}件`);
  }

  /* ═══════════ 6. 会の作成が壊れていないこと（HANDOFF §14 の再発防止） ═══════════ */
  {
    const { data, error } = await host.client.from("parties").insert({
      host_id: host.id, title: "権限の通し確認", location: "どこかのお店", area: "新宿",
      host_group_size: 2, guest_group_size: 2, host_member_names: ["同伴者"],
      party_date: dateStr(4), party_time: "19:00",
      budget_tier: "bronze", min_guest_tier: "silver",
    }).select("id, min_guest_tier, status, current_members").single();
    ok("画面と同じ形の insert が通る（列単位 GRANT の抜けなし）", !error && !!data,
      error?.message?.slice(0, 90) ?? `${data?.min_guest_tier} / ${data?.status}`);
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
    console.log(`\n片付け: ユーザー${made.length}件を削除しました（会・評価は cascade で消えます）`);
  }
}
