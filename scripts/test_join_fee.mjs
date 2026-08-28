/* =====================================================================
   参加ポイントの仕様テスト（DB に対する実地テスト）

   確かめること
     1. 参加ポイントは 1人あたり一律 3,800pt であること
     2. ホストが金額を設定しようとしても、その値は保存されないこと
     3. お会計の区分は「ゲストのおごり」に固定されること
     4. 承認時、ゲストの残高から 3,800pt × 課金人数 が引かれること
     5. その全額が platform_revenues（運営の収益）に記録されること
     6. ホストの残高は 1pt も増えないこと
     7. お一人での参加でも 2名分（7,600pt）を頂くこと（2026-08-28〜）

   ⚠ 2026-08-28 の新フローで、課金は最低2名分になった。
     ゲスト側は1名から申し込めるが、金額は常に 3,800 × 2 = 7,600pt。
     ホストは募集人数を選べない（ゲスト枠は常に2名分）。

   実行方法
     DB_PASSWORD=... node scripts/test_join_fee.mjs

   すべての操作はトランザクション内で行い、最後に必ず ROLLBACK する。
   本番のデータは一切変わらない。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

/* 接続先は .env の VITE_SUPABASE_URL から組み立てる。
   ここに ref を直書きすると、プロジェクトを移したときに
   古いDBへ繋ぎに行って気づけない（apply_sql.mjs と同じ方針）。 */
const root = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const ref = env.match(/^VITE_SUPABASE_URL=.*https:\/\/([a-z0-9]+)\.supabase\.co/m)?.[1];
if (!ref) {
  console.error(".env の VITE_SUPABASE_URL からプロジェクトIDを読み取れませんでした。");
  process.exit(2);
}
const HOST = `db.${ref}.supabase.co`;
console.log(`接続先: ${HOST}`);

const PASSWORD = process.env.DB_PASSWORD;
if (!PASSWORD) {
  console.error("DB_PASSWORD を環境変数で渡してください。");
  process.exit(2);
}

const FEE = 3800;
const TREAT = "ゲストのおごり";
/* ゲスト側の申し込み人数。枠は常に2名分（guest_slot_size）。 */
const GROUP_SIZE = 2;
/* 課金人数の下限（billable_guests）。1名で申し込んでも2名分を頂く。 */
const BILLABLE_MIN = 2;

let passed = 0;
let failed = 0;
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  ok ? passed++ : failed++;
  console.log(`${ok ? "  ok  " : "  NG  "} ${label}` + (ok ? "" : `\n         期待: ${expected} / 実際: ${actual}`));
};

const client = new pg.Client({
  host: HOST, port: 5432, user: "postgres", password: PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});

// 年齢確認を通すための生年月日（30歳）
const birth = new Date();
birth.setFullYear(birth.getFullYear() - 30);
const BIRTH = birth.toISOString().slice(0, 10);

const one = async (sql, params) => (await client.query(sql, params)).rows[0];

await client.connect();
try {
  await client.query("begin");

  // --- 利用者を2組つくる（handle_new_user が profiles と残高を作る） ---
  const mkUser = async (name) => {
    const { id } = await one(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), $1, jsonb_build_object('username', $2::text, 'birth_date', $3::text))
       returning id`,
      [`${name}-${Date.now()}@example.test`, name, BIRTH]
    );
    return id;
  };
  const hostId = await mkUser("テストホスト");
  const guestId = await mkUser("テストゲスト");

  // ゲストには十分なポイントを持たせる
  await client.query(`select public.purchase_points($1, 50000, 'テスト用')`, [guestId]);

  const balanceOf = async (id) =>
    Number((await one(`select coalesce(balance, 0) as b from public.point_balances where user_id = $1`, [id]))?.b ?? 0);

  const hostBefore = await balanceOf(hostId);
  const guestBefore = await balanceOf(guestId);

  // --- 1〜3. 会を作る。金額と区分をわざと不正な値で送ってみる ---
  const party = await one(
    `insert into public.parties
       (host_id, title, area, host_group_size, guest_group_size, point_request, treat_type)
     values ($1, 'テストの会', '渋谷', 2, $2, 1, '割り勘')
     returning id, point_request, treat_type, max_members`,
    [hostId, GROUP_SIZE]
  );
  check("参加ポイントは一律に固定される（1pt を送っても 3,800pt）", party.point_request, FEE);
  check("お会計の区分は固定される（割り勘 を送っても ゲストのおごり）", party.treat_type, TREAT);

  // 更新でも書き換えられないこと
  const updated = await one(
    `update public.parties set point_request = 0, treat_type = '奢り' where id = $1
     returning point_request, treat_type`,
    [party.id]
  );
  check("更新でも参加ポイントは書き換えられない", updated.point_request, FEE);
  check("更新でもお会計の区分は書き換えられない", updated.treat_type, TREAT);

  // --- 4〜6. 参加リクエスト → 承認 ---
  const req = await one(
    `insert into public.join_requests (party_id, user_id, group_size, member_names)
     values ($1, $2, $3, array['同伴A']) returning id, billable_size`,
    [party.id, guestId, GROUP_SIZE]
  );
  check("課金人数はサーバが決める（2名）", req.billable_size, BILLABLE_MIN);

  // ホストとして承認する（auth.uid() をホストに見せる）
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [hostId]);
  await client.query(`select public.accept_join_request($1)`, [req.id]);

  const cost = FEE * BILLABLE_MIN;
  check("ゲストの残高から 3,800pt × 課金人数 が引かれる", guestBefore - (await balanceOf(guestId)), cost);
  check("ホストの残高は 1pt も増えない", (await balanceOf(hostId)) - hostBefore, 0);

  const rev = await one(
    `select points, fee_per_person, group_size from public.platform_revenues where party_id = $1`,
    [party.id]
  );
  check("運営の収益として全額が記録される", rev?.points, cost);
  check("記録される単価は 3,800pt", rev?.fee_per_person, FEE);
  check("記録される人数は課金人数と一致する", rev?.group_size, BILLABLE_MIN);

  const earned = await one(
    `select count(*) as n from public.points where user_id = $1 and amount > 0 and type = 'earn'
       and description like '%' || $2 || '%'`,
    [hostId, "テストの会"]
  );
  check("ホストへの報酬の履歴が作られない", earned.n, "0");

  const spent = await one(
    `select amount, type from public.points where user_id = $1 and amount < 0`,
    [guestId]
  );
  check("ゲスト側に消費の履歴が残る", spent?.amount, -cost);

  // 席が人数分できていること（既存仕様の回帰確認）
  const seats = await one(`select count(*) as n from public.party_members where party_id = $1`, [party.id]);
  check("席は ホスト2名 + ゲスト2名 = 4席", seats.n, "4");

  /* --- 7. お一人での参加でも 2名分（7,600pt）を頂く（2026-08-28〜） --- */
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [hostId]);
  const soloParty = await one(
    `insert into public.parties (host_id, title, area, host_group_size, guest_group_size)
     values ($1, 'お一人参加のテスト', '渋谷', 2, 2) returning id, guest_group_size, max_members`,
    [hostId]
  );
  check("ホストはゲスト枠の人数を選べない（常に2名分）", soloParty.guest_group_size, 2);

  const soloGuest = await mkUser("テストお一人");
  await client.query(`select public.purchase_points($1, 50000, 'テスト用')`, [soloGuest]);
  const soloBefore = await balanceOf(soloGuest);

  const soloReq = await one(
    `insert into public.join_requests (party_id, user_id, group_size)
     values ($1, $2, 1) returning id, group_size, billable_size`,
    [soloParty.id, soloGuest]
  );
  check("1名でも申し込める", soloReq.group_size, 1);
  check("1名でも課金人数は2名分", soloReq.billable_size, BILLABLE_MIN);
  check("申し込んだ時点では1ptも減らない", soloBefore - (await balanceOf(soloGuest)), 0);

  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [hostId]);
  await client.query(`select public.accept_join_request($1)`, [soloReq.id]);
  check("承認（＝マッチ成立）した時点で 7,600pt を頂く",
    soloBefore - (await balanceOf(soloGuest)), FEE * BILLABLE_MIN);

  const soloState = await one(`select status from public.parties where id = $1`, [soloParty.id]);
  check("お一人参加でもマッチ成立になる", soloState.status, "matched");
} finally {
  await client.query("rollback");
  await client.end();
}

console.log(`\n${passed} 件成功 / ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);
