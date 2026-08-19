/* =====================================================================
   テストアカウントを Supabase に直接作成する
   （画面からの新規登録を通さないので、確認メールの送信も、
     SMTP のレート制限も、メールアドレスのドメイン検証も通らない）

   作成には「管理者権限のある資格情報」が要る。次のどちらか一方でよい。

   ── 方法A（推奨）: service_role キー ────────────────────────────
     Supabase ダッシュボード → Project Settings → API → service_role key
       node scripts/create_test_user.mjs --service-key eyJ...
     （.env の SUPABASE_SERVICE_ROLE_KEY に書いても、環境変数で渡してもよい）

   ── 方法B: Postgres への直接接続 ────────────────────────────────
     Supabase ダッシュボード → Project Settings → Database → Connection string
     （パスワードを忘れたら同じ画面の "Reset database password" で再発行）
       npm i -D pg
       node scripts/create_test_user.mjs --db-url 'postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres'

   どちらも無い状態では作成できない。anon キーからの signUp は
   メール確認（mailer_autoconfirm=false）を回避できず、確認済みにできない。

   使い方:
     node scripts/create_test_user.mjs
     node scripts/create_test_user.mjs --email you+test1@gmail.com --password Test123456!

   ※ service_role key はブラウザに渡してはいけない（RLS を無視できるため）。

   注意: auth.users への insert は public.handle_new_user() トリガーを起動し、
   そこで 20歳以上の年齢確認が強制される。生年月日（birth_date）を
   user_metadata に入れないと登録自体が失敗する。
   ===================================================================== */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* .env を読む（dotenv に依存しないよう最小限の実装） */
function loadEnv() {
  const env = {};
  let text = "";
  try {
    text = readFileSync(resolve(ROOT, ".env"), "utf8");
  } catch {
    return env;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/* --key value 形式の引数を読む */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const env = loadEnv();
const url = (arg("url", env.VITE_SUPABASE_URL || env.SUPABASE_URL) || "").replace(/\/+$/, "");
const anonKey = arg("anon-key", process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY);

/* 優先順位: --service-key 引数 → 環境変数 → .env
   （.env に書きたくない場合は
      SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/create_test_user.mjs
    のように環境変数で渡せる） */
let serviceKey = arg("service-key", process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
if (serviceKey && serviceKey.startsWith("your_")) serviceKey = undefined; // .env の placeholder

const dbUrl = arg("db-url", process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL);

if (!url) die(".env に VITE_SUPABASE_URL がありません。");
if (!serviceKey && !dbUrl) {
  die(
    "管理者権限の資格情報がありません（.env の SUPABASE_SERVICE_ROLE_KEY は placeholder のままです）。\n" +
    "   次のどちらか一方を渡してください:\n" +
    "     A) service_role key … Project Settings → API\n" +
    "        node scripts/create_test_user.mjs --service-key eyJ...\n" +
    "     B) DB 接続文字列 … Project Settings → Database → Connection string\n" +
    "        node scripts/create_test_user.mjs --db-url 'postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres'\n" +
    "   ※ anon キーだけでは、メール確認済みのユーザーは作れません。"
  );
}

/* 既定値。メールは実在ドメイン（MXレコードのあるドメイン）にする。
   test.com / example.com / aiseki.app はいずれも MX レコードが無く、
   メールを受け取れないドメインなので Supabase のメールアドレス検証で弾かれうる。
     dig +short MX <ドメイン>  が空なら、そのドメインは使わないこと。 */
const email = arg("email", "aiseki.test1@gmail.com");
const password = arg("password", "Test123456!");
const username = arg("username", "テストユーザー");
const birthDate = arg("birth-date", "1995-01-01"); // 20歳以上であること

/* 生年月日から満年齢を出す（フロントの ageFromBirthDate と同じ計算） */
function ageFrom(d) {
  const b = new Date(`${d}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age -= 1;
  return age;
}

const age = ageFrom(birthDate);
if (age === null) die(`--birth-date の形式が不正です: ${birthDate}（YYYY-MM-DD）`);
if (age < 20) die(`生年月日が20歳未満です（満${age}歳）。テストユーザーも20歳以上である必要があります。`);

const meta = { username, birth_date: birthDate, age: String(age), age_confirmed: true };

console.log(`接続先 : ${url}`);
console.log(`メール : ${email}`);
console.log(`パスワード: ${password}`);
console.log(`生年月日 : ${birthDate}（満${age}歳）`);
console.log(`方法   : ${serviceKey ? "service_role（Admin API）" : "Postgres 直接接続"}\n`);

const created = serviceKey ? await createViaAdminApi() : await createViaPostgres();

console.log("✅ テストユーザーを作成しました。");
console.log(`   user id        : ${created.id}`);
console.log(`   email confirmed: ${created.confirmed ? "はい" : "いいえ"}`);

await verifyLogin();

console.log("\nそのままアプリの「ログイン」タブから上記のメール／パスワードで入れます。");

/* ── 方法A: Admin API ────────────────────────────────────────────── */
async function createViaAdminApi() {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      // 確認メールを送らずに「確認済み」にする（メール確認オン／SMTP制限を回避）
      email_confirm: true,
      user_metadata: meta,
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.msg || body?.message || body?.error_description || JSON.stringify(body);
    if (/already been registered|already exists/i.test(msg)) {
      die(`このメールアドレスは既に登録されています: ${email}\n   別の --email を指定するか、そのままログインしてください。`);
    }
    if (/Database error/i.test(msg)) {
      die(
        `DB のトリガーで失敗しました: ${msg}\n` +
        "   supabase/schema.sql が適用済みか、生年月日が20歳以上かを確認してください。"
      );
    }
    die(`作成に失敗しました（HTTP ${res.status}）: ${msg}`);
  }

  return { id: body.id, confirmed: Boolean(body.email_confirmed_at) };
}

/* ── 方法B: auth.users / auth.identities へ直接 insert ───────────── */
async function createViaPostgres() {
  let pg;
  try {
    ({ default: pg } = await import("pg"));
  } catch {
    die("--db-url を使うには pg が必要です:  npm i -D pg");
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (e) {
    if (e.code === "28P01") {
      die(
        "DB のパスワードが違います（28P01）。\n" +
        "   Project Settings → Database → Reset database password で再発行してください。"
      );
    }
    die(`DB に接続できません: ${e.code || ""} ${e.message}`);
  }

  try {
    await client.query("begin");

    const dup = await client.query("select id from auth.users where email = $1", [email]);
    if (dup.rowCount) {
      die(`このメールアドレスは既に登録されています: ${email}（id=${dup.rows[0].id}）`);
    }

    /* pgcrypto は Supabase では extensions スキーマにある */
    const ins = await client.query(
      `insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change
       ) values (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated', $1,
         extensions.crypt($2, extensions.gen_salt('bf')),
         now(), '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb,
         now(), now(), '', '', '', ''
       )
       returning id, email_confirmed_at`,
      [email, password, JSON.stringify(meta)]
    );
    const user = ins.rows[0];

    /* GoTrue はメールログイン時に auth.identities も引くので必ず作る */
    const hasProviderId = await client.query(
      `select 1 from information_schema.columns
        where table_schema='auth' and table_name='identities' and column_name='provider_id'`
    );
    const identityData = JSON.stringify({ sub: user.id, email, email_verified: true, phone_verified: false });
    if (hasProviderId.rowCount) {
      await client.query(
        `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values ($1, $2, $3::jsonb, 'email', now(), now(), now())`,
        [user.id, user.id, identityData]
      );
    } else {
      await client.query(
        `insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1, $2::jsonb, 'email', now(), now(), now())`,
        [user.id, identityData]
      );
    }

    await client.query("commit");
    return { id: user.id, confirmed: Boolean(user.email_confirmed_at) };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    die(`insert に失敗しました: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

/* ── 作成後、実際にログインできるか確かめる ─────────────────────── */
async function verifyLogin() {
  if (!anonKey) {
    console.log("\n⚠️  anon キーが無いのでログイン確認はスキップしました。");
    return;
  }
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    die(`作成はできましたが、ログインに失敗しました: ${body?.msg || body?.error_code || res.status}`);
  }
  console.log("✅ ログイン確認 OK（signInWithPassword でトークンを取得できました）");
  console.log(`   access_token   : ${String(body.access_token).slice(0, 24)}…`);
}
