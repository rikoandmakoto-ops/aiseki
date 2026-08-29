/* SMS（電話番号）認証の E2E。本番スキーマに対して実行し、最後に必ず ROLLBACK する
   （本番データは1行も変わらない）。

     node .e2e-sms.mjs

   見るもの:
     ・phone_verified を利用者が読めない／書けない
     ・認証が済むまで 会の作成・参加申込・相方の同意 が通らない
     ・番号を変えると認証が外れる
     ・同じ番号を2アカウントで認証済みにできない
     ・送信・照合の回数制限
   Twilio を実際に叩く分は .e2e-sms-api.mjs（こちらは通信しない）。
*/
import fs from "node:fs"; import pg from "pg";
const env = fs.readFileSync(".env", "utf8");
const ref = env.match(/^VITE_SUPABASE_URL=.*https:\/\/([a-z0-9]+)\.supabase\.co/m)[1];
if (ref !== "melfyxfvhyknqhruytms") { console.error("想定外の接続先:", ref); process.exit(1); }
const cmd = fs.readFileSync("apply_migrations.command", "utf8");
const password = decodeURIComponent(cmd.match(new RegExp("^DB_URL=\"postgresql://postgres:([^@]+)@db\\." + ref, "m"))[1]);
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
console.log("接続先:", `db.${ref}.supabase.co`);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`  ✗ ${name}  ← 失敗 ${extra}`); }
};
const q = async (sql, params) => (await c.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = async (uid) => c.query(`set local role authenticated; set local request.jwt.claims = '${JSON.stringify({ sub: uid, role: "authenticated" })}'`);
const asAnon = async () => c.query(`set local role anon; set local request.jwt.claims = '${JSON.stringify({ role: "anon" })}'`);
const asService = async () => c.query(`set local role service_role; set local request.jwt.claims = '${JSON.stringify({ role: "service_role" })}'`);
const asPostgres = async () => c.query("reset role; set local request.jwt.claims = ''");

const expectFail = async (name, fn, re) => {
  await c.query("savepoint ef");
  try {
    await fn();
    await c.query("rollback to ef");
    fail++; console.log(`  ✗ ${name}  ← 通ってしまった`);
  } catch (e) {
    await c.query("rollback to ef").catch(() => {});
    if (!re || re.test(e.message)) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}  ← 別のエラー: ${e.message}`); }
  }
  await c.query("release savepoint ef").catch(() => {});
  await asPostgres();
};

const mkUser = async (name, phone, birth = "1995-05-05", extra = {}) => {
  await asPostgres();
  const id = (await one(`select gen_random_uuid() id`)).id;
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       $2,'x',now(),'{}'::jsonb,$3::jsonb,now(),now())`,
    [id, `e2e-sms-${id}@example.test`, JSON.stringify({ username: name, birth_date: birth, gender: "女性", phone_number: phone, ...extra })]
  );
  return id;
};

/* サーバ（/api/sms/check）がやることと同じ＝ service_role で印を立てる */
const markVerified = async (uid) => {
  await asService();
  const r = await one(`select public.sms_verify_mark($1) v`, [uid]);
  await asPostgres();
  return r.v;
};

const mkParty = async (host) => {
  await as(host);
  const gid = (await one(`select public.create_group('のみ会') id`)).id;
  await q(`select public.add_group_member($1,'ゆうと')`, [gid]);
  const p = await one(
    `insert into public.parties (host_id,title,location,area,party_date,party_time,group_id)
     values ($1,'金曜の乾杯','立呑み アオ','渋谷',current_date + 3,'20:00',$2)
     returning id`,
    [host, gid]
  );
  await asPostgres();
  return p;
};

try {
  await c.query("begin");

  /* ─────────── 1. 列と権限 ─────────── */
  console.log("\n=== 1. phone_verified は利用者から読めず、書き換えられない ===");
  const cols = await q(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='profiles'
        and column_name in ('phone_verified','phone_verified_at')`);
  ok("phone_verified / phone_verified_at がある", cols.length === 2, `${cols.length}件`);

  const grants = await q(
    `select count(*)::int n from information_schema.column_privileges
      where table_schema='public' and table_name='profiles'
        and column_name in ('phone_verified','phone_verified_at')
        and grantee in ('anon','authenticated')
        and privilege_type in ('SELECT','INSERT','UPDATE')`);
  ok("anon / authenticated に列単位の権限が無い", grants[0].n === 0, `${grants[0].n}件`);

  const alice = await mkUser("あかり", "090-1111-2222");
  const bob = await mkUser("ひろき", "090-3333-4444");

  await expectFail("authenticated は phone_verified を select できない",
    async () => { await as(alice); await q(`select phone_verified from public.profiles where id=$1`, [alice]); },
    /permission denied/i);

  await expectFail("authenticated は phone_verified を update できない",
    async () => { await as(alice); await q(`update public.profiles set phone_verified = true where id=$1`, [alice]); },
    /permission denied/i);

  for (const fn of [
    "public.sms_verify_mark($1)",
    "public.sms_verify_begin($1, '+819011112222')",
    "public.sms_verify_touch_check($1)",
    "public.assert_phone_verified($1)",
    "public.is_phone_verified($1)",
  ]) {
    await expectFail(`authenticated は ${fn.split("(")[0].replace("public.", "")} を実行できない`,
      async () => { await as(alice); await q(`select ${fn}`, [alice]); },
      /permission denied|does not exist/i);
  }

  /* ─────────── 2. 本人向けの窓口 ─────────── */
  console.log("\n=== 2. my_phone_status は本人分だけを返す ===");
  await as(alice);
  const st = (await one(`select public.my_phone_status() s`)).s;
  ok("本人は自分の電話番号を読める", st?.phone_number === "+819011112222", `phone=${st?.phone_number}`);
  ok("最初は未認証", st?.verified === false, `verified=${st?.verified}`);
  await asPostgres();

  await expectFail("anon は my_phone_status を実行できない",
    async () => { await asAnon(); await q(`select public.my_phone_status()`); },
    /permission denied/i);

  /* ─────────── 3. 参加の関門 ─────────── */
  console.log("\n=== 3. 認証が済むまで参加させない ===");
  await expectFail("未認証では会を作れない",
    async () => { await mkParty(bob); },
    /SMS認証/);

  //  ホストだけ認証して会を用意する
  const markedBob = await markVerified(bob);
  ok("service_role は認証済みにできる", markedBob?.ok === true, JSON.stringify(markedBob));
  const party = await mkParty(bob);
  ok("認証済みのホストは会を作れる", !!party?.id);

  await expectFail("未認証では参加を申し込めない",
    async () => {
      await as(alice);
      await q(`insert into public.join_requests (user_id, party_id, group_size, member_names, pay_mode, status)
               values ($1,$2,2,array['ゆうか'],'bundle','pending')`, [alice, party.id]);
    },
    /SMS認証/);

  await markVerified(alice);
  await as(alice);
  const req = await one(
    `insert into public.join_requests (user_id, party_id, group_size, member_names, pay_mode, status)
     values ($1,$2,2,array['ゆうか'],'bundle','pending') returning id`, [alice, party.id]);
  await asPostgres();
  ok("認証済みなら申し込める", !!req?.id);

  /* ─────────── 4. 相方の同意 ─────────── */
  console.log("\n=== 4. 相方の同意にも認証が要る ===");
  const carol = await mkUser("さやか", "090-5555-6666");   // 相方（未認証）
  const frank = await mkUser("ふみや", "090-6666-7777");   // 別の申込者
  await markVerified(frank);
  await as(frank);
  const req2 = await one(
    `insert into public.join_requests (user_id, party_id, group_size, member_names, pay_mode, partner_id, status)
     values ($1,$2,2,array[]::text[],'split',$3,'pending') returning id`, [frank, party.id, carol]);
  await asPostgres();

  await expectFail("未認証の相方は同意できない",
    async () => { await as(carol); await q(`select public.confirm_join_partner($1)`, [req2.id]); },
    /SMS認証/);

  await markVerified(carol);
  await as(carol);
  const confirmed = (await one(`select public.confirm_join_partner($1) r`, [req2.id])).r;
  await asPostgres();
  ok("認証済みの相方は同意できる", confirmed?.already === false, JSON.stringify(confirmed));

  /* ─────────── 5. 番号を変えたら認証は外れる ─────────── */
  console.log("\n=== 5. 電話番号を変えると認証が外れる ===");
  await as(carol);
  await q(`select public.set_my_phone_number('080-7777-8888')`);
  const afterChange = (await one(`select public.my_phone_status() s`)).s;
  await asPostgres();
  ok("番号が変わっている", afterChange?.phone_number === "+818077778888", `phone=${afterChange?.phone_number}`);
  ok("🚨 認証が外れている", afterChange?.verified === false, `verified=${afterChange?.verified}`);

  await expectFail("認証が外れた相手は同意し直せない",
    async () => { await as(carol); await q(`select public.confirm_join_partner($1)`, [req2.id]); },
    /SMS認証/);

  /* ─────────── 6. 番号1つ＝1アカウント ─────────── */
  console.log("\n=== 6. 同じ番号を2アカウントで認証済みにできない ===");
  const dave = await mkUser("だいき", "090-1111-2222");   // あかりと同じ番号
  const dup = await markVerified(dave);
  ok("2人目は認証済みにならない", dup?.ok === false && dup?.reason === "duplicate", JSON.stringify(dup));
  const daveVerified = await one(`select phone_verified from public.profiles where id=$1`, [dave]);
  ok("印も立っていない", daveVerified.phone_verified === false);

  await expectFail("一意索引が直接の二重登録も止める",
    async () => { await asPostgres(); await q(`update public.profiles set phone_verified=true where id=$1`, [dave]); },
    /profiles_phone_verified_uniq|unique/i);

  /* 番号を消したときは、CHECK に落ちる前にトリガが認証を外す
     （＝「番号が無いのに認証済み」という行は作れない） */
  await asPostgres();
  await q(`update public.profiles set phone_number = null where id=$1`, [alice]);
  const cleared = await one(`select phone_number, phone_verified from public.profiles where id=$1`, [alice]);
  ok("番号を消すと認証も外れる", cleared.phone_number === null && cleared.phone_verified === false,
    JSON.stringify(cleared));
  const chk = await one(`select count(*)::int n from pg_constraint where conname='profiles_phone_verified_needs_number'`);
  ok("番号なしの認証済みを禁じる CHECK がある", chk.n === 1);

  /* ─────────── 7. 回数制限 ─────────── */
  console.log("\n=== 7. 送信・照合の回数制限 ===");
  const erin = await mkUser("えりな", "090-9999-0000");
  await asService();
  const first = (await one(`select public.sms_verify_begin($1,'+819099990000') r`, [erin])).r;
  ok("1回目は送れる", first?.ok === true, JSON.stringify(first));
  const second = (await one(`select public.sms_verify_begin($1,'+819099990000') r`, [erin])).r;
  ok("続けて押しても送れない（間隔）", second?.ok === false && second?.reason === "too_soon",
    `retry_after=${second?.retry_after}`);

  //  間隔だけ過去にずらして、1日の上限を確かめる
  let last;
  for (let i = 0; i < 6; i++) {
    await q(`update public.phone_verify_attempts set last_sent_at = now() - interval '5 minutes' where user_id=$1`, [erin]);
    last = (await one(`select public.sms_verify_begin($1,'+819099990000') r`, [erin])).r;
  }
  ok("1日の上限で止まる", last?.ok === false && last?.reason === "daily_limit", JSON.stringify(last));

  const cnt = await one(`select send_count from public.phone_verify_attempts where user_id=$1`, [erin]);
  ok("上限を超えて数が増えない", cnt.send_count === 5, `send_count=${cnt.send_count}`);

  let check;
  for (let i = 0; i < 16; i++) {
    check = (await one(`select public.sms_verify_touch_check($1) r`, [erin])).r;
  }
  ok("コードの入力回数にも上限がある", check?.ok === false && check?.reason === "check_limit", JSON.stringify(check));

  //  認証が通ると数え直す
  const markedErin = await (async () => { const r = (await one(`select public.sms_verify_mark($1) r`, [erin])).r; return r; })();
  ok("認証できる", markedErin?.ok === true, JSON.stringify(markedErin));
  const reset = await one(`select send_count, check_count from public.phone_verify_attempts where user_id=$1`, [erin]);
  ok("認証後は数え直す", reset.send_count === 0 && reset.check_count === 0,
    `send=${reset.send_count} check=${reset.check_count}`);
  await asPostgres();

  await expectFail("authenticated は回数の表を読めない",
    async () => { await as(erin); await q(`select * from public.phone_verify_attempts`); },
    /permission denied/i);

  /* ─────────── 8. 既存の担保が壊れていない ─────────── */
  console.log("\n=== 8. §24 / §25-b が据え置きであること ===");
  const nameGrants = await q(
    `select count(*)::int n from information_schema.column_privileges
      where table_schema='public' and table_name='profiles'
        and column_name in ('phone_number','real_name') and grantee in ('anon','authenticated')
        and privilege_type in ('SELECT','INSERT','UPDATE')`);
  ok("氏名・電話番号は引き続き他のユーザーから読めない", nameGrants[0].n === 0, `${nameGrants[0].n}件`);
  const norm = await one(`select public.normalize_phone_jp('０９０１２３４５６７８') p`);
  ok("E.164 正規化はそのまま", norm.p === "+819012345678", `p=${norm.p}`);
  const preview = await one(`select pg_get_functiondef('public.party_host_preview(uuid)'::regprocedure) d`);
  ok("party_host_preview は電話番号を返さない", !/phone_number/.test(preview.d));

  console.log(`\n=========== ${pass} 件成功 / ${fail} 件失敗 ===========`);
} finally {
  await c.query("rollback");
  console.log("（ROLLBACK 済み。本番データは変更していない）");
  await c.end();
}
process.exit(fail === 0 ? 0 : 1);
