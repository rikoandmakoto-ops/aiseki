/* ══════════════════════════════════════════════════════════════
   AISEKI — お問い合わせ / ご意見 / 通報

   ・inquiries テーブル（migration_launch.sql）に保存する。
   ・マイグレーション未適用の環境では、メールでの問い合わせに
     切り替えられるようにしておく（ローンチ前に窓口が無い状態を作らない）。
   ・通報はプライバシーポリシー・規約で約束している窓口でもある。
   ══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Send, Mail, ShieldAlert, MessageSquare, Check } from "lucide-react";
import {
  C, FONT_HEAD, card, popBtn, ghostBtn, fieldStyle, labelStyle, Eyebrow, EmptyState,
} from "../lib/theme.jsx";
import * as api from "../lib/api";
import { CONTACT_EMAIL } from "../lib/legal.js";
import { useToast } from "../lib/toast.jsx";

const KIND_ICON = {
  question: MessageSquare,
  feedback: MessageSquare,
  report: ShieldAlert,
};

const KIND_HINT = {
  question: "ご利用方法・アカウント・ポイントについてのご質問をお送りください。",
  feedback: "使いにくかった点、あったら嬉しい機能など、率直にお聞かせください。",
  report:
    "会の場やチャットでの迷惑行為、規約違反を見かけたときにご連絡ください。" +
    "対象の会の名前と、いつ・何があったかを具体的にご記入いただけると調査が早く進みます。",
};

export default function SupportScreen({ user, onBack, initialKind = "question" }) {
  const { toast } = useToast();
  const [kind, setKind] = useState(initialKind);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [unavailable, setUnavailable] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.listMyInquiries(user.id));
    } catch {
      // テーブル未作成でも画面は使えるようにする（メール窓口へ誘導）
      setUnavailable(true);
    }
  }, [user.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) { toast.error("内容を入力してください。"); return; }
    setSending(true);
    try {
      await api.sendInquiry(user.id, {
        kind,
        subject,
        body,
        replyEmail,
      });
      setSubject("");
      setBody("");
      setReplyEmail("");
      toast.success("送信しました。3営業日以内にご登録のメールアドレスへご連絡します。");
      loadHistory();
    } catch (err) {
      toast.error(err.message);
      if (/migration_launch/.test(err.message)) setUnavailable(true);
    } finally {
      setSending(false);
    }
  };

  const mailtoHref = () => {
    const label = api.INQUIRY_KINDS.find((k) => k.key === kind)?.label ?? "お問い合わせ";
    const s = encodeURIComponent(subject.trim() || `[AISEKI] ${label}`);
    const b = encodeURIComponent(`${body}\n\n---\nユーザーID: ${user.id}\nメール: ${user.email}`);
    return `mailto:${CONTACT_EMAIL}?subject=${s}&body=${b}`;
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
        <Eyebrow style={{ marginBottom: 4, textTransform: "uppercase" }}>Support</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
          お問い合わせ
        </div>
      </div>

      <form className="fade" onSubmit={submit} style={{ ...card, padding: 22 }}>
        {/* 種別 */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>種別</label>
          <div style={{ display: "grid", gap: 8 }}>
            {api.INQUIRY_KINDS.map((k) => {
              const on = kind === k.key;
              const Icon = KIND_ICON[k.key];
              return (
                <button
                  key={k.key}
                  type="button"
                  className="press"
                  onClick={() => setKind(k.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    padding: "12px 15px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                    ...(on ? { ...popBtn, borderRadius: 14 } : { ...ghostBtn, borderRadius: 14 }),
                  }}
                >
                  <Icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {k.label}
                  {on && <Check size={15} strokeWidth={2.6} style={{ marginLeft: "auto", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.7, marginTop: 9 }}>
            {KIND_HINT[kind]}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>件名（任意）</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={api.LIMITS.inquirySubject}
            placeholder="例: ポイントが反映されません"
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>内容</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            maxLength={api.LIMITS.inquiry}
            required
            placeholder={kind === "report"
              ? "いつ・どの会で・どなたの・どのような行為だったかをご記入ください。"
              : "できるだけ具体的にご記入ください。"}
            style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.8 }}
          />
          <div style={{ textAlign: "right", fontSize: 10, color: C.textFaint, marginTop: 5 }}>
            {body.length} / {api.LIMITS.inquiry.toLocaleString()}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>返信先メールアドレス（任意）</label>
          <input
            type="email"
            value={replyEmail}
            onChange={(e) => setReplyEmail(e.target.value)}
            placeholder={user.email}
            style={fieldStyle}
          />
          <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.7, marginTop: 8 }}>
            空欄の場合、ご登録のメールアドレス（{user.email}）へご返信します。
          </div>
        </div>

        {unavailable ? (
          <a
            href={mailtoHref()}
            className="lux-cta"
            style={{
              ...popBtn, width: "100%", padding: "15px 0", fontSize: 15, textDecoration: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Mail size={16} strokeWidth={2.2} /> メールでお問い合わせ
          </a>
        ) : (
          <button type="submit" className="lux-cta" disabled={sending} style={{
            ...popBtn, width: "100%", padding: "15px 0", fontSize: 15,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: sending ? 0.6 : 1,
          }}>
            {sending ? "送信中…" : <><Send size={16} strokeWidth={2.2} /> 送信する</>}
          </button>
        )}

        <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.75, marginTop: 14, textAlign: "center" }}>
          メールでのご連絡も承ります： <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: C.primaryDeep }}>{CONTACT_EMAIL}</a>
        </div>
      </form>

      {/* 送信履歴 */}
      {history.length > 0 && (
        <div className="fade" style={{ ...card, padding: 22, marginTop: 14 }}>
          <Eyebrow style={{ marginBottom: 12 }}>送信したお問い合わせ</Eyebrow>
          {history.map((h, i, arr) => {
            const label = api.INQUIRY_KINDS.find((k) => k.key === h.kind)?.label ?? h.kind;
            const d = new Date(h.created_at);
            const closed = h.status === "closed";
            return (
              <div key={h.id} style={{
                padding: "13px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "3px 10px", borderRadius: 999,
                    color: C.primaryDeep, background: "rgba(232,201,135,0.10)", border: `1px solid ${C.line}`,
                  }}>{label}</span>
                  <span style={{ fontSize: 10.5, color: closed ? C.textMuted : C.primaryDeep }}>
                    {closed ? "対応済み" : "確認中"}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: C.textFaint }}>
                    {d.getMonth() + 1}月{d.getDate()}日
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, lineHeight: 1.6 }}>
                  {h.subject || "（件名なし）"}
                </div>
                <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
                  {h.body.length > 90 ? `${h.body.slice(0, 90)}…` : h.body}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {history.length === 0 && !unavailable && (
        <div style={{ marginTop: 8 }}>
          <EmptyState>過去のお問い合わせはまだありません。</EmptyState>
        </div>
      )}
    </div>
  );
}
