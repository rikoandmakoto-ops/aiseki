/* =====================================================================
   AISEKI — アイコン / OGP画像の生成

   public/ 以下の画像はこのスクリプトの出力物。
   ブランドの色や文言を変えたら、これを実行し直して差し替える。

     python3 が必要（Pillow を使う）。
       python3 -c "import PIL"   で確認できる。

   使い方:
     node scripts/generate_icons.mjs

   生成されるもの:
     public/icon-192.png            … PWA / Android
     public/icon-512.png            … PWA / Android
     public/icon-maskable-512.png   … Android のマスク付きアイコン
     public/apple-touch-icon.png    … iOS ホーム画面（180x180）
     public/og.png                  … OGP / Twitter カード（1200x630）
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public");
mkdirSync(OUT, { recursive: true });

const PY = String.raw`
import math, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]

# ── ブランドカラー（src/lib/theme.jsx の C と対応させる） ──
NAVY_TOP    = (16, 24, 48)
NAVY_BOTTOM = (5, 8, 15)
GOLD_LIGHT  = (247, 230, 176)
GOLD_MID    = (223, 188, 108)
GOLD_DARK   = (176, 138, 60)
WINE        = (168, 32, 58)
INK         = (244, 239, 227)

SERIF   = "/System/Library/Fonts/Supplemental/Didot.ttc"
SERIF2  = "/System/Library/Fonts/Supplemental/Baskerville.ttc"
JP_MIN  = "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc"
JP_GO   = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()

def vgrad(size, top, bottom):
    """縦方向のグラデーション"""
    w, h = size
    img = Image.new("RGB", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize(size, Image.BILINEAR)

def diag_gold(size):
    """左上→右下のゴールドグラデーション（f7e6b0 → dfbc6c → b08a3c）"""
    w, h = size
    n = 256
    strip = Image.new("RGB", (n, 1))
    px = strip.load()
    for x in range(n):
        t = x / (n - 1)
        if t < 0.48:
            u = t / 0.48
            c = tuple(int(GOLD_LIGHT[i] + (GOLD_MID[i] - GOLD_LIGHT[i]) * u) for i in range(3))
        else:
            u = (t - 0.48) / 0.52
            c = tuple(int(GOLD_MID[i] + (GOLD_DARK[i] - GOLD_MID[i]) * u) for i in range(3))
        px[x, 0] = c
    strip = strip.resize((w * 2, h * 2), Image.BILINEAR).rotate(-45, expand=False,
                                                               center=(w, h), resample=Image.BILINEAR)
    return strip.crop((w // 2, h // 2, w // 2 + w, h // 2 + h))

def radial(size, center, radius, color, strength=1.0):
    """中心から広がる淡い光。背景の奥行きを作る。"""
    w, h = size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    cx, cy = center
    steps = 42
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = int(255 * strength * (1 - i / steps) ** 1.7)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=a)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.12))
    tint = Image.new("RGB", (w, h), color)
    return tint, layer

def backdrop(size):
    """濃紺のベース + ボルドーと金の光"""
    w, h = size
    base = vgrad(size, NAVY_TOP, NAVY_BOTTOM)
    t, m = radial(size, (w * 0.86, -h * 0.06), w * 0.78, WINE, 0.55)
    base = Image.composite(t, base, m)
    t, m = radial(size, (w * 0.06, h * 1.04), w * 0.72, GOLD_MID, 0.26)
    base = Image.composite(t, base, m)
    return base

def gold_text(canvas, xy, text, fnt, anchor="mm", spacing_px=0):
    """文字の形にゴールドのグラデーションを流し込む"""
    w, h = canvas.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    if spacing_px:
        # 字間を空けて1文字ずつ描く（アンカーは中央想定）
        widths = [d.textlength(ch, font=fnt) for ch in text]
        total = sum(widths) + spacing_px * (len(text) - 1)
        x = xy[0] - total / 2
        for ch, cw in zip(text, widths):
            d.text((x, xy[1]), ch, font=fnt, fill=255, anchor="lm")
            x += cw + spacing_px
    else:
        d.text(xy, text, font=fnt, fill=255, anchor=anchor)
    canvas.paste(diag_gold(canvas.size), (0, 0), mask)
    return mask

# ══════════════════════════════════════════════ アプリアイコン
def app_icon(size, maskable=False):
    """モノグラム "A" を金の輪で囲んだ紋章"""
    S = 1024
    img = backdrop((S, S))
    d = ImageDraw.Draw(img)

    # マスク付きアイコンは端が切られるので、中身を内側に寄せる
    scale = 0.72 if maskable else 0.90
    pad = S * (1 - scale) / 2

    # 外側の細い金の輪
    ring = S * 0.40 * scale
    d.ellipse([S/2 - ring, S/2 - ring, S/2 + ring, S/2 + ring],
              outline=GOLD_MID, width=max(2, int(S * 0.006)))
    ring2 = ring * 0.93
    d.ellipse([S/2 - ring2, S/2 - ring2, S/2 + ring2, S/2 + ring2],
              outline=(int(GOLD_DARK[0]*0.8), int(GOLD_DARK[1]*0.8), int(GOLD_DARK[2]*0.8)),
              width=max(1, int(S * 0.002)))

    # 中央の "A"
    f = font(SERIF, int(S * 0.42 * scale), index=1)  # Didot Bold
    gold_text(img, (S/2, S/2 - S*0.015*scale), "A", f)

    # 下に置く小さな菱形（アプリ内で使っている ◆ のモチーフ）
    dm = S * 0.022 * scale
    cy = S/2 + ring * 0.62
    d.polygon([(S/2, cy - dm), (S/2 + dm, cy), (S/2, cy + dm), (S/2 - dm, cy)], fill=GOLD_MID)

    if not maskable:
        # 角丸のマスク（iOS 以外でも収まりが良い）
        r = int(S * 0.22)
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S-1, S-1], radius=r, fill=255)
        out = Image.new("RGB", (S, S), NAVY_BOTTOM)
        out.paste(img, (0, 0), m)
        img = out

    return img.resize((size, size), Image.LANCZOS)

# ══════════════════════════════════════════════ OGP 画像
def og_image():
    W, H = 1200, 630
    img = backdrop((W, H))
    d = ImageDraw.Draw(img)

    # 上下の金の細線
    d.rectangle([0, 0, W, 3], fill=GOLD_MID)
    d.rectangle([0, H-3, W, H], fill=GOLD_DARK)

    # 小見出し
    f_eyebrow = font(SERIF2, 24, index=0)
    d.text((W/2, 128), "P R E M I U M   G R O U P   M A T C H I N G",
           font=f_eyebrow, fill=(210, 180, 120), anchor="mm")

    # ワードマーク
    f_logo = font(SERIF, 132, index=1)
    gold_text(img, (W/2, 232), "AISEKI", f_logo, spacing_px=18)

    # 左右の罫。ワードマークに掛からない位置から引く。
    d.line([(W/2 - 520, 232), (W/2 - 345, 232)], fill=GOLD_DARK, width=2)
    d.line([(W/2 + 345, 232), (W/2 + 520, 232)], fill=GOLD_DARK, width=2)

    # 日本語のリード
    f_jp = font(JP_MIN, 46, index=0)
    d.text((W/2, 330), "上質な夜を、グループでともに。", font=f_jp, fill=INK, anchor="mm")

    f_sub = font(JP_GO, 27, index=0)
    d.text((W/2, 392), "2名以上のグループ同士でつながる、大人の相席サービス",
           font=f_sub, fill=(190, 184, 170), anchor="mm")

    # 下の要件バッジ
    f_pill = font(JP_GO, 23, index=0)
    pills = ["グループ限定", "オープンスペースのみ", "20歳以上限定", "個人間DMなし"]
    gap, pad_x, ph = 18, 26, 50
    widths = [d.textlength(p, font=f_pill) + pad_x * 2 for p in pills]
    total = sum(widths) + gap * (len(pills) - 1)
    x = (W - total) / 2
    y = 486
    for p, pw in zip(pills, widths):
        d.rounded_rectangle([x, y, x + pw, y + ph], radius=ph/2,
                            outline=(150, 122, 66), width=2)
        d.text((x + pw/2, y + ph/2 + 1), p, font=f_pill, fill=(226, 205, 158), anchor="mm")
        x += pw + gap

    return img

# ══════════════════════════════════════════════ 出力
app_icon(192).save(os.path.join(OUT, "icon-192.png"), optimize=True)
app_icon(512).save(os.path.join(OUT, "icon-512.png"), optimize=True)
app_icon(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
app_icon(180).save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True)
og_image().save(os.path.join(OUT, "og.png"), optimize=True)
print("生成しました:", ", ".join(sorted(os.listdir(OUT))))
`;

const tmp = resolve(ROOT, ".generate_icons.py");
writeFileSync(tmp, PY, "utf8");
try {
  const out = execFileSync("python3", [tmp, OUT], { encoding: "utf8" });
  process.stdout.write(out);
} catch (e) {
  console.error("画像の生成に失敗しました。python3 と Pillow が必要です（pip3 install Pillow）。");
  console.error(e.stderr || e.message);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { force: true });
}
