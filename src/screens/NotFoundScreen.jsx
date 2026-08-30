import { Home, Compass } from "lucide-react";
import { C, FONT_HEAD, FONT_LOGO, brandText, Eyebrow } from "../lib/theme.jsx";

/* ══════════════════════════════════════════════════════════════
   404 — 存在しないURL

   vercel.json の catch-all（"/(.*)" → "/"）で、どんなパスでも
   index.html が返る。そのため URL を打ち間違えても
   「トップページが出る」だけになり、間違いに気づけなかった。
   App.jsx の NOT_FOUND_ROUTE がここへ振り分ける。

   ・アプリ本体を読み込む前に出せるよう、supabase もセッションも見ない。
   ・戻り先は必ずトップ（/）。履歴を戻すと、また存在しないURLへ帰ってしまう。
   ══════════════════════════════════════════════════════════════ */

const LINKS = [
  { href: "/", label: "トップページ", icon: Home },
  { href: "/lp/host", label: "会を募集する方へ", icon: Compass },
  { href: "/lp/guest", label: "会に参加する方へ", icon: Compass },
];

export default function NotFoundScreen({ path = "" }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 14, padding: "48px 28px", textAlign: "center",
    }}>
      <span style={{ fontFamily: FONT_LOGO, fontSize: 26, fontWeight: 700, letterSpacing: 4, ...brandText }}>
        AISEKI
      </span>

      <Eyebrow style={{ marginTop: 6 }}>404 Not Found</Eyebrow>

      <div style={{
        fontFamily: FONT_HEAD, fontSize: 21, fontWeight: 600,
        letterSpacing: 0.5, color: C.text, lineHeight: 1.6,
      }}>
        ページが見つかりません
      </div>

      <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.9, maxWidth: 340 }}>
        お探しのページは、移動または削除された可能性があります。
        <br />URLをご確認のうえ、トップページからお進みください。
      </div>

      {path && (
        <div style={{
          fontSize: 11, color: C.textFaint, letterSpacing: 0.3,
          background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`,
          borderRadius: 10, padding: "7px 12px", maxWidth: "100%",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {path}
        </div>
      )}

      <a href="/" className="press" style={{
        marginTop: 10, display: "inline-flex", alignItems: "center", gap: 7,
        background: C.primaryGrad, color: "#241a06", textDecoration: "none",
        fontSize: 13.5, fontWeight: 700, letterSpacing: 0.4,
        padding: "12px 26px", borderRadius: 999,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}>
        <Home size={16} strokeWidth={2} /> トップページへ戻る
      </a>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
        {LINKS.slice(1).map((l) => (
          <a key={l.href} href={l.href} className="press" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: C.textSec, textDecoration: "none",
            border: `1px solid ${C.lineSoft}`, borderRadius: 999, padding: "8px 14px",
          }}>
            <l.icon size={13} strokeWidth={1.9} color={C.primaryDeep} />{l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
