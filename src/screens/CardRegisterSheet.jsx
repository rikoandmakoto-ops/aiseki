import { useState, useEffect, useRef, useCallback } from "react";
import { X, CreditCard, ShieldCheck, Gem, Lock } from "lucide-react";
import * as api from "../lib/api.js";
import { C, FONT_HEAD, FONT_DISPLAY, brandText, popBtn } from "../lib/theme.jsx";

/* ══════════════════════════════════════════════════════════════
   カードの登録（登録ボーナス 5,000pt）

   ・ここで請求は起きない。あとで請求できる状態にするだけ（SetupIntent）。
   ・カード番号は Stripe が用意する iframe の中にあり、AISEKI の JavaScript
     からは読めない。サーバにも送られない。
   ・ポイントを付けるのはサーバだけ。この画面は「登録が済んだこと」を
     サーバに確かめてもらい、その結果を表示する。
   ══════════════════════════════════════════════════════════════ */

/* Stripe Elements の見た目。暗い地に合わせる（この画面の配色に揃える）。 */
const ELEMENT_STYLE = {
  base: {
    color: "#f4efe3",
    fontFamily: "'Zen Kaku Gothic New', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: "15px",
    fontSmoothing: "antialiased",
    "::placeholder": { color: "rgba(244,239,227,0.34)" },
    iconColor: "#d9b877",
  },
  invalid: { color: "#f0a3b1", iconColor: "#f0a3b1" },
};

export default function CardRegisterSheet({ onClose, onGranted }) {
  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);
  const secretRef = useRef("");

  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { points, balance } | null

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  /* SetupIntent を作り、カード入力欄を差し込む。
     公開可能キーは SetupIntent の応答に入っているものを使う
     （ビルド時に焼き込む VITE_ の値が空でも動くようにするため）。 */
  useEffect(() => {
    let alive = true;
    let card;

    (async () => {
      try {
        const intent = await api.createSetupIntent();
        if (!alive) return;
        secretRef.current = intent.clientSecret;

        const stripe = await api.loadStripe(intent.publishableKey);
        if (!alive || !mountRef.current) return;
        stripeRef.current = stripe;

        card = stripe.elements().create("card", { style: ELEMENT_STYLE, hidePostalCode: true });
        card.mount(mountRef.current);
        card.on("change", (e) => {
          if (!alive) return;
          setComplete(e.complete);
          setError(e.error?.message || "");
        });
        cardRef.current = card;
        setReady(true);
      } catch (e) {
        if (alive) setError(e.message || "カード入力の準備に失敗しました。");
      }
    })();

    return () => {
      alive = false;
      card?.destroy();
      cardRef.current = null;
    };
  }, []);

  const submit = useCallback(async () => {
    const stripe = stripeRef.current;
    const card = cardRef.current;
    if (!stripe || !card || busy) return;

    setBusy(true);
    setError("");
    try {
      const result = await stripe.confirmCardSetup(secretRef.current, {
        payment_method: { card },
      });
      if (result.error) {
        // カードの不備・3Dセキュアの中断など。文面は Stripe が日本語で返す。
        setError(result.error.message || "カードを登録できませんでした。");
        return;
      }

      /* 付与するかどうかを決めるのはサーバ。
         こちらは SetupIntent の ID を渡すだけで、ポイントには触らない。 */
      const granted = await api.confirmCardRegistration(result.setupIntent.id);
      setDone({ points: granted.points ?? 0, balance: granted.balance ?? 0 });
      onGranted?.(granted);
    } catch (e) {
      setError(e.message || "カードを登録できませんでした。");
    } finally {
      setBusy(false);
    }
  }, [busy, onGranted]);

  return (
    <div
      className="sheet-backdrop"
      onClick={() => { if (!busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="カードの登録"
      style={{
        position: "absolute", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end",
        background: "rgba(4,7,14,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "88%", overflowY: "auto", position: "relative",
          borderTopLeftRadius: 26, borderTopRightRadius: 26,
          background: "linear-gradient(180deg, #16203a 0%, #0a0e1c 100%)",
          border: `1px solid ${C.linePrimary}`, borderBottom: "none",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <span style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(232,201,135,0.35)" }} />
        </div>

        <button className="press" onClick={onClose} disabled={busy} aria-label="閉じる" style={{
          position: "absolute", top: 14, right: 16, width: 30, height: 30, borderRadius: 15,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.4 : 1,
          background: "rgba(255,255,255,0.06)", border: `1px solid ${C.lineSoft}`, color: C.textSec,
        }}><X size={15} strokeWidth={2.2} /></button>

        <div style={{ padding: "12px 22px 28px" }}>
          {done ? (
            /* ── 付与できた（または既に付与済みだった） ── */
            <div style={{ textAlign: "center", padding: "18px 0 6px" }}>
              <div style={{
                width: 62, height: 62, borderRadius: 31, margin: "0 auto 16px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.primaryGrad, color: "#241a06",
                boxShadow: "0 14px 30px rgba(176,138,60,0.42)",
              }}><Gem size={26} strokeWidth={1.9} /></div>

              <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 600, color: C.text, letterSpacing: 0.4 }}>
                {done.points > 0 ? "ポイントを差し上げました" : "カードのご登録が済んでいます"}
              </div>

              {done.points > 0 && (
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 600, ...brandText, marginTop: 12, lineHeight: 1 }}>
                  +{done.points.toLocaleString()}
                  <span style={{ fontSize: 15, fontWeight: 500 }}> pt</span>
                </div>
              )}

              <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.9, marginTop: 14 }}>
                現在の残高は {done.balance.toLocaleString()}pt です。<br />
                そのまま会にお申し込みいただけます。
              </div>

              <button className="lux-cta" onClick={onClose} style={{
                ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15, marginTop: 22,
              }}>閉じる</button>
            </div>
          ) : (
            <>
              {/* ── 見出し ── */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
                <div style={{
                  width: 54, height: 54, borderRadius: 27, marginBottom: 12,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.primaryGradSoft, border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
                }}><CreditCard size={23} strokeWidth={1.8} /></div>

                <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 600, color: C.text, letterSpacing: 0.4 }}>
                  カードを登録して {api.SIGNUP_BONUS.toLocaleString()}pt
                </div>
                <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 7, textAlign: "center", lineHeight: 1.85 }}>
                  ご登録の時点では請求は発生しません。<br />
                  登録が済んだ方に {api.SIGNUP_BONUS.toLocaleString()}pt（参加{api.SIGNUP_BONUS_SEATS}名分）を差し上げています。
                </div>
              </div>

              {/* ── カード入力（Stripe の iframe が入る） ── */}
              <div style={{
                borderRadius: 15, padding: "16px 15px",
                background: "rgba(255,255,255,0.045)",
                border: `1px solid ${error ? "rgba(200,56,79,0.5)" : C.lineSoft}`,
                marginBottom: 12, minHeight: 52,
              }}>
                <div ref={mountRef} />
                {!ready && !error && (
                  <div style={{ fontSize: 12, color: C.textMuted }}>カード入力を読み込んでいます…</div>
                )}
              </div>

              {error && (
                <div role="alert" style={{
                  fontSize: 11.5, lineHeight: 1.75, color: C.accentDeep, marginBottom: 12,
                  background: "rgba(168,32,58,0.14)", border: "1px solid rgba(200,56,79,0.34)",
                  borderRadius: 12, padding: "10px 13px",
                }}>{error}</div>
              )}

              <button
                className="lux-cta"
                onClick={submit}
                disabled={!ready || !complete || busy}
                style={{
                  ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: !ready || !complete || busy ? 0.45 : 1,
                  cursor: !ready || !complete || busy ? "not-allowed" : "pointer",
                }}
              >
                <Gem size={16} strokeWidth={2.1} />
                {busy ? "登録しています…" : `登録して ${api.SIGNUP_BONUS.toLocaleString()}pt もらう`}
              </button>

              {/* ── 安心してもらうための説明 ── */}
              <div style={{ display: "grid", gap: 9, marginTop: 18 }}>
                {[
                  { icon: Lock, text: "カード番号は Stripe へ直接送られます。AISEKI のサーバには保存されません。" },
                  { icon: ShieldCheck, text: "この登録では請求は発生しません。ポイントのご購入は、購入タブから都度お選びいただきます。" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 10.5, color: C.textMuted, lineHeight: 1.8 }}>
                    <Icon size={13} strokeWidth={1.8} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
