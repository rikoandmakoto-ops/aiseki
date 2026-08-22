/* =====================================================================
   AISEKI — 広告用ランディングページの OGP 画像を作る

   public/og.png（サービス全体のOGP）は scripts/generate_icons.mjs が作る。
   こちらは LP 専用の2枚だけを作る。文言が違うので分けてある。

     python3 が必要（Pillow を使う）。
       python3 -c "import PIL"   で確認できる。

   使い方:
     node scripts/generate_lp_og.mjs

   生成されるもの:
     public/og-women.png   … /lp/women 用（1200x630）
     public/og-men.png     … /lp/men 用（1200x630）
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public");
mkdirSync(OUT, { recursive: true });

const PY = String.raw`
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]

# ── ブランドカラー（src/lib/theme.jsx の C と対応させる） ──
NAVY_TOP    = (16, 24, 48)
NAVY_BOTTOM = (5, 8, 15)
GOLD_LIGHT  = (247, 230, 176)
GOLD_MID    = (223, 188, 108)
GOLD_DARK   = (176, 138, 60)
WINE        = (168, 32, 58)
ROSE        = (200, 69, 92)
INK         = (244, 239, 227)
DIM         = (190, 184, 170)

SERIF  = "/System/Library/Fonts/Supplemental/Didot.ttc"
SERIF2 = "/System/Library/Fonts/Supplemental/Baskerville.ttc"
JP_MIN = "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc"
JP_GO  = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"

def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()

def vgrad(size, top, bottom):
    w, h = size
    img = Image.new("RGB", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize(size, Image.BILINEAR)

def diag_gold(size):
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
    strip = strip.resize((w * 2, h * 2), Image.BILINEAR).rotate(
        -45, expand=False, center=(w, h), resample=Image.BILINEAR)
    return strip.crop((w // 2, h // 2, w // 2 + w, h // 2 + h))

def radial(size, center, radius, color, strength=1.0):
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
    return Image.new("RGB", (w, h), color), layer

def backdrop(size, glow, glow_x):
    """濃紺のベース + 光。glow_x で光の向きを変え、2枚を描き分ける。"""
    w, h = size
    base = vgrad(size, NAVY_TOP, NAVY_BOTTOM)
    t, m = radial(size, (w * glow_x, -h * 0.06), w * 0.78, glow, 0.55)
    base = Image.composite(t, base, m)
    t, m = radial(size, (w * (1 - glow_x), h * 1.04), w * 0.72, GOLD_MID, 0.26)
    return Image.composite(t, base, m)

def gold_text(canvas, xy, text, fnt, anchor="mm", spacing_px=0):
    w, h = canvas.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    if spacing_px:
        widths = [d.textlength(ch, font=fnt) for ch in text]
        total = sum(widths) + spacing_px * (len(text) - 1)
        x = xy[0] - total / 2
        for ch, cw in zip(text, widths):
            d.text((x, xy[1]), ch, font=fnt, fill=255, anchor="lm")
            x += cw + spacing_px
    else:
        d.text(xy, text, font=fnt, fill=255, anchor=anchor)
    canvas.paste(diag_gold(canvas.size), (0, 0), mask)

def pills(d, img, y, labels):
    f = font(JP_GO, 23, index=0)
    W = img.size[0]
    pads, gap = 22, 14
    widths = [d.textlength(t, font=f) + pads * 2 for t in labels]
    x = (W - (sum(widths) + gap * (len(labels) - 1))) / 2
    for t, bw in zip(labels, widths):
        d.rounded_rectangle([x, y - 22, x + bw, y + 22], radius=22,
                            outline=(120, 100, 62), width=2)
        d.text((x + bw / 2, y), t, font=f, fill=(205, 195, 175), anchor="mm")
        x += bw + gap

def og(path, glow, glow_x, eyebrow, line1, line2, sub, badges):
    W, H = 1200, 630
    img = backdrop((W, H), glow, glow_x)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 3], fill=GOLD_MID)
    d.rectangle([0, H - 3, W, H], fill=GOLD_DARK)

    # ワードマーク（小さめ。主役はキャッチコピー）
    gold_text(img, (W / 2, 92), "AISEKI", font(SERIF, 52, index=1), spacing_px=9)
    d.text((W / 2, 143), eyebrow, font=font(SERIF2, 21, index=0),
           fill=(198, 170, 116), anchor="mm")

    # キャッチコピー（2行）
    f_jp = font(JP_MIN, 62, index=0)
    d.text((W / 2, 253), line1, font=f_jp, fill=INK, anchor="mm")
    gold_text(img, (W / 2, 340), line2, f_jp)

    d.text((W / 2, 430), sub, font=font(JP_GO, 27, index=0), fill=DIM, anchor="mm")
    pills(d, img, 520, badges)

    img.save(path, "PNG", optimize=True)
    print("wrote", path)

og(os.path.join(OUT, "og-women.png"), ROSE, 0.86,
   "F O R   H O S T   G R O U P S",
   "今夜のごはんは、", "ぜんぶ、おごられる。",
   "友だちと2名以上で会を立てるだけ。参加ポイントは0pt。",
   ["登録無料", "ポイント不要", "グループ限定", "20歳以上限定"])

og(os.path.join(OUT, "og-men.png"), WINE, 0.14,
   "F O R   G U E S T   G R O U P S",
   "相席で、出会う。", "グループだから、気軽に。",
   "募集中の会にリクエスト。参加は1名あたり一律3,800pt。",
   ["明朗会計", "グループ限定", "個室なし", "20歳以上限定"])
`;

const tmp = resolve(OUT, "_gen_lp_og.py");
writeFileSync(tmp, PY, "utf8");
try {
  execFileSync("python3", [tmp, OUT], { stdio: "inherit" });
} finally {
  rmSync(tmp, { force: true });
}
