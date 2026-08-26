/* =====================================================================
   カード登録ボーナス（5,000pt）の付与 — 2つの経路の共通処理

   呼ぶのは次の2か所だけ。同じ判定を二重に書かないためにここへ寄せている。
     ・POST /api/stripe/confirm-card（画面から）
     ・setup_intent.succeeded の Webhook（Stripe から）

   ここでやること:
     ① SetupIntent に紐づくカードの **fingerprint** を Stripe から取る。
     ② grant_card_bonus(p_user, p_fingerprint) を呼ぶ（service_role 専用）。

   fingerprint とは:
     カード番号ごとに一意な文字列（例 `Xt5EWLLDS7FJjR1c`）。
     Customer が違っても・登録し直しても、**同じカードなら同じ値**になる。
     カード番号を復元できる値ではないので、こちらで保存してよい。
     → これを使って「カード1枚につき1アカウント」を担保する
       （supabase/migration_card_fingerprint.sql）。

   🚨 fingerprint が取れなかったら付与しない（fail-closed）。
     取れないものを通すと、そこが抜け道になる。
     payment_method_types は ["card"] に限っているので、
     通常の登録で取れないことは無い。
   ===================================================================== */
import { serviceClient } from "./_lib.js";

/* SetupIntent に紐づくカードの fingerprint。取れなければ空文字。

   payment_method は経路によって形が違う:
     ・confirm-card … expand して取るので object
     ・Webhook      … イベントの中身は ID の文字列（expand されていない）
   どちらでも受けられるようにしておく。 */
export async function cardFingerprint(stripe, intent) {
  const pm = intent?.payment_method;

  if (pm && typeof pm === "object") return String(pm?.card?.fingerprint ?? "");

  if (typeof pm === "string" && pm) {
    // 取得に失敗したら throw する（呼び出し側で 500 → Stripe が再送する）
    const full = await stripe.paymentMethods.retrieve(pm);
    return String(full?.card?.fingerprint ?? "");
  }

  return "";
}

/* ボーナスを付ける。戻り値は次の3つのいずれか。

     { ok: false, reason: "no_fingerprint" }
       カードの識別子が取れなかった。付与していない。
     { ok: false, reason: "duplicate", balance }
       このカードは既に別のアカウントで使われている。付与していない。
       （カードの登録そのものは Stripe 側で成立している）
     { ok: true, granted, points, balance }
       granted=false は「既に付与済み」（再送・2枚目の登録）を意味する。

   DB のエラーはそのまま throw する（呼び出し側で 500 にする）。 */
export async function grantCardBonus(stripe, intent, userId) {
  const fingerprint = await cardFingerprint(stripe, intent);
  if (!fingerprint) {
    console.error("[card] fingerprint が取れませんでした:", intent?.id, userId);
    return { ok: false, reason: "no_fingerprint" };
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("grant_card_bonus", {
    p_user: userId,
    p_fingerprint: fingerprint,
  });
  if (error) throw error;

  if (data?.duplicate === true) {
    console.warn("[card] 既に別のアカウントで登録済みのカードです:", intent?.id, userId);
    return { ok: false, reason: "duplicate", balance: data?.balance ?? 0 };
  }

  return {
    ok: true,
    granted: data?.granted ?? false,
    points: data?.points ?? 0,
    balance: data?.balance ?? 0,
  };
}

/* 画面に出す文面。confirm-card と、将来ほかから使うときで揃える。 */
export const DUPLICATE_CARD_MESSAGE =
  "このカードは既に別のアカウントでご登録済みです。" +
  "登録ボーナスはカード1枚につき1回までとなっております。" +
  "別のカードでご登録いただくと、ボーナスをお受け取りいただけます。";
