import { useState, useEffect, useCallback, useRef } from "react";
import {
  Home, MessageCircle, Plus, Gem, User, MapPin, Clock, Users, Bell,
  Crown, ChevronLeft, Send, ArrowRight, Check, Sparkles, Settings,
  Mail, LogOut, Wine, Repeat, History, Wallet, ShieldCheck, Lock, FileText, UsersRound,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as api from "./lib/api";
import {
  C, FONT_LOGO, FONT_DISPLAY, FONT_SERIF_JP, FONT_BODY,
  goldText, glass, goldBtn, ghostBtn, fieldStyle, labelStyle, Eyebrow,
  partyEmoji, TreatBadge, Tag, AvatarBubble, SectionTitle, Spinner, EmptyState,
} from "./lib/theme.jsx";
import AuthScreen from "./screens/AuthScreen.jsx";
import TermsScreen from "./screens/TermsScreen.jsx";

/* Real Tokyo nightlife districts */
const AREAS = ["渋谷", "恵比寿", "中目黒", "六本木", "西麻布", "銀座", "新宿"];

/* ══════════════════════════════════════════════════════════════
   グループ飲み会マッチングの前提
   ・1つの会は「ホスト側2名以上」×「参加側2名以上」でのみ成立（1対1は不可）
   ・参加者の個人プロフィールは、参加が承認されたメンバーにのみ表示
   ・性別による制限なし（同性グループ同士でも参加可）
   ══════════════════════════════════════════════════════════════ */
const MIN_GROUP = api.MIN_GROUP_SIZE;
const GROUP_OPTIONS = [2, 3, 4, 5, 6];

/* 会のグループ構成（ホスト側 / 募集側）。旧データにも安全にフォールバック */
const groupSizes = (p) => {
  const host = Math.max(MIN_GROUP, p?.host_group_size ?? MIN_GROUP);
  const guest = Math.max(MIN_GROUP, p?.guest_group_size ?? Math.max(MIN_GROUP, (p?.max_members ?? 4) - host));
  return { host, guest };
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 17) return "こんにちは";
  return "こんばんは";
};

/* ═══════════════════════════════════════════════════════ TabBar */
const NAV = [
  { key: "home", icon: Home, label: "ホーム" },
  { key: "chat", icon: MessageCircle, label: "チャット" },
  { key: "create", icon: Plus, label: "会を作る", center: true },
  { key: "points", icon: Gem, label: "ポイント" },
  { key: "mypage", icon: User, label: "マイページ" },
];

const TabBar = ({ active, onTab }) => (
  <div style={{
    display: "flex", alignItems: "flex-end", padding: "9px 10px 12px",
    background: "linear-gradient(180deg, rgba(11,8,9,0.35), rgba(6,4,5,0.94))",
    borderTop: `1px solid ${C.line}`,
    backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
  }}>
    {NAV.map((t) => {
      const on = active === t.key;
      const Icon = t.icon;

      if (t.center) {
        return (
          <div key={t.key} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <button className="press" onClick={() => onTab(t.key)} aria-label={t.label} style={{
              marginTop: -26, width: 54, height: 54, borderRadius: 27, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: C.goldGrad, color: "#241704",
              boxShadow: "0 10px 24px rgba(169,130,63,0.5), inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 5px rgba(6,4,5,0.9)",
            }}>
              <Plus size={24} strokeWidth={2.4} />
            </button>
          </div>
        );
      }

      return (
        <button key={t.key} className="nav-btn" onClick={() => onTab(t.key)} style={{
          flex: 1, background: "none", border: "none", padding: "4px 0 2px", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          color: on ? C.gold : C.textMuted,
        }}>
          <Icon className="nav-ico" size={20} strokeWidth={on ? 2.2 : 1.7} />
          <span style={{ fontSize: 9.5, letterSpacing: 0.4, fontWeight: on ? 700 : 500 }}>{t.label}</span>
        </button>
      );
    })}
  </div>
);

/* ══════════════════════════════════════════════════ Meta rows */
const MetaLine = ({ icon: Icon, children }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.textSec, letterSpacing: 0.2 }}>
    <Icon size={13.5} strokeWidth={1.8} style={{ opacity: 0.85 }} />{children}
  </span>
);

/* ═══════════════════════════════════════════ Featured (hero) card */
const FeaturedCard = ({ p, onTap }) => (
  <div className="lux-card" onClick={onTap} style={{
    ...glass, borderRadius: 22, padding: 0, marginBottom: 16, cursor: "pointer", overflow: "hidden", position: "relative",
    border: `1px solid ${C.lineGold}`,
  }}>
    {/* ambient header */}
    <div style={{
      position: "relative", height: 128, overflow: "hidden",
      background:
        "radial-gradient(120% 130% at 82% -10%, rgba(178,58,76,0.5), transparent 58%)," +
        "radial-gradient(120% 130% at 12% 120%, rgba(216,189,130,0.28), transparent 60%)," +
        "linear-gradient(135deg, #1a1216, #0c090c)",
    }}>
      <div style={{ position: "absolute", top: 14, left: 16 }}>
        <Eyebrow style={{ color: C.goldBright }}>✦ 今夜のおすすめグループ</Eyebrow>
      </div>
      <div style={{ position: "absolute", top: 12, right: 14 }}><TreatBadge treat={p.treat_type} /></div>
      <div style={{ position: "absolute", left: 16, bottom: -22, width: 66, height: 66, borderRadius: 33, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
        background: "radial-gradient(circle at 34% 28%, rgba(232,214,166,0.3), rgba(168,50,58,0.16) 80%)",
        border: `1px solid ${C.lineGold}`, boxShadow: "0 10px 24px rgba(0,0,0,0.55)" }}>
        {partyEmoji(p.id)}
      </div>
    </div>

    <div style={{ padding: "30px 18px 18px" }}>
      <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 19, fontWeight: 600, color: C.text, letterSpacing: 0.3, lineHeight: 1.3 }}>{p.title}</div>
      <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
        {[p.location, p.area].filter(Boolean).length > 0 && (
          <MetaLine icon={MapPin}>{[p.location, p.area].filter(Boolean).join(" · ")}</MetaLine>
        )}
        <MetaLine icon={Users}>{p.current_members}/{p.max_members}名</MetaLine>
        {p.party_time && <MetaLine icon={Clock}>{p.party_time}</MetaLine>}
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}>
        <Tag>ホスト側 {groupSizes(p).host}名</Tag>
        <Tag>募集 {groupSizes(p).guest}名グループ</Tag>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}` }}>
        <div>
          <div style={{ fontSize: 9.5, color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>参加ポイント / 1名</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, lineHeight: 1, ...goldText }}>
            {p.point_request}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span>
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: C.gold, letterSpacing: 0.5 }}>
          詳細を見る <ArrowRight size={15} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════ PartyCard */
const PartyCard = ({ p, onTap }) => {
  // 表示するのは会の情報のみ。参加者個人の属性（性別・年齢・写真）は一覧に出さない。
  const { host, guest } = groupSizes(p);
  const tags = [`ホスト側 ${host}名`, `募集 ${guest}名グループ`];
  return (
    <div className="lux-card" onClick={onTap} style={{ ...glass, padding: 15, marginBottom: 12, cursor: "pointer", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 18, right: 18, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 11 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <AvatarBubble size={48}>{partyEmoji(p.id)}</AvatarBubble>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_SERIF_JP, fontWeight: 600, fontSize: 15.5, color: C.text, letterSpacing: 0.2, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
            <div style={{ marginTop: 4 }}><MetaLine icon={MapPin}>{[p.location, p.area].filter(Boolean).join(" · ") || "場所未定"}</MetaLine></div>
          </div>
        </div>
        <TreatBadge treat={p.treat_type} />
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          {tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 11, borderTop: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "flex", gap: 15 }}>
          <MetaLine icon={Users}>{p.current_members}/{p.max_members}名</MetaLine>
          {p.party_time && <MetaLine icon={Clock}>{p.party_time}</MetaLine>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, ...goldText }}>{p.point_request}<span style={{ fontSize: 10.5, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Home */
const HomeScreen = ({ user, onDetail }) => {
  const [area, setArea] = useState(null);
  const [parties, setParties] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, reqs] = await Promise.all([
        api.listParties(area),
        api.listIncomingRequests(user.id),
      ]);
      setParties(ps.filter((p) => p.host_id !== user.id));
      setIncoming(reqs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [area, user.id]);

  useEffect(() => { load(); }, [load]);

  const respond = async (id, status) => {
    try {
      await api.respondJoinRequest(id, status);
      load();
    } catch (e) { alert("処理に失敗しました: " + e.message); }
  };

  const [featured, ...rest] = parties;

  return (
    <div>
      {/* editorial greeting */}
      <div style={{ padding: "16px 20px 2px" }}>
        <Eyebrow style={{ color: C.textMuted }}>{greeting()}</Eyebrow>
        <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 21, fontWeight: 600, color: C.text, letterSpacing: 0.4, marginTop: 3 }}>
          今夜は、どのグループと。
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10,
          padding: "5px 12px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          color: C.goldBright, background: "rgba(216,189,130,0.08)", border: `1px solid ${C.lineGold}`,
        }}>
          <UsersRound size={12} strokeWidth={2} /> {MIN_GROUP}名以上のグループ同士 · 同性グループもOK
        </div>
      </div>

      {/* area filter */}
      <div style={{ padding: "12px 20px 4px" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
          {["すべて", ...AREAS].map((a) => {
            const on = (a === "すべて" && !area) || area === a;
            return (
              <button key={a} className="chip" onClick={() => setArea(a === "すべて" ? null : a)} style={{
                padding: "7px 16px", borderRadius: 22, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                ...(on
                  ? { ...goldBtn, borderRadius: 22, color: "#241704", boxShadow: "0 6px 16px rgba(169,130,63,0.36), inset 0 1px 0 rgba(255,255,255,0.55)" }
                  : { background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
              }}>{a}</button>
            );
          })}
        </div>
      </div>

      {/* incoming join requests (host inbox) */}
      {incoming.length > 0 && (
        <div style={{ padding: "8px 20px 0" }}>
          <Eyebrow style={{ marginBottom: 11 }}>◆ グループ参加リクエスト</Eyebrow>
          {incoming.map((r, i) => {
            const pt = r.party?.point_request ?? 0;
            const size = Math.max(MIN_GROUP, r.group_size ?? MIN_GROUP);
            return (
              <div key={r.id} className="rise" style={{ ...glass, padding: 16, marginBottom: 10, animationDelay: `${i * 60}ms`,
                background: "linear-gradient(135deg, rgba(178,58,76,0.22), rgba(111,26,40,0.08))", border: "1px solid rgba(178,58,76,0.32)" }}>
                {/* 承認前に表示するのは代表者のニックネームとグループ人数のみ。
                    顔写真・年齢などのプロフィールは承認後にのみ閲覧できる。 */}
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11 }}>
                  <AvatarBubble size={44}><UsersRound size={20} strokeWidth={1.7} color={C.gold} /></AvatarBubble>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>
                      <b style={{ color: C.goldBright, fontWeight: 700 }}>{r.applicant_name || "ゲスト"}</b>
                      <span style={{ color: C.textMuted, fontSize: 11.5 }}> さんのグループ（{size}名）</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textSec }}>「{r.party?.title}」への参加希望</div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: C.textSec, marginBottom: 9, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Gem size={12} strokeWidth={1.8} color={C.gold} /> 承認すると <b style={{ color: C.gold }}>{(pt * size).toLocaleString()}pt</b> を受け取ります
                  <span style={{ color: C.textMuted }}>（{pt.toLocaleString()}pt × {size}名）</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 13, display: "flex", alignItems: "flex-start", gap: 5, lineHeight: 1.6 }}>
                  <Lock size={11} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 2 }} />
                  メンバーのプロフィールは、承認後に会の画面で確認できます。
                </div>
                <div style={{ display: "flex", gap: 9 }}>
                  <button className="gold-cta" onClick={() => respond(r.id, "accepted")} style={{ ...goldBtn, flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <Check size={15} strokeWidth={2.5} /> 承認する
                  </button>
                  <button className="press" onClick={() => respond(r.id, "rejected")} style={{ ...ghostBtn, flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13 }}>見送る</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* feed */}
      <div style={{ padding: "12px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <Eyebrow style={{ color: C.textMuted }}>募集中のグループ飲み会</Eyebrow>
          <span style={{ fontSize: 11.5, color: C.textFaint, fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: 0.5 }}>{loading ? "…" : `${parties.length} groups`}</span>
        </div>
        {loading ? <Spinner /> : parties.length === 0 ? (
          <EmptyState icon={<Wine size={24} strokeWidth={1.6} />}>
            この条件で募集中の会はまだありません。<br />「＋」から、最初のグループ飲み会を立ち上げましょう。
          </EmptyState>
        ) : (
          <>
            {featured && (
              <div className="rise"><FeaturedCard p={featured} onTap={() => onDetail(featured.id)} /></div>
            )}
            {rest.map((p, i) => (
              <div key={p.id} className="rise" style={{ animationDelay: `${(i + 1) * 55}ms` }}>
                <PartyCard p={p} onTap={() => onDetail(p.id)} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Detail */
const DetailScreen = ({ user, partyId, onBack, onGoPoints }) => {
  const [party, setParty] = useState(null);
  const [members, setMembers] = useState([]);
  const [balance, setBalance] = useState(null);
  const [reqStatus, setReqStatus] = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [groupSize, setGroupSize] = useState(MIN_GROUP); // 申し込むグループの人数（2名以上）

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [p, ms, bal, req] = await Promise.all([
          api.getParty(partyId),
          api.getPartyMembers(partyId),
          api.getBalance(user.id),
          api.getMyJoinRequest(user.id, partyId),
        ]);
        if (!alive) return;
        setParty(p);
        setMembers(ms);
        setBalance(bal);
        setReqStatus(req?.status ?? null);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [partyId, user.id]);

  const sendRequest = async () => {
    setSending(true);
    try {
      await api.sendJoinRequest(user.id, party.id, groupSize);
      setReqStatus("pending");
    } catch (e) {
      alert("リクエスト送信に失敗しました: " + e.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ padding: "0 20px" }}><BackButton onBack={onBack} /><Spinner /></div>;
  if (!party) return <div style={{ padding: "0 20px" }}><BackButton onBack={onBack} /><EmptyState>会が見つかりませんでした。</EmptyState></div>;

  const { host: hostGroup, guest: guestGroup } = groupSizes(party);
  const seatsLeft = Math.max(0, party.max_members - party.current_members);
  // 参加できるグループ人数の選択肢（2名以上、かつ残枠まで）
  const sizeOptions = GROUP_OPTIONS.filter((n) => n <= seatsLeft);
  const cost = party.point_request * groupSize;             // 参加グループが支払うポイント合計
  const isHost = party.host_id === user.id;
  const isMember = members.some((m) => m.user_id === user.id);
  const canSeeMembers = isHost || isMember;                 // 承認後のみ個人プロフィールを表示
  const isFull = seatsLeft < MIN_GROUP;
  const enough = (balance ?? 0) >= cost;
  const INFO = [
    { label: "場所", value: [party.location, party.area && `（${party.area}）`].filter(Boolean).join("") || "未定", icon: MapPin },
    { label: "時間", value: party.party_time || "未定", icon: Clock },
    { label: "参加人数", value: `${party.current_members}/${party.max_members}名`, icon: Users },
    { label: "グループ構成", value: `ホスト${hostGroup}名 × 募集${guestGroup}名`, icon: UsersRound },
  ];

  return (
    <div style={{ padding: "0 20px 24px" }}>
      <BackButton onBack={onBack} />
      <div className="fade" style={{ ...glass, overflow: "hidden" }}>
        <div style={{
          height: 96, position: "relative",
          background:
            "radial-gradient(120% 130% at 82% -10%, rgba(178,58,76,0.45), transparent 58%)," +
            "radial-gradient(120% 130% at 10% 120%, rgba(216,189,130,0.24), transparent 60%)," +
            "linear-gradient(135deg, #1a1216, #0c090c)",
        }}>
          <div style={{ position: "absolute", top: 14, right: 16 }}><TreatBadge treat={party.treat_type} /></div>
          <div style={{ position: "absolute", left: 22, bottom: -28, width: 66, height: 66, borderRadius: 33, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
            background: "radial-gradient(circle at 34% 28%, rgba(232,214,166,0.3), rgba(168,50,58,0.16) 80%)", border: `1px solid ${C.lineGold}`, boxShadow: "0 10px 24px rgba(0,0,0,0.55)" }}>
            {partyEmoji(party.id)}
          </div>
        </div>

        <div style={{ padding: "38px 22px 22px" }}>
          <h2 style={{ fontFamily: FONT_SERIF_JP, fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: C.text, letterSpacing: 0.4, lineHeight: 1.3 }}>{party.title}</h2>
          {/* 公開されるのは会の情報とホストのニックネームまで */}
          <p style={{ fontSize: 12.5, color: C.textSec, margin: "0 0 8px", letterSpacing: 0.3 }}>
            {[party.host_name && `ホスト: ${party.host_name}`, `${hostGroup}名グループが${guestGroup}名グループを募集中`].filter(Boolean).join(" · ")}
          </p>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 22 }}>
            <Tag>グループ飲み会</Tag>
            <Tag>同性グループもOK</Tag>
          </div>

          {!canSeeMembers && (
            <div style={{
              display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 22,
              background: "rgba(255,255,255,0.028)", border: `1px solid ${C.lineSoft}`, borderRadius: 15, padding: "14px 16px",
            }}>
              <span style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(216,189,130,0.09)", border: `1px solid ${C.lineGold}`, color: C.gold,
              }}><Lock size={15} strokeWidth={1.9} /></span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>メンバーのプロフィールは非公開です</div>
                <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
                  参加メンバーの名前・写真は、参加が承認されたあとに表示されます。
                </div>
              </div>
            </div>
          )}

          {canSeeMembers && members.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Eyebrow style={{ marginBottom: 14 }}>参加メンバー</Eyebrow>
              <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
                {members.map((m, i) => {
                  const prof = m.profiles || {};
                  return (
                    <div key={i} style={{ textAlign: "center", flexShrink: 0, width: 74 }}>
                      <div style={{ position: "relative", width: 68, height: 68, margin: "0 auto", borderRadius: 34, padding: 2, background: C.goldGrad, boxShadow: "0 6px 16px rgba(0,0,0,0.5)" }}>
                        {prof.avatar_url ? (
                          <img src={prof.avatar_url} alt={prof.username} loading="lazy" style={{ width: "100%", height: "100%", borderRadius: 32, objectFit: "cover", display: "block", background: "#1a1620" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "#181318", color: C.gold }}>
                            {m.role === "host" ? <Crown size={24} strokeWidth={1.7} /> : <User size={24} strokeWidth={1.7} />}
                          </div>
                        )}
                        {m.role === "host" && (
                          <div style={{ position: "absolute", top: -4, right: -2, background: C.goldGrad, borderRadius: 10, padding: "2px 3px", boxShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
                            <Crown size={11} strokeWidth={2.2} color="#241704" />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 8 }}>{prof.username || "ゲスト"}</div>
                      <div style={{ fontSize: 10.5, color: C.textMuted }}>{prof.age ? `${prof.age}歳` : (m.role === "host" ? "ホスト" : "")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {INFO.map((item) => (
              <div key={item.label} style={{ background: "rgba(255,255,255,0.028)", border: `1px solid ${C.lineSoft}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: C.textMuted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  <item.icon size={13} strokeWidth={1.8} /> {item.label}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{item.value}</div>
              </div>
            ))}
          </div>

          {!isHost && !isMember && reqStatus !== "accepted" && reqStatus !== "pending" && !isFull && (
            <>
              {/* 参加は必ずグループ単位（2名以上） */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>参加するグループの人数（{MIN_GROUP}名以上）</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sizeOptions.map((n) => {
                    const on = groupSize === n;
                    return (
                      <button key={n} className="chip" onClick={() => setGroupSize(n)} style={{
                        flex: 1, minWidth: 58, padding: "10px 0", borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                        ...(on ? { ...goldBtn, borderRadius: 12 } : { ...ghostBtn, borderRadius: 12 }),
                      }}>{n}名</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                  1対1でのマッチングは行っていません。残り{seatsLeft}名分の枠があります。
                </div>
              </div>

              <div style={{
                borderRadius: 16, padding: 18, marginBottom: 18, position: "relative", overflow: "hidden",
                background: "linear-gradient(135deg, rgba(178,58,76,0.24), rgba(111,26,40,0.12))",
                border: `1px solid rgba(178,58,76,0.32)`,
              }}>
                <div style={{ fontSize: 10, color: "rgba(244,240,230,0.62)", marginBottom: 6, letterSpacing: 1.8, textTransform: "uppercase" }}>参加に必要なポイント（グループ合計）</div>
                <div style={{ fontSize: 32, fontWeight: 700, fontFamily: FONT_DISPLAY, lineHeight: 1, ...goldText }}>{cost.toLocaleString()}<span style={{ fontSize: 15, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 6 }}>{party.point_request.toLocaleString()}pt × {groupSize}名</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.lineSoft}` }}>
                  <span style={{ fontSize: 11, color: C.textSec }}>現在の残高</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: FONT_DISPLAY, color: enough ? C.gold : C.red }}>
                    {(balance ?? 0).toLocaleString()} pt
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 7 }}>※ 参加するグループが支払うポイントです。承認されるとホストに支払われます。</div>
              </div>
            </>
          )}

          {isHost ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "default" }}>
              <Crown size={16} strokeWidth={2} color={C.gold} /> あなたが募集したグループ飲み会です
            </div>
          ) : isMember || reqStatus === "accepted" ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "default", color: C.gold }}>
              <Check size={17} strokeWidth={2.5} /> 参加済みです
            </div>
          ) : reqStatus === "pending" ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "default", color: C.gold }}>
              <Check size={17} strokeWidth={2.5} /> リクエスト送信済み（承認待ち）
            </div>
          ) : isFull ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 14, textAlign: "center", cursor: "default", color: C.textMuted }}>
              グループで参加できる枠が埋まりました
            </div>
          ) : !enough ? (
            <button className="press" onClick={onGoPoints} style={{
              ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <Gem size={16} strokeWidth={2.2} /> ポイントが不足しています（購入する）
            </button>
          ) : (
            <button className="gold-cta" onClick={sendRequest} disabled={sending} style={{
              ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: sending ? 0.7 : 1, cursor: sending ? "default" : "pointer",
            }}>
              {sending ? "送信中…" : <><Send size={16} strokeWidth={2.2} /> {groupSize}名グループで参加を申し込む</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Create */
const CreateScreen = ({ user, onCreated }) => {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [hostGroup, setHostGroup] = useState(MIN_GROUP);   // ホスト側グループの人数（2名以上）
  const [guestGroup, setGuestGroup] = useState(MIN_GROUP); // 募集するグループの人数（2名以上）
  const [time, setTime] = useState("20:00");
  const [treat, setTreat] = useState("奢り");
  const [points, setPoints] = useState(300);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) { alert("会の名前を入力してください。"); return; }
    // グループ限定：1対1のマッチングは作成できない
    if (hostGroup < MIN_GROUP || guestGroup < MIN_GROUP) {
      alert(`グループ飲み会マッチングのため、ホスト側・募集側ともに${MIN_GROUP}名以上で設定してください。`);
      return;
    }
    setSaving(true);
    try {
      const p = await api.createParty(user.id, {
        title: title.trim(),
        location: location.trim() || null,
        area: area.trim() || null,
        host_group_size: hostGroup,
        guest_group_size: guestGroup,
        party_time: time,
        treat_type: treat,
        point_request: Number(points) || 0,
      });
      onCreated(p.id);
    } catch (e) {
      alert("会の作成に失敗しました: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const GroupPicker = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 7 }}>
      {GROUP_OPTIONS.map((n) => {
        const on = value === n;
        return (
          <button key={n} className="chip" onClick={() => onChange(n)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            ...(on ? { ...goldBtn, borderRadius: 12 } : { ...ghostBtn, borderRadius: 12 }),
          }}>{n}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <SectionTitle sub="Host a group dinner">グループ飲み会を作成</SectionTitle>

      {/* グループ限定であることを作成画面でも明示 */}
      <div className="fade" style={{
        display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 14,
        borderRadius: 16, padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(216,189,130,0.1), rgba(216,189,130,0.02))",
        border: `1px solid ${C.lineGold}`,
      }}>
        <span style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(216,189,130,0.1)", border: `1px solid ${C.lineGold}`, color: C.gold,
        }}><UsersRound size={15} strokeWidth={1.9} /></span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{MIN_GROUP}名以上のグループ同士でのみ開催できます</div>
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
            1対1のマッチングは行えません。性別による制限はなく、同性グループ同士でも開催できます。
          </div>
        </div>
      </div>

      <div className="fade" style={{ ...glass, padding: 22 }}>
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>会の名前</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 金曜の乾杯、軽く一杯" style={fieldStyle} />
        </div>
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>お店</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: 恵比寿 / BAR TRENCH" style={fieldStyle} />
        </div>
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>エリア</label>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
            {AREAS.map((a) => {
              const on = area === a;
              return (
                <button key={a} className="chip" onClick={() => setArea(on ? "" : a)} style={{
                  padding: "7px 15px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  ...(on ? { ...goldBtn, borderRadius: 20 } : { background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
                }}>{a}</button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>ホスト側のグループ人数（あなたを含む · {MIN_GROUP}名以上）</label>
          <GroupPicker value={hostGroup} onChange={setHostGroup} />
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>募集するグループの人数（{MIN_GROUP}名以上）</label>
          <GroupPicker value={guestGroup} onChange={setGuestGroup} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, padding: "10px 13px", borderRadius: 12, background: "rgba(255,255,255,0.028)", border: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 11.5, color: C.textSec }}>合計人数</span>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_DISPLAY, ...goldText }}>
              {hostGroup + guestGroup}<span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 600 }}> 名</span>
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>時間</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...fieldStyle, colorScheme: "dark" }} />
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>お会計</label>
          <div style={{ display: "flex", gap: 9 }}>
            {["奢り", "割り勘"].map((t) => {
              const on = treat === t;
              return (
                <button key={t} className="press" onClick={() => setTreat(t)} style={{
                  flex: 1, padding: "12px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  ...(on ? { ...goldBtn, borderRadius: 12 } : { ...ghostBtn, borderRadius: 12 }),
                }}>{t === "奢り" ? "◆ 奢り" : "割り勘"}</button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>参加ポイント（参加グループが支払う／1人あたり）</label>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <input type="number" value={points} onChange={(e) => setPoints(e.target.value)} style={fieldStyle} />
            <span style={{ fontSize: 14, color: C.gold, fontWeight: 700 }}>pt</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
            <Gem size={13} strokeWidth={1.8} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
            募集する側（あなた）にポイントはかかりません。グループの参加が承認されるたび、人数分のポイントを受け取れます。
          </div>
        </div>

        <button className="gold-cta" onClick={submit} disabled={saving} style={{ ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: saving ? 0.7 : 1 }}>
          {saving ? "作成中…" : <><Sparkles size={16} strokeWidth={2} /> グループ飲み会を作成する</>}
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Points */
const PACKS = [
  { amount: 500, price: 500, bonus: 0 },
  { amount: 1100, price: 1000, bonus: 100 },
  { amount: 2400, price: 2000, bonus: 400, popular: true },
  { amount: 5500, price: 5000, bonus: 500 },
  { amount: 12000, price: 10000, bonus: 2000 },
];

const PointsScreen = ({ user }) => {
  const [tab, setTab] = useState("buy");
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [convertAmt, setConvertAmt] = useState(1000);

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([api.getBalance(user.id), api.getPointHistory(user.id)]);
      setBalance(b);
      setHistory(h);
    } catch (e) { console.error(e); }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const buy = async (pack) => {
    setBusy(true);
    try {
      await api.purchasePoints(
        pack.amount,
        `ポイント購入 ¥${pack.price.toLocaleString()}${pack.bonus ? `（+${pack.bonus}ボーナス）` : ""}`,
      );
      await load();
    } catch (e) { alert("購入処理に失敗しました: " + e.message); }
    finally { setBusy(false); }
  };

  const convert = async () => {
    const amt = Number(convertAmt);
    if (!balance || amt > balance) { alert("残高が不足しています。"); return; }
    setBusy(true);
    try {
      const converted = Math.floor(amt * 0.85);
      await api.convertPoints(amt, `オリパpt変換（${converted}オリパpt）`);
      await load();
      alert(`${converted}オリパptに変換しました。`);
    } catch (e) { alert("変換に失敗しました: " + e.message); }
    finally { setBusy(false); }
  };

  const TABS = [
    { key: "buy", label: "購入", icon: Wallet },
    { key: "convert", label: "変換", icon: Repeat },
    { key: "history", label: "履歴", icon: History },
  ];

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      {/* balance card */}
      <div className="fade" style={{
        borderRadius: 22, padding: "26px 24px", marginBottom: 18, position: "relative", overflow: "hidden",
        background: "linear-gradient(140deg, #1c1319 0%, #0c090c 52%, #241119 100%)",
        border: `1px solid ${C.lineGold}`, boxShadow: "0 20px 46px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.1)",
      }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 62, background: "linear-gradient(90deg, rgba(255,255,255,0.16), transparent)", animation: "sheen 5.5s ease-in-out infinite" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.textMuted, marginBottom: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              <Gem size={12} strokeWidth={1.8} /> Point Balance
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, fontFamily: FONT_DISPLAY, lineHeight: 1, marginBottom: 8, ...goldText }}>
              {balance === null ? "…" : balance.toLocaleString()}<span style={{ fontSize: 17, fontWeight: 600, fontFamily: FONT_BODY }}> pt</span>
            </div>
            <div style={{ fontSize: 11, color: C.textSec }}>グループ飲み会の参加に使えるポイント</div>
          </div>
          <div style={{ width: 42, height: 42, borderRadius: 21, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(216,189,130,0.1)", border: `1px solid ${C.lineGold}`, color: C.gold }}>
            <Gem size={20} strokeWidth={1.6} />
          </div>
        </div>
      </div>

      {/* segmented tabs */}
      <div style={{ display: "flex", gap: 7, marginBottom: 18, background: "rgba(255,255,255,0.028)", padding: 4, borderRadius: 14, border: `1px solid ${C.lineSoft}` }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} className="press" onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              ...(on ? { background: C.goldGrad, color: "#241704", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" } : { background: "transparent", color: C.textSec }),
            }}><t.icon size={14} strokeWidth={2} />{t.label}</button>
          );
        })}
      </div>

      {tab === "buy" && (
        <div className="fade" style={{ ...glass, padding: 22 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Buy Points</Eyebrow>
          {PACKS.map((p, i, arr) => (
            <div key={p.price} className="lux-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 6px", margin: "0 -6px", borderRadius: 10, borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text }}>{p.amount.toLocaleString()}<span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></span>
                {p.bonus > 0 && <Tag>+{p.bonus} ボーナス</Tag>}
                {p.popular && <span style={{ fontSize: 10, fontWeight: 700, color: "#241704", background: C.goldGrad, padding: "2px 9px", borderRadius: 20, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>人気</span>}
              </div>
              <button className="gold-cta" onClick={() => buy(p)} disabled={busy} style={{ ...goldBtn, padding: "9px 17px", borderRadius: 11, fontSize: 13, opacity: busy ? 0.6 : 1 }}>¥{p.price.toLocaleString()}</button>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 10.5, color: C.textMuted, marginTop: 14 }}>
            <ShieldCheck size={13} strokeWidth={1.8} /> デモ版のため実際の決済は行われません
          </div>
        </div>
      )}

      {tab === "convert" && (
        <div className="fade" style={{ ...glass, padding: 22 }}>
          <Eyebrow style={{ marginBottom: 16 }}>オリパpt 変換</Eyebrow>
          <div style={{ background: "rgba(255,255,255,0.028)", border: `1px solid ${C.lineSoft}`, borderRadius: 15, padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.5 }}>変換元</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text }}>{Number(convertAmt).toLocaleString()}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
              </div>
              <ArrowRight size={22} strokeWidth={1.8} color={C.gold} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.5 }}>オリパpt</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT_DISPLAY, ...goldText }}>{Math.floor(convertAmt * 0.85).toLocaleString()}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: C.textMuted, textAlign: "center" }}>変換レート 1pt → 0.85オリパpt（手数料15%）</div>
          </div>
          <input type="range" min={100} max={Math.max(100, balance || 100)} step={50} value={convertAmt} onChange={(e) => setConvertAmt(Number(e.target.value))} style={{ width: "100%", marginBottom: 18 }} />
          <button className="gold-cta" onClick={convert} disabled={busy} style={{ ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
            <Repeat size={16} strokeWidth={2} /> 変換する
          </button>
        </div>
      )}

      {tab === "history" && (
        <div className="fade" style={{ ...glass, padding: 22 }}>
          <Eyebrow style={{ marginBottom: 10 }}>取引履歴</Eyebrow>
          {history.length === 0 ? <EmptyState icon={<History size={22} strokeWidth={1.6} />}>取引履歴はまだありません。</EmptyState> : history.map((h, i, arr) => {
            const up = h.amount >= 0;
            const d = new Date(h.created_at);
            return (
              <div key={h.id} className="lux-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 6px", margin: "0 -6px", borderRadius: 10, borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>{h.description || h.type}</div>
                  <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 2 }}>{d.getMonth() + 1}月{d.getDate()}日</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, color: up ? C.gold : C.red }}>{up ? "+" : ""}{h.amount.toLocaleString()}<span style={{ fontSize: 10.5, fontFamily: FONT_BODY, fontWeight: 600 }}>pt</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Chat list
   チャットは「会（グループ）」単位のみ。個人間DMは提供しない。
   一覧に並ぶのは自分が参加している会のグループチャットのみ。            */
const ChatScreen = ({ user, openRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const ps = await api.listMyParties(user.id);
        if (alive) setRooms(ps);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user.id]);

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <SectionTitle sub="Group chat">グループチャット</SectionTitle>
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 16,
        borderRadius: 14, padding: "11px 14px",
        background: "rgba(255,255,255,0.028)", border: `1px solid ${C.lineSoft}`,
      }}>
        <UsersRound size={14} strokeWidth={1.9} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.7 }}>
          チャットは会に参加したメンバー全員のグループチャットのみです。個人間のダイレクトメッセージ機能はありません。
        </span>
      </div>
      {loading ? <Spinner /> : rooms.length === 0 ? (
        <EmptyState icon={<MessageCircle size={24} strokeWidth={1.6} />}>
          参加中の会がありません。<br />グループ飲み会を作るか、参加リクエストが承認されると<br />グループチャットが始まります。
        </EmptyState>
      ) : rooms.map((c, i) => {
        const matched = c.status === "matched";
        return (
          <div key={c.id} className="lux-card" onClick={() => openRoom(c)} style={{ ...glass, display: "flex", gap: 13, alignItems: "center", padding: 15, marginBottom: 11, cursor: "pointer", animationDelay: `${i * 50}ms` }}>
            <AvatarBubble size={46}>{partyEmoji(c.id)}</AvatarBubble>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                <span style={{ fontFamily: FONT_SERIF_JP, fontWeight: 600, fontSize: 14.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: matched ? C.gold : C.textMuted }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: matched ? C.gold : C.textFaint, animation: matched ? "pulseDot 1.8s ease-in-out infinite" : "none" }} />
                  {matched ? "マッチ済" : "募集中"}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[c.location, c.area].filter(Boolean).join(" · ") || "タップしてグループチャットを開く"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ══════════════════════════════════════════════ ChatRoom (Realtime) */
const ChatRoom = ({ user, party, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ms = await api.listMessages(party.id);
        if (alive) setMessages(ms);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    const unsub = api.subscribeMessages(party.id, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    return () => { alive = false; unsub(); };
  }, [party.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    try {
      await api.sendMessage(party.id, user.id, content);
    } catch (e) { alert("送信に失敗しました: " + e.message); setText(content); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 11, background: "linear-gradient(180deg, rgba(255,255,255,0.025), transparent)" }}>
        <button className="press" onClick={onBack} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", padding: 4, display: "flex" }}><ChevronLeft size={22} strokeWidth={2} /></button>
        <AvatarBubble size={38}>{partyEmoji(party.id)}</AvatarBubble>
        <div>
          <div style={{ fontFamily: FONT_SERIF_JP, fontSize: 14.5, fontWeight: 600, color: C.text }}>{party.title}</div>
          <div style={{ fontSize: 10.5, color: C.textMuted, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <UsersRound size={11} strokeWidth={1.9} /> グループチャット
            {[party.location, party.area].filter(Boolean).length > 0 && ` · ${[party.location, party.area].filter(Boolean).join(" · ")}`}
          </div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {loading ? <Spinner /> : messages.length === 0 ? (
          <EmptyState icon={<MessageCircle size={22} strokeWidth={1.6} />}>まだメッセージはありません。<br />グループのみんなに最初のひとことを。</EmptyState>
        ) : messages.map((m) => {
          const mine = m.user_id === user.id;
          return (
            <div key={m.id} className="fade" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 11 }}>
              <div style={{ maxWidth: "76%" }}>
                {!mine && <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, marginLeft: 4 }}>{m.profiles?.username || "ゲスト"}</div>}
                <div style={{
                  padding: "10px 14px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.55, wordBreak: "break-word",
                  ...(mine
                    ? { background: C.goldGrad, color: "#241704", borderBottomRightRadius: 5, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px rgba(169,130,63,0.25)" }
                    : { background: "rgba(255,255,255,0.055)", color: C.text, border: `1px solid ${C.lineSoft}`, borderBottomLeftRadius: 5 }),
                }}>{m.content}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 9, alignItems: "center" }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          placeholder="グループにメッセージを送る…" style={{ ...fieldStyle, borderRadius: 22 }}
        />
        <button className="press" onClick={send} aria-label="送信" style={{ ...goldBtn, width: 44, height: 44, borderRadius: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          <Send size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ MyPage */
const MyPageScreen = ({ user, onTerms }) => {
  const [profile, setProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [editing, setEditing] = useState(false);
  // 性別は取り扱わない（性別による制限を設けないため、入力・表示ともに行わない）
  const [form, setForm] = useState({ username: "", age: "", bio: "", avatar_url: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, b] = await Promise.all([api.getProfile(user.id), api.getBalance(user.id)]);
      setProfile(p);
      setBalance(b);
      if (p) setForm({ username: p.username || "", age: p.age || "", bio: p.bio || "", avatar_url: p.avatar_url || "" });
    } catch (e) { console.error(e); }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(user.id, {
        username: form.username || null,
        age: form.age ? Number(form.age) : null,
        bio: form.bio || null,
        avatar_url: form.avatar_url || null,
      });
      setProfile(updated);
      setEditing(false);
    } catch (e) { alert("保存に失敗しました: " + e.message); }
    finally { setSaving(false); }
  };

  const logout = async () => {
    if (confirm("ログアウトしますか？")) await api.signOut();
  };

  if (!profile && balance === null) return <Spinner />;

  if (editing) {
    return (
      <div style={{ padding: "16px 20px 24px" }}>
        <SectionTitle sub="Edit profile">プロフィール編集</SectionTitle>
        <div className="fade" style={{ ...glass, padding: 22 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>ニックネーム</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>年齢（18歳以上）</label>
            <input type="number" min={18} max={99} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>顔写真URL</label>
            <input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" style={fieldStyle} />
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 10.5, color: C.textMuted, lineHeight: 1.65 }}>
              <Lock size={12} strokeWidth={1.9} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
              写真・名前・年齢は一覧には表示されません。同じ会に参加が承認されたメンバーにのみ公開されます。
            </div>
          </div>
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>自己紹介</label>
            <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} placeholder="ひとこと" style={{ ...fieldStyle, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button className="press" onClick={() => setEditing(false)} style={{ ...ghostBtn, flex: 1, padding: "13px 0", borderRadius: 12, fontSize: 14 }}>キャンセル</button>
            <button className="gold-cta" onClick={save} disabled={saving} style={{ ...goldBtn, flex: 1, padding: "13px 0", borderRadius: 12, fontSize: 14, opacity: saving ? 0.6 : 1 }}>{saving ? "保存中…" : "保存する"}</button>
          </div>
        </div>
      </div>
    );
  }

  const ROWS = [
    { icon: Gem, label: "ポイント残高", value: `${(balance ?? 0).toLocaleString()} pt`, gold: true },
    { icon: Mail, label: "メール", value: user.email },
    { icon: Settings, label: "プロフィール編集", action: () => setEditing(true) },
    { icon: FileText, label: "利用規約", action: onTerms },
    { icon: LogOut, label: "ログアウト", action: logout, danger: true },
  ];

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      {/* profile header */}
      <div className="fade" style={{ ...glass, padding: 20, marginBottom: 16, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 90% -20%, rgba(178,58,76,0.16), transparent 55%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 15, position: "relative" }}>
          <div style={{ width: 66, height: 66, borderRadius: 33, padding: 2, background: C.goldGrad, boxShadow: "0 8px 22px rgba(0,0,0,0.5)", flexShrink: 0 }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} style={{ width: "100%", height: "100%", borderRadius: 31, objectFit: "cover", display: "block", background: "#1a1620" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: 31, display: "flex", alignItems: "center", justifyContent: "center", background: "#181318", color: C.gold }}><User size={28} strokeWidth={1.6} /></div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_SERIF_JP, fontWeight: 600, fontSize: 21, color: C.text, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.username || "ゲスト"}</div>
            <div style={{ fontSize: 12, color: C.textSec, letterSpacing: 0.5, marginTop: 2 }}>
              {profile?.age ? `${profile.age}歳` : "プロフィール未設定"}
            </div>
          </div>
          <button className="press" onClick={() => setEditing(true)} style={{ fontSize: 12, color: C.gold, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineGold}`, borderRadius: 20, padding: "6px 15px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>編集</button>
        </div>
        {profile?.bio && (
          <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.textSec, lineHeight: 1.7, position: "relative" }}>{profile.bio}</div>
        )}
      </div>

      <div className="fade" style={{ ...glass, overflow: "hidden" }}>
        {ROWS.map((item, i, arr) => (
          <div key={i} className={item.action ? "lux-row" : ""} onClick={item.action} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none", cursor: item.action ? "pointer" : "default" }}>
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              <span style={{ display: "flex", color: item.gold ? C.gold : item.danger ? C.red : C.textSec }}><item.icon size={17} strokeWidth={1.8} /></span>
              <span style={{ fontSize: 14, color: item.danger ? C.redSoft : C.text }}>{item.label}</span>
            </div>
            {item.value && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: item.gold ? FONT_DISPLAY : FONT_BODY, ...(item.gold ? goldText : { color: C.textSec }), maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</span>}
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 22, fontSize: 9.5, color: C.textFaint, letterSpacing: 2, textTransform: "uppercase" }}>AISEKI · Group Dining Matching</div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════ Footer
   どの画面からでも利用規約・プライバシーポリシーに到達できるようにする。 */
const AppFooter = ({ onTerms }) => (
  <div style={{
    margin: "10px 20px 0", padding: "16px 0 20px",
    borderTop: `1px solid ${C.lineSoft}`, textAlign: "center",
  }}>
    <button className="press" onClick={onTerms} style={{
      background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
      fontSize: 11.5, fontWeight: 700, color: C.gold, letterSpacing: 0.5,
      fontFamily: FONT_BODY, display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <FileText size={12.5} strokeWidth={2} /> 利用規約・プライバシーポリシー
    </button>
    <div style={{ fontSize: 9.5, color: C.textFaint, letterSpacing: 1.6, marginTop: 9, lineHeight: 1.8 }}>
      18歳未満利用禁止 · グループ飲み会マッチング
      <br />
      © 2026 AISEKI
    </div>
  </div>
);

/* Shared back button */
const BackButton = ({ onBack }) => (
  <button className="press" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", fontSize: 13.5, color: C.gold, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4 }}>
    <ChevronLeft size={18} strokeWidth={2} /> 戻る
  </button>
);

/* ═══════════════════════════════════════════════════════ Root App */
export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [detailId, setDetailId] = useState(null);
  const [chatRoom, setChatRoom] = useState(null);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) { setTab("home"); setDetailId(null); setChatRoom(null); setShowTerms(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const shell = (children) => (
    <div style={{
      maxWidth: 400, width: "100%", margin: "0 auto", minHeight: 720, height: 720, display: "flex", flexDirection: "column", overflow: "hidden",
      borderRadius: 30,
      background:
        "radial-gradient(120% 78% at 86% -6%, rgba(178,58,76,0.28), transparent 55%)," +
        "radial-gradient(100% 58% at 0% 6%, rgba(216,189,130,0.1), transparent 50%)," +
        "linear-gradient(180deg, #100c0e 0%, #070506 100%)",
      border: `1px solid ${C.line}`,
      boxShadow: "0 44px 96px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)",
      fontFamily: FONT_BODY,
    }}>{children}</div>
  );

  if (!authReady) return shell(<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner label="起動中…" /></div>);
  if (!session) return <AuthScreen />;

  const user = session.user;

  if (chatRoom) {
    return shell(<ChatRoom user={user} party={chatRoom} onBack={() => setChatRoom(null)} />);
  }

  const renderScreen = () => {
    if (showTerms) return <TermsScreen onBack={() => setShowTerms(false)} />;
    if (detailId) return <DetailScreen user={user} partyId={detailId} onBack={() => setDetailId(null)} onGoPoints={() => { setDetailId(null); setTab("points"); }} />;
    switch (tab) {
      case "home": return <HomeScreen user={user} onDetail={setDetailId} />;
      case "create": return <CreateScreen user={user} onCreated={(id) => { setTab("home"); setDetailId(id); }} />;
      case "chat": return <ChatScreen user={user} openRoom={setChatRoom} />;
      case "points": return <PointsScreen user={user} />;
      case "mypage": return <MyPageScreen user={user} onTerms={() => setShowTerms(true)} />;
      default: return <HomeScreen user={user} onDetail={setDetailId} />;
    }
  };

  return shell(
    <>
      <div style={{
        padding: "15px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.line}`, background: "linear-gradient(180deg, rgba(255,255,255,0.028), transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: FONT_LOGO, fontSize: 24, fontWeight: 700, letterSpacing: 3.5, ...goldText }}>AISEKI</span>
          <span style={{ fontFamily: FONT_SERIF_JP, fontSize: 11, color: C.textMuted, letterSpacing: 0.8 }}>グループ飲み会マッチング</span>
        </div>
        <button className="press" aria-label="お知らせ" style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`, borderRadius: 20, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textSec, position: "relative" }}>
          <Bell size={16} strokeWidth={1.8} />
          <span style={{ position: "absolute", top: 8, right: 9, width: 6, height: 6, borderRadius: 3, background: C.red, boxShadow: "0 0 0 2px #0d0a0c" }} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {renderScreen()}
        {!showTerms && <AppFooter onTerms={() => setShowTerms(true)} />}
      </div>
      <TabBar active={tab} onTab={(t) => { setTab(t); setDetailId(null); setShowTerms(false); }} />
    </>
  );
}
