/* ══════════════════════════════════════════════════════════════
   AISEKI — インフルエンサー営業DMの管理（/admin/dm）

   相席・飲み会系のインフルエンサーへ営業DMを出すための、
   リスト・文面・送信状況の管理画面。運営だけが使う。

   ⚠ 運営かどうかを決めるのはサーバ（/api/admin/gate · /api/dm/*）だけ。
     この画面はメールアドレスを一切見ていない。403 が返ったらトップへ帰す。

   ⚠ この画面だけ2段になっている。
     1段目 … 運営のメールアドレス（ADMIN_EMAILS）
     2段目 … 管理者パスワード（サーバの ADMIN_PASSWORD）
     合言葉を通すまで /api/dm/* は 423 を返すので、中身は1件も出てこない。
     通した証明は sessionStorage に置くだけ（タブを閉じれば消える・8時間で失効）。

   🚨 **送信は自動化していない。ここを「自動送信」に作り替えないこと。**
     Instagram の初回DM（相手からの接触が無い状態）は
       ・Messaging API … 相手の最終接触から24時間以内しか送れないので、
                          未接触の相手には API そのものが通らない
       ・ブラウザ自動化 … Meta Platform Terms が明示的に禁じている
     という理由で、どの経路でも自動送信できない。
     この画面は「文面を用意してDM画面を開くところまで」をやり、
     送信ボタンは人が押す。押した結果だけを status に記録する。

     ⚠ 返信が来たあとは Messaging API の24時間ウィンドウに入るので、
       そこからのやり取りは自動化できる。伸ばすならその方向。
   ══════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, RefreshCw, Send, Upload, FileText, Lock, Copy, Check, ExternalLink,
  AlertTriangle, Trash2, Search, Clock, Ban, Star, Inbox,
} from "lucide-react";
import {
  C, FONT_HEAD, FONT_BODY, card, popBtn, ghostBtn, fieldStyle, labelStyle,
  Eyebrow, Spinner, EmptyState,
} from "../lib/theme.jsx";
import {
  callAdminApi, clearAdminUnlock, fetchAdminGate, isDenied, isForbidden, unlockAdmin,
} from "../lib/adminApi";
import { useToast } from "../lib/toast.jsx";

/* 送信状況。並び順はそのまま画面の並び順。 */
const STATUSES = [
  { key: "pending", label: "未送信", color: C.primaryDeep, bg: "rgba(232,201,135,0.12)", line: C.linePrimary },
  { key: "sent",    label: "送信済", color: "#8fd6b4",     bg: "rgba(143,214,180,0.12)", line: "rgba(143,214,180,0.36)" },
  { key: "failed",  label: "失敗",   color: C.accentDeep,  bg: "rgba(200,56,79,0.14)",   line: "rgba(200,56,79,0.34)" },
  { key: "skipped", label: "対象外", color: C.textMuted,   bg: "rgba(255,255,255,0.05)", line: C.lineSoft },
];
const statusOf = (key) => STATUSES.find((s) => s.key === key) ?? STATUSES[0];

const TABS = [
  { key: "send",      label: "送信", icon: Send },
  { key: "list",      label: "リスト", icon: Inbox },
  { key: "templates", label: "文面", icon: FileText },
];

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtCount = (n) => (typeof n === "number" ? n.toLocaleString("ja-JP") : "—");

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

const Stat = ({ label, value, tone }) => (
  <div style={{
    flex: "1 1 76px", minWidth: 76, padding: "11px 12px", borderRadius: 12,
    background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`,
  }}>
    <div style={{ fontSize: 9.5, color: C.textMuted, letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
    <div style={{
      fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 600, letterSpacing: 0.5,
      color: tone ?? C.text, lineHeight: 1.2,
    }}>{value}</div>
  </div>
);

const Notice = ({ children, tone = "info", icon }) => {
  const tones = {
    info: { bg: "rgba(232,201,135,0.08)", line: C.line, color: C.textSec },
    warn: { bg: "rgba(200,56,79,0.10)", line: "rgba(200,56,79,0.30)", color: C.text },
  };
  const t = tones[tone] ?? tones.info;
  return (
    <div style={{
      display: "flex", gap: 9, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12,
      background: t.bg, border: `1px solid ${t.line}`, marginBottom: 14,
    }}>
      {icon}
      <div style={{ fontSize: 11.5, color: t.color, lineHeight: 1.85, minWidth: 0 }}>{children}</div>
    </div>
  );
};

/* ───────────────────────────────── 送信タブ：1件のカード

   「コピーしてDMを開く」→ 人が Instagram で送る → 結果を押す、という順。
   結果を押すまで次のカードへは進めない（取りこぼしを防ぐ）。 */
const SendCard = ({ entry, template, busy, cooling, onMark, index }) => {
  const { toast } = useToast();
  const [message, setMessage] = useState(entry.message);
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setMessage(entry.message); setOpened(false); }, [entry.message, entry.target.id]);

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("コピーできませんでした。文面を手で選択してコピーしてください。");
    }
    window.open(entry.dmUrl, "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  const t = entry.target;

  return (
    <div style={{ ...card, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{
          fontFamily: FONT_HEAD, fontSize: 11, color: C.textFaint, letterSpacing: 0.6,
          width: 20, flexShrink: 0,
        }}>{String(index + 1).padStart(2, "0")}</span>
        <a
          href={entry.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: C.text,
            letterSpacing: 0.4, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
          }}
        >
          @{t.username}
          <ExternalLink size={12} strokeWidth={2} color={C.primaryDeep} />
        </a>
        {typeof t.follower_count === "number" && (
          <span style={{ fontSize: 10.5, color: C.textMuted }}>{fmtCount(t.follower_count)} フォロワー</span>
        )}
        <span style={{ marginLeft: "auto" }}><StatusBadge status={t.status} /></span>
      </div>

      {(t.display_name || t.category || t.note) && (
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, lineHeight: 1.7 }}>
          {[t.display_name, t.category].filter(Boolean).join(" · ")}
          {t.note && <div style={{ color: C.textFaint, marginTop: 2 }}>{t.note}</div>}
        </div>
      )}

      {entry.warnings.map((w) => (
        <div key={w} style={{
          display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 8,
          fontSize: 10.5, color: C.accentDeep, lineHeight: 1.7,
        }}>
          <AlertTriangle size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
          {w}
        </div>
      ))}

      <label style={{ ...labelStyle, display: "block", marginBottom: 5 }}>
        送る文面（{template?.name ?? "ひな形"} · この場で直せます）
      </label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={8}
        style={{
          ...fieldStyle, width: "100%", resize: "vertical", lineHeight: 1.9,
          fontSize: 12, fontFamily: FONT_BODY, whiteSpace: "pre-wrap",
        }}
      />
      <div style={{ fontSize: 10, color: message.length > 1000 ? C.accentDeep : C.textFaint, textAlign: "right", marginTop: 4 }}>
        {message.length} / 1000
      </div>

      <button
        className="press"
        onClick={copyAndOpen}
        disabled={busy || cooling}
        style={{
          ...popBtn, width: "100%", marginTop: 10, padding: "13px 0", fontSize: 13.5,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
          ...(busy || cooling ? { opacity: 0.5, cursor: "not-allowed" } : null),
        }}
      >
        {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2.2} />}
        {copied ? "コピーしました" : "コピーしてDMを開く"}
      </button>

      <div style={{ fontSize: 10, color: C.textFaint, textAlign: "center", marginTop: 7, lineHeight: 1.7 }}>
        Instagram が開きます。貼り付けて送信したら、下のボタンで結果を記録してください。
      </div>

      <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
        <button
          className="press"
          onClick={() => onMark("sent")}
          disabled={busy || cooling}
          style={{
            ...ghostBtn, flex: "1 1 100px", padding: "11px 0", fontSize: 12, fontWeight: 700,
            color: "#8fd6b4", border: "1px solid rgba(143,214,180,0.36)",
            ...(busy || cooling ? { opacity: 0.5, cursor: "not-allowed" } : null),
            ...(opened && !busy && !cooling ? { background: "rgba(143,214,180,0.10)" } : null),
          }}
        >
          送信済みにする
        </button>
        <button
          className="press"
          onClick={() => onMark("failed", window.prompt("送れなかった理由（任意）") ?? undefined)}
          disabled={busy || cooling}
          style={{
            ...ghostBtn, flex: "1 1 90px", padding: "11px 0", fontSize: 12,
            color: C.accentDeep, border: "1px solid rgba(200,56,79,0.30)",
            ...(busy || cooling ? { opacity: 0.5, cursor: "not-allowed" } : null),
          }}
        >
          送れなかった
        </button>
        <button
          className="press"
          onClick={() => onMark("skipped")}
          disabled={busy || cooling}
          style={{
            ...ghostBtn, flex: "1 1 80px", padding: "11px 0", fontSize: 12, color: C.textMuted,
            ...(busy || cooling ? { opacity: 0.5, cursor: "not-allowed" } : null),
          }}
        >
          対象外
        </button>
      </div>
    </div>
  );
};

/* ───────────────────────────────── 送信タブ */
const SendTab = ({ stats, onStats, onDenied }) => {
  const { toast } = useToast();
  const [batch, setBatch] = useState([]);
  const [template, setTemplate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [capReached, setCapReached] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  const gap = Number(stats?.min_interval_seconds ?? 0);
  const remaining = Math.max(0, Number(stats?.daily_cap ?? 0) - Number(stats?.sent_today ?? 0));

  useEffect(() => {
    callAdminApi("/api/dm/templates")
      .then((p) => setTemplates(p.items ?? []))
      .catch((e) => { if (isDenied(e)) onDenied(); });
  }, [onDenied]);

  /* 間隔のカウントダウン。1件記録するたびに走らせる。 */
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    timerRef.current = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await callAdminApi("/api/dm/start", {
        method: "POST",
        body: { limit: 10, ...(templateId ? { templateId } : {}) },
      });
      setBatch(payload.batch ?? []);
      setTemplate(payload.template ?? null);
      setCapReached(!!payload.capReached);
      onStats(payload.stats);
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [templateId, onStats, onDenied, toast]);

  const mark = async (id, status, note) => {
    setBusyId(id);
    try {
      const payload = await callAdminApi("/api/dm/targets", {
        method: "PATCH",
        body: { id, status, ...(note ? { note } : {}) },
      });
      setBatch((prev) => prev.filter((b) => b.target.id !== id));
      onStats(payload.stats);
      toast.success(`「${statusOf(status).label}」に記録しました。`);
      // 送信した直後だけ間隔を空ける（対象外・失敗は待つ意味がない）
      if (status === "sent" && gap > 0) setCooldown(gap);
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Notice icon={<AlertTriangle size={14} strokeWidth={2} color={C.primaryDeep} style={{ flexShrink: 0, marginTop: 2 }} />}>
        <b style={{ color: C.text }}>送信は自動化していません。</b><br />
        Instagram は未接触の相手への初回DMを API で送れず（24時間ウィンドウ）、
        ブラウザ自動化は Platform Terms が禁じています。
        ここは文面を用意してDM画面を開くところまでを行い、送信ボタンは人が押します。
        <span style={{ color: C.textMuted }}>返信が来たあとのやり取りは自動化できます。</span>
      </Notice>

      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 9 }}>使う文面</Eyebrow>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          style={{ ...fieldStyle, width: "100%", fontSize: 12.5 }}
        >
          <option value="">既定のひな形</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.is_default ? "（既定）" : ""}</option>
          ))}
        </select>

        <button
          className="press"
          onClick={load}
          disabled={loading || remaining === 0}
          style={{
            ...popBtn, width: "100%", marginTop: 12, padding: "13px 0", fontSize: 13.5,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            ...(loading || remaining === 0 ? { opacity: 0.5, cursor: "not-allowed" } : null),
          }}
        >
          <Send size={15} strokeWidth={2.2} />
          {batch.length > 0 ? "次の10件を出す" : "送信する分を出す（10件）"}
        </button>

        <div style={{ fontSize: 10.5, color: C.textFaint, textAlign: "center", marginTop: 8, lineHeight: 1.8 }}>
          本日の残り {remaining} 件（上限 {stats?.daily_cap ?? "—"} 件／間隔 {gap} 秒）
        </div>
      </div>

      {cooldown > 0 && (
        <Notice icon={<Clock size={14} strokeWidth={2} color={C.primaryDeep} style={{ flexShrink: 0, marginTop: 2 }} />}>
          次の1件まで <b style={{ color: C.text }}>{cooldown} 秒</b>。
          続けて出しすぎないための間隔です（設定で変えられます）。
        </Notice>
      )}

      {loading && batch.length === 0 ? (
        <Spinner label="送信先を取り出しています…" />
      ) : batch.length === 0 ? (
        <EmptyState icon={capReached ? <Ban size={24} strokeWidth={1.6} /> : <Send size={24} strokeWidth={1.6} />}>
          {capReached
            ? "本日ぶんの上限に達しました。明日また出せます。"
            : "未送信の相手がいません。「リスト」から取り込んでください。"}
        </EmptyState>
      ) : (
        batch.map((entry, i) => (
          <SendCard
            key={entry.target.id}
            entry={entry}
            index={i}
            template={template}
            busy={busyId === entry.target.id}
            cooling={cooldown > 0}
            onMark={(status, note) => mark(entry.target.id, status, note)}
          />
        ))
      )}
    </>
  );
};

/* ───────────────────────────────── リストタブ */
const ListTab = ({ stats, onStats, onDenied }) => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const s = params.toString();
      const payload = await callAdminApi(`/api/dm/targets${s ? `?${s}` : ""}`);
      setItems(payload.items ?? []);
      onStats(payload.stats);
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, q, onStats, onDenied, toast]);

  useEffect(() => {
    const id = setTimeout(load, q ? 350 : 0);   // 検索は打ち終わりを待つ
    return () => clearTimeout(id);
  }, [load, q]);

  const runImport = async (text) => {
    if (!text.trim()) { toast.error("取り込む内容がありません。"); return; }
    setImporting(true);
    setResult(null);
    try {
      const payload = await callAdminApi("/api/dm/targets", { method: "POST", body: { csv: text } });
      setResult(payload);
      onStats(payload.stats);
      setCsv("");
      toast.success(`${payload.inserted}件を取り込みました。`);
      load();
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const pickFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    runImport(text);
  };

  const remove = async (id, username) => {
    if (!window.confirm(`@${username} をリストから削除します。よろしいですか？`)) return;
    try {
      const payload = await callAdminApi(`/api/dm/targets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
      onStats(payload.stats);
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    }
  };

  const changeStatus = async (id, next) => {
    try {
      const payload = await callAdminApi("/api/dm/targets", { method: "PATCH", body: { id, status: next } });
      setItems((prev) =>
        status && payload.item?.status !== status
          ? prev.filter((x) => x.id !== id)
          : prev.map((x) => (x.id === id ? payload.item : x))
      );
      onStats(payload.stats);
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    }
  };

  return (
    <>
      {/* 取り込み */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 9 }}>CSV で取り込む</Eyebrow>
        <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.85, marginBottom: 10 }}>
          見出し行に <code style={{ color: C.primaryDeep }}>username, display_name, category, follower_count, note</code>{" "}
          （日本語の見出しも可）。見出しが無ければ1列目をユーザー名として読みます。<br />
          <code style={{ color: C.primaryDeep }}>@name</code> や プロフィールURL のままでも取り込めます。
          既に入っている相手は<b style={{ color: C.textSec }}>上書きしません</b>（送信済みが戻らないように）。
        </div>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          placeholder={"username,display_name,category\naiseki_taro,相席太郎,飲み会\n@nomikai_hanako,のみ会はなこ,合コン"}
          style={{ ...fieldStyle, width: "100%", resize: "vertical", fontSize: 11.5, fontFamily: "ui-monospace, monospace", lineHeight: 1.8 }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button
            className="press"
            onClick={() => runImport(csv)}
            disabled={importing}
            style={{
              ...popBtn, flex: "1 1 150px", padding: "12px 0", fontSize: 13,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              ...(importing ? { opacity: 0.5, cursor: "not-allowed" } : null),
            }}
          >
            <Upload size={14} strokeWidth={2.2} />
            {importing ? "取り込み中…" : "取り込む"}
          </button>
          <button
            className="press"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{ ...ghostBtn, flex: "0 1 130px", padding: "12px 0", fontSize: 12.5 }}
          >
            ファイルを選ぶ
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
            style={{ display: "none" }}
          />
        </div>

        {result && (
          <div style={{
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}`,
            fontSize: 11, color: C.textSec, lineHeight: 1.9,
          }}>
            取り込み {result.inserted} 件 ／ 既にあった {result.duplicated} 件
            {result.skipped?.length > 0 && (
              <>
                <div style={{ color: C.accentDeep, marginTop: 6 }}>
                  読めなかった {result.skipped.length} 件:
                </div>
                <div style={{ maxHeight: 130, overflowY: "auto", marginTop: 4 }}>
                  {result.skipped.slice(0, 50).map((s, i) => (
                    <div key={`${s.line}-${i}`} style={{ fontSize: 10.5, color: C.textMuted }}>
                      {s.line}行目「{s.value || "（空）"}」— {s.reason}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 絞り込み */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={14} strokeWidth={2} color={C.textMuted}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ユーザー名・表示名・カテゴリで探す"
            style={{ ...fieldStyle, width: "100%", paddingLeft: 34, fontSize: 12.5 }}
          />
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Pill on={status === null} onClick={() => setStatus(null)} count={stats?.total}>すべて</Pill>
          {STATUSES.map((s) => (
            <Pill key={s.key} on={status === s.key} onClick={() => setStatus(s.key)} count={stats?.[s.key]}>
              {s.label}
            </Pill>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <Spinner label="読み込み中…" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Inbox size={24} strokeWidth={1.6} />}>
          {status || q ? "この条件に当てはまる相手はいません。" : "まだ誰も登録されていません。上のCSVから取り込んでください。"}
        </EmptyState>
      ) : (
        items.map((item) => (
          <div key={item.id} style={{ ...card, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <a
                href={`https://www.instagram.com/${item.username}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: C.text, textDecoration: "none" }}
              >@{item.username}</a>
              <StatusBadge status={item.status} />
              <button
                className="press"
                onClick={() => remove(item.id, item.username)}
                title="削除"
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: C.textFaint, padding: 2 }}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>

            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.75 }}>
              {[item.display_name, item.category, typeof item.follower_count === "number" ? `${fmtCount(item.follower_count)} フォロワー` : null]
                .filter(Boolean).join(" · ") || "—"}
            </div>
            {item.note && <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 3 }}>{item.note}</div>}
            {item.status === "sent" && (
              <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>送信 {fmtDate(item.sent_at)}</div>
            )}
            {item.last_error && (
              <div style={{ fontSize: 10, color: C.accentDeep, marginTop: 4 }}>{item.last_error}</div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
              {STATUSES.filter((s) => s.key !== item.status).map((s) => (
                <button
                  key={s.key}
                  className="press"
                  onClick={() => changeStatus(item.id, s.key)}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
                    borderRadius: 999, padding: "5px 11px", fontSize: 10.5, color: C.textSec,
                    cursor: "pointer", fontFamily: FONT_BODY,
                  }}
                >{s.label}へ</button>
              ))}
            </div>
          </div>
        ))
      )}

      {items.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.textFaint, textAlign: "center", marginTop: 14 }}>
          {items.length}件を表示（新しい順・最大500件）
        </div>
      )}
    </>
  );
};

/* ───────────────────────────────── 文面タブ */
const TemplateTab = ({ onDenied }) => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: "", body: "" });
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await callAdminApi("/api/dm/templates");
      setItems(payload.items ?? []);
      setEdits({});
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [onDenied, toast]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await callAdminApi("/api/dm/templates", { method: "POST", body: draft });
      setDraft({ name: "", body: "" });
      toast.success("ひな形を追加しました。");
      load();
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    }
  };

  const save = async (id) => {
    const patch = edits[id];
    if (!patch) return;
    try {
      await callAdminApi("/api/dm/templates", { method: "PATCH", body: { id, ...patch } });
      toast.success("保存しました。");
      load();
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    }
  };

  const setDefault = async (id) => {
    try {
      await callAdminApi("/api/dm/templates", { method: "PATCH", body: { id, is_default: true } });
      load();
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`ひな形「${name}」を削除します。よろしいですか？`)) return;
    try {
      await callAdminApi(`/api/dm/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      load();
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    }
  };

  const valueOf = (item, key) => edits[item.id]?.[key] ?? item[key];
  const dirty = (id) => !!edits[id];

  return (
    <>
      <Notice icon={<FileText size={14} strokeWidth={2} color={C.primaryDeep} style={{ flexShrink: 0, marginTop: 2 }} />}>
        差し込めるのは <code style={{ color: C.primaryDeep }}>{"{{display_name}}"}</code>{" "}
        <code style={{ color: C.primaryDeep }}>{"{{username}}"}</code>{" "}
        <code style={{ color: C.primaryDeep }}>{"{{category}}"}</code> の3つです。<br />
        <b style={{ color: C.text }}>名乗り・用件・断りたいときの導線</b>を必ず入れてください。
        AISEKI は異性紹介サービスではないので、「出会い」を訴求する文面にはしないこと。
      </Notice>

      {loading ? <Spinner label="読み込み中…" /> : items.map((item) => (
        <div key={item.id} style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <input
              value={valueOf(item, "name")}
              onChange={(e) => setEdits((p) => ({ ...p, [item.id]: { ...p[item.id], name: e.target.value } }))}
              style={{ ...fieldStyle, flex: 1, fontSize: 13, fontFamily: FONT_HEAD, fontWeight: 600 }}
            />
            {item.is_default ? (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                color: C.primaryDeep, background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`,
                display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
              }}><Star size={10} strokeWidth={2.4} />既定</span>
            ) : (
              <button
                className="press"
                onClick={() => setDefault(item.id)}
                style={{ ...ghostBtn, padding: "7px 12px", fontSize: 10.5, whiteSpace: "nowrap" }}
              >既定にする</button>
            )}
          </div>

          <textarea
            value={valueOf(item, "body")}
            onChange={(e) => setEdits((p) => ({ ...p, [item.id]: { ...p[item.id], body: e.target.value } }))}
            rows={10}
            style={{ ...fieldStyle, width: "100%", resize: "vertical", fontSize: 12, lineHeight: 1.9 }}
          />
          <div style={{
            fontSize: 10, color: valueOf(item, "body").length > 1000 ? C.accentDeep : C.textFaint,
            textAlign: "right", marginTop: 4,
          }}>
            {valueOf(item, "body").length} / 1000
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              className="press"
              onClick={() => save(item.id)}
              disabled={!dirty(item.id)}
              style={{
                ...popBtn, flex: 1, padding: "11px 0", fontSize: 12.5,
                ...(dirty(item.id) ? null : { opacity: 0.4, cursor: "not-allowed" }),
              }}
            >保存</button>
            <button
              className="press"
              onClick={() => remove(item.id, item.name)}
              style={{ ...ghostBtn, padding: "11px 16px", fontSize: 12.5, color: C.accentDeep }}
            >削除</button>
          </div>
        </div>
      ))}

      {/* 追加 */}
      <div style={{ ...card, padding: 16 }}>
        <Eyebrow style={{ marginBottom: 9 }}>ひな形を追加</Eyebrow>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="名前（例: 初回のご挨拶）"
          style={{ ...fieldStyle, width: "100%", fontSize: 12.5, marginBottom: 8 }}
        />
        <textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          rows={7}
          placeholder={"{{display_name}} 様\n\nはじめまして。相席マッチ（AISEKI）運営の者です。"}
          style={{ ...fieldStyle, width: "100%", resize: "vertical", fontSize: 12, lineHeight: 1.9 }}
        />
        <button
          className="press"
          onClick={create}
          disabled={!draft.name.trim() || !draft.body.trim()}
          style={{
            ...popBtn, width: "100%", marginTop: 10, padding: "12px 0", fontSize: 13,
            ...(draft.name.trim() && draft.body.trim() ? null : { opacity: 0.4, cursor: "not-allowed" }),
          }}
        >追加する</button>
      </div>
    </>
  );
};

/* ───────────────────────────────── 2段目 — 管理者パスワード
   照合はサーバ（/api/admin/gate）。ここは入力を預かるだけで、
   合言葉をどこにも保存しない（通ったときサーバが返す証明だけを預かる）。 */
const UnlockGate = ({ user, busy, error, onSubmit, onExit }) => {
  const [password, setPassword] = useState("");

  return (
    <div style={{ ...card, padding: 26, maxWidth: 420, margin: "0 auto" }}>
      <div style={{
        width: 56, height: 56, margin: "0 auto 16px", borderRadius: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
      }}>
        <Lock size={22} strokeWidth={1.8} />
      </div>
      <div style={{
        fontFamily: FONT_HEAD, fontSize: 16, color: C.text, letterSpacing: 0.6,
        marginBottom: 8, textAlign: "center",
      }}>
        管理者パスワード
      </div>
      <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.9, textAlign: "center", marginBottom: 18 }}>
        営業リストを開くには、ログインに加えて<br />管理者パスワードの入力が必要です。
        <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 6, wordBreak: "break-all" }}>{user?.email}</div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (password.trim()) onSubmit(password); }}
      >
        <label style={labelStyle} htmlFor="admin-password">パスワード</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...fieldStyle, marginBottom: 12 }}
        />
        {error && (
          <div style={{
            fontSize: 11.5, color: C.text, lineHeight: 1.8, marginBottom: 12,
            padding: "10px 12px", borderRadius: 10,
            background: "rgba(200,56,79,0.10)", border: "1px solid rgba(200,56,79,0.30)",
          }}>{error}</div>
        )}
        <button
          type="submit"
          className="press"
          disabled={busy || !password.trim()}
          style={{ ...popBtn, width: "100%", padding: "13px 0", fontSize: 13.5, opacity: busy || !password.trim() ? 0.55 : 1 }}
        >
          {busy ? "確認しています…" : "開く"}
        </button>
      </form>

      <button
        className="press"
        onClick={onExit}
        style={{
          background: "none", border: "none", cursor: "pointer", display: "block",
          margin: "14px auto 0", fontSize: 12, color: C.textMuted, letterSpacing: 0.4,
        }}
      >
        管理画面に戻る
      </button>
    </div>
  );
};

/* ───────────────────────────────── 画面本体 */
export default function AdminDMScreen({ user, onExit }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("send");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  /* 入口の状態。checking → locked（合言葉待ち）→ ready。
     運営でないアカウントはここに来た時点でトップへ帰すので denied を持たない。 */
  const [gate, setGate] = useState("checking");
  const [gateError, setGateError] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const checkGate = useCallback(async () => {
    setGate("checking");
    try {
      const payload = await fetchAdminGate();
      if (!payload.configured) {
        setGateError("サーバーに管理者パスワード（ADMIN_PASSWORD）が設定されていません。");
        setGate("error");
        return;
      }
      setGate(payload.unlocked ? "ready" : "locked");
    } catch (e) {
      // 運営のアカウントでなければ、画面を見せずにトップへ返す
      if (isForbidden(e)) { clearAdminUnlock(); window.location.replace("/"); return; }
      setGateError(e.message);
      setGate("error");
    }
  }, []);

  useEffect(() => { checkGate(); }, [checkGate]);

  /* 子画面が 401/403/423 を受けたときは、入口の判定からやり直す
     （合言葉切れなら入力へ、権限が無くなっていればトップへ）。 */
  const onDenied = useCallback(() => { checkGate(); }, [checkGate]);
  const onStats = useCallback((s) => { if (s) setStats(s); }, []);

  const submitUnlock = async (password) => {
    setUnlocking(true);
    setUnlockError("");
    try {
      await unlockAdmin(password);
      setGate("ready");
    } catch (e) {
      // 401/403 は「運営のアカウントではない」（合言葉の不一致は 422）
      if (isForbidden(e)) { clearAdminUnlock(); window.location.replace("/"); return; }
      setUnlockError(e.message);
    } finally {
      setUnlocking(false);
    }
  };

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await callAdminApi("/api/dm/status");
      setStats(payload.stats ?? null);
    } catch (e) {
      if (isDenied(e)) { onDenied(); return; }
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [toast, onDenied]);

  useEffect(() => { if (gate === "ready") loadStats(); }, [gate, loadStats]);

  const header = useMemo(() => (
    <>
      <button className="press" onClick={onExit} style={{
        display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
        fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4,
      }}>
        <ChevronLeft size={18} strokeWidth={2} /> 管理画面に戻る
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow style={{ marginBottom: 4, textTransform: "uppercase" }}>Admin</Eyebrow>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
            インフルエンサー営業
          </div>
          <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 4, wordBreak: "break-all" }}>{user?.email}</div>
        </div>
        <button
          className="press"
          onClick={loadStats}
          disabled={loading}
          style={{ ...ghostBtn, marginLeft: "auto", flexShrink: 0, padding: "9px 16px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} strokeWidth={2.2} style={loading ? { animation: "spin 0.85s linear infinite" } : undefined} />
          更新
        </button>
      </div>
    </>
  ), [onExit, loadStats, loading, user?.email]);

  /* 判定が済むまで中身を出さない（運営でなければトップへ帰る途中） */
  if (gate === "checking") {
    return (
      <div style={{ padding: "0 20px 24px" }}>
        <Spinner label="確認しています…" />
      </div>
    );
  }

  if (gate === "error") {
    return (
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ ...card, padding: 26, textAlign: "center", maxWidth: 420, margin: "48px auto 0" }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 16px", borderRadius: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(200,56,79,0.14)", border: "1px solid rgba(200,56,79,0.34)", color: C.accentDeep,
          }}>
            <Lock size={22} strokeWidth={1.8} />
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.9 }}>{gateError}</div>
          <button className="press" onClick={checkGate} style={{ ...popBtn, marginTop: 20, padding: "12px 28px", fontSize: 13.5 }}>
            もう一度試す
          </button>
          <button
            className="press"
            onClick={onExit}
            style={{
              background: "none", border: "none", cursor: "pointer", display: "block",
              margin: "14px auto 0", fontSize: 12, color: C.textMuted, letterSpacing: 0.4,
            }}
          >
            管理画面に戻る
          </button>
        </div>
      </div>
    );
  }

  if (gate === "locked") {
    return (
      <div style={{ padding: "48px 20px 24px" }}>
        <UnlockGate
          user={user}
          busy={unlocking}
          error={unlockError}
          onSubmit={submitUnlock}
          onExit={onExit}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 20px 24px" }}>
      {header}

      {/* 集計 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat label="未送信" value={fmtCount(stats?.pending)} tone={C.primaryDeep} />
        <Stat label="送信済" value={fmtCount(stats?.sent)} tone="#8fd6b4" />
        <Stat label="失敗" value={fmtCount(stats?.failed)} tone={C.accentDeep} />
        <Stat label="対象外" value={fmtCount(stats?.skipped)} />
        <Stat label="本日" value={`${fmtCount(stats?.sent_today)} / ${stats?.daily_cap ?? "—"}`} />
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Pill key={t.key} on={tab === t.key} onClick={() => setTab(t.key)}>
            <t.icon size={12} strokeWidth={2.2} />{t.label}
          </Pill>
        ))}
      </div>

      {tab === "send" && <SendTab stats={stats} onStats={onStats} onDenied={onDenied} />}
      {tab === "list" && <ListTab stats={stats} onStats={onStats} onDenied={onDenied} />}
      {tab === "templates" && <TemplateTab onDenied={onDenied} />}
    </div>
  );
}
