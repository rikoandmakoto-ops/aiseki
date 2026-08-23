/* ══════════════════════════════════════════════════════════════
   AISEKI — お知らせ（通知センター）

   通知専用のテーブルは持たず、api.listNotifications() が
   既存のデータ（参加リクエスト・その結果・新着メッセージ）から
   組み立てたものを表示する。既読は端末側に持つ。
   ══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from "react";
import { Bell, Check, X, MessageCircle, UsersRound, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { C, FONT_HEAD, card, Eyebrow, EmptyState, Skeleton } from "../lib/theme.jsx";
import * as api from "../lib/api";

const ICON = {
  request: { icon: UsersRound, color: C.primary, bg: "rgba(232,201,135,0.12)", line: C.linePrimary },
  accepted: { icon: Check, color: C.primary, bg: "rgba(232,201,135,0.12)", line: C.linePrimary },
  rejected: { icon: X, color: C.textMuted, bg: "rgba(255,255,255,0.05)", line: C.lineSoft },
  message: { icon: MessageCircle, color: C.accentDeep, bg: "rgba(168,32,58,0.18)", line: "rgba(200,56,79,0.34)" },
  /* 会に参加していない方から募集中の会へ届いたメッセージ（アプローチ） */
  approach: { icon: Sparkles, color: C.primary, bg: "rgba(232,201,135,0.14)", line: C.linePrimary },
};

/* 「3分前」「2時間前」のような相対表記。日付だけだと当日の並びが読めない。 */
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const Row = ({ n, unread, onOpen }) => {
  const tone = ICON[n.type] || ICON.request;
  const Icon = tone.icon;
  const clickable = Boolean(n.partyId);
  return (
    <div
      className={clickable ? "lux-row" : ""}
      onClick={clickable ? onOpen : undefined}
      style={{
        display: "flex", gap: 13, alignItems: "flex-start",
        padding: "15px 16px", borderRadius: 15, marginBottom: 9,
        cursor: clickable ? "pointer" : "default",
        background: unread ? "rgba(232,201,135,0.07)" : "rgba(255,255,255,0.035)",
        border: `1px solid ${unread ? C.linePrimary : C.lineSoft}`,
      }}
    >
      <span style={{
        flexShrink: 0, width: 34, height: 34, borderRadius: 17,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: tone.bg, border: `1px solid ${tone.line}`, color: tone.color,
      }}><Icon size={15} strokeWidth={2} /></span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {unread && (
            <span style={{
              flexShrink: 0, width: 6, height: 6, borderRadius: 3, background: C.primary,
            }} />
          )}
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.2,
            lineHeight: 1.5, minWidth: 0,
          }}>{n.title}</span>
          <span style={{ flexShrink: 0, fontSize: 10, color: C.textMuted }}>{relativeTime(n.at)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 4, wordBreak: "break-word" }}>
          {n.body}
        </div>
      </div>

      {clickable && (
        <ChevronRight size={15} strokeWidth={2} color={C.textFaint} style={{ flexShrink: 0, marginTop: 9 }} />
      )}
    </div>
  );
};

export default function NotificationsScreen({ user, onBack, onOpenParty, onOpenChat }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seenAt] = useState(() => api.loadSeenAt());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listNotifications(user.id));
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  // この画面を開いた時点で既読にする（バッジは次回から消える）
  useEffect(() => { api.markNotificationsSeen(); }, []);

  return (
    <div style={{ padding: "0 20px 24px" }}>
      <button className="press" onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
        fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4,
      }}>
        <ChevronLeft size={18} strokeWidth={2} /> 戻る
      </button>

      <div style={{ marginBottom: 18 }}>
        <Eyebrow style={{ marginBottom: 4, textTransform: "uppercase" }}>Notifications</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
          お知らせ
        </div>
      </div>

      {loading ? (
        <div aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...card, display: "flex", gap: 13, padding: 15, marginBottom: 9 }}>
              <Skeleton w={34} h={34} r={17} />
              <div style={{ flex: 1 }}>
                <Skeleton w="64%" h={12} />
                <Skeleton w="88%" h={10} style={{ marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell size={24} strokeWidth={1.6} />}>
          新しいお知らせはありません。<br />
          参加リクエストや新着メッセージが届くと、ここに表示されます。
        </EmptyState>
      ) : (
        items.map((n) => (
          <Row
            key={n.id}
            n={n}
            unread={!seenAt || new Date(n.at) > seenAt}
            onOpen={() => (n.chat ? onOpenChat(n.partyId) : onOpenParty(n.partyId))}
          />
        ))
      )}
    </div>
  );
}
