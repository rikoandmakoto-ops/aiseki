import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ShieldCheck, ShieldAlert, Ban, Lock, UsersRound, Clock,
  BadgeCheck, MessageCircle, FileText, DoorClosed, Trash2, LifeBuoy,
} from "lucide-react";
import * as api from "../lib/api.js";
import {
  C, FONT_HEAD, card, ghostBtn, popBtn, Eyebrow, Spinner, EmptyState,
} from "../lib/theme.jsx";
import { useToast } from "../lib/toast.jsx";

/* ══════════════════════════════════════════════════════════════
   安心してご利用いただくために（安全センター）

   すでに実装している安全側の作りを一箇所にまとめて説明し、
   困ったときの行き先（通報・ブロック）をその場に置く。
   「何が守られているか」が分からないと、そもそも一歩目を踏み出せない。
   ══════════════════════════════════════════════════════════════ */

/* いま効いている仕組み。ここに書くことは、すべて実装済みのものだけ。 */
const PROTECTIONS = [
  {
    icon: UsersRound,
    title: `${api.MIN_GROUP_SIZE}名以上のグループ同士のみ`,
    body: "1対1のマッチングは行いません。ホスト側・参加側ともに2名以上のグループでのみ会が成立します（データベース側の制約でも担保しています）。",
  },
  {
    icon: Lock,
    title: "プロフィールは参加が承認されるまで非公開",
    body: "写真・ニックネーム・年齢は募集の一覧に一切表示されません。同じ会に参加が承認されたメンバーにだけ公開されます。",
  },
  {
    icon: MessageCircle,
    title: "個人間のダイレクトメッセージはありません",
    body: "やり取りは会ごとのグループチャットのみです。1対1で連絡先を求められる導線をつくっていません。",
  },
  {
    icon: DoorClosed,
    title: "相席はオープンスペースのみ",
    body: "個室・半個室での相席は提供しません。フロア席・カウンターなど、店内を見渡せる席に限られます。",
  },
  {
    icon: ShieldCheck,
    title: `${api.MIN_AGE}歳以上限定・生年月日で確認`,
    body: "飲酒を伴うため20歳以上限定です。登録時に生年月日で年齢を確認し、20歳未満は登録自体ができません。",
  },
  {
    icon: Ban,
    title: "ブロックと通報",
    body: "気になる相手はブロックできます。ブロックすると、その方が主催する会は一覧に表示されなくなり、参加の申し込みもできなくなります。",
  },
];

/* 通報したあと、運営が何をするか。分からないと通報しづらい。 */
const REPORT_FLOW = [
  { step: "1", title: "受付", body: "アプリの「通報・違反の報告」から送信すると、その時点で記録されます。24時間以内に確認します。" },
  { step: "2", title: "確認", body: "対象の会・グループチャットの記録を確認します。通報された方に、誰が通報したかは伝えません。" },
  { step: "3", title: "対応", body: "違反が確認できた場合は、警告・会の取り消し・アカウントの利用停止のいずれかを行います。" },
  { step: "4", title: "ご連絡", body: "返信先メールアドレスをご記入いただいた場合、対応の結果をお送りします。" },
];

const Row = ({ icon: Icon, title, body, tone = "gold" }) => (
  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "15px 0", borderTop: `1px solid ${C.lineSoft}` }}>
    <span style={{
      flexShrink: 0, width: 32, height: 32, borderRadius: 16,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: tone === "gold" ? "rgba(232,201,135,0.11)" : "rgba(168,32,58,0.18)",
      border: `1px solid ${tone === "gold" ? C.linePrimary : "rgba(200,56,79,0.38)"}`,
      color: tone === "gold" ? C.primaryDeep : C.accentDeep,
    }}><Icon size={15} strokeWidth={1.9} /></span>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85, marginTop: 4 }}>{body}</div>
    </div>
  </div>
);

export default function SafetyScreen({ onBack, onReport, onTerms }) {
  const { toast, confirm } = useToast();
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBlocks(await api.listBlocks());
    } catch (e) {
      console.error(e);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unblock = async (row) => {
    const ok = await confirm({
      title: "ブロックを解除しますか？",
      message: `${row.username || "この方"}が主催する会が、また一覧に表示されるようになります。`,
      confirmLabel: "解除する",
    });
    if (!ok) return;
    setBusy(row.blocked_id);
    try {
      await api.unblockUser(row.blocked_id);
      toast.success("ブロックを解除しました。");
      await load();
    } catch (e) {
      toast.error("解除できませんでした: " + e.message);
    } finally {
      setBusy(null);
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
        <Eyebrow style={{ marginBottom: 6, textTransform: "uppercase" }}>Safety</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
          安心してご利用いただくために
        </div>
      </div>

      {/* ── いま効いている仕組み ── */}
      <div className="fade" style={{ ...card, padding: "6px 20px 18px", marginBottom: 14 }}>
        {PROTECTIONS.map((p) => <Row key={p.title} {...p} />)}
      </div>

      {/* ── 本人確認（これから） ── */}
      <div className="fade" style={{
        ...card, padding: 20, marginBottom: 14,
        border: `1px solid ${C.linePrimary}`,
        background: "linear-gradient(135deg, rgba(232,201,135,0.11), rgba(168,32,58,0.10))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <BadgeCheck size={17} strokeWidth={2} color={C.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>本人確認バッジ</span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, padding: "3px 9px", borderRadius: 999,
            color: C.primaryDeep, background: "rgba(232,201,135,0.13)", border: `1px solid ${C.linePrimary}`,
          }}>準備中</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.9 }}>
          公的書類による本人確認を準備しています。確認が済んだ方にはバッジが付き、
          会の画面で「本人確認済み」と表示されます。
          <br />
          <span style={{ color: C.textMuted }}>
            提出いただく書類は年齢と本人性の確認にのみ使用し、確認後は速やかに削除します。
            他の利用者に書類そのものが公開されることはありません。
          </span>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 12, fontSize: 10.5, color: C.textMuted }}>
          <Clock size={12} strokeWidth={1.9} />
          開始時期はアプリ内のお知らせでご案内します
        </div>
      </div>

      {/* ── 通報の流れ ── */}
      <div className="fade" style={{ ...card, padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ShieldAlert size={16} strokeWidth={2} color={C.accentDeep} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>通報したあとの流れ</span>
        </div>

        {REPORT_FLOW.map((f, i, arr) => (
          <div key={f.step} style={{ display: "flex", gap: 12, alignItems: "flex-start", position: "relative", paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
            {/* 縦線でつなぐ（順番があることを示す） */}
            {i < arr.length - 1 && (
              <span style={{
                position: "absolute", left: 13, top: 28, bottom: 4, width: 1,
                background: `linear-gradient(180deg, ${C.linePrimary}, transparent)`,
              }} />
            )}
            <span style={{
              flexShrink: 0, width: 27, height: 27, borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11.5, fontWeight: 700, color: "#241a06", background: C.primaryGrad,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
            }}>{f.step}</span>
            <div style={{ minWidth: 0, paddingTop: 3 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{f.title}</div>
              <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85, marginTop: 3 }}>{f.body}</div>
            </div>
          </div>
        ))}

        <button className="lux-cta" onClick={onReport} style={{
          ...popBtn, width: "100%", padding: "13px 0", borderRadius: 999, fontSize: 13.5, marginTop: 18,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <ShieldAlert size={15} strokeWidth={2.1} /> 通報・違反を報告する
        </button>
      </div>

      {/* ── ブロック中の一覧 ── */}
      <div className="fade" style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ban size={16} strokeWidth={2} color={C.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.4 }}>ブロック中の方</span>
        </div>
        <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.8, marginBottom: 12 }}>
          ブロックは会の詳細画面から行えます。すでに同じ会に参加しているグループチャットは、
          当日の待ち合わせに支障が出ないようそのまま残ります。困っている場合は通報をご利用ください。
        </div>

        {loading ? <Spinner label="読み込み中…" /> : blocks.length === 0 ? (
          <EmptyState icon={<Ban size={21} strokeWidth={1.6} />}>
            ブロックしている方はいません。
          </EmptyState>
        ) : blocks.map((b, i, arr) => (
          <div key={b.blocked_id} className="lux-row" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            padding: "13px 6px", margin: "0 -6px", borderRadius: 10,
            borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.username || "退会された方"}
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                {new Date(b.created_at).toLocaleDateString("ja-JP")} にブロック
              </div>
            </div>
            <button className="press" onClick={() => unblock(b)} disabled={busy === b.blocked_id} style={{
              ...ghostBtn, padding: "8px 15px", fontSize: 11.5, flexShrink: 0,
              opacity: busy === b.blocked_id ? 0.5 : 1,
            }}>{busy === b.blocked_id ? "…" : "解除"}</button>
          </div>
        ))}
      </div>

      {/* ── 規約への導線 ── */}
      <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        <button className="press" onClick={onTerms} style={{
          ...ghostBtn, flex: 1, padding: "12px 0", fontSize: 12,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}>
          <FileText size={13} strokeWidth={2} /> 利用規約
        </button>
        <button className="press" onClick={onReport} style={{
          ...ghostBtn, flex: 1, padding: "12px 0", fontSize: 12,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}>
          <LifeBuoy size={13} strokeWidth={2} /> お問い合わせ
        </button>
      </div>

      <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 16, fontSize: 10, color: C.textFaint, lineHeight: 1.85 }}>
        <Trash2 size={11} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 2 }} />
        退会するとプロフィール・チャットの発言は削除されます（マイページの最下部から手続きできます）。
      </div>
    </div>
  );
}
