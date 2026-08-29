/* /api/sms/* の通し検証。**Twilio を実際に叩く（SMSが1通飛ぶ）。**

     node .e2e-sms-api.mjs

   ・Vercel Functions のハンドラを直接 import して Request を渡す
     （vercel dev はこのプロジェクトでは画面が壊れるため使わない。HANDOFF §6）。
   ・テスト用のアカウントは最後に必ず消す。
   ・コードは分からないので「間違ったコードが弾かれること」までを見る。
     approved の経路は DB 側（.e2e-sms.mjs の sms_verify_mark）で確認済み。
*/
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/melfyxfvhyknqhruytms/.test(BASE)) { console.error("想定外の接続先:", BASE); process.exit(1); }

/* 依頼で受け取ったテスト用の番号。ここへ実際にSMSが飛ぶ。 */
const TEST_PHONE = "07041804390";
const PASSWORD = "AisekiSmsTest2026!";

const { POST: startPost } = await import("./api/sms/start.js");
const { POST: checkPost } = await import("./api/sms/check.js");
const { GET: statusGet } = await import("./api/sms/status.js");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`  ✗ ${name}  ← 失敗 ${extra}`); }
};

const req = (body, token) => new Request("https://aisekimatch.com/api/sms/start", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body ?? {}),
});
const read = async (res) => ({ status: res.status, body: await res.json() });

const admin = createClient(BASE, SR, { auth: { persistSession: false, autoRefreshToken: false } });
let userId = null;

try {
  console.log("接続先:", BASE);

  console.log("\n=== 0. 設定 ===");
  const st = await read(await statusGet());
  ok("/api/sms/status が enabled:true を返す", st.body?.enabled === true, JSON.stringify(st.body));

  console.log("\n=== 1. ログインしていないと使えない ===");
  const noAuth = await read(await startPost(req({})));
  ok("start は 401", noAuth.status === 401, `status=${noAuth.status}`);
  const noAuthCheck = await read(await checkPost(req({ code: "123456" })));
  ok("check も 401", noAuthCheck.status === 401, `status=${noAuthCheck.status}`);

  console.log("\n=== 2. テスト用アカウントを作る ===");
  const email = `theoffzaki+sms${Date.now().toString().slice(-6)}@gmail.com`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: {
      username: "SMS検証", birth_date: "1994-04-04", age_confirmed: true,
      gender: "男性", account_type: "full", real_name: "検証 太郎",
      /* 番号はあえて入れずに作る（電話番号を取る前に登録した既存ユーザーと同じ状態） */
    },
  });
  if (cErr) throw new Error("createUser: " + cErr.message);
  userId = created.user.id;
  ok("作成できた", !!userId, email);

  const anonClient = createClient(BASE, ANON, { auth: { persistSession: false } });
  const { data: session, error: sErr } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error("signIn: " + sErr.message);
  const token = session.session.access_token;
  ok("ログインできた", !!token);

  console.log("\n=== 3. 電話番号が未登録のとき ===");
  const noPhone = await read(await startPost(req({}, token)));
  ok("番号を求められる（needPhone）", noPhone.status === 400 && noPhone.body?.needPhone === true,
    JSON.stringify(noPhone.body));

  console.log("\n=== 4. 不正な番号はサーバ側で弾く ===");
  for (const bad of ["0312345678", "00000000", "でたらめ", "090-0000"]) {
    const r = await read(await startPost(req({ phone: bad }, token)));
    ok(`「${bad}」は受け取らない`, r.status === 400, `status=${r.status} ${r.body?.error ?? ""}`);
  }
  const { data: stillNull } = await admin.from("profiles").select("phone_number").eq("id", userId).single();
  ok("不正な番号は保存もされていない", stillNull?.phone_number === null, `phone=${stillNull?.phone_number}`);

  console.log("\n=== 5. 正しい番号を渡すと保存して送る（実際にSMSが飛ぶ） ===");
  const sent = await read(await startPost(req({ phone: TEST_PHONE }, token)));
  ok("送信できた", sent.status === 200 && sent.body?.ok === true, JSON.stringify(sent.body));
  ok("E.164 に正規化して送っている", sent.body?.phone === "+817041804390", `phone=${sent.body?.phone}`);
  const { data: saved } = await admin.from("profiles").select("phone_number, phone_verified").eq("id", userId).single();
  ok("プロフィールに保存された", saved?.phone_number === "+817041804390", `phone=${saved?.phone_number}`);
  ok("この時点ではまだ未認証", saved?.phone_verified === false);

  console.log("\n=== 6. 連打は止まる ===");
  const again = await read(await startPost(req({}, token)));
  ok("すぐの再送は 429", again.status === 429, `status=${again.status} ${again.body?.error ?? ""}`);
  ok("待ち時間が返る", Number(again.body?.retryAfter) > 0, `retryAfter=${again.body?.retryAfter}`);

  console.log("\n=== 7. コードの照合 ===");
  const empty = await read(await checkPost(req({ code: "" }, token)));
  ok("空のコードは 400", empty.status === 400, `status=${empty.status}`);
  const wrong = await read(await checkPost(req({ code: "000000" }, token)));
  ok("違うコードは弾かれる", wrong.status === 400 && (wrong.body?.wrong === true || wrong.body?.expired === true),
    JSON.stringify(wrong.body));

  const { data: after } = await admin.from("profiles").select("phone_verified").eq("id", userId).single();
  ok("🚨 違うコードでは認証済みにならない", after?.phone_verified === false, `verified=${after?.phone_verified}`);

  console.log(`\n=========== ${pass} 件成功 / ${fail} 件失敗 ===========`);
  console.log(`\n※ ${TEST_PHONE} に確認コードのSMSを1通お送りしました（Twilio Verify / 10分で失効）。`);
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(error ? `後片付けに失敗: ${error.message}` : "後片付け: テスト用アカウントを削除しました。");
  }
}
process.exit(fail === 0 ? 0 : 1);
