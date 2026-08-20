/* =====================================================================
   Supabase の Auth 設定（メール確認・戻り先URL）を Management API で適用する

     SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply_auth_config.mjs

   ・Auth の設定は DB にも service_role キーにも無い。
     auth スキーマに config テーブルは存在せず、GoTrue は設定を
     コンテナの環境変数から読む。書き換えられるのは Management API だけ。
     → Personal Access Token（sbp_ で始まる）が必須。
       ダッシュボード右上 → Account → Access Tokens → Generate new token
   ・接続先は .env の VITE_SUPABASE_URL から組み立てる（誤爆防止）。
   ・順番を必ず守る。戻り先URL を先に入れてから、メール確認を ON にする。
     逆にすると Site URL が既定値のまま確認メールが飛び、
     その間に登録した人のリンクが全部開けなくなる。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN が未設定です。");
  console.error("ダッシュボード → Account → Access Tokens で発行してください。");
  console.error("anon キー・service_role キー・DBパスワードでは代用できません。");
  process.exit(1);
}
if (!token.startsWith("sbp_")) {
  console.error(`トークンの形式が違います（${token.slice(0, 4)}…）。`);
  console.error("Personal Access Token は sbp_ で始まります。");
  process.exit(1);
}

/* .env から接続先プロジェクトを読む */
const root = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const ref = env.match(/^VITE_SUPABASE_URL=.*https:\/\/([a-z0-9]+)\.supabase\.co/m)?.[1];
const anon = env.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
if (!ref) {
  console.error(".env の VITE_SUPABASE_URL からプロジェクトIDを読み取れませんでした。");
  process.exit(1);
}

const SITE_URL = "https://aiseki-xi.vercel.app";
const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

console.log(`接続先: ${ref}`);
console.log(`Site URL: ${SITE_URL}\n`);

async function patch(label, body) {
  console.log(`▶ ${label}`);
  const res = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`❌ 失敗 (HTTP ${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  console.log("✅ 適用しました\n");
}

/* 1. 戻り先URL を先に入れる（順番を入れ替えないこと） */
await patch("戻り先URL（Site URL / Redirect URLs）", {
  site_url: SITE_URL,
  uri_allow_list: `${SITE_URL},${SITE_URL}/**`,
});

/* 2. そのうえでメール確認を ON にする */
await patch("メール確認を有効化（mailer_autoconfirm = false）", {
  mailer_autoconfirm: false,
});

/* 3. 実際に反映されたか、公開エンドポイントで確かめる */
console.log("▶ 反映の確認");
const check = await fetch(`https://${ref}.supabase.co/auth/v1/settings`, {
  headers: anon ? { apikey: anon } : {},
});
const settings = await check.json();
if (settings.mailer_autoconfirm === false) {
  console.log("✅ mailer_autoconfirm: false（確認メールが必要な状態）");
} else {
  console.error(`❌ まだ mailer_autoconfirm: ${settings.mailer_autoconfirm} です。`);
  process.exit(1);
}

console.log("\n残りはダッシュボードでの作業です（APIでは設定できない）:");
console.log("  ・2-3 SMTP … Project Settings → Authentication → SMTP Settings");
console.log("  ・2-4 メール本文の日本語化 … Authentication → Email Templates");
