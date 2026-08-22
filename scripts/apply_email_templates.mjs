/* =====================================================================
   Supabase Auth の「メール本文・件名」を日本語にする（Management API）

     SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply_email_templates.mjs

   ・件名は mailer_subjects_*、本文は mailer_templates_*_content として
     /v1/projects/{ref}/config/auth に入っている。ダッシュボードの
     Email Templates 画面と同じものを API から書ける（手作業は要らない）。
   ・⛔ SMTP と同じ枠の設定なので、PATCH のたびに custom SMTP が消えていないか
     疑うこと。このスクリプトは SMTP を触らないが、適用後に GET で
     smtp_host が生きていることまで確認する。
   ・接続先は .env の VITE_SUPABASE_URL から組み立てる（誤爆防止）。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token?.startsWith("sbp_")) {
  console.error("SUPABASE_ACCESS_TOKEN（sbp_ で始まる Personal Access Token）が要ります。");
  console.error("anon キー・service_role キー・DBパスワードでは代用できません。");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const ref = env.match(/^VITE_SUPABASE_URL=.*https:\/\/([a-z0-9]+)\.supabase\.co/m)?.[1];
if (!ref) {
  console.error(".env の VITE_SUPABASE_URL からプロジェクトIDを読み取れませんでした。");
  process.exit(1);
}

const SITE_URL = "https://aisekimatch.com";
const CONTACT_EMAIL = "theoffzaki@gmail.com";
const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

/* ---------------------------------------------------------------
   本文の共通レイアウト
   メールなので CSS ファイルは使えない。すべてインラインで書く。
   アプリと同じダークネイビー × ゴールド。
   --------------------------------------------------------------- */
const layout = ({ heading, lead, cta, url, note }) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d1224;margin:0;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#101830;border:1px solid rgba(232,201,135,0.28);border-radius:14px;">
        <tr>
          <td style="padding:32px 32px 28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;color:#f4efe3;">
            <p style="margin:0 0 24px 0;font-size:13px;letter-spacing:0.18em;color:#e8c987;">相席マッチ</p>
            <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#f4efe3;">${heading}</h1>
            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.8;color:#d8d3c6;">${lead}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
              <tr>
                <td style="border-radius:9px;background-color:#e8c987;">
                  <a href="${url}" style="display:inline-block;padding:13px 28px;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:15px;font-weight:600;color:#0d1224;text-decoration:none;">${cta}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;font-size:13px;line-height:1.7;color:#9d9788;">ボタンが開けないときは、次のURLをブラウザに貼り付けてください。</p>
            <p style="margin:0 0 24px 0;font-size:12px;line-height:1.7;word-break:break-all;"><a href="${url}" style="color:#e8c987;">${url}</a></p>
            <p style="margin:0 0 24px 0;padding:14px 16px;background-color:rgba(232,201,135,0.07);border-radius:9px;font-size:13px;line-height:1.8;color:#c7c2b6;">${note}</p>
            <p style="margin:0;padding-top:20px;border-top:1px solid rgba(244,239,227,0.12);font-size:12px;line-height:1.8;color:#8b8679;">
              相席マッチ<br>
              <a href="${SITE_URL}" style="color:#8b8679;">${SITE_URL}</a><br>
              お問い合わせ: <a href="mailto:${CONTACT_EMAIL}" style="color:#8b8679;">${CONTACT_EMAIL}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

const IGNORE_NOTE =
  "このメールに心当たりがない場合は、何もせずに破棄してください。リンクは一定時間で無効になります。";

/* 件名と本文。{{ .ConfirmationURL }} は Supabase が差し込む */
const templates = {
  /* 新規登録の確認 */
  mailer_subjects_confirmation: "相席マッチ - メールアドレスの確認",
  mailer_templates_confirmation_content: layout({
    heading: "メールアドレスの確認",
    lead: "相席マッチへのご登録ありがとうございます。<br>以下のリンクをクリックして、メールアドレスの確認を完了してください。",
    cta: "メールアドレスを確認する",
    url: "{{ .ConfirmationURL }}",
    note: IGNORE_NOTE,
  }),

  /* パスワード再設定 */
  mailer_subjects_recovery: "相席マッチ - パスワードの再設定",
  mailer_templates_recovery_content: layout({
    heading: "パスワードの再設定",
    lead: "パスワード再設定のリクエストを受け付けました。<br>以下のリンクをクリックして、新しいパスワードを設定してください。",
    cta: "パスワードを再設定する",
    url: "{{ .ConfirmationURL }}",
    note: "このメールに心当たりがない場合は、何もせずに破棄してください。現在のパスワードは変更されません。",
  }),

  /* メールアドレスの変更 */
  mailer_subjects_email_change: "相席マッチ - 新しいメールアドレスの確認",
  mailer_templates_email_change_content: layout({
    heading: "新しいメールアドレスの確認",
    lead: "アカウントのメールアドレスを <strong style=\"color:#f4efe3;\">{{ .NewEmail }}</strong> に変更するリクエストを受け付けました。<br>以下のリンクをクリックして、変更を完了してください。",
    cta: "メールアドレスの変更を確認する",
    url: "{{ .ConfirmationURL }}",
    note: "このメールに心当たりがない場合は、何もせずに破棄してください。メールアドレスは変更されません。",
  }),

  /* ログイン用リンク（現在アプリでは未使用だが、英語のまま残さない） */
  mailer_subjects_magic_link: "相席マッチ - ログイン用リンク",
  mailer_templates_magic_link_content: layout({
    heading: "ログイン用リンク",
    lead: "以下のリンクをクリックすると、相席マッチにログインできます。",
    cta: "ログインする",
    url: "{{ .ConfirmationURL }}",
    note: IGNORE_NOTE,
  }),
};

console.log(`接続先: ${ref}\n`);

const res = await fetch(endpoint, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(templates),
});
if (!res.ok) {
  console.error(`❌ 失敗 (HTTP ${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log("✅ PATCH は成功。実値を GET で確認します。\n");

/* ⛔ 200 が返っても保存されていないことがある（SMTP で2回踏んだ）。
   必ず読み直して、日本語が入っていること・SMTP が消えていないことを見る。 */
const after = await (
  await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
).json();

let ok = true;
for (const [key, want] of Object.entries(templates)) {
  const got = after[key];
  const hit = got === want;
  if (!hit) ok = false;
  console.log(`${hit ? "✅" : "❌"} ${key}`);
  if (key.startsWith("mailer_subjects_")) console.log(`     件名: ${got}`);
  if (!hit && !key.startsWith("mailer_subjects_")) {
    console.log(`     保存された値の先頭: ${String(got).slice(0, 80)}`);
  }
}

console.log("\n--- SMTP が消えていないか ---");
for (const key of ["smtp_host", "smtp_port", "smtp_user", "smtp_admin_email", "smtp_sender_name"]) {
  const got = after[key];
  if (!got) ok = false;
  console.log(`${got ? "✅" : "❌"} ${key} = ${got ?? "null"}`);
}
console.log(`${after.smtp_pass ? "✅" : "❌"} smtp_pass = ${after.smtp_pass ? "(設定あり)" : "null"}`);
console.log(
  `${after.mailer_autoconfirm === false ? "✅" : "❌"} mailer_autoconfirm = ${after.mailer_autoconfirm}（false = メール確認 ON）`
);

process.exit(ok ? 0 : 1);
