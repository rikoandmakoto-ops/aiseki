/* =====================================================================
   Twilio Verify サービスを作る（無ければ作る・あればそれを使う）

     node scripts/setup_twilio_verify.mjs

   ・TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN は .env か環境変数から読む。
   ・同じ FriendlyName のサービスが既にあれば作り直さない（冪等）。
   ・見つかった／作った VA... を .env の TWILIO_VERIFY_SERVICE_SID に書く。

   FriendlyName は **SMS の本文に出る名前**。確認メールの差出人
   （「相席マッチ」）と合わせてある。変えると利用者に届く文面が変わる。

   ⚠ Vercel 側の環境変数はこのスクリプトでは触らない。
     `vercel env add` で入れて再デプロイすること（HANDOFF §28）。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";

const FRIENDLY_NAME = "相席マッチ";
const CODE_LENGTH = 6;

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");

/* .env を読む（既に環境変数にあればそちらを優先する） */
const fileEnv = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) fileEnv[m[1]] = m[2];
  }
}
const readEnv = (name) => (process.env[name] || fileEnv[name] || "").trim();

const sid = readEnv("TWILIO_ACCOUNT_SID");
const token = readEnv("TWILIO_AUTH_TOKEN");
if (!sid || !token) {
  console.error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN が見つかりません（.env か環境変数に入れてください）。");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;

async function twilio(url, params) {
  const res = await fetch(url, {
    method: params ? "POST" : "GET",
    headers: {
      authorization: auth,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${body?.message ?? "不明なエラー"} (code ${body?.code ?? "-"})`);
  }
  return body;
}

/* アカウントの種別を出す。Trial は「検証済みの番号」にしか送れないので、
   本番運用の前にアップグレードが要る。 */
const account = await twilio(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`);
console.log(`アカウント: ${account.friendly_name}（${account.type} / ${account.status}）`);
if (account.type === "Trial") {
  console.log("⚠ Trial アカウントです。Twilio で検証していない番号には SMS が届きません。");
}

const list = await twilio("https://verify.twilio.com/v2/Services?PageSize=50");
let service = (list.services ?? []).find((s) => s.friendly_name === FRIENDLY_NAME);

if (service) {
  console.log(`既存の Verify サービスを使います: ${service.sid}`);
} else {
  service = await twilio("https://verify.twilio.com/v2/Services", {
    FriendlyName: FRIENDLY_NAME,
    CodeLength: String(CODE_LENGTH),
    DoNotShareWarningEnabled: "true",
  });
  console.log(`Verify サービスを作成しました: ${service.sid}`);
}

console.log(`  FriendlyName : ${service.friendly_name}`);
console.log(`  CodeLength   : ${service.code_length}`);

/* .env を更新する（既にあれば置き換え、無ければ末尾に足す） */
if (fs.existsSync(envPath)) {
  const before = fs.readFileSync(envPath, "utf8");
  const line = `TWILIO_VERIFY_SERVICE_SID=${service.sid}`;
  const after = /^TWILIO_VERIFY_SERVICE_SID=.*$/m.test(before)
    ? before.replace(/^TWILIO_VERIFY_SERVICE_SID=.*$/m, line)
    : `${before.replace(/\n*$/, "\n")}${line}\n`;
  if (after !== before) {
    fs.writeFileSync(envPath, after);
    console.log("✅ .env の TWILIO_VERIFY_SERVICE_SID を更新しました。");
  } else {
    console.log("・.env は既に同じ値です。");
  }
}

console.log("\n次: Vercel の Production に3つとも入れて再デプロイする（環境変数は再デプロイまで効きません）。");
