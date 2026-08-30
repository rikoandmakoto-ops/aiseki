/* ══════════════════════════════════════════════════════════════
   AISEKI — 運営用の管理画面（/admin）

   通報・お問い合わせを一覧で見て、対応状況を動かすための画面。
   利用者向けの画面ではないので、タブバーもフッターも出さない。

   ⚠ 運営かどうかを決めるのはサーバ（/api/admin/inquiries）だけ。
     この画面はメールアドレスを一切見ていない。403 が返ったら閉じるだけ。
     ブラウザに配る値で可否を決めると、書き換えれば通ってしまうため。

   ⚠ inquiries は RLS で「本人が自分の分だけ読める」「status は書けない」ので、
     ここから supabase を直接叩いても何も取れない。必ず /api 経由。
   ══════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, RefreshCw, ShieldAlert, MessageSquare, Lock, Mail,
  ChevronDown, ChevronUp, User, Users, Clock, Copy, Check, Send,
} from "lucide-react";
import {
  C, FONT_HEAD, FONT_BODY, card, popBtn, ghostBtn, Eyebrow, Spinner, EmptyState,
} from "../lib/theme.jsx";
import { INQUIRY_KINDS } from "../lib/api";
import { callAdminApi } from "../lib/adminApi";
import { useToast } from "../lib/toast.jsx";

/* 対応状況。順番はそのまま画面の並び順（左から進んでいく）。 */
const STATUSES = [
  { key: "open",      label: "未対応",   color: C.accentDeep,  bg: "rgba(200,56,79,0.14)",    line: "rgba(200,56,79,0.34)" },
  { key: "in_review", label: "対応中",   color: C.primaryDeep, bg: "rgba(232,201,135,0.12)",  line: C.linePrimary },
  { key: "resolved",  label: "解決済み", color: "#8fd6b4",     bg: "rgba(143,214,180,0.12)",  line: "rgba(143,214,180,0.36)" },
  { key: "closed",    label: "クローズ", color: C.textMuted,   bg: "rgba(255,255,255,0.05)",  line: C.lineSoft },
];
const statusOf = (key) => STATUSES.find((s) => s.key === key) ?? STATUSES[0];

const KIND_LABEL = Object.fromEntries(INQUIRY_KINDS.map((k) => [k.key, k.label]));

const fmtDate = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* 呼び出しは src/lib/adminApi.js に集約してある（DM営業の画面と共有）。 */

/* ───────────────────────────────── 小さな部品 */
const Pill = ({ on, children, onClick, count }) => (
  <button
    type="button"
    className="press"
    onClick={onClick}
    style={{
      display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      padding: "7px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      letterSpacing: 0.4, cursor: "pointer", fontFamily: FONT_BODY,
      ...(on
        ? { background: C.primaryGrad, color: "#241a06", border: "none" }
        : { background: "rgba(255,255,255,0.045)", color: C.textSec, border: `1px solid ${C.lineSoft}` }),
    }}
  >
    {children}
    {typeof count === "number" && (
      <span style={{ fontSize: 10.5, fontWeight: 700, opacity: on ? 0.75 : 1, color: on ? "#241a06" : C.textMuted }}>
        {count}
      </span>
    )}
  </button>
);

const StatusBadge = ({ status }) => {
  const s = statusOf(status);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "3px 10px", borderRadius: 999,
      color: s.color, background: s.bg, border: `1px solid ${s.line}`, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
};

/* 通報の調査では ID をそのまま Supabase の検索に貼ることが多いので、写せるようにする。 */
const CopyValue = ({ value }) => {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="press"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* 非対応環境では何もしない */ }
      }}
      title="コピー"
      style={{
        background: "none", border: "none", padding: 2, cursor: "pointer", color: C.textMuted,
        display: "inline-flex", alignItems: "center", flexShrink: 0,
      }}
    >
      {done ? <Check size={12} strokeWidth={2.6} color={C.primaryDeep} /> : <Copy size={12} strokeWidth={2} />}
    </button>
  );
};

const Row = ({ label, children }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", fontSize: 11.5, lineHeight: 1.7 }}>
    <span style={{ color: C.textMuted, width: 84, flexShrink: 0, letterSpacing: 0.3 }}>{label}</span>
    <span style={{ color: C.text, minWidth: 0, wordBreak: "break-word", flex: 1 }}>{children}</span>
  </div>
);

const PersonBlock = ({ title, person, icon }) => {
  if (!person) return null;
  return (
    <div style={{
      borderRadius: 12, padding: "11px 13px", marginTop: 8,
      background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.primaryDeep, letterSpacing: 0.6 }}>{title}</span>
      </div>
      <Row label="表示名">{person.display_name || "（未設定）"}</Row>
      <Row label="メール">
        {person.email ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <a href={`mailto:${person.email}`} style={{ color: C.primaryDeep }}>{person.email}</a>
            <CopyValue value={person.email} />
          </span>
        ) : <span style={{ color: C.textFaint }}>取得できません（退会済みの可能性）</span>}
      </Row>
      <Row label="ユーザーID">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.textSec, fontFamily: "ui-monospace, monospace" }}>
          {person.id ?? "—"}
          <CopyValue value={person.id} />
        </span>
      </Row>
    </div>
  );
};

/* ───────────────────────────────── 1件のカード */
const InquiryCard = ({ item, open, onToggle, onStatus, busy }) => {
  const isReport = item.kind === "report";
  const Icon = isReport ? ShieldAlert : MessageSquare;

  return (
    <div style={{
      ...card,
      padding: 16,
      marginBottom: 12,
      ...(isReport ? { border: `1px solid rgba(200,56,79,0.30)` } : null),
    }}>
      <button
        type="button"
        className="press"
        onClick={onToggle}
        style={{ background: "none", border: "none", padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "3px 10px", borderRadius: 999,
            color: isReport ? C.accentDeep : C.primaryDeep,
            background: isReport ? "rgba(200,56,79,0.14)" : "rgba(232,201,135,0.10)",
            border: `1px solid ${isReport ? "rgba(200,56,79,0.34)" : C.line}`,
          }}>
            <Icon size={11} strokeWidth={2.2} />
            {KIND_LABEL[item.kind] ?? item.kind}
          </span>
          <StatusBadge status={item.status} />
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textFaint }}>
            <Clock size={10} strokeWidth={2} />{fmtDate(item.created_at)}
          </span>
        </div>

        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.6, fontFamily: FONT_HEAD }}>
          {item.subject || "（件名なし）"}
        </div>
        <div style={{
          fontSize: 11.5, color: C.textSec, lineHeight: 1.8, marginTop: 4,
          ...(open ? { whiteSpace: "pre-wrap" } : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
        }}>
          {open ? item.body : item.body.replace(/\s+/g, " ")}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 10.5, color: C.textMuted }}>
          <User size={11} strokeWidth={2} />
          {item.sender?.display_name || item.sender?.email || "（送信者不明）"}
          {item.target && (
            <>
              <span style={{ color: C.textFaint }}>→</span>
              <ShieldAlert size={11} strokeWidth={2} color={C.accentDeep} />
              <span style={{ color: C.accentDeep }}>{item.target.display_name || item.target.email || item.target.id}</span>
            </>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, color: C.primaryDeep }}>
            {open ? <>閉じる <ChevronUp size={12} strokeWidth={2.2} /></> : <>詳細 <ChevronDown size={12} strokeWidth={2.2} /></>}
          </span>
        </div>
      </button>

      {open && (
        <div className="rise" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
          <PersonBlock title="送信者" person={item.sender} icon={<User size={12} strokeWidth={2.2} color={C.primaryDeep} />} />
          <PersonBlock title="通報の対象者" person={item.target} icon={<ShieldAlert size={12} strokeWidth={2.2} color={C.accentDeep} />} />

          {item.party && (
            <div style={{
              borderRadius: 12, padding: "11px 13px", marginTop: 8,
              background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Users size={12} strokeWidth={2.2} color={C.primaryDeep} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.primaryDeep, letterSpacing: 0.6 }}>対象の会</span>
              </div>
              <Row label="タイトル">{item.party.title}</Row>
              <Row label="場所">{[item.party.location, item.party.area].filter(Boolean).join(" · ") || "—"}</Row>
              <Row label="開催日">{item.party.party_date || "—"}</Row>
              <Row label="状態">{item.party.status}</Row>
              <Row label="会のID">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.textSec, fontFamily: "ui-monospace, monospace" }}>
                  {item.party.id}
                  <CopyValue value={item.party.id} />
                </span>
              </Row>
            </div>
          )}

          {item.reply_email && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
              <Mail size={12} strokeWidth={2.2} color={C.primaryDeep} />
              <span style={{ color: C.textMuted }}>返信先の指定：</span>
              <a href={`mailto:${item.reply_email}`} style={{ color: C.primaryDeep }}>{item.reply_email}</a>
            </div>
          )}

          {/* 対応状況の変更 */}
          <div style={{ marginTop: 14 }}>
            <Eyebrow style={{ marginBottom: 8 }}>対応状況を変更</Eyebrow>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {STATUSES.map((s) => {
                const on = item.status === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className="press"
                    disabled={on || busy}
                    onClick={() => onStatus(s.key)}
                    style={{
                      padding: "8px 15px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                      letterSpacing: 0.4, fontFamily: FONT_BODY,
                      cursor: on || busy ? "default" : "pointer",
                      opacity: busy && !on ? 0.5 : 1,
                      ...(on
                        ? { background: s.bg, color: s.color, border: `1px solid ${s.line}` }
                        : { ...ghostBtn, borderRadius: 999 }),
                    }}
                  >
                    {on ? `● ${s.label}` : s.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 8, lineHeight: 1.7 }}>
              未対応 → 対応中 → 解決済み → クローズ の順に進めます（戻すこともできます）。
              変更は送信者の「お問い合わせ」画面にも反映されます。
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ───────────────────────────────── 画面本体 */
export default function AdminScreen({ user, onExit }) {
  const { toast } = useToast();
  const [kind, setKind] = useState(null);      // null = すべて
  const [status, setStatus] = useState(null);  // null = すべて
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  /* サーバが 200 を返した＝運営のアカウント。他の管理画面への導線はこのときだけ出す。
     画面側でメールアドレスを見て判定しない（ADMIN_EMAILS の出典は api/_lib.js だけ）。 */
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (status) params.set("status", status);
      const q = params.toString();
      const payload = await callAdminApi(`/api/admin/inquiries${q ? `?${q}` : ""}`);
      setItems(payload.items ?? []);
      setCounts(payload.counts ?? null);
      setDenied(false);
      setIsAdmin(true);
    } catch (e) {
      if (e.status === 403 || e.status === 401) { setDenied(true); setIsAdmin(false); return; }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, next) => {
    setBusyId(id);
    try {
      const { item } = await callAdminApi("/api/admin/inquiries", {
        method: "PATCH",
        body: { id, status: next },
      });
      // 状態で絞り込んでいるときは、外れた行を一覧から落とす
      setItems((prev) =>
        status && item.status !== status
          ? prev.filter((x) => x.id !== id)
          : prev.map((x) => (x.id === id ? item : x))
      );
      setCounts((prev) => {
        if (!prev) return prev;
        const before = items.find((x) => x.id === id)?.status;
        if (!before || before === item.status) return prev;
        return { ...prev, [before]: Math.max(0, (prev[before] ?? 0) - 1), [item.status]: (prev[item.status] ?? 0) + 1 };
      });
      toast.success(`「${statusOf(next).label}」に変更しました。`);
    } catch (e) {
      if (e.status === 403 || e.status === 401) { setDenied(true); return; }
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const header = useMemo(() => (
    <>
      <button className="press" onClick={onExit} style={{
        display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
        fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4,
      }}>
        <ChevronLeft size={18} strokeWidth={2} /> アプリに戻る
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow style={{ marginBottom: 4, textTransform: "uppercase" }}>Admin</Eyebrow>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
            通報・お問い合わせ
          </div>
          <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 4, wordBreak: "break-all" }}>{user?.email}</div>
        </div>
        <button
          className="press"
          onClick={load}
          disabled={loading}
          style={{ ...ghostBtn, marginLeft: "auto", flexShrink: 0, padding: "9px 16px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} strokeWidth={2.2} style={loading ? { animation: "spin 0.85s linear infinite" } : undefined} />
          更新
        </button>
      </div>

      {/* 他の管理画面への導線。増えたらここに並べる。
          運営だとサーバが認めたときだけ出す（＝通報の一覧が 200 で返ったとき）。
          /admin/dm は開いた先で管理者パスワード（ADMIN_PASSWORD）も要る。 */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
          <a
            href="/admin/dm"
            className="press"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
              padding: "8px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4,
              background: "rgba(255,255,255,0.045)", color: C.textSec, border: `1px solid ${C.lineSoft}`,
            }}
          >
            <Send size={12} strokeWidth={2.2} />
            インフルエンサー営業
            <Lock size={11} strokeWidth={2.2} style={{ opacity: 0.7 }} />
          </a>
        </div>
      )}
    </>
  ), [onExit, load, loading, user?.email, isAdmin]);

  if (denied) {
    return (
      <div style={{ padding: "0 20px 24px" }}>
        {header}
        <div style={{ ...card, padding: 26, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 16px", borderRadius: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(200,56,79,0.14)", border: "1px solid rgba(200,56,79,0.34)", color: C.accentDeep,
          }}>
            <Lock size={22} strokeWidth={1.8} />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 16, color: C.text, letterSpacing: 0.6, marginBottom: 8 }}>
            この画面を利用する権限がありません
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.9 }}>
            管理画面は運営のアカウントでのみご利用いただけます。<br />
            ログイン中のアカウント：{user?.email || "—"}
          </div>
          <button className="press" onClick={onExit} style={{ ...popBtn, marginTop: 20, padding: "12px 28px", fontSize: 13.5 }}>
            アプリに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 20px 24px" }}>
      {header}

      {/* 絞り込み */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 9 }}>種別</Eyebrow>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 15 }}>
          <Pill on={kind === null} onClick={() => setKind(null)}>すべて</Pill>
          {INQUIRY_KINDS.map((k) => (
            <Pill key={k.key} on={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</Pill>
          ))}
        </div>

        <Eyebrow style={{ marginBottom: 9 }}>対応状況</Eyebrow>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Pill on={status === null} onClick={() => setStatus(null)} count={counts?.total}>すべて</Pill>
          {STATUSES.map((s) => (
            <Pill key={s.key} on={status === s.key} onClick={() => setStatus(s.key)} count={counts?.[s.key]}>
              {s.label}
            </Pill>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          ...card, padding: 16, marginBottom: 14,
          border: "1px solid rgba(200,56,79,0.34)", background: "rgba(200,56,79,0.10)",
        }}>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.8 }}>{error}</div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <Spinner label="読み込み中…" />
      ) : items.length === 0 ? (
        <EmptyState icon={<MessageSquare size={24} strokeWidth={1.6} />}>
          {kind || status ? "この条件に当てはまるものはありません。" : "お問い合わせ・通報はまだ届いていません。"}
        </EmptyState>
      ) : (
        items.map((item) => (
          <InquiryCard
            key={item.id}
            item={item}
            open={openId === item.id}
            busy={busyId === item.id}
            onToggle={() => setOpenId((v) => (v === item.id ? null : item.id))}
            onStatus={(next) => changeStatus(item.id, next)}
          />
        ))
      )}

      {items.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.textFaint, textAlign: "center", marginTop: 14, lineHeight: 1.8 }}>
          {items.length}件を表示（新しい順・最大200件）
        </div>
      )}
    </div>
  );
}
