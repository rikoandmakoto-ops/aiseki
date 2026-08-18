/* ══════════════════════════════════════════════════════════════
   AISEKI — トースト通知 / 確認ダイアログ

   ブラウザの alert() / confirm() は
     ・見た目がアプリから浮く（OSのダイアログがそのまま出る）
     ・iOS の PWA では表示が遅れることがある
     ・非同期処理の途中で画面を止めてしまう
   ため、アプリ内で描画する軽量な仕組みに置き換える。

   使い方:
     const { toast, confirm } = useToast();
     toast.success("保存しました");
     toast.error("保存に失敗しました");
     if (await confirm({ title: "ログアウトしますか？" })) { ... }
   ══════════════════════════════════════════════════════════════ */
import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";
import { C, FONT_HEAD, FONT_BODY, popBtn, ghostBtn, card } from "./theme.jsx";

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Provider の外で呼ばれた場合でも画面が落ちないようにする
    return {
      toast: Object.assign(() => {}, { success: () => {}, error: () => {}, info: () => {} }),
      confirm: async () => window.confirm("実行しますか？"),
    };
  }
  return ctx;
}

const TONE = {
  success: { icon: Check, color: C.primary, bg: "rgba(232,201,135,0.14)", line: C.linePrimary, ink: C.primaryDeep },
  error: { icon: AlertTriangle, color: C.accent, bg: "rgba(168,32,58,0.20)", line: "rgba(200,56,79,0.45)", ink: C.accentDeep },
  info: { icon: Info, color: C.primary, bg: "rgba(255,255,255,0.07)", line: C.lineSoft, ink: C.text },
};

const ToastRow = ({ t, onClose }) => {
  const tone = TONE[t.type] || TONE.info;
  const Icon = tone.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fade"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px", borderRadius: 14, marginTop: 8,
        background: tone.bg, border: `1px solid ${tone.line}`,
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 14px 34px rgba(0,0,0,0.52)",
        pointerEvents: "auto",
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1, display: "flex", color: tone.color }}>
        <Icon size={15} strokeWidth={2.1} />
      </span>
      <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.65, color: tone.ink, wordBreak: "break-word" }}>
        {t.message}
      </span>
      <button
        onClick={onClose}
        aria-label="閉じる"
        style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 0, display: "flex" }}
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
};

const ConfirmDialog = ({ req, onAnswer }) => (
  <div
    role="dialog"
    aria-modal="true"
    onClick={() => onAnswer(false)}
    style={{
      position: "absolute", inset: 0, zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      background: "rgba(4,7,14,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
    }}
  >
    <div className="fade" onClick={(e) => e.stopPropagation()} style={{ ...card, padding: 22, width: "100%", maxWidth: 320 }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: 0.3, lineHeight: 1.5 }}>
        {req.title}
      </div>
      {req.message && (
        <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.8, marginTop: 9 }}>{req.message}</div>
      )}
      <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
        <button className="press" onClick={() => onAnswer(false)} style={{ ...ghostBtn, flex: 1, padding: "12px 0", fontSize: 13.5 }}>
          {req.cancelLabel || "キャンセル"}
        </button>
        <button
          className="lux-cta"
          onClick={() => onAnswer(true)}
          style={{
            ...popBtn, flex: 1, padding: "12px 0", fontSize: 13.5,
            ...(req.danger
              ? { background: C.accentGrad, color: "#fff2f4", boxShadow: "0 10px 24px rgba(168,32,58,0.42), inset 0 1px 0 rgba(255,255,255,0.28)" }
              : null),
          }}
        >
          {req.confirmLabel || "実行する"}
        </button>
      </div>
    </div>
  </div>
);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmReq, setConfirmReq] = useState(null);
  const seq = useRef(0);
  const resolver = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, type = "info", ms = 4200) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-2), { id, message: String(message), type }]);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  const confirm = useCallback((req) => {
    setConfirmReq(typeof req === "string" ? { title: req } : req);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const answer = useCallback((v) => {
    setConfirmReq(null);
    resolver.current?.(v);
    resolver.current = null;
  }, []);

  const value = useMemo(() => {
    const toast = (m, t) => push(m, t);
    toast.success = (m) => push(m, "success");
    toast.error = (m) => push(m, "error", 6000);
    toast.info = (m) => push(m, "info");
    return { toast, confirm };
  }, [push, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* トーストは画面下（タブバーの上）に重ねる */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 78, zIndex: 55,
          padding: "0 16px", pointerEvents: "none", fontFamily: FONT_BODY,
        }}
      >
        {toasts.map((t) => <ToastRow key={t.id} t={t} onClose={() => dismiss(t.id)} />)}
      </div>
      {confirmReq && <ConfirmDialog req={confirmReq} onAnswer={answer} />}
    </ToastContext.Provider>
  );
}
