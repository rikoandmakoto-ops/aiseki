/* =====================================================================
   CAPTCHA（Cloudflare Turnstile）が効いているかを確かめる

   確かめること:
     1. siteverify にトークンを送る経路が生きているか
        （設定してあるシークレットが「テスト用」か「本番用」かも分かる）
     2. 本番（または任意の URL）の /api/stripe/setup-intent が
        ・CAPTCHA トークン無しの POST を **400 で断る**
        ・トークン付きの POST を 200 で通す（テスト用シークレットのとき）
        ＝ ボーナス 5,000pt の入口が塞がっていること

   使い方:
     node scripts/verify_captcha.mjs
       → 1 だけ（ネットワークのみ。ログイン不要）

     node scripts/verify_captcha.mjs --base https://aisekimatch.com \
       --email you+test@gmail.com --password 'Test123456!'
       → 1 と 2。テストユーザーでログインして実際に叩く。
         ユーザーは scripts/create_test_user.mjs で作れる。

   ⚠ 2 を実行すると Stripe に SetupIntent が1つ作られる（未確定・**課金されない**）。
     カード番号を送らないので、そのまま放置され期限切れになる。
   ===================================================================== */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  let text = "";
  try { text = readFileSync(resolve(ROOT, ".env"), "utf8"); } catch { return env; }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const env = loadEnv();
const secret = process.env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY || "";
const siteKey = process.env.VITE_TURNSTILE_SITE_KEY || env.VITE_TURNSTILE_SITE_KEY || "";

const TEST_SECRET_PASS = "1x0000000000000000000000000000000AA";
const TEST_SECRET_FAIL = "2x0000000000000000000000000000000AA";

let failed = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const ng = (m) => { failed++; console.log(`  ❌ ${m}`); };

console.log("\n── 設定 ───────────────────────────────");
console.log(`  サイトキー   : ${siteKey || "(未設定)"}`);
console.log(`  シークレット : ${secret ? `${secret.slice(0, 6)}…（${secret.length}文字）` : "(未設定)"}`);
if (!secret) {
  console.error("\n❌ TURNSTILE_SECRET_KEY が .env にありません。\n");
  process.exit(1);
}
const usingTestSecret = secret === TEST_SECRET_PASS || secret === TEST_SECRET_FAIL;
console.log(`  種別         : ${usingTestSecret ? "⚠ テスト用（常に同じ結果を返す）" : "本番用"}`);

/* ── 1. siteverify に届くか ───────────────────────────── */
async function siteverify(token) {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  return res.json();
}

console.log("\n── 1. Cloudflare への問い合わせ ────────");
{
  const body = await siteverify("dummy-token-for-probe");
  const codes = (body["error-codes"] || []).join(",") || "-";
  console.log(`  応答: success=${body.success} error-codes=${codes}`);

  if (usingTestSecret && secret === TEST_SECRET_PASS) {
    body.success === true
      ? ok("テスト用シークレットが期待どおり成功を返した")
      : ng("テスト用シークレットなのに成功しない（キーの写し間違い？）");
  } else if (body.success === false && codes.includes("invalid-input-response")) {
    ok("本番用シークレットが、でたらめなトークンを正しく拒否した");
  } else if (body.success === true) {
    ng("でたらめなトークンが通ってしまった（シークレットの確認が必要）");
  } else {
    ng(`想定外の応答（${codes}）`);
  }
}

/* ── 2. 実際のエンドポイント ──────────────────────────── */
const base = arg("base", "");
const email = arg("email", "");
const password = arg("password", "");

if (!base || !email || !password) {
  console.log("\n── 2. /api/stripe/setup-intent ─────────");
  console.log("  (skip) --base / --email / --password を渡すと実行します。");
} else {
  console.log(`\n── 2. ${base}/api/stripe/setup-intent ──`);
  const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anon) {
    console.error("  .env に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY がありません。");
    process.exit(1);
  }

  const signIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password }),
  });
  const session = await signIn.json();
  if (!session.access_token) {
    console.error(`  ❌ ログインできませんでした: ${session.error_description || session.msg || signIn.status}`);
    process.exit(1);
  }
  ok(`ログインできた（${email}）`);

  const call = async (body) => {
    const res = await fetch(`${base}/api/stripe/setup-intent`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  /* 2-a. トークン無し → 400 で断られること（ここが本題） */
  const without = await call({});
  console.log(`  トークン無し: ${without.status} ${JSON.stringify(without.body)}`);
  without.status === 400 && without.body.captcha === true
    ? ok("CAPTCHA 無しの SetupIntent 作成は断られた")
    : ng(`CAPTCHA 無しでも ${without.status} が返った（穴が開いている可能性）`);

  /* 2-b. でたらめなトークン → テスト用シークレットなら通る／本番用なら断られる */
  const withToken = await call({ captchaToken: "dummy-token-for-probe" });
  console.log(`  トークン有り: ${withToken.status} ${JSON.stringify(withToken.body).slice(0, 120)}`);
  if (usingTestSecret && secret === TEST_SECRET_PASS) {
    withToken.status === 200 && withToken.body.clientSecret
      ? ok("トークンを付ければ SetupIntent を作れた（経路は生きている）")
      : ng("テスト用シークレットなのに SetupIntent を作れない");
  } else {
    withToken.status === 400
      ? ok("本番用シークレットが、でたらめなトークンを拒否した")
      : ng(`本番用シークレットなのに ${withToken.status} が返った`);
  }
}

console.log(failed === 0 ? "\n🎉 すべて期待どおり\n" : `\n❌ ${failed} 件が期待と違う\n`);
process.exit(failed === 0 ? 0 : 1);
