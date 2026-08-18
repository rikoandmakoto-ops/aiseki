/* ══════════════════════════════════════════════════════════════
   AISEKI — 「ホーム画面に追加」の案内

   毎回出すと邪魔なので、次のときだけ表示する。
     ・まだホーム画面から起動していない
     ・ブラウザが追加に対応している（または iOS Safari）
     ・利用者が「あとで」を選んでいない（選択は端末に覚える）
   ══════════════════════════════════════════════════════════════ */
import { useState, useEffect } from "react";
import { Smartphone, Share, Plus, X } from "lucide-react";
import { C, card, popBtn } from "../lib/theme.jsx";
import { onInstallAvailable, promptInstall, isStandalone, isIosSafari } from "../lib/pwa.js";

const DISMISS_KEY = "aiseki:install:dismissed";

export default function InstallCard() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => onInstallAvailable(setAvailable), []);

  const ios = isIosSafari();
  if (isStandalone() || dismissed) return null;
  if (!available && !ios) return null;

  const close = () => {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* 覚えられなくても動く */ }
  };

  const install = async () => {
    if (ios) { setShowIosSteps((v) => !v); return; }
    const ok = await promptInstall();
    if (ok) setDismissed(true);
  };

  return (
    <div className="fade" style={{
      ...card, padding: "15px 16px", marginTop: 14,
      border: `1px solid ${C.linePrimary}`, background: "rgba(232,201,135,0.07)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: 17,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
        }}><Smartphone size={16} strokeWidth={1.9} /></span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
            ホーム画面に追加して、アプリのように
          </div>
          <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.75, marginTop: 4 }}>
            アドレスバーのない全画面で起動でき、次からすぐ開けます。
          </div>

          {showIosSteps && (
            <div style={{
              marginTop: 11, padding: "11px 13px", borderRadius: 12,
              background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`,
              fontSize: 11, color: C.textSec, lineHeight: 1.9,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: C.primaryDeep, fontWeight: 700 }}>1.</span>
                画面下の <Share size={13} strokeWidth={2} style={{ verticalAlign: "middle" }} /> 共有ボタンを押す
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: C.primaryDeep, fontWeight: 700 }}>2.</span>
                <Plus size={13} strokeWidth={2.4} style={{ verticalAlign: "middle" }} /> 「ホーム画面に追加」を選ぶ
              </div>
            </div>
          )}

          <button className="lux-cta" onClick={install} style={{
            ...popBtn, marginTop: 12, padding: "9px 20px", fontSize: 12.5,
          }}>
            {ios ? (showIosSteps ? "手順を閉じる" : "追加のしかたを見る") : "ホーム画面に追加"}
          </button>
        </div>

        <button onClick={close} aria-label="閉じる" style={{
          flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 0, display: "flex",
        }}><X size={15} strokeWidth={2} /></button>
      </div>
    </div>
  );
}
