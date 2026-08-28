import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, UsersRound, UserPlus, Copy, Share2, Check, Trash2, Crown, Clock,
} from "lucide-react";
import * as api from "../lib/api.js";
import {
  C, FONT_DISPLAY, FONT_HEAD, brandText, card, popBtn, ghostBtn,
  fieldStyle, labelStyle, Eyebrow, Spinner, EmptyState,
} from "../lib/theme.jsx";
import { useToast } from "../lib/toast.jsx";

/* ══════════════════════════════════════════════════════════════
   グループ（卓を立てる前に、友達を集めておく箱）

   新フロー（2026-08-28）のホスト側の入口。
     1. グループを作る
     2. 招待リンクを友達に送る
     3. 友達は「簡易登録」（名前＋年齢確認＋写真）で参加する
     4. あなたを含めて MIN_HOST_GROUP_SIZE 名以上そろうと卓を立てられる

   ⚠ ホスト側が2名以上であることは、1対1の会を作らせないための担保
     そのもの（§1）。ここの人数制限を緩めないこと。DB 側
     （enforce_group_party）でも同じ判定をしている。

   ⚠ 招待コードはテーブルから直接読めない（列単位で遮断してある）。
     取得経路は list_my_groups() だけ。
   ══════════════════════════════════════════════════════════════ */

const shareTargets = (text) => {
  const encoded = encodeURIComponent(text);
  return [
    { key: "line", label: "LINE", href: `https://line.me/R/msg/text/?${encoded}` },
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${encoded}` },
    { key: "mail", label: "メール", href: `mailto:?subject=${encodeURIComponent("AISEKIのグループに招待します")}&body=${encoded}` },
  ];
};

export default function GroupScreen({ onBack }) {
  const { toast, confirm } = useToast();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [memberName, setMemberName] = useState({});   // groupId → 入力中の名前
  const [adding, setAdding] = useState(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setGroups(await api.listMyGroups());
    } catch (e) {
      console.error(e);
      setGroups([]);
      setError(e.message || "グループを読み込めませんでした。");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      await api.createGroup(newName || "マイグループ");
      setNewName("");
      await load();
      toast.success("グループを作りました。友達を招待しましょう。");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const addMember = async (groupId) => {
    const name = (memberName[groupId] || "").trim();
    if (!name) { toast.error("友達のニックネームを入力してください。"); return; }
    setAdding(groupId);
    try {
      await api.addGroupMember(groupId, name);
      setMemberName((m) => ({ ...m, [groupId]: "" }));
      await load();
      toast.success("招待リンクを作りました。友達に送ってください。");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAdding(null);
    }
  };

  const removeMember = async (member) => {
    const ok = await confirm({
      title: `${member.display_name}さんを外しますか？`,
      message: "この方の招待リンクは使えなくなります。",
      confirmLabel: "外す",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeGroupMember(member.id);
      await load();
      toast.success("グループから外しました。");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
      toast.success("コピーしました。");
    } catch {
      toast.error("コピーできませんでした。長押しで選択してください。");
    }
  };

  const share = async (member, ownerName) => {
    const text = api.groupInviteShareText(member.invite_code, ownerName);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* 取り消しは無視 */ }
    }
    copy(text, `share-${member.id}`);
  };

  return (
    <div style={{ padding: "0 20px 28px" }}>
      <button className="press" onClick={onBack} style={{
        ...ghostBtn, border: "none", background: "none", padding: "16px 0 10px",
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.textSec, cursor: "pointer",
      }}>
        <ChevronLeft size={17} strokeWidth={2} /> 戻る
      </button>

      <div style={{ marginBottom: 18 }}>
        <Eyebrow style={{ marginBottom: 6 }}>Your group</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 600, letterSpacing: 0.8, color: C.text }}>
          一緒に行く友達
        </div>
      </div>

      <div className="fade" style={{
        display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 16,
        borderRadius: 16, padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(232,201,135,0.13), rgba(168,32,58,0.16))",
        border: `1px solid ${C.linePrimary}`,
      }}>
        <span style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
        }}><UsersRound size={15} strokeWidth={1.9} /></span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
            あなたを含めて{api.MIN_HOST_GROUP_SIZE}名以上そろうと、会を立てられます
          </div>
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
            会を立てる側（ホスト）は<b style={{ color: C.primaryDeep, fontWeight: 700 }}>完全無料</b>です。
            カードの登録も要りません。招待された友達は、お名前・年齢確認・お写真だけの
            かんたんな登録で参加できます（{api.MIN_AGE}歳以上の方に限ります）。
          </div>
        </div>
      </div>

      {groups === null ? (
        <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
          <Spinner label="読み込み中…" />
        </div>
      ) : (
        <>
          {error && (
            <div style={{ fontSize: 11.5, color: C.accentDeep, lineHeight: 1.7, marginBottom: 14 }}>{error}</div>
          )}

          {groups.length === 0 && !error && (
            <EmptyState icon={<UsersRound size={24} strokeWidth={1.6} />}>
              まだグループがありません。<br />グループを作って、友達を招待しましょう。
            </EmptyState>
          )}

          {groups.map((g) => {
            const owner = g.members.find((m) => m.is_owner);
            const ready = api.groupIsReady(g);
            return (
              <div key={g.id} className="fade" style={{ ...card, padding: 18, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 13 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: 0.3 }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>
                      {g.members.length}名 / 最大{api.MAX_GROUP_MEMBERS}名
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0, padding: "5px 12px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                    ...(ready
                      ? { background: "rgba(232,201,135,0.14)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep }
                      : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`, color: C.textMuted }),
                  }}>
                    {ready ? "会を立てられます" : `あと${api.MIN_HOST_GROUP_SIZE - g.members.length}名`}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                  {g.members.map((m) => (
                    <div key={m.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 13px", borderRadius: 14,
                      background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`,
                    }}>
                      <span style={{ flexShrink: 0, display: "flex", color: m.is_owner ? C.primary : m.joined ? C.primaryDeep : C.textMuted }}>
                        {m.is_owner ? <Crown size={14} strokeWidth={2} />
                          : m.joined ? <Check size={14} strokeWidth={2.6} />
                          : <Clock size={13} strokeWidth={2} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.display_name}
                        </span>
                        <span style={{ display: "block", fontSize: 10.5, color: C.textMuted, marginTop: 2 }}>
                          {m.is_owner ? "あなた（代表）" : m.joined ? "登録済み" : "招待中（未登録）"}
                        </span>
                      </span>
                      {!m.is_owner && !m.joined && (
                        <button className="press" onClick={() => removeMember(m)} aria-label="外す" style={{
                          ...ghostBtn, padding: "6px 9px", borderRadius: 999, flexShrink: 0,
                          color: C.textMuted, display: "inline-flex", alignItems: "center",
                        }}><Trash2 size={13} strokeWidth={2} /></button>
                      )}
                    </div>
                  ))}
                </div>

                {/* 招待リンク（まだ引き受けられていない枠だけ） */}
                {g.members.filter((m) => m.invite_code).map((m) => (
                  <div key={`inv-${m.id}`} style={{
                    borderRadius: 14, padding: "12px 13px", marginBottom: 9,
                    background: "rgba(232,201,135,0.07)", border: `1px solid ${C.linePrimary}`,
                  }}>
                    <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8, lineHeight: 1.6 }}>
                      <b style={{ color: C.text, fontWeight: 700 }}>{m.display_name}</b>さんへの招待リンク
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: 2.5, ...brandText }}>
                        {m.invite_code}
                      </span>
                      <button className="press" onClick={() => copy(api.groupInviteUrl(m.invite_code), `url-${m.id}`)} style={{
                        ...ghostBtn, padding: "7px 12px", borderRadius: 999, fontSize: 11, flexShrink: 0,
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                        {copied === `url-${m.id}` ? <><Check size={12} strokeWidth={2.6} /> コピー済</> : <><Copy size={12} strokeWidth={2} /> リンク</>}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button className="lux-cta" onClick={() => share(m, owner?.display_name)} style={{
                        ...popBtn, flex: 1, padding: "10px 0", borderRadius: 999, fontSize: 12,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}>
                        <Share2 size={13} strokeWidth={2.2} /> 送る
                      </button>
                      {shareTargets(api.groupInviteShareText(m.invite_code, owner?.display_name)).map((t) => (
                        <a key={t.key} href={t.href} target="_blank" rel="noreferrer" className="press" style={{
                          ...ghostBtn, padding: "10px 13px", borderRadius: 999, fontSize: 11.5,
                          textDecoration: "none", display: "inline-flex", alignItems: "center",
                        }}>{t.label}</a>
                      ))}
                    </div>
                  </div>
                ))}

                {/* 友達を足す */}
                {g.members.length < api.MAX_GROUP_MEMBERS && (
                  <div style={{ display: "flex", gap: 9, marginTop: 4 }}>
                    <input
                      value={memberName[g.id] ?? ""}
                      onChange={(e) => setMemberName((m) => ({ ...m, [g.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addMember(g.id); } }}
                      maxLength={api.LIMITS.username}
                      placeholder="友達のニックネーム"
                      aria-label="友達のニックネーム"
                      style={fieldStyle}
                    />
                    <button className="press" onClick={() => addMember(g.id)} disabled={adding === g.id} style={{
                      ...popBtn, padding: "0 16px", borderRadius: 999, fontSize: 12.5, flexShrink: 0,
                      display: "inline-flex", alignItems: "center", gap: 6,
                      opacity: adding === g.id ? 0.6 : 1,
                    }}>
                      <UserPlus size={14} strokeWidth={2.2} /> 招待
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* 新しいグループを作る */}
          <div className="fade" style={{ ...card, padding: 18 }}>
            <label style={labelStyle}>新しいグループを作る</label>
            <div style={{ display: "flex", gap: 9 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); create(); } }}
                maxLength={30}
                placeholder="例: 会社の同期"
                aria-label="グループの名前"
                style={fieldStyle}
              />
              <button className="press" onClick={create} disabled={creating} style={{
                ...popBtn, padding: "0 18px", borderRadius: 999, fontSize: 12.5, flexShrink: 0,
                opacity: creating ? 0.6 : 1,
              }}>{creating ? "作成中…" : "作る"}</button>
            </div>
            <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 9, lineHeight: 1.7 }}>
              相手や日程ごとにグループを分けておくと、会を立てるときに選ぶだけで済みます。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
