/* =====================================================================
   既存の写真から「ぼかし画像」を作って埋める（薄モザイクの後追い生成）

   なぜ要るか（HANDOFF §18-b）:
     マッチが成立するまで相手に配信するのは、素の写真ではなく
     「アップロード時に作ったぼかしの別画像」（profiles.avatar_blur_url /
     photos_blur）。この仕組みを入れる前に登録された写真にはそれが無く、
     また src/lib/api.js の uploadAvatarPair() は
     【ぼかしの生成に失敗しても登録自体は通す】作りなので、
     素の写真だけがあってぼかしが欠けた行は今後も生まれうる。

     ぼかしが無い写真は「一覧・詳細で絵文字にフォールバックする」だけで
     壊れはしないが、ホストの雰囲気が伝わらない。これを後から埋める。

   使い方:
     node scripts/backfill_blur_photos.mjs            # 何をするか出すだけ（既定）
     node scripts/backfill_blur_photos.mjs --apply    # 実際に作って保存する
     node scripts/backfill_blur_photos.mjs --apply --user <uuid>   # 1人だけ

   必要なもの:
     ・.env の SUPABASE_SERVICE_ROLE_KEY（Storage への書き込みと RLS の迂回）
     ・python3 + Pillow（generate_icons.mjs と同じ。`python3 -c "import PIL"`）

   ⚠ ぼかし方は src/lib/api.js の makeBlurredImage() と揃えてある。
     いったん幅 BLUR_WIDTH まで縮めてから伸ばし直すので、
     ぼかしを解いて元の顔に戻すことはできない（ここが要点。
     単に半径の大きいぼかしをかけるだけでは復元の余地が残る）。
     片方だけ変えると、画面から上げた写真と後追いで作った写真で
     ぼかしの強さが変わってしまう。必ず両方を直すこと。

   ⚠ 何度実行しても安全（冪等）。既にぼかしがある写真は飛ばす。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

/* ── src/lib/api.js と同じ値にすること ── */
const BLUR_WIDTH = 64;    // いったんここまで小さくする（情報そのものを捨てる）
const BLUR_RADIUS = 6;    // そのうえで軽くぼかす
const MAX_OUT_WIDTH = 720;
const JPEG_QUALITY = 70;

const root = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
/* ⚠ indexOf は見つからないと -1 を返す。素直に +1 すると argv[0]（＝--apply）を
   ユーザーIDとして拾ってしまう。必ず「あるか」を先に見ること。 */
const userFlag = argv.indexOf("--user");
const ONLY_USER = userFlag === -1 ? null : (argv[userFlag + 1] || null);
if (userFlag !== -1 && !ONLY_USER) {
  console.error("--user のあとにユーザーIDを指定してください。");
  process.exit(2);
}

/* ── 接続先は .env から組み立てる（別プロジェクトへの誤爆を防ぐ） ── */
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const URL_ = pick("VITE_SUPABASE_URL");
const SERVICE_KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_ || !SERVICE_KEY) {
  console.error(".env の VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が読めませんでした。");
  process.exit(2);
}
const ref = URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
console.log(`接続先: ${ref}.supabase.co`);
console.log(APPLY ? "モード: 実行（保存します）" : "モード: 確認のみ（--apply で実行）");

const db = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

/* ── python3 + Pillow でぼかす ──
   src/lib/api.js の canvas 版と同じ手順:
     1) 幅 BLUR_WIDTH まで縮小して情報を捨てる
     2) 出力サイズへ戻しつつガウスぼかしをかける */
const PY = String.raw`
import sys
from PIL import Image, ImageFilter

src, dst, blur_w, radius, max_w, quality = sys.argv[1:7]
blur_w, radius, max_w, quality = int(blur_w), float(radius), int(max_w), int(quality)

im = Image.open(src)
im = im.convert("RGB")
w, h = im.size
ratio = h / w if w else 1.0

small = im.resize((blur_w, max(1, round(blur_w * ratio))), Image.LANCZOS)
out_w = min(w, max_w)
out_h = max(1, round(out_w * ratio))
out = small.resize((out_w, out_h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(radius))
out.save(dst, "JPEG", quality=quality, optimize=True)
print(f"{out_w}x{out_h}")
`;

function blurToFile(inputPath, outputPath) {
  return execFileSync(
    "python3",
    ["-c", PY, inputPath, outputPath, String(BLUR_WIDTH), String(BLUR_RADIUS),
     String(MAX_OUT_WIDTH), String(JPEG_QUALITY)],
    { encoding: "utf8" }
  ).trim();
}

/* ── 公開URL ↔ ストレージ上のパス ── */
const MARKER = "/storage/v1/object/public/avatars/";
const pathOf = (url) => {
  const i = String(url || "").indexOf(MARKER);
  return i === -1 ? null : decodeURIComponent(String(url).slice(i + MARKER.length).split("?")[0]);
};

/* 1枚ぶん: 落として → ぼかして → 上げて → 公開URLを返す */
async function makeBlur(userId, url, tmpDir, label) {
  const srcPath = pathOf(url);
  if (!srcPath) { console.log(`      · ${label}: 自前のストレージのURLではないため飛ばします`); return null; }
  /* 他人のフォルダの写真は触らない（万一データがおかしくても事故らせない） */
  if (!srcPath.startsWith(`${userId}/`)) {
    console.log(`      · ${label}: 持ち主のフォルダ外（${srcPath}）のため飛ばします`);
    return null;
  }

  const { data: blob, error: dlErr } = await db.storage.from("avatars").download(srcPath);
  if (dlErr || !blob) { console.log(`      · ${label}: 元の写真を取得できません（${dlErr?.message}）`); return null; }

  const inFile = path.join(tmpDir, "in" + path.extname(srcPath).slice(0, 5));
  const outFile = path.join(tmpDir, "out.jpg");
  fs.writeFileSync(inFile, Buffer.from(await blob.arrayBuffer()));

  let size;
  try { size = blurToFile(inFile, outFile); }
  catch (e) { console.log(`      · ${label}: ぼかしに失敗（${String(e.message).split("\n").pop()}）`); return null; }

  if (!APPLY) { console.log(`      · ${label}: 作成できます（${size}）`); return "(dry-run)"; }

  /* 画面から上げるときと同じ形のパス。名前は推測できない値にする。 */
  const destPath = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await db.storage.from("avatars").upload(
    destPath, fs.readFileSync(outFile),
    { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }
  );
  if (upErr) { console.log(`      · ${label}: 保存に失敗（${upErr.message}）`); return null; }

  const { data } = db.storage.from("avatars").getPublicUrl(destPath);
  console.log(`      · ${label}: 作成しました（${size}）`);
  return data.publicUrl;
}

/* ── 本体 ── */
let q = db.from("profiles").select("id, username, avatar_url, avatar_blur_url, photos, photos_blur");
if (ONLY_USER) q = q.eq("id", ONLY_USER);
const { data: rows, error } = await q;
if (error) { console.error("プロフィールを取得できませんでした:", error.message); process.exit(1); }

/* 直すべき行だけに絞る。
   ・メイン写真があるのに avatar_blur_url が無い
   ・サブ写真の枚数に photos_blur が足りていない（並びは photos と同じ） */
const needs = (p) =>
  (p.avatar_url && !p.avatar_blur_url) ||
  (p.photos ?? []).some((u, i) => u && !(p.photos_blur ?? [])[i]);

const targets = (rows ?? []).filter(needs);

console.log(`\nプロフィール ${rows.length} 件のうち、ぼかしが欠けているのは ${targets.length} 件です。`);
if (targets.length === 0) {
  console.log("直すものはありません。");
  process.exit(0);
}

let madeAvatars = 0, madePhotos = 0, updated = 0, failed = 0;

for (const p of targets) {
  console.log(`\n  ${p.username ?? "(名前なし)"} (${p.id})`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiseki-blur-"));
  try {
    const patch = {};

    if (p.avatar_url && !p.avatar_blur_url) {
      const url = await makeBlur(p.id, p.avatar_url, tmpDir, "メインの写真");
      if (url) { patch.avatar_blur_url = APPLY ? url : undefined; madeAvatars++; }
      else failed++;
    }

    const photos = p.photos ?? [];
    const blurs = [...(p.photos_blur ?? [])];
    let touchedPhotos = false;
    for (let i = 0; i < photos.length; i++) {
      if (!photos[i] || blurs[i]) continue;
      const url = await makeBlur(p.id, photos[i], tmpDir, `サブ写真 ${i + 1}枚目`);
      if (url) { if (APPLY) blurs[i] = url; touchedPhotos = true; madePhotos++; }
      else failed++;
    }
    /* 並びは photos と1対1で揃える（ずれると別人の写真のぼかしを配ることになる） */
    if (touchedPhotos && APPLY) patch.photos_blur = photos.map((_, i) => blurs[i] ?? null).filter(Boolean);

    if (APPLY && Object.keys(patch).length > 0) {
      const { error: upErr } = await db.from("profiles").update(patch).eq("id", p.id);
      if (upErr) { console.log(`      × 保存に失敗: ${upErr.message}`); failed++; }
      else { console.log("      ✓ プロフィールを更新しました"); updated++; }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  `\n${APPLY ? "作成" : "作成できる"}: メイン ${madeAvatars}枚 / サブ ${madePhotos}枚` +
  (APPLY ? ` · 更新したプロフィール ${updated}件` : "") +
  (failed ? ` · 失敗 ${failed}件` : "")
);

if (APPLY && updated > 0) {
  /* 会の一覧に出すため parties.host_avatar_blur_url へ写している。
     profiles の UPDATE で on_profile_drinking_style トリガーが同期するので、
     ここでは念のため確認だけする（ずれていたら手当てが要る）。 */
  const { data: stale } = await db
    .from("parties")
    .select("id")
    .in("status", ["recruiting", "matched"])
    .is("host_avatar_blur_url", null);
  console.log(`募集中・成立済みの会のうち、ホストのぼかし写真が未設定のもの: ${stale?.length ?? 0}件`);
  console.log("（ホストがまだ写真を登録していない会は、これで正常です）");
}

if (!APPLY) console.log("\n実際に保存するには --apply を付けて実行してください。");
