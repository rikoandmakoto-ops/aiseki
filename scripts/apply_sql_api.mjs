/* =====================================================================
   SQLファイルを Supabase Management API 経由で流す

     SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply_sql_api.mjs \
       supabase/migration_reviews_approach_style.sql

   ・接続先は .env の VITE_SUPABASE_URL から自動で組み立てる
     （別のプロジェクトへ誤って流さないため、接続先は必ず表示する）
   ・DBパスワードが要らない（PAT だけで流せる）ぶん、
     scripts/apply_sql.mjs（node pg / IPv6直結）より取り回しがよい。
   ・POST /v1/projects/{ref}/database/query は複数文・ドル引用符・
     DOブロックをまとめて1回で実行できる。分割は要らない。
   ・PAT は「そのプロジェクトを持つアカウント」のものでないと 403 になる。
     先に GET /v1/projects で対象が一覧に出るかを確かめてから流す。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("使い方: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply_sql_api.mjs <SQLファイル...>");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN が未設定です（Supabase の Personal Access Token）。");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const ref = env.match(/^VITE_SUPABASE_URL=.*https:\/\/([a-z0-9]+)\.supabase\.co/m)?.[1];
if (!ref) {
  console.error(".env の VITE_SUPABASE_URL からプロジェクトIDを読み取れませんでした。");
  process.exit(1);
}

const api = (p, init) =>
  fetch(`https://api.supabase.com${p}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

/* PAT がこのプロジェクトに届くかを先に確かめる（届かないと 403 になる） */
const listRes = await api("/v1/projects");
if (!listRes.ok) {
  console.error(`プロジェクト一覧を取得できませんでした: ${listRes.status} ${await listRes.text()}`);
  process.exit(1);
}
const projects = await listRes.json();
const target = projects.find((p) => p.id === ref);
if (!target) {
  console.error(
    `この PAT からは ${ref} が見えません（別アカウントのトークンです）。\n` +
    `見えているプロジェクト: ${projects.map((p) => `${p.name}(${p.id})`).join(", ") || "なし"}`
  );
  process.exit(1);
}
console.log(`接続先: ${target.name} (${ref}) / org ${target.organization_id}`);

for (const file of files) {
  const abs = path.resolve(root, file);
  const sql = fs.readFileSync(abs, "utf8");
  console.log(`\n▶ ${file}`);
  const res = await api(`/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ 失敗（${res.status}）: ${text}`);
    process.exit(1);
  }
  console.log(`✅ 適用しました${text && text !== "[]" ? `\n${text}` : ""}`);
}
