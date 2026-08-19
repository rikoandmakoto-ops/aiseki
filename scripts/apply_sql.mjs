/* =====================================================================
   SQLファイルを Supabase に直接流す（psql の代わり）

     AISEKI_DB_PASSWORD=... node scripts/apply_sql.mjs supabase/migration_launch2.sql

   ・接続先は .env の VITE_SUPABASE_URL から自動で組み立てる
     （別のプロジェクトへ誤って流さないため、接続先は必ず表示する）
   ・DBパスワードは環境変数から渡す。ファイルには書かない。
   ・pg の簡易クエリなので、複数文・ドル引用符・DOブロックを
     まとめて1回で実行できる（分割は不要）。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("使い方: AISEKI_DB_PASSWORD=... node scripts/apply_sql.mjs <SQLファイル...>");
  process.exit(1);
}

const password = process.env.AISEKI_DB_PASSWORD;
if (!password) {
  console.error("AISEKI_DB_PASSWORD が未設定です（Supabase → Settings → Database のパスワード）。");
  process.exit(1);
}

/* .env から接続先プロジェクトを読む */
const root = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const ref = env.match(/^VITE_SUPABASE_URL=.*https:\/\/([a-z0-9]+)\.supabase\.co/m)?.[1];
if (!ref) {
  console.error(".env の VITE_SUPABASE_URL からプロジェクトIDを読み取れませんでした。");
  process.exit(1);
}

console.log(`接続先: db.${ref}.supabase.co`);

const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: "postgres",
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
/* raise notice の内容（適用ログ）を拾う */
client.on("notice", (n) => console.log("  ·", n.message));

await client.connect();
try {
  for (const file of files) {
    const abs = path.resolve(root, file);
    console.log(`\n▶ ${file}`);
    await client.query(fs.readFileSync(abs, "utf8"));
    console.log(`✅ 適用しました`);
  }
} finally {
  await client.end();
}
