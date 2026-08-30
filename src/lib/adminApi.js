/* ══════════════════════════════════════════════════════════════
   /api/admin/* · /api/dm/* の呼び出し（運営用の画面から使う）

   ⚠ 運営かどうかを決めるのはサーバだけ（api/_lib.js の ADMIN_EMAILS）。
     画面側にメールアドレスのリストを置かない。
     ブラウザに配る値で可否を決めると、書き換えれば通ってしまうため。

   401 / 403 は「権限が無い」として画面ごと切り替えたいので、
   ステータスコードを潰さずに error.status へ載せて投げる。

   /api/dm/* はさらに管理者パスワード（サーバの ADMIN_PASSWORD）を通した
   証明が要る。合言葉そのものは保存せず、照合に成功したときサーバが返す
   短命の token だけを sessionStorage に置き、x-admin-unlock で送る。
   タブを閉じれば消える／期限が切れれば 423 が返って入力に戻る。
   ══════════════════════════════════════════════════════════════ */
import { supabase } from "./supabase";

/* sessionStorage（タブ単位・閉じれば消える）。localStorage は使わない。 */
const UNLOCK_KEY = "aiseki.admin.unlock";

export function adminUnlockToken() {
  try { return sessionStorage.getItem(UNLOCK_KEY) || ""; } catch { return ""; }
}
function storeUnlockToken(token) {
  try {
    if (token) sessionStorage.setItem(UNLOCK_KEY, token);
    else sessionStorage.removeItem(UNLOCK_KEY);
  } catch { /* プライベートモード等で使えなくても動作は続ける（毎回入力になる） */ }
}
export const clearAdminUnlock = () => storeUnlockToken("");

export async function callAdminApi(path, { method = "GET", body } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    const e = new Error("ログインが必要です。");
    e.status = 401;
    throw e;
  }

  const unlock = adminUnlockToken();
  const res = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(unlock ? { "x-admin-unlock": unlock } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // npm run dev には /api が無く HTML が返る（vercel dev で起動する必要がある）
  if (!res.headers.get("content-type")?.includes("application/json")) {
    const e = new Error("管理APIに接続できませんでした。ローカルでは `vercel dev` で起動してください。");
    e.status = res.status;
    throw e;
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 423 = 合言葉が無い／期限切れ。持っている token はもう使えないので捨てる
    if (res.status === 423) storeUnlockToken("");
    const e = new Error(payload?.error || "通信に失敗しました。");
    e.status = res.status;
    throw e;
  }
  return payload;
}

/* 入口の状態を聞く。運営でなければ 403 が飛ぶ（＝画面を出してはいけない）。 */
export const fetchAdminGate = () => callAdminApi("/api/admin/gate");

/* 管理者パスワードの照合。通れば証明を預かる（合言葉自体は保存しない）。 */
export async function unlockAdmin(password) {
  const { token, expiresAt } = await callAdminApi("/api/admin/gate", {
    method: "POST",
    body: { password },
  });
  storeUnlockToken(token);
  return expiresAt;
}

/* 「このまま画面を続けられない」ことを表すかどうか。呼び出し側の判定を1箇所にまとめる。
   401/403 は権限が無い、423 は管理者パスワードの入れ直しが要る。
   どちらも入口の判定（fetchAdminGate）に戻せば、正しい行き先が決まる。 */
export const isDenied = (e) => e?.status === 401 || e?.status === 403 || e?.status === 423;

/* 権限そのものが無い（＝合言葉を入れ直しても入れない）。 */
export const isForbidden = (e) => e?.status === 401 || e?.status === 403;
