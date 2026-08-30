/* ══════════════════════════════════════════════════════════════
   /api/admin/* · /api/dm/* の呼び出し（運営用の画面から使う）

   ⚠ 運営かどうかを決めるのはサーバだけ（api/_lib.js の ADMIN_EMAILS）。
     画面側にメールアドレスのリストを置かない。
     ブラウザに配る値で可否を決めると、書き換えれば通ってしまうため。

   401 / 403 は「権限が無い」として画面ごと切り替えたいので、
   ステータスコードを潰さずに error.status へ載せて投げる。
   ══════════════════════════════════════════════════════════════ */
import { supabase } from "./supabase";

export async function callAdminApi(path, { method = "GET", body } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    const e = new Error("ログインが必要です。");
    e.status = 401;
    throw e;
  }

  const res = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
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
    const e = new Error(payload?.error || "通信に失敗しました。");
    e.status = res.status;
    throw e;
  }
  return payload;
}

/* 権限が無いことを表すかどうか。呼び出し側の判定を1箇所にまとめる。 */
export const isDenied = (e) => e?.status === 401 || e?.status === 403;
