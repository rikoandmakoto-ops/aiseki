import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, Gift, Copy, Share2, Ticket, Check, Users, Gem, Sparkles,
} from "lucide-react";
import * as api from "../lib/api.js";
import {
  C, FONT_DISPLAY, FONT_HEAD, FONT_BODY,
  brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle, Eyebrow, Spinner,
} from "../lib/theme.jsx";
import { useToast } from "../lib/toast.jsx";

/* ══════════════════════════════════════════════════════════════
   友達を招待する

   ・自分のコードを友達に渡す → 友達が登録後に入力すると双方にボーナス
   ・グループで来るサービスなので、そもそも1人では参加できない。
     「誘う」ことが利用の前提であり、招待はおまけではなく導線そのもの。
   ══════════════════════════════════════════════════════════════ */

const BONUS = api.REFERRAL_BONUS;

/* 共有先。Web Share API が使える端末では、まずそちらを勧める。 */
const shareTargets = (text) => {
  const encoded = encodeURIComponent(text);
  return [
    { key: "line", label: "LINE", href: `https://line.me/R/msg/text/?${encoded}` },
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${encoded}` },
    { key: "mail", label: "メール", href: `mailto:?subject=${encodeURIComponent("AISEKIに一緒に登録しませんか")}&body=${encoded}` },
  ];
};

export default function ReferralScreen({ onBack }) {
  const { toast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await api.getReferralStats());
    } catch (e) {
      console.error(e);
      setError(e.message || "招待コードを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const myCode = stats?.code || "";
  const text = myCode ? api.referralShareText(myCode) : "";

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`${label}をコピーしました。`);
    } catch {
      toast.info(value);
    }
  };

  /* 端末の共有シートが使えるならそれを開く（LINE でも X でも選べる）。
     使えない環境では、下のリンクから個別に開いてもらう。 */
  const share = async () => {
    if (!navigator.share) { copy(text, "招待メッセージ"); return; }
    try {
      await navigator.share({ title: "AISEKI", text });
    } catch {
      /* 利用者が閉じただけなので何もしない */
    }
  };

  const apply = async () => {
    const value = code.trim();
    if (!value) { toast.error("招待コードを入力してください。"); return; }
    setApplying(true);
    try {
      const r = await api.applyReferralCode(value);
      toast.success(`${Number(r?.bonus ?? BONUS).toLocaleString()}ptを受け取りました。`);
      setCode("");
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ padding: "0 20px 24px" }}>
      <button className="press" onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
        fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4,
      }}>
        <ChevronLeft size={18} strokeWidth={2} /> 戻る
      </button>

      <div style={{ marginBottom: 18 }}>
        <Eyebrow style={{ marginBottom: 6, textTransform: "uppercase" }}>Invite friends</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
          友達を招待する
        </div>
      </div>

      {loading ? <Spinner /> : error ? (
        <div style={{ ...card, padding: 22, fontSize: 12.5, color: C.textSec, lineHeight: 1.9 }}>{error}</div>
      ) : (
        <>
          {/* ── 訴求 ── */}
          <div className="fade" style={{
            borderRadius: 22, padding: "26px 22px", marginBottom: 16, position: "relative", overflow: "hidden",
            background: "linear-gradient(135deg, rgba(168,32,58,0.34), rgba(232,201,135,0.13))",
            border: `1px solid ${C.linePrimary}`, textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, margin: "0 auto 14px", borderRadius: 26,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: C.primaryGrad, color: "#241a06",
              boxShadow: "0 12px 26px rgba(176,138,60,0.44), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}>
              <Gift size={24} strokeWidth={1.9} />
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 600, color: C.text, letterSpacing: 0.5, lineHeight: 1.6 }}>
              二人とも <span style={{ ...brandText, fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700 }}>{BONUS.toLocaleString()}</span>
              <span style={{ fontSize: 13 }}>pt</span> もらえます
            </div>
            <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.9, marginTop: 8 }}>
              ちょうど参加1名分のポイントです。<br />
              AISEKIは{api.MIN_GROUP_SIZE}名以上のグループでのみ参加できます。
              まず、一緒に行く友達を誘いましょう。
            </div>
          </div>

          {/* ── 自分のコード ── */}
          <div className="fade" style={{ ...card, padding: 22, marginBottom: 14 }}>
            <Eyebrow style={{ marginBottom: 13 }}>◆ あなたの招待コード</Eyebrow>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              borderRadius: 16, padding: "18px 14px", marginBottom: 13,
              background: "rgba(232,201,135,0.09)", border: `1px solid ${C.linePrimary}`,
            }}>
              <span style={{
                fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: 6,
                lineHeight: 1, ...brandText,
              }}>{myCode}</span>
              <button className="press" onClick={() => copy(myCode, "招待コード")} aria-label="招待コードをコピー" style={{
                ...ghostBtn, padding: "8px 11px", borderRadius: 999, display: "inline-flex", alignItems: "center", flexShrink: 0,
              }}>{copied ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2} />}</button>
            </div>

            <button className="lux-cta" onClick={share} style={{
              ...popBtn, width: "100%", padding: "14px 0", borderRadius: 999, fontSize: 14.5,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <Share2 size={16} strokeWidth={2.1} /> 招待メッセージを送る
            </button>

            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              {shareTargets(text).map((t) => (
                <a
                  key={t.key}
                  className="press"
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...ghostBtn, flex: 1, padding: "10px 0", fontSize: 12, textAlign: "center",
                    textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >{t.label}</a>
              ))}
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: C.textSec }}>
                <Users size={14} strokeWidth={1.9} color={C.primary} /> 招待した友達
              </span>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, ...brandText }}>
                {Number(stats?.count ?? 0)}<span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 600 }}> 人</span>
              </span>
            </div>
            {Number(stats?.count ?? 0) > 0 && (
              <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 7, lineHeight: 1.7, textAlign: "right" }}>
                これまでに {(Number(stats.count) * BONUS).toLocaleString()}pt を受け取っています。
              </div>
            )}
          </div>

          {/* ── コードを入力する側 ── */}
          <div className="fade" style={{ ...card, padding: 22 }}>
            <Eyebrow style={{ marginBottom: 11 }}>◆ 招待コードを受け取った方</Eyebrow>
            {stats?.used ? (
              <div style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                borderRadius: 14, padding: "13px 15px",
                background: "rgba(232,201,135,0.09)", border: `1px solid ${C.linePrimary}`,
              }}>
                <Check size={15} strokeWidth={2.4} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                  招待コードは利用済みです。ボーナスポイントは残高に入っています。
                </div>
              </div>
            ) : (
              <>
                <label style={labelStyle}>招待コード（8桁）</label>
                <div style={{ display: "flex", gap: 9 }}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); apply(); } }}
                    placeholder="例: KX7M2QDA"
                    maxLength={8}
                    style={{ ...fieldStyle, letterSpacing: 3, fontFamily: FONT_DISPLAY, fontWeight: 700 }}
                  />
                  <button className="lux-cta" onClick={apply} disabled={applying} style={{
                    ...popBtn, padding: "0 20px", borderRadius: 999, fontSize: 13.5, flexShrink: 0,
                    opacity: applying ? 0.6 : 1,
                  }}>{applying ? "…" : "受け取る"}</button>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 10.5, color: C.textMuted, marginTop: 10, lineHeight: 1.75 }}>
                  <Gem size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                  ご自身のコードは使えません。ご利用は登録から14日以内、お一人につき1回までです。
                </div>
              </>
            )}
          </div>

          {/* ── 会に同伴者を招くコードとの違い ── */}
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", marginTop: 14,
            borderRadius: 14, padding: "12px 15px",
            background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`,
          }}>
            <Ticket size={13} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.8 }}>
              会ごとに発行される「同伴者の招待コード」とは別のものです。
              こちらはサービスそのものへのご招待で、ポイントが増えます。
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 18, fontSize: 10, color: C.textFaint, letterSpacing: 0.6, lineHeight: 1.9 }}>
            <Sparkles size={11} strokeWidth={1.9} style={{ verticalAlign: -1, marginRight: 4 }} />
            不正な取得が確認された場合、ポイントを取り消すことがあります
          </div>
        </>
      )}
    </div>
  );
}
