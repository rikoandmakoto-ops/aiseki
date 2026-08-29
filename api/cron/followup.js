/* =====================================================================
   GET /api/cron/followup — 簡易登録の方への「追いかけメール」

   招待リンクから来た方は、お名前と年齢確認だけの簡易登録で会に入る
   （account_type = 'simple'）。そのままだと自分から卓に申し込めないので、

     「カードを登録すると 5,000pt が付いて、自分でも相席に申し込めます」

   を、登録から何日かあとにお知らせする。

   ── 誰に、いつ送るか ────────────────────────────────
     followup_candidates(kind, 経過時間) が返す人にだけ送る。条件は
       ・account_type = 'simple'
       ・card_registered = false（＝まだ 5,000pt を受け取っていない）
       ・メール確認済み
       ・その kind をまだ送っていない（followup_emails の一意制約）
     カードを登録した時点で、以降の追いかけは自動的に止まる。

   ── 二重送信について ────────────────────────────────
     送る前に record_followup_email() で記録を先に取り、
     取れた（＝まだ送っていない）ときだけ送る。
     Cron が二重に起動しても、一意制約で2通目は弾かれる。
     ⚠ 逆順（送ってから記録）にしないこと。記録に失敗したときに
       同じ人へ何度も届く。

   ── 実行 ────────────────────────────────────────
     Vercel の Cron（vercel.json の crons）が1日1回叩く。
     Cron からの呼び出しには Authorization: Bearer $CRON_SECRET が付く。
     手で叩くときも同じヘッダが要る（誰でも叩けると送信を空撃ちできる）。

   環境変数
     CRON_SECRET       … Vercel が Cron 実行時に付けるトークン
     RESEND_API_KEY    … 送信に使う（Supabase の SMTP と同じ Resend）
     MAIL_FROM         … 省略時 "相席マッチ <noreply@aisekimatch.com>"
     PUBLIC_BASE_URL   … 省略時 https://aisekimatch.com
   ===================================================================== */
import { ConfigError, env, json, serviceClient } from "../_lib.js";

const BASE_URL = () => env("PUBLIC_BASE_URL") || "https://aisekimatch.com";
const FROM = () => env("MAIL_FROM") || "相席マッチ <noreply@aisekimatch.com>";

/* 送る種類。kind は followup_emails に残るので、あとから増やしてよい
   （既に送った人へ遡って送られることはない）。 */
const STEPS = [
  {
    kind: "upgrade_d1",
    after: "1 day",
    subject: "【相席マッチ】あなたも相席にお誘いできます（5,000ptプレゼント）",
  },
  {
    kind: "upgrade_d7",
    after: "7 days",
    subject: "【相席マッチ】5,000pt はまだお受け取りいただけます",
  },
];

/* 本文。売り込みすぎない・事実だけを書く。
   ⚠ 金額は src/lib/pricing.js が出典（SIGNUP_BONUS = 5000 / SOLO_FEE = 7600）。
     ここを直すときは pricing.js と DB の signup_bonus() も見ること。 */
function body(name, step) {
  const url = BASE_URL();
  const intro = step.kind === "upgrade_d1"
    ? "先日は相席マッチへのご登録、ありがとうございました。"
    : "相席マッチをご利用いただき、ありがとうございます。";

  return [
    `${name} さん`,
    "",
    intro,
    "",
    "いまのご登録（かんたん登録）では、お誘いを受けて参加することはできますが、",
    "ご自身から相席にお申し込みいただくことはできません。",
    "",
    "お支払い方法（カード）をご登録いただくと、",
    "　・新規登録ボーナス 5,000pt をお受け取りいただけます",
    "　・ご自身からも、気になる会にお申し込みいただけます",
    "　・お友達を招待すると、参加費から 3,800pt の招待割が入ります",
    "",
    "ご登録はマイページから1分ほどで完了します。",
    `　${url}/?tab=points`,
    "",
    "※ カードのご登録だけで料金は発生しません。",
    "※ 20歳以上の方限定のサービスです（飲酒を伴うため）。",
    "",
    "――――――――――――――――",
    "相席マッチ",
    `${url}`,
    "お問い合わせ: theoffzaki@gmail.com",
  ].join("\n");
}

async function sendMail({ to, subject, text }) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new ConfigError("RESEND_API_KEY が設定されていません。");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: FROM(), to: [to], subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export async function GET(request) {
  /* Vercel Cron は Authorization: Bearer $CRON_SECRET を付けてくる。
     設定していないときは動かさない（誰でも叩ける状態にしない）。 */
  const secret = env("CRON_SECRET");
  if (!secret) return json({ error: "CRON_SECRET が設定されていません。" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  let db;
  try {
    db = serviceClient();
  } catch (e) {
    return json({ error: e.message }, e instanceof ConfigError ? 503 : 500);
  }
  if (!env("RESEND_API_KEY")) {
    return json({ error: "RESEND_API_KEY が設定されていません。" }, 503);
  }

  const result = [];
  for (const step of STEPS) {
    const { data, error } = await db.rpc("followup_candidates", {
      p_kind: step.kind,
      p_min_age: step.after,
    });
    if (error) {
      result.push({ kind: step.kind, error: error.message });
      continue;
    }

    let sent = 0;
    let failed = 0;
    for (const row of data ?? []) {
      /* 先に記録を取る。取れなかった＝他の実行が既に送っている。 */
      const { data: claimed, error: markError } = await db.rpc("record_followup_email", {
        p_user: row.user_id,
        p_kind: step.kind,
      });
      if (markError || claimed !== true) continue;

      try {
        await sendMail({ to: row.email, subject: step.subject, text: body(row.username, step) });
        sent += 1;
      } catch (e) {
        /* 送信に失敗しても記録は消さない。同じ人に何度も届くほうが害が大きい。
           恒久的な失敗（無効なアドレス）と一時的な失敗を区別できないため。 */
        console.error("[aiseki] 追いかけメールの送信に失敗:", row.user_id, e.message);
        failed += 1;
      }
    }
    result.push({ kind: step.kind, candidates: (data ?? []).length, sent, failed });
  }

  return json({ ok: true, steps: result });
}

export function POST() {
  return json({ error: "Method Not Allowed" }, 405);
}
