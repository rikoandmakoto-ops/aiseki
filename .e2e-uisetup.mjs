/* 画面確認用の使い捨てデータを作る（確認後 .e2e-uisetup.mjs --clean で消す）。
   ・ログイン用のユーザー1名（bronze のまま）
   ・platinum のホスト1名と、条件なし／ゴールド以上の会を1つずつ */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = "/Users/ayukiyamazaki/Developer/aiseki";
const STATE = `${ROOT}/.e2e-uisetup.json`;
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env`, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

if (process.argv.includes("--clean")) {
  if (existsSync(STATE)) {
    const { users } = JSON.parse(readFileSync(STATE, "utf8"));
    for (const id of users) await admin.auth.admin.deleteUser(id);
    unlinkSync(STATE);
    console.log(`片付け: ユーザー${users.length}件を削除しました`);
  } else {
    console.log("片付けるものはありません");
  }
  process.exit(0);
}

const stamp = Date.now();
const users = [];
const password = "Test123456!";

async function makeUser(tag, gender) {
  const email = `theoffzaki+ui${stamp}${tag}@gmail.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `確認${tag}`, birth_date: "1994-05-05", gender },
  });
  if (error) throw new Error(`${tag}: ${error.message}`);
  users.push(data.user.id);
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client, email, tag };
}

const dateStr = (o) => { const d = new Date(); d.setDate(d.getDate() + o);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const me = await makeUser("me", "男性");
const host = await makeUser("host", "女性");
const r1 = await makeUser("r1", "女性");
const r2 = await makeUser("r2", "男性");
const r3 = await makeUser("r3", "その他");

/* ホストを platinum に上げる */
const { data: past } = await admin.from("parties").insert({
  host_id: host.id, title: "確認用（終わった会）", area: "渋谷",
  host_group_size: 2, guest_group_size: 2,
  party_date: dateStr(-2), party_time: "20:00", budget_tier: "bronze",
}).select("id").single();
await admin.from("party_members").insert([r1, r2, r3].map((r) => ({
  party_id: past.id, user_id: r.id, group_owner_id: r1.id,
  side: "guest", role: "member", display_name: r.tag,
})));
for (const r of [r1, r2, r3]) {
  await r.client.from("user_reviews").insert({
    party_id: past.id, reviewed_id: host.id, reviewer_id: r.id, rating: 5,
  });
}

/* 募集中の会を2つ（条件なし／ゴールド以上） */
for (const [tier, title] of [["bronze", "確認用・どなたでも"], ["gold", "確認用・ゴールド以上"]]) {
  const { error } = await host.client.from("parties").insert({
    host_id: host.id, title, area: "銀座", location: "確認用のお店",
    host_group_size: 2, guest_group_size: 2, host_member_names: ["同伴者"],
    party_date: dateStr(2), party_time: "20:00",
    budget_tier: "bronze", min_guest_tier: tier,
  });
  if (error) throw new Error(`${title}: ${error.message}`);
}

/* me が host の会に申し込んだ状態も作る（受信箱のランク表示を見るため） */
writeFileSync(STATE, JSON.stringify({ users, login: { email: me.email, password } }, null, 2));
console.log("ログイン用:", me.email, "/", password);
console.log("ホスト用:  ", host.email, "/", password);
