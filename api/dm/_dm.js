/* =====================================================================
   /api/dm/* の共通部分（インフルエンサー営業リスト）

   先頭が "_" のファイルはエンドポイントとして公開されない。

   ── この機能の前提（触る前に読む） ──────────────────
   Instagram の **初回DM（相手からの接触が無い状態）は自動送信できない。**
     ・Messaging API は「相手が最後に接触してから24時間以内」しか送れない。
       未接触の相手は API そのものが受け付けない。
     ・ブラウザ自動化での代替は Meta Platform Terms が禁じている。
   そのため /api/dm/* は **送信を行わない**。やるのは
     「次に誰へ・どの文面で出すか」を払い出し、「出した結果」を記録すること。
   実際の送信は運営が管理画面から1件ずつ行う（AdminDMScreen）。

   ⚠ 送信処理をここに足さないこと。足すと上の前提が崩れる。
   ===================================================================== */

export const DM_STATUSES = ["pending", "sent", "failed", "skipped"];

/* 取り込みの上限。1回のリクエストで送られてくる CSV の行数。
   Vercel Functions のボディ上限とDBの往復に収まる範囲にしておく。 */
export const MAX_IMPORT_ROWS = 2000;

/* 払い出しの1回ぶん。画面が「次の n 件」として並べる。 */
export const DEFAULT_BATCH = 10;
export const MAX_BATCH = 50;

/* ─────────────────────────────────────────────────────
   ユーザー名の正規化

   🚨 これは DB の dm_normalize_username() と**同じ規則**。
     片方だけ変えると、取り込みが CHECK 制約（dm_targets_username_shape）で
     落ちる。変えるときは必ず両方直すこと
     （HANDOFF.md「値を2箇所直す必要があるもの」と同じ形）。

   取り込みは最大2000行あるので、1行ずつ RPC を叩かずここで潰す。
   形が合わない行はDBの CHECK が最後の砦になる。
   ───────────────────────────────────────────────────── */
export function normalizeUsername(raw) {
  let v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;

  v = v.replace(/^https?:\/\//, "");
  v = v.replace(/^(www\.)?instagram\.com\//, "");
  v = v.replace(/[?#].*$/, "");
  v = v.split("/")[0];
  v = v.replace(/^@+/, "");

  return /^[a-z0-9._]{1,30}$/.test(v) ? v : null;
}

/* ─────────────────────────────────────────────────────
   文面の差し込み

   {{username}} / {{display_name}} / {{category}} だけ。
   知らないキーは**そのまま残す**（消すと、書き間違いに気付かないまま
   歯抜けの文面を送ってしまう）。
   display_name が空のときは username で代替する。
   ───────────────────────────────────────────────────── */
export function renderTemplate(body, target) {
  const values = {
    username: target?.username ?? "",
    display_name: target?.display_name || target?.username || "",
    category: target?.category || "",
  };
  return String(body ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole
  );
}

/* 差し込んだあとに未解決の {{...}} が残っていないか。
   画面で警告を出すために使う（送信を止めはしない）。 */
export function unresolvedKeys(rendered) {
  return [...String(rendered ?? "").matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
}

/* ─────────────────────────────────────────────────────
   CSV の読み取り

   Excel / スプレッドシートからの書き出しをそのまま受ける想定なので、
   引用符・改行入りセル・BOM・CRLF を扱えるだけの実装にしてある。
   ───────────────────────────────────────────────────── */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; }   // "" はエスケープされた "
        else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += c;
  }
  row.push(cell);
  rows.push(row);

  // 全部空のだけの行は落とす（末尾の改行で必ず1行できるため）
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

/* 見出しの対応表。日本語の見出しでもそのまま取り込めるようにする。 */
const HEADER_ALIASES = {
  username: ["username", "user_name", "id", "account", "instagram", "アカウント", "ユーザー名", "ユーザーid"],
  display_name: ["display_name", "name", "表示名", "名前", "アカウント名"],
  category: ["category", "genre", "カテゴリ", "カテゴリー", "ジャンル"],
  follower_count: ["follower_count", "followers", "follower", "フォロワー", "フォロワー数"],
  note: ["note", "memo", "remarks", "メモ", "備考"],
};

function headerKey(label) {
  const v = String(label ?? "").trim().toLowerCase().replace(/\s+/g, "");
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase().replace(/\s+/g, "") === v)) return key;
  }
  return null;
}

/* CSV を dm_targets の行の形に直す。

   ・見出し行があればそれに従う。無ければ1列目を username として読む
     （「アカウント名だけを縦に貼った」という一番多い形を通すため）。
   ・username が取れない行は落とし、理由付きで返す（画面に出す）。
   ・同じ username が同じファイル内に複数あれば最初の1行だけ採る。 */
export function csvToTargets(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { rows: [], skipped: [], columns: [] };

  const mapped = rows[0].map(headerKey);
  const hasHeader = mapped.some((m) => m !== null);
  const columns = hasHeader ? mapped : ["username"];
  const body = hasHeader ? rows.slice(1) : rows;

  const out = [];
  const skipped = [];
  const seen = new Set();

  body.forEach((cells, index) => {
    const record = {};
    columns.forEach((key, col) => {
      if (key) record[key] = cells[col];
    });

    const lineNo = index + (hasHeader ? 2 : 1);
    const username = normalizeUsername(record.username);
    if (!username) {
      skipped.push({ line: lineNo, value: String(record.username ?? "").trim(), reason: "ユーザー名として読めません" });
      return;
    }
    if (seen.has(username)) {
      skipped.push({ line: lineNo, value: username, reason: "ファイル内で重複しています" });
      return;
    }
    seen.add(username);

    const followers = Number(String(record.follower_count ?? "").replace(/[,\s]/g, ""));

    out.push({
      username,
      display_name: trimOrNull(record.display_name),
      category: trimOrNull(record.category),
      follower_count: Number.isFinite(followers) && followers >= 0 ? Math.floor(followers) : null,
      note: trimOrNull(record.note),
    });
  });

  return { rows: out, skipped, columns };
}

function trimOrNull(v) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, 500);
}
