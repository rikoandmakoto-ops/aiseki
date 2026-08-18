import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  Home, MessageCircle, Plus, Gem, User, MapPin, Clock, Users, Bell,
  Crown, ChevronLeft, Send, ArrowRight, Check, Sparkles, Settings,
  Mail, LogOut, Wine, Repeat, History, Wallet, ShieldCheck, Lock, FileText, UsersRound,
  Ticket, Copy, DoorClosed, Ban, CreditCard, Camera, Trash2, LifeBuoy, ShieldAlert, XCircle,
} from "lucide-react";
import { supabase, configError } from "./lib/supabase";
import * as api from "./lib/api";
import { POINT_PACKS, packBonus } from "./lib/packs.js";
import { FOOTER_NOTICE } from "./lib/legal.js";
import {
  C, FONT_LOGO, FONT_DISPLAY, FONT_HEAD, FONT_BODY,
  brandText, card, popBtn, ghostBtn, fieldStyle, labelStyle, Eyebrow,
  partyEmoji, TreatBadge, Tag, AvatarBubble, SectionTitle, Spinner, EmptyState,
  Skeleton, SkeletonList,
} from "./lib/theme.jsx";
import { ToastProvider, useToast } from "./lib/toast.jsx";
import InstallCard from "./screens/InstallCard.jsx";

/* 初回表示に要らない画面は、開いたときに読み込む。
   規約の全文（legal.js）とランディングページは分量が大きく、
   最初のJSに含めると起動が重くなる。 */
const TermsScreen = lazy(() => import("./screens/TermsScreen.jsx"));
const LandingScreen = lazy(() => import("./screens/LandingScreen.jsx"));
const AuthScreen = lazy(() => import("./screens/AuthScreen.jsx"));
const NotificationsScreen = lazy(() => import("./screens/NotificationsScreen.jsx"));
const SupportScreen = lazy(() => import("./screens/SupportScreen.jsx"));
const ResetPasswordScreen = lazy(() => import("./screens/ResetPasswordScreen.jsx"));

/* 分割した画面を読み込んでいる間のつなぎ */
const Loading = ({ label }) => (
  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240 }}>
    <Spinner label={label} />
  </div>
);

/* Real Tokyo nightlife districts */
const AREAS = ["渋谷", "恵比寿", "中目黒", "六本木", "西麻布", "銀座", "新宿"];

/* ══════════════════════════════════════════════════════════════
   相席（グループ飲み会）の前提
   ・1つの会は「ホスト側2名以上」×「参加側2名以上」でのみ成立（1対1は不可）
   ・相席はオープンスペースのみ。個室は選択できない
   ・20歳以上限定（飲酒を伴うため）
   ・店側は接待をしない／サクラを置かない（風営法上の風俗営業に該当しない）
   ・参加者の個人プロフィールは、参加が承認されたメンバーにのみ表示
   ・性別による制限なし（同性グループ同士でも参加可）
   ══════════════════════════════════════════════════════════════ */
const MIN_GROUP = api.MIN_GROUP_SIZE;
const MIN_AGE = api.MIN_AGE;
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
  <div className="app-tabbar" style={{
    display: "flex", alignItems: "flex-end", padding: "9px 10px 12px", flexShrink: 0,
    background: "linear-gradient(180deg, rgba(11,16,32,0.55), rgba(5,8,15,0.94))",
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
              background: C.primaryGrad, color: "#241a06",
              boxShadow: "0 12px 26px rgba(176,138,60,0.5), inset 0 1px 0 rgba(255,255,255,0.65), 0 0 0 5px #0a0e1c",
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
          color: on ? C.primary : C.textMuted,
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

/* ════════════════════════════════════════════ 同伴者の登録フィールド
   グループの人数分だけ「席」を作るため、代表者を除く同伴者の
   ニックネームをここで登録する。空欄でも既定名で席は作られる。 */
const MemberNamesField = ({ size, names, onChange, label, hint }) => {
  const count = Math.max(Number(size) - 1, 0);
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 17 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "grid", gap: 8 }}>
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            value={names[i] ?? ""}
            maxLength={20}
            onChange={(e) => {
              const next = [...names];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`${i + 2}人目のニックネーム`}
            style={fieldStyle}
          />
        ))}
      </div>
      {hint && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 10.5, color: C.textMuted, lineHeight: 1.65 }}>
          <UsersRound size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
          {hint}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════ 招待コードで席を引き受ける
   代表者が登録した同伴者の席を、同伴者本人のアカウントに紐づける。
   これでグループチャットとメンバー一覧が見えるようになる。 */
const InviteCodeCard = ({ onJoined }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) { toast.error("招待コードを入力してください。"); return; }
    setBusy(true);
    try {
      const r = await api.claimSeat(code);
      setCode("");
      setOpen(false);
      toast.success(`「${r?.title ?? "会"}」に参加しました。`);
      onJoined?.(r?.party_id);
    } catch (e) {
      toast.error("参加できませんでした: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...card, padding: open ? 16 : "12px 16px", marginTop: 12 }}>
      <button className="press" onClick={() => setOpen((v) => !v)} style={{
        width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 9, color: C.text, textAlign: "left",
      }}>
        <span style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
        }}><Ticket size={14} strokeWidth={1.9} /></span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3 }}>招待コードで参加する</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>{open ? "閉じる" : "同伴者の方はこちら"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 13 }}>
          <div style={{ display: "flex", gap: 9 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
              placeholder="例: A1B2C3D4"
              maxLength={8}
              style={{ ...fieldStyle, letterSpacing: 2, fontFamily: FONT_DISPLAY, fontWeight: 700 }}
            />
            <button className="lux-cta" onClick={submit} disabled={busy} style={{ ...popBtn, padding: "0 18px", borderRadius: 999, fontSize: 13.5, flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
              {busy ? "…" : "参加"}
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 9, lineHeight: 1.65 }}>
            グループの代表者から受け取った8桁のコードを入力すると、その会のグループチャットに参加できます。
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════ Featured (hero) card */
const FeaturedCard = ({ p, onTap }) => (
  <div className="lux-card" onClick={onTap} style={{
    ...card, borderRadius: 22, padding: 0, marginBottom: 16, cursor: "pointer", overflow: "hidden", position: "relative",
    border: `1px solid ${C.linePrimary}`,
  }}>
    {/* ambient header */}
    <div style={{
      position: "relative", height: 128, overflow: "hidden",
      background:
        "radial-gradient(120% 130% at 82% -10%, rgba(168,32,58,0.55), transparent 60%)," +
        "radial-gradient(120% 130% at 12% 120%, rgba(232,201,135,0.22), transparent 62%)," +
        "linear-gradient(135deg, #1b2340 0%, #0a0e1c 100%)",
    }}>
      <div style={{ position: "absolute", top: 14, left: 16 }}>
        <Eyebrow style={{ letterSpacing: 2, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>◆ 本日のおすすめ</Eyebrow>
      </div>
      <div style={{ position: "absolute", top: 12, right: 14 }}><TreatBadge treat={p.treat_type} /></div>
      <div style={{ position: "absolute", left: 16, bottom: -22, width: 66, height: 66, borderRadius: 33, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
        background: "linear-gradient(150deg, #1a2340 0%, #0c1122 100%)",
        border: `1px solid ${C.linePrimary}`, boxShadow: "0 10px 24px rgba(0,0,0,0.6)" }}>
        {partyEmoji(p.id)}
      </div>
    </div>

    <div style={{ padding: "30px 18px 18px" }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 600, color: C.text, letterSpacing: 0.3, lineHeight: 1.3 }}>{p.title}</div>
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
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: 0.2, marginBottom: 3 }}>参加ポイント / 1名</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, lineHeight: 1, ...brandText }}>
            {p.point_request}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span>
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: C.primaryDeep, letterSpacing: 0.5 }}>
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
    <div className="lux-card" onClick={onTap} style={{ ...card, padding: 15, marginBottom: 12, cursor: "pointer", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 18, right: 18, height: 1, background: "linear-gradient(90deg, transparent, rgba(232,201,135,0.38), transparent)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 11 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <AvatarBubble size={48}>{partyEmoji(p.id)}</AvatarBubble>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 15.5, color: C.text, letterSpacing: 0.2, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
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
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, ...brandText }}>{p.point_request}<span style={{ fontSize: 10.5, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Home */
const HomeScreen = ({ user, onDetail, onCreate }) => {
  const { toast, confirm } = useToast();
  const [area, setArea] = useState(null);
  const [parties, setParties] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyReq, setBusyReq] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ps, reqs] = await Promise.all([
        api.listParties(area),
        api.listIncomingRequests(user.id),
      ]);
      setParties(ps.filter((p) => p.host_id !== user.id));
      setIncoming(reqs);
    } catch (e) {
      console.error(e);
      setLoadError(
        /failed to fetch|load failed|networkerror/i.test(e.message || "")
          ? "通信できませんでした。電波の良い場所でもう一度お試しください。"
          : "会の一覧を読み込めませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }, [area, user.id]);

  useEffect(() => { load(); }, [load]);

  const respond = async (id, status) => {
    if (status === "rejected") {
      const ok = await confirm({
        title: "このリクエストを見送りますか？",
        message: "見送ると、申し込んだグループには「見送り」として通知されます。取り消しはできません。",
        confirmLabel: "見送る",
        danger: true,
      });
      if (!ok) return;
    }
    setBusyReq(id);
    try {
      await api.respondJoinRequest(id, status);
      toast.success(status === "accepted" ? "参加を承認しました。グループチャットが始まります。" : "リクエストを見送りました。");
      await load();
    } catch (e) {
      toast.error("処理に失敗しました: " + e.message);
    } finally {
      setBusyReq(null);
    }
  };

  const [featured, ...rest] = parties;

  return (
    <div>
      {/* editorial greeting */}
      <div style={{ padding: "16px 20px 2px" }}>
        <Eyebrow style={{ color: C.textMuted }}>{greeting()}</Eyebrow>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 21, fontWeight: 600, color: C.text, letterSpacing: 0.4, marginTop: 3 }}>
          今夜は、どのグループと。
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10,
          padding: "5px 12px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          color: C.primaryDeep, background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`,
        }}>
          <UsersRound size={12} strokeWidth={2} /> {MIN_GROUP}名以上のグループ同士 · オープンスペースのみ · {MIN_AGE}歳以上
        </div>

        {/* 代表者から招待コードを受け取った同伴者の入口 */}
        <InviteCodeCard onJoined={(id) => { if (id) onDetail(id); else load(); }} />
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
                  ? { ...popBtn, borderRadius: 999, boxShadow: "0 6px 16px rgba(176,138,60,0.4), inset 0 1px 0 rgba(255,255,255,0.55)" }
                  : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
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
              <div key={r.id} className="rise" style={{ ...card, padding: 16, marginBottom: 10, animationDelay: `${i * 60}ms`,
                background: "linear-gradient(135deg, rgba(168,32,58,0.30), rgba(232,201,135,0.07))", border: `1px solid ${C.linePrimary}` }}>
                {/* 承認前に表示するのは代表者のニックネームとグループ人数のみ。
                    顔写真・年齢などのプロフィールは承認後にのみ閲覧できる。 */}
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11 }}>
                  <AvatarBubble size={44}><UsersRound size={20} strokeWidth={1.7} color={C.primary} /></AvatarBubble>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>
                      <b style={{ color: C.primaryDeep, fontWeight: 700 }}>{r.applicant_name || "ゲスト"}</b>
                      <span style={{ color: C.textMuted, fontSize: 11.5 }}> さんのグループ（{size}名）</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textSec }}>「{r.party?.title}」への参加希望</div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: C.textSec, marginBottom: 9, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Gem size={12} strokeWidth={1.8} color={C.primary} /> 承認すると <b style={{ color: C.primaryDeep }}>{(pt * size).toLocaleString()}pt</b> を受け取ります
                  <span style={{ color: C.textMuted }}>（{pt.toLocaleString()}pt × {size}名）</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 13, display: "flex", alignItems: "flex-start", gap: 5, lineHeight: 1.6 }}>
                  <Lock size={11} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 2 }} />
                  メンバーのプロフィールは、承認後に会の画面で確認できます。
                </div>
                <div style={{ display: "flex", gap: 9 }}>
                  <button className="lux-cta" disabled={busyReq === r.id} onClick={() => respond(r.id, "accepted")} style={{ ...popBtn, flex: 1, padding: "11px 0", borderRadius: 999, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busyReq === r.id ? 0.6 : 1 }}>
                    {busyReq === r.id ? "処理中…" : <><Check size={15} strokeWidth={2.5} /> 承認する</>}
                  </button>
                  <button className="press" disabled={busyReq === r.id} onClick={() => respond(r.id, "rejected")} style={{ ...ghostBtn, flex: 1, padding: "11px 0", borderRadius: 999, fontSize: 13, opacity: busyReq === r.id ? 0.6 : 1 }}>見送る</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* feed */}
      <div style={{ padding: "12px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <Eyebrow style={{ color: C.textMuted }}>本日の募集中の会</Eyebrow>
          <span style={{ fontSize: 11.5, color: C.textFaint, fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: 0.5 }}>{loading ? "…" : `${parties.length} groups`}</span>
        </div>
        {loading ? <SkeletonList count={3} /> : loadError ? (
          <EmptyState
            icon={<XCircle size={24} strokeWidth={1.6} />}
            action={
              <button className="press" onClick={load} style={{ ...ghostBtn, padding: "11px 26px", fontSize: 13 }}>
                もう一度読み込む
              </button>
            }
          >
            {loadError}
          </EmptyState>
        ) : parties.length === 0 ? (
          <EmptyState
            icon={<Wine size={24} strokeWidth={1.6} />}
            action={
              <button className="lux-cta" onClick={onCreate} style={{
                ...popBtn, padding: "12px 26px", fontSize: 13.5,
                display: "inline-flex", alignItems: "center", gap: 7,
              }}>
                <Plus size={15} strokeWidth={2.4} /> 会を主催する
              </button>
            }
          >
            {area ? `${area}で募集中の会は、いまのところありません。` : "募集中の会はまだありません。"}
            <br />あなたの会を主催してみませんか。
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
const DetailScreen = ({ user, partyId, onBack, onGoPoints, onCancelled }) => {
  const { toast, confirm } = useToast();
  const [party, setParty] = useState(null);
  const [members, setMembers] = useState([]);
  const [mySeats, setMySeats] = useState([]);     // 自分のグループの席（招待コード付き）
  const [balance, setBalance] = useState(null);
  const [reqStatus, setReqStatus] = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [groupSize, setGroupSize] = useState(MIN_GROUP); // 申し込むグループの人数（2名以上）
  const [guestNames, setGuestNames] = useState([]);      // 同伴者のニックネーム
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    const [p, ms, bal, req] = await Promise.all([
      api.getParty(partyId),
      api.getPartyMembers(partyId),
      api.getBalance(user.id),
      api.getMyJoinRequest(user.id, partyId),
    ]);
    setParty(p);
    setMembers(ms);
    setBalance(bal);
    setReqStatus(req?.status ?? null);
    // 自分がこの会のメンバーのときだけ、自分のグループの招待コードを取得する
    if (ms.some((m) => m.user_id === user.id)) {
      try { setMySeats(await api.listMySeats(partyId)); }
      catch (e) { console.error(e); setMySeats([]); }
    } else {
      setMySeats([]);
    }
  }, [partyId, user.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { await load(); } catch (e) { if (alive) console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [load]);

  const sendRequest = async () => {
    setSending(true);
    try {
      await api.sendJoinRequest(user.id, party.id, groupSize, guestNames);
      setReqStatus("pending");
      toast.success("参加リクエストを送りました。ホストの承認をお待ちください。");
    } catch (e) {
      toast.error("リクエスト送信に失敗しました: " + e.message);
    } finally {
      setSending(false);
    }
  };

  /* ホストによる取り消し。まだ1組も承認していない会だけ取り消せる
     （承認済みの会を取り消せると、受け取ったポイントを返さずに
       中止できてしまうため。判定は DB 側の cancel_party が行う） */
  const cancel = async () => {
    const ok = await confirm({
      title: "この会を取り消しますか？",
      message: "募集を取り下げ、届いている参加リクエストはすべて見送りになります。取り消したあとは元に戻せません。",
      confirmLabel: "会を取り消す",
      danger: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await api.cancelParty(party.id);
      toast.success("会を取り消しました。");
      onCancelled?.();
    } catch (e) {
      toast.error("取り消せませんでした: " + e.message);
    } finally {
      setCancelling(false);
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`招待コード ${code} をコピーしました。`);
    } catch {
      // クリップボードが使えない環境（http / 権限なし）ではコードを読み上げる
      toast.info(`招待コード: ${code}`);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "0 20px" }}>
        <BackButton onBack={onBack} />
        <div style={{ ...card, overflow: "hidden" }}>
          <Skeleton w="100%" h={96} r={0} />
          <div style={{ padding: "24px 22px" }}>
            <Skeleton w="70%" h={20} />
            <Skeleton w="52%" h={12} style={{ marginTop: 12 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 22 }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={62} r={14} />)}
            </div>
            <Skeleton h={48} r={999} style={{ marginTop: 20 }} />
          </div>
        </div>
      </div>
    );
  }
  if (!party) return <div style={{ padding: "0 20px" }}><BackButton onBack={onBack} /><EmptyState icon={<XCircle size={24} strokeWidth={1.6} />}>会が見つかりませんでした。<br />取り消された可能性があります。</EmptyState></div>;

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
  const cancelled = party.status === "cancelled";
  // ゲスト側の席が1つでも埋まっていたら、ホストはもう取り消せない
  const hasGuests = members.some((m) => m.side === "guest");
  const INFO = [
    { label: "場所", value: [party.location, party.area && `（${party.area}）`].filter(Boolean).join("") || "未定", icon: MapPin },
    { label: "時間", value: party.party_time || "未定", icon: Clock },
    { label: "参加人数", value: `${party.current_members}/${party.max_members}名`, icon: Users },
    { label: "グループ構成", value: `ホスト${hostGroup}名 × 募集${guestGroup}名`, icon: UsersRound },
    // 席は常にオープンスペース（個室での相席は提供しない）
    { label: "席", value: "オープンスペース", icon: DoorClosed },
    { label: "年齢", value: `${MIN_AGE}歳以上限定`, icon: ShieldCheck },
  ];

  return (
    <div style={{ padding: "0 20px 24px" }}>
      <BackButton onBack={onBack} />
      <div className="fade" style={{ ...card, overflow: "hidden" }}>
        <div style={{
          height: 96, position: "relative",
          background:
            "radial-gradient(120% 130% at 82% -10%, rgba(168,32,58,0.5), transparent 60%)," +
            "radial-gradient(120% 130% at 10% 120%, rgba(232,201,135,0.20), transparent 62%)," +
            "linear-gradient(135deg, #1b2340 0%, #0a0e1c 100%)",
        }}>
          <div style={{ position: "absolute", top: 14, right: 16 }}><TreatBadge treat={party.treat_type} /></div>
          <div style={{ position: "absolute", left: 22, bottom: -28, width: 66, height: 66, borderRadius: 33, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
            background: "linear-gradient(150deg, #1a2340 0%, #0c1122 100%)", border: `1px solid ${C.linePrimary}`, boxShadow: "0 10px 24px rgba(0,0,0,0.6)" }}>
            {partyEmoji(party.id)}
          </div>
        </div>

        <div style={{ padding: "38px 22px 22px" }}>
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: C.text, letterSpacing: 0.4, lineHeight: 1.3 }}>{party.title}</h2>
          {/* 公開されるのは会の情報とホストのニックネームまで */}
          <p style={{ fontSize: 12.5, color: C.textSec, margin: "0 0 8px", letterSpacing: 0.3 }}>
            {[party.host_name && `ホスト: ${party.host_name}`, `${hostGroup}名グループが${guestGroup}名グループを募集中`].filter(Boolean).join(" · ")}
          </p>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 22 }}>
            <Tag>グループ飲み会</Tag>
            <Tag>同性グループもOK</Tag>
            <Tag>オープンスペース</Tag>
            <Tag>{MIN_AGE}歳以上</Tag>
          </div>

          {!canSeeMembers && (
            <div style={{
              display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 22,
              background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`, borderRadius: 15, padding: "14px 16px",
            }}>
              <span style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
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
              <Eyebrow style={{ marginBottom: 14 }}>
                参加メンバー（{members.length}名）
              </Eyebrow>
              <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
                {members.map((m) => {
                  const prof = m.profiles || {};
                  // user_id が null の席 = まだアプリに登録していない同伴者
                  const claimed = !!m.user_id;
                  const name = prof.username || m.display_name || "メンバー";
                  return (
                    <div key={m.id} style={{ textAlign: "center", flexShrink: 0, width: 74 }}>
                      <div style={{
                        position: "relative", width: 68, height: 68, margin: "0 auto", borderRadius: 34, padding: 2,
                        background: claimed ? C.primaryGrad : "rgba(232,201,135,0.14)",
                        boxShadow: claimed ? "0 6px 16px rgba(0,0,0,0.45)" : "none",
                        opacity: claimed ? 1 : 0.72,
                      }}>
                        {claimed && prof.avatar_url ? (
                          <img src={prof.avatar_url} alt={name} loading="lazy" style={{ width: "100%", height: "100%", borderRadius: 32, objectFit: "cover", display: "block", background: "#141c33" }} />
                        ) : (
                          <div style={{
                            width: "100%", height: "100%", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center",
                            background: "#141c33", color: claimed ? C.primary : C.textMuted,
                            border: claimed ? "none" : `1px dashed ${C.lineSoft}`,
                          }}>
                            {m.role === "host" ? <Crown size={24} strokeWidth={1.7} /> : <User size={24} strokeWidth={1.7} />}
                          </div>
                        )}
                        {m.role === "host" && (
                          <div style={{ position: "absolute", top: -4, right: -2, background: C.primaryGrad, borderRadius: 10, padding: "2px 3px", boxShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
                            <Crown size={11} strokeWidth={2.2} color="#241a06" />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: claimed ? C.text : C.textSec, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 10.5, color: C.textMuted }}>
                        {!claimed ? "招待中" : prof.age ? `${prof.age}歳` : (m.role === "host" ? "ホスト" : "")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 自分のグループの未登録席 … 同伴者に渡す招待コード */}
          {canSeeMembers && mySeats.some((s) => s.invite_code) && (
            <div style={{ marginBottom: 24, borderRadius: 16, padding: "15px 16px", background: "rgba(232,201,135,0.08)", border: `1px solid ${C.linePrimary}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Ticket size={14} strokeWidth={1.9} color={C.primary} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>同伴者を招待する</span>
              </div>
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.7, marginBottom: 12 }}>
                同伴者にコードを渡すと、その方のアカウントでグループチャットに参加できます。人数は既に確保されているため、渡しても会の人数は変わりません。
              </div>
              {mySeats.filter((s) => s.invite_code).map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderTop: `1px solid ${C.lineSoft}` }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.display_name}</span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: 2.5, ...brandText }}>{s.invite_code}</span>
                  <button className="press" onClick={() => copyCode(s.invite_code)} aria-label="コードをコピー" style={{
                    ...ghostBtn, padding: "6px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", flexShrink: 0,
                  }}><Copy size={13} strokeWidth={2} /></button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {INFO.map((item) => (
              <div key={item.label} style={{ background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: C.textMuted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  <item.icon size={13} strokeWidth={1.8} /> {item.label}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 取り消された会 */}
          {cancelled && (
            <div style={{
              display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 18,
              borderRadius: 15, padding: "14px 16px",
              background: "rgba(168,32,58,0.16)", border: "1px solid rgba(200,56,79,0.38)",
            }}>
              <XCircle size={16} strokeWidth={1.9} color={C.accentDeep} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12, color: C.accentDeep, lineHeight: 1.75 }}>
                この会はホストにより取り消されました。参加の申し込みはできません。
              </div>
            </div>
          )}

          {!cancelled && !isHost && !isMember && reqStatus !== "accepted" && reqStatus !== "pending" && !isFull && (
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
                        ...(on ? { ...popBtn, borderRadius: 999 } : { ...ghostBtn, borderRadius: 999 }),
                      }}>{n}名</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                  1対1でのマッチングは行っていません。残り{seatsLeft}名分の枠があります。
                  <br />同伴者を含め、参加者は全員{MIN_AGE}歳以上である必要があります。
                </div>
              </div>

              {/* 同伴者を登録して、人数分の席を確保する */}
              <MemberNamesField
                size={groupSize}
                names={guestNames}
                onChange={setGuestNames}
                label="一緒に参加する同伴者（あなた以外）"
                hint={`承認されると、この人数分の席がグループに確保されます。同伴者はあとで招待コードを使って自分のアカウントでグループチャットに参加できます。同伴者が${MIN_AGE}歳以上であることをご確認のうえ登録してください。`}
              />

              <div style={{
                borderRadius: 16, padding: 18, marginBottom: 18, position: "relative", overflow: "hidden",
                background: "linear-gradient(135deg, rgba(168,32,58,0.28), rgba(232,201,135,0.10))",
                border: `1px solid ${C.linePrimary}`,
              }}>
                <div style={{ fontSize: 10.5, color: C.textSec, fontWeight: 800, marginBottom: 6, letterSpacing: 0.2 }}>参加に必要なポイント（グループ合計）</div>
                <div style={{ fontSize: 32, fontWeight: 700, fontFamily: FONT_DISPLAY, lineHeight: 1, ...brandText }}>{cost.toLocaleString()}<span style={{ fontSize: 15, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 6 }}>{party.point_request.toLocaleString()}pt × {groupSize}名</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.lineSoft}` }}>
                  <span style={{ fontSize: 11, color: C.textSec }}>現在の残高</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: FONT_DISPLAY, color: enough ? C.primary : C.accent }}>
                    {(balance ?? 0).toLocaleString()} pt
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 7 }}>※ 参加するグループが支払うポイントです。承認されるとホストに支払われます。</div>
              </div>
            </>
          )}

          {isHost ? (
            <>
              <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "default" }}>
                <Crown size={16} strokeWidth={2} color={C.primary} />
                {cancelled ? "取り消し済みの会です" : "あなたが募集したグループ飲み会です"}
              </div>

              {/* 取り消しは、まだ1組も承認していない会だけ */}
              {!cancelled && (
                hasGuests ? (
                  <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 12, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
                    <Lock size={12} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 2 }} />
                    既に参加が承認されたグループがあるため、この会は取り消せません。中止したい場合はグループチャットでご相談ください。
                  </div>
                ) : (
                  <button className="press" onClick={cancel} disabled={cancelling} style={{
                    ...ghostBtn, width: "100%", padding: "13px 0", borderRadius: 999, fontSize: 13, marginTop: 10,
                    color: C.accentDeep, borderColor: "rgba(200,56,79,0.34)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                    opacity: cancelling ? 0.6 : 1,
                  }}>
                    {cancelling ? "取り消し中…" : <><XCircle size={15} strokeWidth={2} /> この会を取り消す</>}
                  </button>
                )
              )}
            </>
          ) : cancelled ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 14, textAlign: "center", cursor: "default", color: C.textMuted }}>
              この会は取り消されました
            </div>
          ) : isMember || reqStatus === "accepted" ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "default", color: C.primaryDeep }}>
              <Check size={17} strokeWidth={2.5} /> 参加済みです
            </div>
          ) : reqStatus === "pending" ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 14, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "default", color: C.primaryDeep }}>
              <Check size={17} strokeWidth={2.5} /> リクエスト送信済み（承認待ち）
            </div>
          ) : isFull ? (
            <div style={{ ...ghostBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 14, textAlign: "center", cursor: "default", color: C.textMuted }}>
              グループで参加できる枠が埋まりました
            </div>
          ) : !enough ? (
            <button className="press" onClick={onGoPoints} style={{
              ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <Gem size={16} strokeWidth={2.2} /> ポイントが不足しています（購入する）
            </button>
          ) : (
            <button className="lux-cta" onClick={sendRequest} disabled={sending} style={{
              ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15,
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
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [hostGroup, setHostGroup] = useState(MIN_GROUP);   // ホスト側グループの人数（2名以上）
  const [hostNames, setHostNames] = useState([]);          // ホスト側同伴者のニックネーム
  const [guestGroup, setGuestGroup] = useState(MIN_GROUP); // 募集するグループの人数（2名以上）
  const [time, setTime] = useState("20:00");
  const [treat, setTreat] = useState("奢り");
  const [points, setPoints] = useState(300);
  const [saving, setSaving] = useState(false);
  // 席の種別は「オープンスペース」固定。個室は選択できない（変更不可）。
  const roomType = api.ROOM_TYPE_OPEN;

  const submit = async () => {
    if (!title.trim()) { toast.error("会の名前を入力してください。"); return; }
    // グループ限定：1対1のマッチングは作成できない
    if (hostGroup < MIN_GROUP || guestGroup < MIN_GROUP) {
      toast.error(`相席は${MIN_GROUP}名以上のグループ同士のみのため、ホスト側・募集側ともに${MIN_GROUP}名以上で設定してください。`);
      return;
    }
    // 個室での相席は提供しない（オープンスペース以外は作成できない）
    if (roomType !== api.ROOM_TYPE_OPEN) {
      toast.error("相席はオープンスペースのみです。個室での会は作成できません。");
      return;
    }
    const pt = Number(points);
    if (!Number.isFinite(pt) || pt < 0) {
      toast.error("参加ポイントは0以上の数値で入力してください。");
      return;
    }
    if (pt > api.LIMITS.pointRequest) {
      toast.error(`参加ポイントは${api.LIMITS.pointRequest.toLocaleString()}pt以下で設定してください。`);
      return;
    }
    setSaving(true);
    try {
      const p = await api.createParty(user.id, {
        title: title.trim(),
        location: location.trim() || null,
        area: area.trim() || null,
        host_group_size: hostGroup,
        host_member_names: hostNames,
        guest_group_size: guestGroup,
        party_time: time,
        treat_type: treat,
        room_type: roomType,
        point_request: Number(points) || 0,
      });
      toast.success("会を公開しました。参加リクエストが届くとお知らせします。");
      onCreated(p.id);
    } catch (e) {
      toast.error("会の作成に失敗しました: " + e.message);
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
            ...(on ? { ...popBtn, borderRadius: 999 } : { ...ghostBtn, borderRadius: 999 }),
          }}>{n}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <SectionTitle sub="Host an evening">グループ相席を主催する</SectionTitle>

      {/* グループ限定・オープンスペース限定・20歳以上限定であることを作成画面でも明示 */}
      <div className="fade" style={{
        display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 14,
        borderRadius: 16, padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(232,201,135,0.13), rgba(168,32,58,0.16))",
        border: `1px solid ${C.linePrimary}`,
      }}>
        <span style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
        }}><UsersRound size={15} strokeWidth={1.9} /></span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>{MIN_GROUP}名以上のグループ同士 · オープンスペースのみ</div>
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
            1対1のマッチングは行えません。相席はフロア席・カウンター等のオープンスペースに限られ、個室での相席は作成できません。
            参加はご本人・同伴者ともに{MIN_AGE}歳以上に限られます。性別による制限はなく、同性グループ同士でも開催できます。
          </div>
        </div>
      </div>

      <div className="fade" style={{ ...card, padding: 22 }}>
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>会の名前</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={api.LIMITS.title} placeholder="例: 金曜の夜に、静かな一軒で" style={fieldStyle} />
        </div>
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>お店</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={api.LIMITS.location} placeholder="例: 恵比寿 / BAR TRENCH" style={fieldStyle} />
        </div>
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>エリア</label>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
            {AREAS.map((a) => {
              const on = area === a;
              return (
                <button key={a} className="chip" onClick={() => setArea(on ? "" : a)} style={{
                  padding: "7px 15px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  ...(on ? { ...popBtn, borderRadius: 999 } : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
                }}>{a}</button>
              );
            })}
          </div>
        </div>

        {/* 席の種別 … オープンスペース固定。個室は選択不可（押せない）。 */}
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>席の種別</label>
          <div style={{ display: "grid", gap: 8 }}>
            {api.ROOM_TYPES.map((r) => {
              const on = r.allowed && roomType === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  // 選択できない項目も押せるようにして、理由を伝える（状態は変わらない）
                  aria-disabled={!r.allowed}
                  onClick={() => {
                    if (!r.allowed) toast.info("個室での相席は提供していません。相席はオープンスペースのみです。");
                  }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
                    padding: "12px 14px", borderRadius: 12, cursor: r.allowed ? "default" : "not-allowed",
                    // 2行になる選択肢なので、丸みは大きめの角丸にとどめる
                    ...(on
                      ? { ...popBtn, borderRadius: 18 }
                      : { ...ghostBtn, borderRadius: 18, opacity: 0.5 }),
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: 1, display: "flex" }}>
                    {r.allowed ? <Check size={15} strokeWidth={2.6} /> : <Ban size={15} strokeWidth={2.2} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>
                      {r.label}{r.allowed ? "" : "（選択できません）"}
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, lineHeight: 1.6, marginTop: 2, opacity: 0.85 }}>
                      {r.note}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 10.5, color: C.textMuted, lineHeight: 1.65 }}>
            <DoorClosed size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            相席は、店内を見渡せるオープンスペースでのみ行います。個室・半個室での相席は提供しません。
          </div>
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>ホスト側のグループ人数（あなたを含む · {MIN_GROUP}名以上）</label>
          <GroupPicker value={hostGroup} onChange={setHostGroup} />
        </div>

        {/* 同伴者を登録して、人数分の席を確保する */}
        <MemberNamesField
          size={hostGroup}
          names={hostNames}
          onChange={setHostNames}
          label="一緒に参加する同伴者（あなた以外）"
          hint={`会を作成すると、この人数分の席がグループに確保されます。作成後に表示される招待コードを渡すと、同伴者も自分のアカウントでグループチャットに参加できます。同伴者が${MIN_AGE}歳以上であることをご確認のうえ登録してください。`}
        />

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>募集するグループの人数（{MIN_GROUP}名以上）</label>
          <GroupPicker value={guestGroup} onChange={setGuestGroup} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, padding: "10px 13px", borderRadius: 12, background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 11.5, color: C.textSec }}>合計人数</span>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_DISPLAY, ...brandText }}>
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
                  ...(on ? { ...popBtn, borderRadius: 999 } : { ...ghostBtn, borderRadius: 999 }),
                }}>{t === "奢り" ? "◆ 奢り" : "割り勘"}</button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>参加ポイント（参加グループが支払う／1人あたり）</label>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <input type="number" min={0} max={api.LIMITS.pointRequest} step={50} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} style={fieldStyle} />
            <span style={{ fontSize: 14, color: C.primaryDeep, fontWeight: 700 }}>pt</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
            <Gem size={13} strokeWidth={1.8} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            募集する側（あなた）にポイントはかかりません。グループの参加が承認されるたび、人数分のポイントを受け取れます。
          </div>
        </div>

        <button className="lux-cta" onClick={submit} disabled={saving} style={{ ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: saving ? 0.7 : 1 }}>
          {saving ? "作成中…" : <><Sparkles size={16} strokeWidth={2} /> この会を公開する</>}
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Points
   購入は Stripe Checkout に遷移して行う。
   ポイントの付与は支払い完了後にサーバ（/api/stripe/webhook）が行うため、
   この画面から残高が増えることはない。 */
const PointsScreen = ({ user, checkoutResult, onCheckoutHandled }) => {
  const { toast, confirm } = useToast();
  const [tab, setTab] = useState("buy");
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [convertAmt, setConvertAmt] = useState(1000);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([api.getBalance(user.id), api.getPointHistory(user.id)]);
      setBalance(b);
      setHistory(h);
      return b;
    } catch (e) { console.error(e); return null; }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  /* 決済から戻ってきたとき。
     Webhook の到着が数秒遅れることがあるので、残高が動くまで数回ためす。 */
  useEffect(() => {
    if (!checkoutResult) return;
    onCheckoutHandled?.();
    if (checkoutResult === "cancel") {
      setNotice("購入をキャンセルしました。");
      return;
    }
    let alive = true;
    setNotice("お支払いを確認しています…");
    (async () => {
      const before = await load();
      for (let i = 0; i < 6 && alive; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!alive) return;
        const now = await load();
        if (now !== null && before !== null && now > before) {
          setNotice("ポイントを追加しました。ありがとうございます。");
          return;
        }
      }
      if (alive) setNotice("お支払いの確認に時間がかかっています。少し経ってから残高をご確認ください。");
    })();
    return () => { alive = false; };
  }, [checkoutResult, load, onCheckoutHandled]);

  // Stripe の決済ページへ移動する（成功後この画面に戻ってくる）
  const buy = async (pack) => {
    setBusy(true);
    setNotice("");
    try {
      const url = await api.createCheckoutSession(pack.id);
      window.location.href = url;
    } catch (e) {
      toast.error("決済ページを開けませんでした: " + e.message);
      setBusy(false);
    }
  };

  const convert = async () => {
    const amt = Number(convertAmt);
    if (!balance || amt > balance) { toast.error("残高が不足しています。"); return; }
    const converted = Math.floor(amt * 0.85);
    const ok = await confirm({
      title: `${amt.toLocaleString()}pt を変換しますか？`,
      message: `${converted.toLocaleString()}オリパpt になります（手数料15%）。変換したポイントは元に戻せません。`,
      confirmLabel: "変換する",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.convertPoints(amt, `オリパpt変換（${converted}オリパpt）`);
      await load();
      toast.success(`${converted.toLocaleString()}オリパptに変換しました。`);
    } catch (e) { toast.error("変換に失敗しました: " + e.message); }
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
        borderRadius: 26, padding: "26px 24px", marginBottom: 18, position: "relative", overflow: "hidden",
        background: C.primaryGrad,
        border: "none", boxShadow: "0 18px 38px rgba(176,138,60,0.34), inset 0 1px 0 rgba(255,255,255,0.6)",
      }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 62, background: "linear-gradient(90deg, rgba(255,255,255,0.42), transparent)", animation: "sheen 5.5s ease-in-out infinite" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(36,26,6,0.72)", marginBottom: 10, letterSpacing: 2.2, fontWeight: 600, textTransform: "uppercase" }}>
              <Gem size={12} strokeWidth={2.2} /> Point Balance
            </div>
            <div style={{ fontSize: 46, fontWeight: 600, fontFamily: FONT_DISPLAY, lineHeight: 1, marginBottom: 8, color: "#241a06" }}>
              {balance === null ? "…" : balance.toLocaleString()}<span style={{ fontSize: 17, fontWeight: 500, fontFamily: FONT_BODY }}> pt</span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(36,26,6,0.78)", fontWeight: 500, letterSpacing: 0.4 }}>グループ相席のご参加に使えるポイント</div>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(36,26,6,0.14)", border: "1px solid rgba(36,26,6,0.28)", color: "#241a06" }}>
            <Gem size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {/* 決済から戻ってきたときの案内 */}
      {notice && (
        <div className="fade" style={{
          display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 16,
          borderRadius: 14, padding: "12px 15px", fontSize: 12, lineHeight: 1.7,
          color: C.primaryDeep, background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`,
        }}>
          <Gem size={14} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button className="press" onClick={() => setNotice("")} aria-label="閉じる" style={{
            background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 0, fontSize: 11, flexShrink: 0,
          }}>閉じる</button>
        </div>
      )}

      {/* segmented tabs */}
      <div style={{ display: "flex", gap: 7, marginBottom: 18, background: "rgba(255,255,255,0.045)", padding: 4, borderRadius: 14, border: `1px solid ${C.lineSoft}` }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} className="press" onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              ...(on ? { background: C.primaryGrad, color: "#241a06", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" } : { background: "transparent", color: C.textSec }),
            }}><t.icon size={14} strokeWidth={2} />{t.label}</button>
          );
        })}
      </div>

      {tab === "buy" && (
        <div className="fade" style={{ ...card, padding: 22 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Buy Points</Eyebrow>
          {POINT_PACKS.map((p, i, arr) => {
            const bonus = packBonus(p);
            return (
              <div key={p.id} className="lux-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 6px", margin: "0 -6px", borderRadius: 10, borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text }}>{p.points.toLocaleString()}<span style={{ fontSize: 11, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></span>
                  {bonus > 0 && <Tag>+{bonus.toLocaleString()} ボーナス</Tag>}
                  {p.popular && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: "#241a06", background: C.primaryGrad, padding: "2px 10px", borderRadius: 999, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>人気</span>}
                </div>
                <button className="lux-cta" onClick={() => buy(p)} disabled={busy} style={{ ...popBtn, padding: "9px 17px", borderRadius: 999, fontSize: 13, opacity: busy ? 0.6 : 1 }}>¥{p.price.toLocaleString()}</button>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 10.5, color: C.textMuted, marginTop: 14, lineHeight: 1.7 }}>
            <CreditCard size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              お支払いは Stripe の決済ページで行います。カード情報が AISEKI に保存されることはありません。
              支払いが完了すると、自動でポイントが追加されます。
            </span>
          </div>
        </div>
      )}

      {tab === "convert" && (
        <div className="fade" style={{ ...card, padding: 22 }}>
          <Eyebrow style={{ marginBottom: 16 }}>オリパpt 変換</Eyebrow>
          <div style={{ background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`, borderRadius: 15, padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.5 }}>変換元</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text }}>{Number(convertAmt).toLocaleString()}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
              </div>
              <ArrowRight size={22} strokeWidth={1.8} color={C.primary} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: C.textMuted, letterSpacing: 0.5 }}>オリパpt</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT_DISPLAY, ...brandText }}>{Math.floor(convertAmt * 0.85).toLocaleString()}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: C.textMuted, textAlign: "center" }}>変換レート 1pt → 0.85オリパpt（手数料15%）</div>
          </div>
          <input type="range" min={100} max={Math.max(100, balance || 100)} step={50} value={convertAmt} onChange={(e) => setConvertAmt(Number(e.target.value))} style={{ width: "100%", marginBottom: 18 }} />
          <button className="lux-cta" onClick={convert} disabled={busy} style={{ ...popBtn, width: "100%", padding: "15px 0", borderRadius: 999, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
            <Repeat size={16} strokeWidth={2} /> 変換する
          </button>
        </div>
      )}

      {tab === "history" && (
        <div className="fade" style={{ ...card, padding: 22 }}>
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
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, color: up ? C.primary : C.accent }}>{up ? "+" : ""}{h.amount.toLocaleString()}<span style={{ fontSize: 10.5, fontFamily: FONT_BODY, fontWeight: 600 }}>pt</span></div>
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
        background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`,
      }}>
        <UsersRound size={14} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.7 }}>
          チャットは会に参加したメンバー全員のグループチャットのみです。個人間のダイレクトメッセージ機能はありません。
        </span>
      </div>
      {loading ? <SkeletonList count={3} /> : rooms.length === 0 ? (
        <EmptyState icon={<MessageCircle size={24} strokeWidth={1.6} />}>
          参加中の会がありません。<br />会を主催するか、参加リクエストが承認されると<br />グループチャットが始まります。
        </EmptyState>
      ) : rooms.map((c, i) => {
        const matched = c.status === "matched";
        return (
          <div key={c.id} className="lux-card" onClick={() => openRoom(c)} style={{ ...card, display: "flex", gap: 13, alignItems: "center", padding: 15, marginBottom: 11, cursor: "pointer", animationDelay: `${i * 50}ms` }}>
            <AvatarBubble size={46}>{partyEmoji(c.id)}</AvatarBubble>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 14.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: matched ? C.primary : C.textMuted }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: matched ? C.primary : C.textFaint, animation: matched ? "pulseDot 1.8s ease-in-out infinite" : "none" }} />
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
  const { toast } = useToast();
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
    if (content.length > api.LIMITS.message) {
      toast.error(`メッセージは${api.LIMITS.message.toLocaleString()}文字以内で入力してください。`);
      return;
    }
    setText("");
    try {
      await api.sendMessage(party.id, user.id, content);
    } catch (e) {
      // 送信できなかった文面は入力欄に戻す（打ち直させない）
      toast.error("送信に失敗しました: " + e.message);
      setText(content);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 11, background: "linear-gradient(180deg, rgba(232,201,135,0.06), transparent)" }}>
        <button className="press" onClick={onBack} style={{ background: "none", border: "none", color: C.primaryDeep, cursor: "pointer", padding: 4, display: "flex" }}><ChevronLeft size={22} strokeWidth={2} /></button>
        <AvatarBubble size={38}>{partyEmoji(party.id)}</AvatarBubble>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 14.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{party.title}</div>
          <div style={{ fontSize: 10.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <UsersRound size={11} strokeWidth={1.9} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              グループチャット
              {[party.location, party.area].filter(Boolean).length > 0 && ` · ${[party.location, party.area].filter(Boolean).join(" · ")}`}
            </span>
          </div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {loading ? <Spinner /> : messages.length === 0 ? (
          <EmptyState icon={<MessageCircle size={22} strokeWidth={1.6} />}>まだメッセージはありません。<br />当日に向けて、最初のひとことを。</EmptyState>
        ) : messages.map((m) => {
          const mine = m.user_id === user.id;
          return (
            <div key={m.id} className="fade" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 11 }}>
              <div style={{ maxWidth: "76%" }}>
                {!mine && <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, marginLeft: 4 }}>{m.profiles?.username || "ゲスト"}</div>}
                <div style={{
                  padding: "10px 14px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.55, wordBreak: "break-word",
                  ...(mine
                    ? { background: C.primaryGrad, color: "#241a06", borderBottomRightRadius: 5, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 16px rgba(0,0,0,0.4)" }
                    : { background: "rgba(255,255,255,0.06)", color: C.text, border: `1px solid ${C.lineSoft}`, borderBottomLeftRadius: 5 }),
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
          maxLength={api.LIMITS.message}
          aria-label="メッセージ"
          placeholder="グループにメッセージを送る…" style={{ ...fieldStyle, borderRadius: 22 }}
        />
        <button className="press" onClick={send} aria-label="送信" style={{ ...popBtn, width: 44, height: 44, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          <Send size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ MyPage */
const MyPageScreen = ({ user, onTerms, onSupport, onReport }) => {
  const { toast, confirm } = useToast();
  const [profile, setProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [editing, setEditing] = useState(false);
  // 性別は取り扱わない（性別による制限を設けないため、入力・表示ともに行わない）
  const [form, setForm] = useState({ username: "", age: "", bio: "", avatar_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b] = await Promise.all([api.getProfile(user.id), api.getBalance(user.id)]);
      setProfile(p);
      setBalance(b);
      if (p) setForm({ username: p.username || "", age: p.age || "", bio: p.bio || "", avatar_url: p.avatar_url || "" });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  /* 顔写真のアップロード。
     選んだ画像をそのまま avatars バケットへ上げ、返ってきた公開URLを
     フォームに入れる（保存ボタンを押した時点でプロフィールに反映される）。 */
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";           // 同じファイルを選び直せるようにする
    if (!file) return;
    setUploading(true);
    try {
      const url = await api.uploadAvatar(user.id, file);
      const previous = form.avatar_url;
      setForm((f) => ({ ...f, avatar_url: url }));
      // 直前にこの画面で上げた写真が残っていれば消す（保存前の上げ直し分）
      if (previous && previous !== profile?.avatar_url) {
        api.removeAvatar(user.id, previous);
      }
      toast.success("写真をアップロードしました。「保存する」で反映されます。");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(user.id, {
        username: form.username,
        age: form.age === "" ? null : form.age,
        bio: form.bio,
        avatar_url: form.avatar_url,
      });
      // 差し替え前の写真がストレージ上のものなら消しておく（容量を無駄にしない）
      if (profile?.avatar_url && profile.avatar_url !== updated.avatar_url) {
        api.removeAvatar(user.id, profile.avatar_url);
      }
      setProfile(updated);
      setEditing(false);
      toast.success("プロフィールを保存しました。");
    } catch (e) { toast.error("保存に失敗しました: " + e.message); }
    finally { setSaving(false); }
  };

  const logout = async () => {
    const ok = await confirm({
      title: "ログアウトしますか？",
      message: "次回はメールアドレスとパスワードでログインが必要です。",
      confirmLabel: "ログアウト",
    });
    if (ok) await api.signOut();
  };

  /* 退会。ポイントが失効すること・元に戻せないことを必ず伝えてから実行する
     （利用規約 第15条）。念のため2段階で確認する。 */
  const withdraw = async () => {
    const first = await confirm({
      title: "本当に退会しますか？",
      message:
        `保有ポイント（${(balance ?? 0).toLocaleString()}pt）はすべて失効し、払い戻しはできません。` +
        "主催中の会は取り消され、プロフィール・チャットの発言も削除されます。",
      confirmLabel: "退会手続きへ進む",
      danger: true,
    });
    if (!first) return;
    const second = await confirm({
      title: "この操作は取り消せません",
      message: "アカウントを削除します。同じメールアドレスで新しく登録し直すことはできますが、これまでのデータは戻りません。",
      confirmLabel: "アカウントを削除する",
      danger: true,
    });
    if (!second) return;
    try {
      await api.deleteAccount();
      // 削除に成功すると onAuthStateChange がログイン前の画面へ戻す
    } catch (e) {
      toast.error("退会できませんでした: " + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "16px 20px 24px" }}>
        <div style={{ ...card, padding: 20, marginBottom: 16, display: "flex", gap: 15, alignItems: "center" }}>
          <Skeleton w={66} h={66} r={33} />
          <div style={{ flex: 1 }}>
            <Skeleton w="58%" h={18} />
            <Skeleton w="34%" h={11} style={{ marginTop: 9 }} />
          </div>
        </div>
        <div style={{ ...card, padding: 0 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "16px 18px", borderBottom: i < 3 ? `1px solid ${C.lineSoft}` : "none" }}>
              <Skeleton w="46%" h={13} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{ padding: "16px 20px 24px" }}>
        <SectionTitle sub="Edit profile">プロフィール編集</SectionTitle>
        <div className="fade" style={{ ...card, padding: 22 }}>
          {/* ── 顔写真 ── */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>顔写真</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 78, height: 78, borderRadius: 39, padding: 2, flexShrink: 0,
                background: C.primaryGrad, boxShadow: "0 8px 22px rgba(0,0,0,0.5)", position: "relative",
              }}>
                {form.avatar_url ? (
                  <img
                    src={form.avatar_url}
                    alt="プロフィール写真"
                    style={{ width: "100%", height: "100%", borderRadius: 37, objectFit: "cover", display: "block", background: "#141c33" }}
                  />
                ) : (
                  <div style={{
                    width: "100%", height: "100%", borderRadius: 37, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#141c33", color: C.primaryDeep,
                  }}><User size={32} strokeWidth={1.6} /></div>
                )}
                {uploading && (
                  <div style={{
                    position: "absolute", inset: 2, borderRadius: 37, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(5,8,15,0.72)",
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      border: `2px solid ${C.tintStrong}`, borderTopColor: C.primary,
                      animation: "spin 0.85s linear infinite",
                    }} />
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={api.AVATAR_MIME.join(",")}
                  onChange={pickPhoto}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="press"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    ...ghostBtn, width: "100%", padding: "11px 0", fontSize: 13,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  <Camera size={15} strokeWidth={2} />
                  {uploading ? "アップロード中…" : form.avatar_url ? "写真を変更" : "写真を選ぶ"}
                </button>
                {form.avatar_url && (
                  <button
                    type="button"
                    className="press"
                    onClick={() => setForm({ ...form, avatar_url: "" })}
                    style={{
                      width: "100%", background: "none", border: "none", cursor: "pointer",
                      padding: "9px 0 0", fontSize: 11.5, color: C.textMuted,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <Trash2 size={12} strokeWidth={1.9} /> 写真を削除
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 12, fontSize: 10.5, color: C.textMuted, lineHeight: 1.65 }}>
              <Lock size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
              JPEG・PNG・WebP、2MBまで。写真・名前・年齢は一覧には表示されず、同じ会に参加が承認されたメンバーにのみ公開されます。
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>ニックネーム</label>
            <input
              value={form.username}
              maxLength={api.LIMITS.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              style={fieldStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>年齢（{MIN_AGE}歳以上）</label>
            <input type="number" min={MIN_AGE} max={99} inputMode="numeric" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} style={fieldStyle} />
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 10.5, color: C.textMuted, lineHeight: 1.65 }}>
              <ShieldCheck size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 1 }} />
              本サービスは飲酒を伴うため{MIN_AGE}歳以上限定です。登録時の生年月日で年齢を確認しています。
            </div>
          </div>
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>自己紹介</label>
            <textarea
              value={form.bio}
              rows={3}
              maxLength={api.LIMITS.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="ひとこと"
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.8 }}
            />
            <div style={{ textAlign: "right", fontSize: 10, color: C.textFaint, marginTop: 5 }}>
              {form.bio.length} / {api.LIMITS.bio}
            </div>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button className="press" onClick={() => { setEditing(false); load(); }} style={{ ...ghostBtn, flex: 1, padding: "13px 0", borderRadius: 999, fontSize: 14 }}>キャンセル</button>
            <button className="lux-cta" onClick={save} disabled={saving || uploading} style={{ ...popBtn, flex: 1, padding: "13px 0", borderRadius: 999, fontSize: 14, opacity: saving || uploading ? 0.6 : 1 }}>{saving ? "保存中…" : "保存する"}</button>
          </div>
        </div>
      </div>
    );
  }

  const ROWS = [
    { icon: Gem, label: "ポイント残高", value: `${(balance ?? 0).toLocaleString()} pt`, highlight: true },
    { icon: Mail, label: "メール", value: user.email },
    { icon: Settings, label: "プロフィール編集", action: () => setEditing(true) },
    { icon: LifeBuoy, label: "お問い合わせ・ご意見", action: onSupport },
    { icon: ShieldAlert, label: "通報・違反の報告", action: onReport },
    { icon: FileText, label: "利用規約・プライバシーポリシー", action: onTerms },
    { icon: LogOut, label: "ログアウト", action: logout, danger: true },
  ];

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      {/* profile header */}
      <div className="fade" style={{ ...card, padding: 20, marginBottom: 16, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 90% -20%, rgba(168,32,58,0.22), transparent 58%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 15, position: "relative" }}>
          <div style={{ width: 66, height: 66, borderRadius: 33, padding: 2, background: C.primaryGrad, boxShadow: "0 8px 22px rgba(0,0,0,0.5)", flexShrink: 0 }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} style={{ width: "100%", height: "100%", borderRadius: 31, objectFit: "cover", display: "block", background: "#141c33" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: 31, display: "flex", alignItems: "center", justifyContent: "center", background: "#141c33", color: C.primaryDeep }}><User size={28} strokeWidth={1.6} /></div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 21, color: C.text, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.username || "ゲスト"}</div>
            <div style={{ fontSize: 12, color: C.textSec, letterSpacing: 0.5, marginTop: 2 }}>
              {profile?.age ? `${profile.age}歳` : "プロフィール未設定"}
            </div>
          </div>
          <button className="press" onClick={() => setEditing(true)} style={{ fontSize: 12, color: C.primaryDeep, background: "rgba(232,201,135,0.08)", border: `1px solid ${C.linePrimary}`, borderRadius: 20, padding: "6px 15px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>編集</button>
        </div>
        {profile?.bio && (
          <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.textSec, lineHeight: 1.7, position: "relative" }}>{profile.bio}</div>
        )}
      </div>

      <div className="fade" style={{ ...card, overflow: "hidden" }}>
        {ROWS.map((item, i, arr) => (
          <div key={i} className={item.action ? "lux-row" : ""} onClick={item.action} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none", cursor: item.action ? "pointer" : "default" }}>
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              <span style={{ display: "flex", color: item.highlight ? C.primary : item.danger ? C.accent : C.textSec }}><item.icon size={17} strokeWidth={1.8} /></span>
              <span style={{ fontSize: 14, color: item.danger ? C.accentDeep : C.text }}>{item.label}</span>
            </div>
            {item.value && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: item.highlight ? FONT_DISPLAY : FONT_BODY, ...(item.highlight ? brandText : { color: C.textSec }), maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</span>}
          </div>
        ))}
      </div>

      {/* ホーム画面への追加案内（未追加のときだけ出る） */}
      <InstallCard />

      {/* 退会（利用規約 第15条）。押し間違いを避けるため、控えめに置く。 */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button className="press" onClick={withdraw} style={{
          background: "none", border: "none", cursor: "pointer", padding: "8px 14px",
          fontSize: 11.5, color: C.textMuted, letterSpacing: 0.4,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>
          退会する（アカウントを削除）
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 9.5, color: C.textFaint, letterSpacing: 2, textTransform: "uppercase" }}>AISEKI · PREMIUM GROUP MATCHING</div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════ Footer
   どの画面からでも利用規約・プライバシーポリシーに到達できるようにする。
   あわせて、業態上の法的表示（許認可・年齢制限・接待/個室/サクラなし）を常時掲示する。 */
const AppFooter = ({ onTerms, onSupport }) => (
  <div style={{
    margin: "10px 20px 0", padding: "16px 0 20px",
    borderTop: `1px solid ${C.lineSoft}`, textAlign: "center",
  }}>
    <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
      <button className="press" onClick={onTerms} style={{
        background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
        fontSize: 11.5, fontWeight: 700, color: C.primaryDeep, letterSpacing: 0.5,
        fontFamily: FONT_BODY, display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        <FileText size={12.5} strokeWidth={2} /> 利用規約・プライバシー
      </button>
      {onSupport && (
        <button className="press" onClick={onSupport} style={{
          background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
          fontSize: 11.5, fontWeight: 700, color: C.primaryDeep, letterSpacing: 0.5,
          fontFamily: FONT_BODY, display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <LifeBuoy size={12.5} strokeWidth={2} /> お問い合わせ
        </button>
      )}
    </div>

    {/* 法的表示 */}
    <div style={{
      marginTop: 12, padding: "12px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.035)", border: `1px solid ${C.lineSoft}`,
      textAlign: "left",
    }}>
      {FOOTER_NOTICE.map((line, i) => (
        <div key={line} style={{
          display: "flex", gap: 7, alignItems: "flex-start",
          fontSize: 10, color: C.textMuted, lineHeight: 1.75, marginTop: i === 0 ? 0 : 6,
        }}>
          <ShieldCheck size={11} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{line}</span>
        </div>
      ))}
    </div>

    <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 0.2, marginTop: 11, lineHeight: 1.9, fontWeight: 500 }}>
      大人のグループ相席マッチング
      <br />
      © 2026 AISEKI
    </div>
  </div>
);

/* Shared back button */
const BackButton = ({ onBack }) => (
  <button className="press" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", fontSize: 13.5, color: C.primaryDeep, cursor: "pointer", padding: "14px 0", fontWeight: 600, letterSpacing: 0.4 }}>
    <ChevronLeft size={18} strokeWidth={2} /> 戻る
  </button>
);

/* 接続情報が未設定のときに出す画面（真っ白／無限ローディングを防ぐ） */
const ConfigErrorScreen = ({ message }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 34, textAlign: "center" }}>
    <span style={{ fontFamily: FONT_LOGO, fontSize: 30, fontWeight: 700, letterSpacing: 4, ...brandText }}>AISEKI</span>
    <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.text, letterSpacing: 0.5 }}>ただいまご利用いただけません</div>
    <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
      サーバーへの接続設定に問題があります。<br />お手数ですが、しばらく経ってから再度お試しください。
    </div>
    <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 6, lineHeight: 1.6 }}>{message}</div>
  </div>
);

/* ═══════════════════════════════════════════════════════ Root App */
/* Stripe から戻ってきたか（?checkout=success / ?checkout=cancel）を一度だけ読む。
   決済後はポイント画面を開いて、結果を知らせる。 */
const readCheckoutResult = () => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("checkout");
  return v === "success" || v === "cancel" ? v : null;
};

/* パスワード再設定メールから戻ってきたかを判定する。
   Supabase はリンク先に #access_token=…&type=recovery を付けて返す
   （バージョンによっては ?type=recovery のクエリ）。両方を見る。 */
const isRecoveryLink = () => {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return q.get("type") === "recovery" || h.get("type") === "recovery";
};

/* ベルアイコン。未読があるときだけ印を出す。
   通知の中身は listNotifications() が既存データから組み立てる。 */
const NotificationBell = ({ user, onOpen, refreshKey }) => {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const [items, seenAt] = [await api.listNotifications(user.id), api.loadSeenAt()];
        if (!alive) return;
        setUnread(items.filter((n) => !seenAt || new Date(n.at) > seenAt).length);
      } catch (e) {
        console.error(e);
      }
    };
    check();
    // 画面を開きっぱなしでも気づけるよう、ゆっくり見に行く
    const timer = setInterval(check, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [user.id, refreshKey]);

  return (
    <button
      className="press"
      onClick={onOpen}
      aria-label={unread > 0 ? `お知らせ（未読${unread}件）` : "お知らせ"}
      style={{
        background: "rgba(255,255,255,0.05)", border: `1px solid ${C.line}`, borderRadius: 20,
        width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: C.primaryDeep, position: "relative", boxShadow: C.shadowSoft, flexShrink: 0,
      }}
    >
      <Bell size={16} strokeWidth={1.8} />
      {unread > 0 && (
        <span style={{
          position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9,
          padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9.5, fontWeight: 700, fontFamily: FONT_BODY,
          background: C.accentGrad, color: "#fff2f4", boxShadow: "0 0 0 2px #0d1224",
        }}>{unread > 9 ? "9+" : unread}</span>
      )}
    </button>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [recovery, setRecovery] = useState(isRecoveryLink);
  const [authMode, setAuthMode] = useState(null);   // null = ランディングページ
  const [checkoutResult, setCheckoutResult] = useState(readCheckoutResult);
  const [tab, setTab] = useState(() => (readCheckoutResult() ? "points" : "home"));
  const [detailId, setDetailId] = useState(null);
  const [chatRoom, setChatRoom] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null); // 通知から開くとき（会の実体は後から引く）
  const [overlay, setOverlay] = useState(null);       // 'terms' | 'notifications' | 'support' | 'report'
  const [notifyKey, setNotifyKey] = useState(0);      // ベルの再計算トリガ

  useEffect(() => {
    if (configError) { setAuthReady(true); return; }
    // getSession() は保存済みトークンの更新でネットワークに出るため失敗しうる。
    // catch を付けないと authReady が立たず「起動中…」で永久に止まる。
    supabase.auth.getSession()
      .then(({ data }) => setSession(data?.session ?? null))
      .catch((err) => console.error("[aiseki] getSession 失敗:", err))
      .finally(() => setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!s) {
        setTab("home"); setDetailId(null); setChatRoom(null);
        setChatRoomId(null); setOverlay(null); setAuthMode(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* 決済結果を読み終えたら、アドレスバーから ?checkout=... を消す。
     リロードで案内が繰り返し出るのを防ぐ（履歴は増やさない）。 */
  const clearCheckoutParams = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("checkout")) return;
    url.searchParams.delete("checkout");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  /* 再設定用のトークンを URL に残さない（共有・履歴から漏らさない） */
  const clearRecoveryParams = useCallback(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  /* 通知から会のチャットを開く。会の実体を取ってからチャット画面へ渡す。 */
  const openChatByPartyId = useCallback(async (partyId) => {
    setChatRoomId(partyId);
    try {
      const p = await api.getParty(partyId);
      setChatRoom(p);
    } catch (e) {
      console.error(e);
    } finally {
      setChatRoomId(null);
    }
  }, []);

  const shell = (children) => (
    <div className="app-shell-outer">
      <div className="app-shell" style={{ fontFamily: FONT_BODY, color: C.text }}>
        <ToastProvider>{children}</ToastProvider>
      </div>
    </div>
  );

  if (configError) return shell(<ConfigErrorScreen message={configError} />);
  if (!authReady) {
    return shell(
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner label="起動中…" />
      </div>
    );
  }

  /* パスワード再設定 … 復旧セッションが張られている間だけ表示する */
  if (recovery) {
    return shell(
      <Suspense fallback={<Loading label="読み込み中…" />}>
        <ResetPasswordScreen onDone={() => { setRecovery(false); clearRecoveryParams(); setAuthMode("login"); }} />
      </Suspense>
    );
  }

  /* 未ログイン … まずサービス紹介（LP）、そこからログイン／新規登録へ */
  if (!session) {
    if (!authMode) {
      return (
        <Suspense fallback={
          <div className="app-shell-outer"><Spinner label="読み込み中…" /></div>
        }>
          <LandingScreen onStart={setAuthMode} />
        </Suspense>
      );
    }
    return shell(
      <Suspense fallback={<Loading label="読み込み中…" />}>
        <AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} />
      </Suspense>
    );
  }

  const user = session.user;

  if (chatRoom) {
    return shell(
      <ChatRoom
        user={user}
        party={chatRoom}
        onBack={() => { setChatRoom(null); setNotifyKey((k) => k + 1); }}
      />
    );
  }
  if (chatRoomId) {
    return shell(
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner label="チャットを開いています…" />
      </div>
    );
  }

  const backToApp = () => setOverlay(null);

  const renderScreen = () => {
    if (overlay === "terms") return <TermsScreen onBack={backToApp} />;
    if (overlay === "notifications") {
      return (
        <NotificationsScreen
          user={user}
          onBack={() => { backToApp(); setNotifyKey((k) => k + 1); }}
          onOpenParty={(id) => { setOverlay(null); setDetailId(id); }}
          onOpenChat={(id) => { setOverlay(null); openChatByPartyId(id); }}
        />
      );
    }
    if (overlay === "support" || overlay === "report") {
      return (
        <SupportScreen
          user={user}
          onBack={backToApp}
          initialKind={overlay === "report" ? "report" : "question"}
        />
      );
    }
    if (detailId) {
      return (
        <DetailScreen
          user={user}
          partyId={detailId}
          onBack={() => setDetailId(null)}
          onGoPoints={() => { setDetailId(null); setTab("points"); }}
          onCancelled={() => { setDetailId(null); setTab("home"); }}
        />
      );
    }
    switch (tab) {
      case "home": return <HomeScreen user={user} onDetail={setDetailId} onCreate={() => setTab("create")} />;
      case "create": return <CreateScreen user={user} onCreated={(id) => { setTab("home"); setDetailId(id); }} />;
      case "chat": return <ChatScreen user={user} openRoom={setChatRoom} />;
      case "points": return (
        <PointsScreen
          user={user}
          checkoutResult={checkoutResult}
          onCheckoutHandled={clearCheckoutParams}
        />
      );
      case "mypage": return (
        <MyPageScreen
          user={user}
          onTerms={() => setOverlay("terms")}
          onSupport={() => setOverlay("support")}
          onReport={() => setOverlay("report")}
        />
      );
      default: return <HomeScreen user={user} onDetail={setDetailId} onCreate={() => setTab("create")} />;
    }
  };

  return shell(
    <>
      <div className="app-topbar" style={{
        padding: "15px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${C.line}`, background: "linear-gradient(180deg, rgba(232,201,135,0.09), transparent)",
        flexShrink: 0,
      }}>
        <button
          className="press"
          onClick={() => { setTab("home"); setDetailId(null); setOverlay(null); }}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            display: "flex", alignItems: "baseline", gap: 8, minWidth: 0,
          }}
        >
          <span style={{ fontFamily: FONT_LOGO, fontSize: 26, fontWeight: 600, letterSpacing: 3.5, ...brandText }}>AISEKI</span>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 10.5, color: C.textMuted, letterSpacing: 1, fontWeight: 500, whiteSpace: "nowrap" }}>大人のグループ相席</span>
        </button>
        <NotificationBell user={user} refreshKey={notifyKey} onOpen={() => { setDetailId(null); setOverlay("notifications"); }} />
      </div>

      <div className="app-body">
        <Suspense fallback={<Loading label="読み込み中…" />}>{renderScreen()}</Suspense>
        {overlay !== "terms" && <AppFooter onTerms={() => setOverlay("terms")} onSupport={() => setOverlay("support")} />}
      </div>

      <TabBar
        active={tab}
        onTab={(t) => { setTab(t); setDetailId(null); setOverlay(null); setCheckoutResult(null); }}
      />
    </>
  );
}
