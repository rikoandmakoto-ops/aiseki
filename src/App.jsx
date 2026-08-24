import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  Home, MessageCircle, Plus, Gem, User, MapPin, Clock, Users, Bell,
  Crown, ChevronLeft, Send, ArrowRight, Check, Sparkles, Settings,
  Mail, LogOut, Wine, Repeat, History, Wallet, ShieldCheck, Lock, FileText, UsersRound,
  Ticket, Copy, DoorClosed, Ban, CreditCard, LifeBuoy, ShieldAlert, XCircle,
  Search, SlidersHorizontal, CalendarDays, Gift, Star, Beer, Heart, Store,
} from "lucide-react";
import { supabase, configError } from "./lib/supabase";
import * as api from "./lib/api";
import { POINT_PACKS, packDiscount, packSeats, packUnitPrice } from "./lib/packs.js";
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
const ProfileEditScreen = lazy(() => import("./screens/ProfileEditScreen.jsx"));
/* 充実度バーは編集画面と同じ計算を使うので、同じチャンクから名前付きで取り出す
   （マイページで先に読み込まれる分、編集画面を開くときには手元に揃っている） */
const CompletionMeter = lazy(() =>
  import("./screens/ProfileEditScreen.jsx").then((m) => ({ default: m.CompletionMeter }))
);
const ReferralScreen = lazy(() => import("./screens/ReferralScreen.jsx"));
const SafetyScreen = lazy(() => import("./screens/SafetyScreen.jsx"));
const MemberSheet = lazy(() => import("./screens/MemberSheet.jsx"));
const ReviewSheet = lazy(() => import("./screens/ReviewSheet.jsx"));
/* ランク（評価で決まる予算帯）と、そのランクで選べるお店の一覧。
   マイページと会の作成画面の両方から使うので、同じチャンクに置く。 */
const RankCard = lazy(() => import("./screens/RankCard.jsx"));
const ShopsScreen = lazy(() => import("./screens/ShopsScreen.jsx"));

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
   ・会の参加条件に性別は使えない（同性グループ同士でも参加可）。
     性別を集めているのは、募集中の会へのアプローチ（会のチャットへの
     ひとこと）を送れるかどうかの判定のためだけで、他人には表示しない
   ・募集は無料。参加は1人あたり一律3,800pt（全額が運営に入る）
   ・ホストは必ずおごられる（当日のホストのお会計は参加グループが負担）
   ══════════════════════════════════════════════════════════════ */
const MIN_GROUP = api.MIN_GROUP_SIZE;
const MIN_AGE = api.MIN_AGE;
const GROUP_OPTIONS = [2, 3, 4, 5, 6];

/* 参加ポイント（1人あたり）。全ての会で一律で、ホストは金額を設定できない。
   DB 側（join_fee_per_person）でも同じ値が強制されている。 */
const JOIN_FEE = api.JOIN_FEE_PER_PERSON;
const feeText = (n = 1) => api.joinFeeFor(n).toLocaleString();

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
        <button key={t.key} className="nav-btn" data-active={on} onClick={() => onTab(t.key)} style={{
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

/* ═══════════════════════════════════════════ 飲みスタイルタグ
   性別による絞り込みではなく、全ユーザーが設定できる自己紹介タグ。
   会の一覧ではホストのタグ（parties.host_drinking_style）を、
   会の詳細では参加メンバーそれぞれのタグを出す。
   ふつうの Tag と見分けがつくよう、こちらはゴールドで箔押しにする。 */
/* 会のお店の予算帯。
   ⚠ これは「会」の属性であって、ホスト個人のランクではない。
     個人のランクは本人以外には出さない（DB 側でも読めない）。
     当日の飲食代は参加グループが負担するため、探す側に必ず見せる。 */
const BudgetTag = ({ party }) => {
  const label = api.budgetLabel(party);
  if (!label) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
      color: C.primaryDeep, background: "rgba(232,201,135,0.10)",
      border: `1px solid ${C.linePrimary}`,
    }}>
      <Wallet size={11} strokeWidth={2} />{label}
    </span>
  );
};

const StyleTag = ({ children }) => (
  <span style={{
    fontSize: 10.5, fontWeight: 700, color: C.primaryDeep, whiteSpace: "nowrap", letterSpacing: 0.3,
    padding: "4px 11px", borderRadius: 999,
    background: "rgba(232,201,135,0.10)", border: `1px solid ${C.linePrimary}`,
  }}>{children}</span>
);

const StyleTagRow = ({ tags, label }) => {
  const list = (tags ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      {label && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: C.textMuted, letterSpacing: 0.4 }}>
          <Beer size={11} strokeWidth={1.9} color={C.primary} />{label}
        </span>
      )}
      {list.map((t) => <StyleTag key={t}>{t}</StyleTag>)}
    </div>
  );
};

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
      <div style={{ position: "absolute", top: 12, right: 14 }}><TreatBadge /></div>
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
        {api.formatPartyDate(p.party_date) && <MetaLine icon={CalendarDays}>{api.formatPartyDate(p.party_date)}</MetaLine>}
        {p.party_time && <MetaLine icon={Clock}>{p.party_time}</MetaLine>}
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11, alignItems: "center" }}>
        <Tag>ホスト側 {groupSizes(p).host}名</Tag>
        <Tag>募集 {groupSizes(p).guest}名グループ</Tag>
        <BudgetTag party={p} />
      </div>
      {/* ホストグループの飲みスタイル（当日の温度感が先に伝わる） */}
      <div style={{ marginTop: 9 }}>
        <StyleTagRow tags={p.host_drinking_style} label="飲みスタイル" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}` }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: 0.2, marginBottom: 3 }}>参加ポイント / 1名（一律）</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, lineHeight: 1, ...brandText }}>
            {feeText()}<span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span>
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
        <TreatBadge />
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {tags.map((t) => <Tag key={t}>{t}</Tag>)}
        <BudgetTag party={p} />
      </div>
      {(p.host_drinking_style?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 12 }}>
          <StyleTagRow tags={p.host_drinking_style} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 11, borderTop: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "flex", gap: 13, flexWrap: "wrap" }}>
          <MetaLine icon={Users}>{p.current_members}/{p.max_members}名</MetaLine>
          {api.formatPartyDate(p.party_date) && <MetaLine icon={CalendarDays}>{api.formatPartyDate(p.party_date)}</MetaLine>}
          {p.party_time && <MetaLine icon={Clock}>{p.party_time}</MetaLine>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, ...brandText }}>{feeText()}<span style={{ fontSize: 10.5, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span></div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════ 絞り込みの部品
   横に並ぶ選択肢。押した状態が一目で分かるよう、
   選択中だけゴールドの箔押しにする。 */
const ChipRow = ({ label, options, value, onChange }) => (
  <div style={{ marginBottom: 11 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1, marginBottom: 7 }}>{label}</div>
    <div className="scroll-x" style={{ display: "flex", gap: 7, paddingBottom: 2 }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key} className="chip" onClick={() => onChange(o.key)} style={{
            padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            ...(on
              ? { ...popBtn, borderRadius: 999, boxShadow: "0 5px 14px rgba(176,138,60,0.36), inset 0 1px 0 rgba(255,255,255,0.55)" }
              : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
          }}>{o.label}</button>
        );
      })}
    </div>
  </div>
);

/* エリア・日付・時間帯・人数・キーワードでの絞り込み。
   よく使うエリアだけを常時表示し、細かい条件は開いたときに出す
   （最初から全部出すと、探す前に選ばせることになるため）。 */
const FilterPanel = ({ filters, onChange, count, loading }) => {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState(filters.keyword ?? "");

  const set = (patch) => onChange({ ...filters, ...patch });

  /* 既定値から動いている条件の数。開かなくても絞り込み中だと分かるようにする。 */
  const active =
    (filters.area ? 1 : 0) +
    (filters.date && filters.date !== "all" ? 1 : 0) +
    (filters.time && filters.time !== "all" ? 1 : 0) +
    (filters.size && filters.size !== "all" ? 1 : 0) +
    (filters.keyword ? 1 : 0);

  const submitKeyword = () => set({ keyword: keyword.trim() || null });

  return (
    <div style={{ padding: "12px 20px 0" }}>
      {/* キーワード */}
      <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} strokeWidth={2} color={C.textMuted} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onBlur={submitKeyword}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submitKeyword(); } }}
            placeholder="会の名前・お店・エリアで探す"
            aria-label="キーワードで探す"
            style={{ ...fieldStyle, paddingLeft: 38, borderRadius: 999, fontSize: 13 }}
          />
          {keyword && (
            <button className="press" onClick={() => { setKeyword(""); set({ keyword: null }); }} aria-label="キーワードを消す" style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 2,
            }}><XCircle size={15} strokeWidth={2} /></button>
          )}
        </div>
        <button className="press" onClick={() => setOpen((v) => !v)} aria-label="絞り込み" style={{
          ...(open || active > 0 ? popBtn : ghostBtn), padding: "0 15px", borderRadius: 999, flexShrink: 0,
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5,
        }}>
          <SlidersHorizontal size={14} strokeWidth={2.1} />
          {active > 0 ? active : "絞込"}
        </button>
      </div>

      {/* エリア（常時表示） */}
      <div className="scroll-x" style={{ display: "flex", gap: 7, paddingBottom: 8 }}>
        {["すべて", ...AREAS].map((a) => {
          const on = (a === "すべて" && !filters.area) || filters.area === a;
          return (
            <button key={a} className="chip" onClick={() => set({ area: a === "すべて" ? null : a })} style={{
              padding: "7px 16px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              ...(on
                ? { ...popBtn, borderRadius: 999, boxShadow: "0 6px 16px rgba(176,138,60,0.4), inset 0 1px 0 rgba(255,255,255,0.55)" }
                : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
            }}>{a}</button>
          );
        })}
      </div>

      {/* 詳細（日付・時間帯・人数） */}
      {open && (
        <div className="rise" style={{
          marginTop: 6, marginBottom: 4, padding: "14px 15px 6px", borderRadius: 16,
          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
        }}>
          <ChipRow label="開催日" options={api.DATE_FILTERS} value={filters.date ?? "all"} onChange={(date) => set({ date })} />
          <ChipRow label="時間帯" options={api.TIME_FILTERS} value={filters.time ?? "all"} onChange={(time) => set({ time })} />
          <ChipRow label="募集グループの人数" options={api.SIZE_FILTERS} value={filters.size ?? "all"} onChange={(size) => set({ size })} />
          {active > 0 && (
            <button className="press" onClick={() => { setKeyword(""); onChange({}); }} style={{
              width: "100%", background: "none", border: "none", cursor: "pointer",
              padding: "8px 0 10px", fontSize: 11.5, color: C.textMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <XCircle size={12} strokeWidth={2} /> 絞り込みをすべて解除
            </button>
          )}
          <div style={{ fontSize: 10, color: C.textFaint, lineHeight: 1.7, paddingBottom: 8 }}>
            開催日が未設定の会は「すべて」にのみ表示されます。
          </div>
        </div>
      )}

      {/* 件数 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <Eyebrow style={{ color: C.textMuted }}>
          {active > 0 ? "絞り込みの結果" : "本日の募集中の会"}
        </Eyebrow>
        <span style={{ fontSize: 11.5, color: C.textFaint, fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: 0.5 }}>
          {loading ? "…" : `${count} groups`}
        </span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ Home */
const HomeScreen = ({ user, onDetail, onCreate }) => {
  const { toast, confirm } = useToast();
  const [filters, setFilters] = useState({});
  const [parties, setParties] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyReq, setBusyReq] = useState(null);
  const area = filters.area ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ps, reqs] = await Promise.all([
        api.listParties(filters),
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
  }, [filters, user.id]);

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

      {/* incoming join requests (host inbox) */}
      {incoming.length > 0 && (
        <div style={{ padding: "8px 20px 0" }}>
          <Eyebrow style={{ marginBottom: 11 }}>◆ グループ参加リクエスト</Eyebrow>
          {incoming.map((r, i) => {
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
                <div style={{ fontSize: 11.5, color: C.textSec, marginBottom: 7, display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <Gem size={12} strokeWidth={1.8} color={C.primary} /> このグループが <b style={{ color: C.primaryDeep }}>{feeText(size)}pt</b> を支払います
                  <span style={{ color: C.textMuted }}>（{feeText()}pt × {size}名）</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 9, lineHeight: 1.6 }}>
                  ポイントは運営が受け取るため、あなたへの支払いはありません。
                  <br />そのかわり、当日の<b style={{ color: C.primaryDeep, fontWeight: 700 }}>あなたのグループのお会計は、参加グループが負担します</b>。
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

      {/* 探す */}
      <FilterPanel filters={filters} onChange={setFilters} count={parties.length} loading={loading} />

      {/* feed */}
      <div style={{ padding: "14px 20px 24px" }}>
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
              <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
                {Object.values(filters).some(Boolean) && (
                  <button className="press" onClick={() => setFilters({})} style={{
                    ...ghostBtn, padding: "12px 22px", fontSize: 13,
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                    <XCircle size={14} strokeWidth={2} /> 絞り込みを解除
                  </button>
                )}
                <button className="lux-cta" onClick={onCreate} style={{
                  ...popBtn, padding: "12px 26px", fontSize: 13.5,
                  display: "inline-flex", alignItems: "center", gap: 7,
                }}>
                  <Plus size={15} strokeWidth={2.4} /> 会を主催する
                </button>
              </div>
            }
          >
            {Object.values(filters).some(Boolean)
              ? <>この条件に合う会は、いまのところありません。<br />条件を広げるか、あなたの会を主催してみませんか。</>
              : <>募集中の会はまだありません。<br />あなたの会を主催してみませんか。</>}
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
const DetailScreen = ({ user, partyId, onBack, onGoPoints, onCancelled, onReport }) => {
  const { toast, confirm } = useToast();
  const [party, setParty] = useState(null);
  const [members, setMembers] = useState([]);
  const [mySeats, setMySeats] = useState([]);     // 自分のグループの席（招待コード付き）
  const [balance, setBalance] = useState(null);
  const [reqStatus, setReqStatus] = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [groupSize, setGroupSize] = useState(MIN_GROUP); // 申し込むグループの人数（2名以上）
  const [guestNames, setGuestNames] = useState([]);      // 同伴者のニックネーム
  const [cancelling, setCancelling] = useState(false);
  const [openMember, setOpenMember] = useState(null);    // プロフィールを開いているメンバー
  const [reviewTarget, setReviewTarget] = useState(null); // 評価を書いているメンバー
  const [myReviews, setMyReviews] = useState([]);         // この会で自分が書いた評価
  const [canApproach, setCanApproach] = useState(false);  // アプローチを送れるか（DBが判定）
  const [myApproaches, setMyApproaches] = useState([]);   // この会へ自分が送ったメッセージ
  const [approachText, setApproachText] = useState("");
  const [sendingApproach, setSendingApproach] = useState(false);

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

    const iAmMember = ms.some((m) => m.user_id === user.id);
    // 自分がこの会のメンバーのときだけ、自分のグループの招待コードを取得する
    if (iAmMember) {
      try { setMySeats(await api.listMySeats(partyId)); }
      catch (e) { console.error(e); setMySeats([]); }
    } else {
      setMySeats([]);
    }

    if (iAmMember) {
      /* 会が終わっていれば、自分が既に誰を評価したかを取る
         （相手が書いた評価は取得できない） */
      setCanApproach(false);
      setMyApproaches([]);
      if (api.partyIsOver(p)) {
        try { setMyReviews(await api.listMyReviews(partyId)); }
        catch (e) { console.error(e); setMyReviews([]); }
      } else {
        setMyReviews([]);
      }
    } else {
      /* 参加していない会。アプローチを送れるかは DB に聞く
         （性別・年齢・ブロック・募集状況をまとめて判定している） */
      setMyReviews([]);
      try {
        const [ok, mine] = await Promise.all([
          api.canApproachParty(partyId, user.id),
          api.listMyApproaches(partyId, user.id),
        ]);
        setCanApproach(ok);
        setMyApproaches(mine);
      } catch (e) {
        console.error(e);
        setCanApproach(false);
        setMyApproaches([]);
      }
    }
  }, [partyId, user.id]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        await load();
      } catch (e) {
        console.error(e);
        if (!alive) return;
        /* 「取り消された会」と「通信できなかった」は利用者にとって
           まったく別の話なので、取り違えないよう分けて伝える。 */
        setLoadError(
          /failed to fetch|load failed|networkerror/i.test(e.message || "")
            ? "通信できませんでした。電波の良い場所でもう一度お試しください。"
            : ""
        );
      }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [load, reloadKey]);

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

  /* アプローチ（参加していない会のグループチャットへ「気になります」を送る）。
     個人宛のメッセージではなく、会のチャットに残る。
     送れるかどうかの判定はすべて DB 側（can_approach_party + RLS）にある。 */
  const sendApproach = async () => {
    const body = approachText.trim();
    if (!body) { toast.error("メッセージを入力してください。"); return; }
    setSendingApproach(true);
    try {
      const saved = await api.sendApproach(party.id, user.id, body);
      setMyApproaches((prev) => [...prev, saved]);
      setApproachText("");
      toast.success("メッセージを送りました。ホストのグループに届きます。");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSendingApproach(false);
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
  if (!party) {
    return (
      <div style={{ padding: "0 20px" }}>
        <BackButton onBack={onBack} />
        <EmptyState
          icon={<XCircle size={24} strokeWidth={1.6} />}
          action={
            <button className="press" onClick={() => setReloadKey((k) => k + 1)} style={{ ...ghostBtn, padding: "11px 26px", fontSize: 13 }}>
              もう一度読み込む
            </button>
          }
        >
          {loadError || <>会が見つかりませんでした。<br />取り消された可能性があります。</>}
        </EmptyState>
      </div>
    );
  }

  const { host: hostGroup, guest: guestGroup } = groupSizes(party);
  const seatsLeft = Math.max(0, party.max_members - party.current_members);
  // 参加できるグループ人数の選択肢（2名以上、かつ残枠まで）
  const sizeOptions = GROUP_OPTIONS.filter((n) => n <= seatsLeft);
  const cost = api.joinFeeFor(groupSize);                   // 参加グループが支払うポイント合計（一律）
  const isHost = party.host_id === user.id;
  const isMember = members.some((m) => m.user_id === user.id);
  const canSeeMembers = isHost || isMember;                 // 承認後のみ個人プロフィールを表示
  const isFull = seatsLeft < MIN_GROUP;
  const enough = (balance ?? 0) >= cost;
  const cancelled = party.status === "cancelled";
  // ゲスト側の席が1つでも埋まっていたら、ホストはもう取り消せない
  const hasGuests = members.some((m) => m.side === "guest");
  /* 会が終わったか（開催日を過ぎた／終了扱い）。評価はここから開ける。 */
  const partyOver = api.partyIsOver(party);
  const reviewedIds = new Set(myReviews.map((r) => r.reviewed_id));
  // 評価できるのは、アプリに登録済みの自分以外のメンバー
  const reviewTargets = members.filter((m) => m.user_id && m.user_id !== user.id);
  const approachesLeft = Math.max(0, api.APPROACH_LIMIT - myApproaches.length);
  const INFO = [
    { label: "場所", value: [party.location, party.area && `（${party.area}）`].filter(Boolean).join("") || "未定", icon: MapPin },
    { label: "開催日", value: api.formatPartyDate(party.party_date) || "未定", icon: CalendarDays },
    { label: "時間", value: party.party_time || "未定", icon: Clock },
    { label: "参加人数", value: `${party.current_members}/${party.max_members}名`, icon: Users },
    { label: "グループ構成", value: `ホスト${hostGroup}名 × 募集${guestGroup}名`, icon: UsersRound },
    // 席は常にオープンスペース（個室での相席は提供しない）
    { label: "席", value: "オープンスペース", icon: DoorClosed },
    { label: "年齢", value: `${MIN_AGE}歳以上限定`, icon: ShieldCheck },
    // 金額とお会計の区分は全ての会で共通（ホストは設定できない）
    { label: "参加ポイント", value: `${feeText()}pt / 1名`, icon: Gem },
    { label: "お会計", value: "参加グループが負担", icon: Wallet },
    // お店の予算の目安。当日の飲食代は参加グループが負担するため、
    // ポイントとは別に、いくらかかる会なのかを先に見せる。
    ...(api.budgetLabel(party)
      ? [{ label: "お店の予算", value: api.budgetLabel(party).replace(/^お一人\s*/, ""), icon: Store }]
      : []),
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
          <div style={{ position: "absolute", top: 14, right: 16 }}><TreatBadge /></div>
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
          {(party.host_drinking_style?.length ?? 0) > 0 && (
            <div style={{ marginTop: -12, marginBottom: 22 }}>
              <StyleTagRow tags={party.host_drinking_style} label="ホストの飲みスタイル" />
            </div>
          )}

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
              <Eyebrow style={{ marginBottom: 6 }}>
                参加メンバー（{members.length}名）
              </Eyebrow>
              <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 12, lineHeight: 1.7 }}>
                タップすると、その方のプロフィールを見られます。
              </div>
              <div className="scroll-x" style={{ display: "flex", gap: 14, paddingBottom: 4 }}>
                {members.map((m) => {
                  const prof = m.profiles || {};
                  // user_id が null の席 = まだアプリに登録していない同伴者
                  const claimed = !!m.user_id;
                  const name = prof.username || m.display_name || "メンバー";
                  return (
                    <button
                      key={m.id}
                      className="press"
                      onClick={() => setOpenMember(m)}
                      aria-label={`${name}さんのプロフィールを見る`}
                      style={{ textAlign: "center", flexShrink: 0, width: 74, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
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
                    </button>
                  );
                })}
              </div>

              {/* メンバーそれぞれの飲みスタイル（承認後にのみ見える） */}
              {members.some((m) => (m.profiles?.drinking_style?.length ?? 0) > 0) && (
                <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C.lineSoft}`, display: "grid", gap: 9 }}>
                  {members
                    .filter((m) => (m.profiles?.drinking_style?.length ?? 0) > 0)
                    .map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: C.textSec, fontWeight: 700, minWidth: 62 }}>
                          {m.profiles.username || m.display_name || "メンバー"}
                        </span>
                        <StyleTagRow tags={m.profiles.drinking_style} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ── 相席の評価（内部評価） ──
              会が終わったあとにだけ出す。相手には見えないことを必ず添える。 */}
          {canSeeMembers && partyOver && reviewTargets.length > 0 && (
            <div style={{
              marginBottom: 24, borderRadius: 16, padding: "15px 16px",
              background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Star size={14} strokeWidth={1.9} color={C.primary} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>この相席はいかがでしたか</span>
              </div>
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.75, marginBottom: 12 }}>
                ご一緒した方の評価をお願いします。
                点数もコメントも<b style={{ color: C.primaryDeep, fontWeight: 700 }}>相手には表示されません</b>。
                評価は安全な運営に使うほか、相手が主催する会で選べるお店のランクに反映されます。
              </div>
              {reviewTargets.map((m) => {
                const done = reviewedIds.has(m.user_id);
                const nm = m.profiles?.username || m.display_name || "メンバー";
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderTop: `1px solid ${C.lineSoft}` }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nm}
                    </span>
                    <button
                      className={done ? "press" : "lux-cta"}
                      onClick={() => setReviewTarget(m)}
                      style={{
                        ...(done ? ghostBtn : popBtn), padding: "8px 16px", borderRadius: 999,
                        fontSize: 12, flexShrink: 0,
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {done ? <><Check size={12} strokeWidth={2.6} /> 評価済み</> : <><Star size={12} strokeWidth={2.2} /> 評価する</>}
                    </button>
                  </div>
                );
              })}
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

          {/* ── アプローチ ──
              会に参加していない方が、募集中の会のグループチャットへ
              ひとこと送れる入口。個人宛のメッセージ（DM）ではない。
              送れるかどうかは DB（can_approach_party）が決める。 */}
          {canApproach && (
            <div style={{
              marginBottom: 18, borderRadius: 16, padding: "15px 16px",
              background: "linear-gradient(135deg, rgba(232,201,135,0.13), rgba(168,32,58,0.13))",
              border: `1px solid ${C.linePrimary}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Heart size={14} strokeWidth={2} color={C.primary} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
                  この会にメッセージを送る
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.75, marginBottom: 12 }}>
                参加を申し込む前に「気になります！」を伝えられます。
                メッセージは<b style={{ color: C.primaryDeep, fontWeight: 700 }}>この会のグループチャット</b>に届き、
                ホストのグループ全員が読みます（個人宛のメッセージではありません）。
                この会の会話は、参加が承認されるまであなたには表示されません。
              </div>

              {myApproaches.length > 0 && (
                <div style={{ display: "grid", gap: 7, marginBottom: 12 }}>
                  {myApproaches.map((m) => (
                    <div key={m.id} style={{
                      fontSize: 12, color: "#241a06", background: C.primaryGrad,
                      borderRadius: 14, borderBottomRightRadius: 5, padding: "9px 13px",
                      lineHeight: 1.6, wordBreak: "break-word",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
                    }}>{m.content}</div>
                  ))}
                </div>
              )}

              {approachesLeft > 0 ? (
                <>
                  <div style={{ display: "flex", gap: 9 }}>
                    <input
                      value={approachText}
                      onChange={(e) => setApproachText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); sendApproach(); } }}
                      maxLength={api.LIMITS.approach}
                      aria-label="この会へのメッセージ"
                      placeholder="例: 気になります！ご一緒できたら嬉しいです"
                      style={{ ...fieldStyle, borderRadius: 22, fontSize: 13 }}
                    />
                    <button
                      className="lux-cta"
                      onClick={sendApproach}
                      disabled={sendingApproach || !approachText.trim()}
                      aria-label="送信"
                      style={{
                        ...popBtn, width: 44, height: 44, borderRadius: 999, flexShrink: 0, padding: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: sendingApproach || !approachText.trim() ? 0.5 : 1,
                      }}
                    ><Send size={17} strokeWidth={2.2} /></button>
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, lineHeight: 1.7 }}>
                    この会にはあと{approachesLeft}通まで送れます（1つの会につき{api.APPROACH_LIMIT}通まで）。
                    実際に参加するには、下の「参加を申し込む」からリクエストを送ってください。
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.75 }}>
                  この会に送れるメッセージは上限（{api.APPROACH_LIMIT}通）に達しました。
                  参加をご希望の場合は、下から参加リクエストをお送りください。
                </div>
              )}
            </div>
          )}

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
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 6 }}>一律 {feeText()}pt × {groupSize}名</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.lineSoft}` }}>
                  <span style={{ fontSize: 11, color: C.textSec }}>現在の残高</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: FONT_DISPLAY, color: enough ? C.primary : C.accent }}>
                    {(balance ?? 0).toLocaleString()} pt
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 7, lineHeight: 1.65 }}>
                  ※ 参加ポイントは全ての会で一律です。承認された時点で消費され、運営が受け取ります（ホストには支払われません）。
                </div>
              </div>

              {/* ホストは必ずおごられる。参加前に必ず伝える。 */}
              <div style={{
                display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 18,
                borderRadius: 16, padding: "14px 16px",
                background: "rgba(232,201,135,0.09)", border: `1px solid ${C.linePrimary}`,
              }}>
                <Wallet size={16} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>当日のお会計は参加グループの負担です</div>
                  <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
                    この会は、ホストグループ（{hostGroup}名）の飲食代を参加グループがお支払いする決まりです。
                    参加ポイントとは別に、当日そのままお店でご精算ください。
                  </div>
                </div>
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

      {/* 気になることがあったときの入口。目立たせすぎず、必ず見つかる場所に置く。 */}
      {!isHost && (
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 16 }}>
          <button className="press" onClick={() => onReport?.(party.host_id)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "6px 10px",
            fontSize: 11, color: C.textMuted, letterSpacing: 0.4,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <ShieldAlert size={12} strokeWidth={1.9} /> この会を通報する
          </button>
        </div>
      )}

      {/* メンバーのプロフィール（承認後のみ開ける） */}
      {openMember && (
        <Suspense fallback={null}>
          <MemberSheet
            member={openMember}
            isSelf={openMember.user_id === user.id}
            onClose={() => setOpenMember(null)}
            onBlocked={() => { setOpenMember(null); onBack(); }}
            onReport={onReport}
          />
        </Suspense>
      )}

      {/* 相席の評価（会が終わったあとのみ開ける。相手には見えない） */}
      {reviewTarget && (
        <Suspense fallback={null}>
          <ReviewSheet
            member={reviewTarget}
            party={party}
            existing={myReviews.find((r) => r.reviewed_id === reviewTarget.user_id) ?? null}
            onClose={() => setReviewTarget(null)}
            onSaved={(saved) => setMyReviews((prev) => [...prev, saved])}
          />
        </Suspense>
      )}
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
  // 開催日。既定は今日（当日の会がいちばん多いため）。過去日は選べない。
  const [date, setDate] = useState(() => api.toDateString(new Date()));
  const [time, setTime] = useState("20:00");
  const [saving, setSaving] = useState(false);
  // 席の種別は「オープンスペース」固定。個室は選択できない（変更不可）。
  const roomType = api.ROOM_TYPE_OPEN;

  /* ランクと予算帯。
     自分のランクで選べる予算帯の中から1つ決める。カタログのお店を選ぶと
     その店の予算帯に自動で揃う。保存できるかは DB 側でも改めて判定される。 */
  const [rank, setRank] = useState(null);
  const [rankError, setRankError] = useState(null);
  const [budgetTier, setBudgetTier] = useState(api.DEFAULT_RANK_KEY);
  const [shop, setShop] = useState(null);       // カタログから選んだお店（任意）
  const [pickingShop, setPickingShop] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getMyRank()
      .then((r) => { if (alive) setRank(r); })
      .catch((e) => { if (alive) setRankError(e.message); });
    return () => { alive = false; };
  }, []);

  const myRankKey = rank?.tier_key ?? api.DEFAULT_RANK_KEY;

  /* お店を選んだら、店名・エリア・予算帯をその店に合わせる */
  const chooseShop = (s, locked) => {
    if (!s) {
      if (locked) {
        toast.info(`「${locked.name}」は${locked.tier?.label}ランクから選べます。相席の評価でランクが上がると解放されます。`);
      }
      return;
    }
    setShop(s);
    setLocation(s.name);
    if (s.area) setArea(s.area);
    setBudgetTier(s.tier?.key ?? api.DEFAULT_RANK_KEY);
    setPickingShop(false);
  };

  const clearShop = () => { setShop(null); };

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
    setSaving(true);
    try {
      // 参加ポイント（一律）とお会計の区分は送らない。サーバ側で確定させる。
      // 予算の実額も送らない（お店を選んだときだけ、カタログの値がサーバで入る）。
      const p = await api.createParty(user.id, {
        title: title.trim(),
        shop_id: shop?.id ?? null,
        budget_tier: budgetTier,
        location: location.trim() || null,
        area: area.trim() || null,
        host_group_size: hostGroup,
        host_member_names: hostNames,
        guest_group_size: guestGroup,
        party_date: date || null,
        party_time: time,
        room_type: roomType,
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
        {/* ── 予算帯 ──────────────────────────────────
            自分のランクで選べる予算帯だけを押せるようにする。
            選べないものも並べて理由を出す（隠すと何が起きているか分からない）。
            ⚠ 出し分けは案内にすぎない。実際の可否は DB 側
              （enforce_group_party）が改めて判定する。 */}
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>お店の予算帯（お一人あたり）</label>
          <div style={{ display: "grid", gap: 7 }}>
            {api.RANK_TIERS.map((t) => {
              const allowed = api.canUseBudgetTier(myRankKey, t.key);
              const on = budgetTier === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-disabled={!allowed}
                  onClick={() => {
                    if (!allowed) {
                      toast.info(`${t.label}のお店は、相席の評価でランクが上がると選べるようになります。`);
                      return;
                    }
                    if (shop && shop.tier?.key !== t.key) clearShop();
                    setBudgetTier(t.key);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    padding: "11px 14px", borderRadius: 14,
                    cursor: allowed ? "pointer" : "not-allowed",
                    ...(on ? { ...popBtn, borderRadius: 14 } : { ...ghostBtn, borderRadius: 14 }),
                    opacity: allowed ? 1 : 0.42,
                  }}
                >
                  <span style={{ flexShrink: 0, display: "flex" }}>
                    {allowed ? <Check size={14} strokeWidth={2.6} /> : <Lock size={13} strokeWidth={2.2} />}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>
                      {t.label} · {t.budgetLabel}
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, lineHeight: 1.6, marginTop: 2, opacity: 0.85 }}>
                      {allowed ? t.note : `${t.label}ランクから選べます`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {/* ⚠ 中に <b> を置くので、テキストは必ず1つの span にまとめる。
                直接並べると flex の子が文字ごとに分かれて縦に潰れる。 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 10.5, color: C.textMuted, lineHeight: 1.7 }}>
            <Star size={12} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ minWidth: 0 }}>
              {rankError
                ? `ランクを読み込めませんでした（${rankError}）。いまは最初の予算帯のみ選べます。`
                : <>
                    いまのランクは<b style={{ color: C.primaryDeep, fontWeight: 700 }}>{rank?.tier_label ?? "—"}</b>です。
                    会の終了後に相席した方から受け取る評価の平均で上がります。
                    ランクは他のユーザーには表示されません。
                  </>}
            </span>
          </div>
        </div>

        {/* ── お店 ──────────────────────────────────
            掲載店から選ぶか、自分で書くか。掲載店を選ぶと店名・エリア・
            予算帯がその店に揃う（金額はサーバ側がカタログから写す）。 */}
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>お店</label>
          <input
            value={location}
            onChange={(e) => { setLocation(e.target.value); if (shop) clearShop(); }}
            maxLength={api.LIMITS.location}
            placeholder="例: 恵比寿 / BAR TRENCH"
            style={fieldStyle}
          />
          <button
            type="button"
            className="press"
            onClick={() => setPickingShop((v) => !v)}
            style={{
              ...ghostBtn, width: "100%", marginTop: 9, padding: "10px 0", borderRadius: 999,
              fontSize: 12.5, cursor: "pointer", display: "inline-flex",
              alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            <Store size={13} strokeWidth={2} />
            {pickingShop ? "掲載店から選ぶのをやめる" : "掲載中のお店から選ぶ"}
          </button>
          {shop && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 9, fontSize: 11, color: C.textSec, lineHeight: 1.7 }}>
              <Check size={12} strokeWidth={2.6} color={C.primaryDeep} style={{ flexShrink: 0, marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                掲載店「{shop.name}」を選択中（お一人 約{Number(shop.avg_budget).toLocaleString()}円）。店名を書き換えると解除されます。
              </span>
            </div>
          )}
          {pickingShop && (
            <div style={{ marginTop: 11 }}>
              <Suspense fallback={<Loading label="お店を読み込み中…" />}>
                <ShopsScreen
                  embedded
                  myRankKey={myRankKey}
                  selectedId={shop?.id}
                  onSelect={chooseShop}
                />
              </Suspense>
            </div>
          )}
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

        {/* 開催日 … 探す側は日付で絞り込む。よく使う日はボタンでも選べるようにする。 */}
        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>開催日</label>
          <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
            {[
              { label: "今日", offset: 0 },
              { label: "明日", offset: 1 },
              { label: "明後日", offset: 2 },
            ].map((q) => {
              const d = new Date();
              d.setDate(d.getDate() + q.offset);
              const value = api.toDateString(d);
              const on = date === value;
              return (
                <button key={q.label} type="button" className="chip" onClick={() => setDate(value)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  ...(on ? popBtn : ghostBtn),
                }}>{q.label}</button>
              );
            })}
          </div>
          <input
            type="date"
            value={date}
            min={api.toDateString(new Date())}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...fieldStyle, colorScheme: "dark" }}
          />
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>時間</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...fieldStyle, colorScheme: "dark" }} />
        </div>

        {/* 金額とお会計の区分はホストが決められない（全ての会で共通）。
            設定項目ではなく、決まりとして提示する。 */}
        <div style={{ marginBottom: 22, borderRadius: 16, padding: "15px 16px", background: "rgba(255,255,255,0.045)", border: `1px solid ${C.lineSoft}` }}>
          <Eyebrow style={{ marginBottom: 11 }}>この会の決まり（全ての会で共通）</Eyebrow>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 11 }}>
            <Gem size={14} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
                募集は無料 · 参加は1名あたり <span style={brandText}>{feeText()}pt</span>
              </div>
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.7, marginTop: 3 }}>
                会はいくつでも自由に立てられます。参加ポイントは全ての会で一律で、あなたが金額を決めることはできません。
                お支払いいただいたポイントは運営が受け取るため、あなたへのポイントの支払いはありません。
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, paddingTop: 11, borderTop: `1px solid ${C.lineSoft}` }}>
            <Wallet size={14} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>あなたのグループは、必ずおごられます</div>
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.7, marginTop: 3 }}>
                当日のホストグループ（あなたを含む{hostGroup}名）の飲食代は、参加グループが負担します。
                この決まりは参加者にも会の画面で明示されます。
              </div>
            </div>
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
/* 変換できる最小単位。スライダーの下限でもある。 */
const CONVERT_MIN = 100;

const PointsScreen = ({ user, checkoutResult, onCheckoutHandled, onInvite }) => {
  const { toast, confirm } = useToast();
  const [tab, setTab] = useState("buy");
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [convertAmt, setConvertAmt] = useState(1000);
  const canConvert = (balance ?? 0) >= CONVERT_MIN;
  const [notice, setNotice] = useState("");
  /* 決済が使えるか。null = 確認中。false のあいだは「準備中」を出す。 */
  const [payEnabled, setPayEnabled] = useState(null);

  useEffect(() => {
    let alive = true;
    api.paymentsEnabled().then((v) => { if (alive) setPayEnabled(v); });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([api.getBalance(user.id), api.getPointHistory(user.id)]);
      setBalance(b);
      setHistory(h);
      /* 変換する量が残高を超えたままだと、スライダーは上限で止まっているのに
         「1,000pt を変換」と出て、押すと残高不足で弾かれる。残高に合わせておく。 */
      setConvertAmt((amt) => Math.min(amt, Math.max(CONVERT_MIN, b ?? CONVERT_MIN)));
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
        <div className="fade">
          {/* 決済がまだ使えないあいだの案内。
              押しても何も起きないボタンを黙って置くより、先に伝える。 */}
          {payEnabled === false && (
            <div style={{
              display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 14,
              borderRadius: 16, padding: "15px 16px",
              background: "linear-gradient(135deg, rgba(232,201,135,0.13), rgba(168,32,58,0.12))",
              border: `1px solid ${C.linePrimary}`,
            }}>
              <span style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
              }}><Clock size={15} strokeWidth={1.9} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
                  ポイントの購入は準備中です
                </div>
                <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85, marginTop: 4 }}>
                  クレジットカード決済の開始までもうしばらくお待ちください。
                  それまでは、新規登録ボーナスと友達招待のボーナスでご参加いただけます。
                </div>
                {onInvite && (
                  <button className="press" onClick={onInvite} style={{
                    ...ghostBtn, marginTop: 11, padding: "9px 16px", fontSize: 12,
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                    <Gift size={13} strokeWidth={2} /> 友達を招待して {api.REFERRAL_BONUS.toLocaleString()}pt もらう
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 22 }}>
            <Eyebrow style={{ marginBottom: 5 }}>Buy Points</Eyebrow>
            <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.75, marginBottom: 16 }}>
              参加は1名あたり一律 {feeText()}pt です。まとめてお求めいただくほど、1ptあたりの単価が下がります。
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {POINT_PACKS.map((p) => {
                const off = packDiscount(p);
                const seats = packSeats(p);
                const disabled = busy || payEnabled === false;
                return (
                  <div key={p.id} className="lux-card" style={{
                    borderRadius: 16, padding: "15px 16px", position: "relative", overflow: "hidden",
                    background: p.popular
                      ? "linear-gradient(135deg, rgba(232,201,135,0.14), rgba(168,32,58,0.12))"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${p.popular ? C.linePrimary : C.lineSoft}`,
                    opacity: payEnabled === false ? 0.72 : 1,
                  }}>
                    {p.popular && (
                      <span style={{
                        position: "absolute", top: 0, right: 14, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
                        padding: "3px 11px", borderBottomLeftRadius: 9, borderBottomRightRadius: 9,
                        color: "#241a06", background: C.primaryGrad, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}><Star size={9} strokeWidth={2.6} /> 人気</span>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT_DISPLAY, ...brandText, lineHeight: 1 }}>
                            {p.points.toLocaleString()}
                            <span style={{ fontSize: 11.5, fontFamily: FONT_BODY, fontWeight: 600 }}> pt</span>
                          </span>
                          {off > 0 && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 9px", borderRadius: 999,
                              color: C.accentDeep, background: "rgba(168,32,58,0.24)", border: "1px solid rgba(200,56,79,0.38)",
                            }}>{off}% お得</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 7, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10.5, color: C.textSec, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <UsersRound size={11} strokeWidth={1.9} color={C.primary} /> 参加 {seats}名分
                          </span>
                          <span style={{ fontSize: 10.5, color: C.textMuted }}>
                            1ptあたり ¥{packUnitPrice(p)}
                          </span>
                        </div>
                      </div>

                      <button
                        className="lux-cta"
                        onClick={() => buy(p)}
                        disabled={disabled}
                        style={{
                          ...popBtn, padding: "11px 18px", borderRadius: 999, fontSize: 13.5, flexShrink: 0,
                          opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
                          minWidth: 96, textAlign: "center",
                        }}
                      >
                        {payEnabled === false ? "準備中" : `¥${p.price.toLocaleString()}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 10.5, color: C.textMuted, marginTop: 16, lineHeight: 1.8 }}>
              <CreditCard size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                お支払いは Stripe の決済ページで行います。カード情報が AISEKI に保存されることはありません。
                支払いが完了すると、自動でポイントが追加されます。
                <br />
                ポイントは前払式支払手段には該当せず、払い戻しはできません（利用規約 第9条）。
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "convert" && !canConvert && (
        <div className="fade" style={{ ...card, padding: 22 }}>
          <Eyebrow style={{ marginBottom: 16 }}>オリパpt 変換</Eyebrow>
          <EmptyState icon={<Repeat size={22} strokeWidth={1.6} />}>
            変換は{CONVERT_MIN}pt から行えます。<br />
            現在の残高は{(balance ?? 0).toLocaleString()}ptです。
          </EmptyState>
        </div>
      )}

      {tab === "convert" && canConvert && (
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
          <input type="range" min={CONVERT_MIN} max={Math.max(CONVERT_MIN, balance || CONVERT_MIN)} step={50} value={convertAmt} onChange={(e) => setConvertAmt(Number(e.target.value))} aria-label="変換するポイント" style={{ width: "100%", marginBottom: 18 }} />
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
const ChatScreen = ({ user, openRoom, openParty }) => {
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
          募集中の会には、まだ参加していない方からメッセージ（アプローチ）が届くことがあります。
        </span>
      </div>
      {loading ? <SkeletonList count={3} /> : rooms.length === 0 ? (
        <EmptyState icon={<MessageCircle size={24} strokeWidth={1.6} />}>
          参加中の会がありません。<br />会を主催するか、参加リクエストが承認されると<br />グループチャットが始まります。
        </EmptyState>
      ) : rooms.map((c, i) => {
        const matched = c.status === "matched";
        const over = api.partyIsOver(c);
        return (
          <div key={c.id} className="lux-card" onClick={() => openRoom(c)} style={{ ...card, padding: 15, marginBottom: 11, cursor: "pointer", animationDelay: `${i * 50}ms` }}>
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              <AvatarBubble size={46}>{partyEmoji(c.id)}</AvatarBubble>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                  <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 14.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: over ? C.textMuted : matched ? C.primary : C.textMuted }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: !over && matched ? C.primary : C.textFaint, animation: !over && matched ? "pulseDot 1.8s ease-in-out infinite" : "none" }} />
                    {over ? "終了" : matched ? "マッチ済" : "募集中"}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[c.location, c.area].filter(Boolean).join(" · ") || "タップしてグループチャットを開く"}
                </div>
              </div>
            </div>

            {/* 終わった会は、そのまま評価に進めるようにする（相手には見えない評価） */}
            {over && openParty && (
              <button
                className="press"
                onClick={(e) => { e.stopPropagation(); openParty(c.id); }}
                style={{
                  ...ghostBtn, width: "100%", marginTop: 12, padding: "10px 0", borderRadius: 999, fontSize: 12,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}
              >
                <Star size={13} strokeWidth={2} /> ご一緒した方を評価する
              </button>
            )}
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
  const [loadError, setLoadError] = useState("");
  const scrollRef = useRef(null);
  const lookedUp = useRef(new Set());   // プロフィールを引きに行った相手（二重に引かない）
  /* 会に参加していない方から届いたメッセージ（アプローチ）の送り主。
     プロフィールは承認まで非公開なので、表示名だけを別経路で受け取る。 */
  const [approachSenders, setApproachSenders] = useState({});

  useEffect(() => {
    let alive = true;
    lookedUp.current = new Set();
    (async () => {
      try {
        const [ms, senders] = await Promise.all([
          api.listMessages(party.id),
          api.listApproachSenders(party.id).catch(() => []),
        ]);
        if (alive) {
          setMessages(ms);
          setApproachSenders(Object.fromEntries((senders ?? []).map((s) => [s.user_id, s.username])));
          setLoadError("");
        }
      } catch (e) {
        console.error(e);
        if (alive) setLoadError("メッセージを読み込めませんでした。通信環境をご確認ください。");
      }
      finally { if (alive) setLoading(false); }
    })();

    /* リアルタイムで届く行は messages の生データで、profiles の埋め込みが無い。
       そのまま並べると相手の名前が「ゲスト」になってしまうので、
       すでに読み込んだ発言から表示名を借り、初めて発言した人だけ取りに行く。 */
    const unsub = api.subscribeMessages(party.id, (m) => {
      if (!alive) return;
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        const known = prev.find((x) => x.user_id === m.user_id && x.profiles)?.profiles;
        return [...prev, known ? { ...m, profiles: known } : m];
      });

      const uid = m.user_id;
      if (!uid || uid === user.id || lookedUp.current.has(uid)) return;
      lookedUp.current.add(uid);
      api.getProfile(uid)
        .then((p) => {
          if (!alive) return;
          if (!p) {
            /* プロフィールを引けない ＝ この会に参加していない方からの
               アプローチ。名前だけを別経路で取り直す。 */
            api.listApproachSenders(party.id)
              .then((senders) => {
                if (!alive) return;
                setApproachSenders(Object.fromEntries((senders ?? []).map((s) => [s.user_id, s.username])));
              })
              .catch((e) => console.error(e));
            return;
          }
          setMessages((prev) =>
            prev.map((x) => (x.user_id === uid && !x.profiles ? { ...x, profiles: p } : x))
          );
        })
        .catch((e) => console.error(e));
    });
    return () => { alive = false; unsub(); };
  }, [party.id, user.id]);

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
        {loading ? <Spinner /> : loadError ? (
          <EmptyState icon={<XCircle size={22} strokeWidth={1.6} />}>{loadError}</EmptyState>
        ) : messages.length === 0 ? (
          <EmptyState icon={<MessageCircle size={22} strokeWidth={1.6} />}>まだメッセージはありません。<br />当日に向けて、最初のひとことを。</EmptyState>
        ) : messages.map((m) => {
          const mine = m.user_id === user.id;
          /* この会に参加していない方からのメッセージ（アプローチ）。
             プロフィールが引けないので、表示名だけを別経路から借りる。 */
          const approachName = approachSenders[m.user_id];
          const isApproach = !mine && !!approachName;
          return (
            <div key={m.id} className="fade" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 11 }}>
              <div style={{ maxWidth: "76%" }}>
                {!mine && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, marginLeft: 4 }}>
                    <span style={{ fontSize: 10, color: C.textMuted }}>
                      {approachName || m.profiles?.username || "ゲスト"}
                    </span>
                    {isApproach && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: "2px 8px", borderRadius: 999,
                        color: C.primaryDeep, background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`,
                      }}>
                        <Heart size={9} strokeWidth={2.6} /> アプローチ
                      </span>
                    )}
                  </div>
                )}
                <div style={{
                  padding: "10px 14px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.55, wordBreak: "break-word",
                  ...(mine
                    ? { background: C.primaryGrad, color: "#241a06", borderBottomRightRadius: 5, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 16px rgba(0,0,0,0.4)" }
                    : isApproach
                      ? { background: "rgba(232,201,135,0.10)", color: C.text, border: `1px solid ${C.linePrimary}`, borderBottomLeftRadius: 5 }
                      : { background: "rgba(255,255,255,0.06)", color: C.text, border: `1px solid ${C.lineSoft}`, borderBottomLeftRadius: 5 }),
                }}>{m.content}</div>
                {isApproach && (
                  <div style={{ fontSize: 9.5, color: C.textFaint, marginTop: 4, marginLeft: 4, lineHeight: 1.6 }}>
                    まだこの会に参加していない方からのメッセージです。
                    プロフィールは、参加を承認すると見られるようになります。
                  </div>
                )}
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
const MyPageScreen = ({ user, onTerms, onSupport, onReport, onInvite, onSafety, onShops }) => {
  const { toast, confirm } = useToast();
  const [profile, setProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /* 自分のプロフィールだけは性別も一緒に取る（他人の性別は取得できない） */
      const [p, b] = await Promise.all([api.getMyProfile(user.id), api.getBalance(user.id)]);
      setProfile(p);
      setBalance(b);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

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
      <Suspense fallback={<Loading label="読み込み中…" />}>
        <ProfileEditScreen
          user={user}
          profile={profile}
          onBack={() => setEditing(false)}
          onSaved={(updated) => { setProfile(updated); setEditing(false); }}
        />
      </Suspense>
    );
  }


  const ROWS = [
    { icon: Gem, label: "ポイント残高", value: `${(balance ?? 0).toLocaleString()} pt`, highlight: true },
    { icon: Mail, label: "メール", value: user.email },
    { icon: Settings, label: "プロフィール編集", action: () => setEditing(true) },
    { icon: Gift, label: "友達を招待する", value: `+${api.REFERRAL_BONUS.toLocaleString()} pt`, action: onInvite, accent: true },
    { icon: ShieldCheck, label: "安心してご利用いただくために", action: onSafety },
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
          <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.textSec, lineHeight: 1.7, position: "relative", whiteSpace: "pre-wrap" }}>{profile.bio}</div>
        )}
        {(profile?.drinking_style?.length ?? 0) > 0 && (
          <div style={{ marginTop: 13, position: "relative" }}>
            <StyleTagRow tags={profile.drinking_style} label="飲みスタイル" />
          </div>
        )}
        {(profile?.hobbies?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 13, position: "relative" }}>
            {profile.hobbies.map((h) => <Tag key={h}>{h}</Tag>)}
          </div>
        )}
      </div>

      {/* 性別を集める前に登録した方への案内。
          会の参加条件にはならないが、募集中の会へメッセージを送るには必要になる。 */}
      {profile && !profile.gender && (
        <div className="fade" onClick={() => setEditing(true)} style={{
          ...card, padding: "14px 16px", marginBottom: 16, cursor: "pointer",
          display: "flex", gap: 11, alignItems: "flex-start",
          background: "linear-gradient(135deg, rgba(232,201,135,0.12), rgba(168,32,58,0.10))",
          border: `1px solid ${C.linePrimary}`,
        }}>
          <span style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(232,201,135,0.12)", border: `1px solid ${C.linePrimary}`, color: C.primaryDeep,
          }}><Heart size={14} strokeWidth={2} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>性別が未設定です</div>
            <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.75, marginTop: 3 }}>
              他のユーザーには表示されず、会の参加条件にもなりません。
              募集中の会へメッセージ（アプローチ）を送るときにだけ使います。
              一度設定すると変更できません。
            </div>
          </div>
        </div>
      )}

      {/* ランク … 相席の評価で決まる「選べるお店の予算帯」。
          本人にしか見えない（他人のランクは DB からも読めない）。 */}
      <Suspense fallback={null}>
        <RankCard onShops={onShops} />
      </Suspense>

      {/* プロフィールの充実度。承認後に相手へ伝わる中身が、どれだけ揃っているか。 */}
      <div className="fade" style={{ marginBottom: 16 }}>
        <Suspense fallback={null}>
          <CompletionMeter profile={profile} onJump={() => setEditing(true)} />
        </Suspense>
      </div>

      <div className="fade" style={{ ...card, overflow: "hidden" }}>
        {ROWS.map((item, i, arr) => (
          <div key={i} className={item.action ? "lux-row" : ""} onClick={item.action} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 18px", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none", cursor: item.action ? "pointer" : "default" }}>
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              <span style={{ display: "flex", color: item.highlight || item.accent ? C.primary : item.danger ? C.accent : C.textSec }}><item.icon size={17} strokeWidth={1.8} /></span>
              <span style={{ fontSize: 14, color: item.danger ? C.accentDeep : C.text }}>{item.label}</span>
            </div>
            {item.value && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: item.highlight ? FONT_DISPLAY : FONT_BODY, ...(item.highlight || item.accent ? brandText : { color: C.textSec }), maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</span>}
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

/* ホーム画面に追加したときのショートカット（manifest.webmanifest の shortcuts）は
   /?tab=create のように開かれる。ここで受け取らないと、どのショートカットから
   起動してもホームが開いてしまう。決済から戻ったとき（?checkout=）はポイント画面が
   優先されるため、そちらを先に見る。 */
const TAB_KEYS = ["home", "chat", "create", "points", "mypage"];
const readTabParam = () => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("tab");
  return TAB_KEYS.includes(v) ? v : null;
};

/* 広告用のランディングページ（/lp/women · /lp/men）からの導線。
   CTA は /?auth=signup で来るので、サービス紹介を飛ばして
   いきなり登録フォームを開く。?auth=login ならログイン。
   同時に付いてくる ?from=... は、どのLPから来たかの印（動作には影響しない）。

   ?auth= は読み終えたらアドレスバーから消すので、読むのは
   「消す前の一度きり」でなければならない。描画のたびに読み直すと、
   消したあとの再描画で null に戻ってしまう（開発時の二重マウントで実際に起きる）。
   そのためモジュールの読み込み時に一度だけ確定させる。 */
const AUTH_MODES = ["signup", "login"];
const INITIAL_AUTH_MODE = (() => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("auth");
  return AUTH_MODES.includes(v) ? v : null;
})();

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
  const [authMode, setAuthMode] = useState(INITIAL_AUTH_MODE);   // null = ランディングページ
  const [checkoutResult, setCheckoutResult] = useState(readCheckoutResult);
  const [tab, setTab] = useState(() => (readCheckoutResult() ? "points" : readTabParam() ?? "home"));
  const [detailId, setDetailId] = useState(null);
  const [chatRoom, setChatRoom] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null); // 通知から開くとき（会の実体は後から引く）
  // 'terms' | 'notifications' | 'support' | 'report' | 'invite' | 'safety'
  const [overlay, setOverlay] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);  // 通報の対象ユーザー（あれば）
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
      /* ログアウトしたら開いていた画面を片付けてランディングへ戻す。
         起動直後にも INITIAL_SESSION が セッション無し で必ず一度飛んでくるので、
         それは除く（除かないと ?auth=signup で開いた登録フォームが
         その場で閉じてしまう）。 */
      if (!s && event !== "INITIAL_SESSION") {
        setTab("home"); setDetailId(null); setChatRoom(null);
        setChatRoomId(null); setOverlay(null); setAuthMode(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ショートカットで指定されたタブ（?tab=...）と、LPからの導線（?auth= / ?from=）は
     開いた時点で用が済むので、アドレスバーから消す。付いたままだと、あとで
     別の画面を開いてリロードしたときに元に戻ってしまう。 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const keys = ["tab", "auth", "from"].filter((k) => url.searchParams.has(k));
    if (keys.length === 0) return;
    keys.forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
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
          targetUserId={reportTarget}
        />
      );
    }
    if (overlay === "invite") return <ReferralScreen onBack={backToApp} />;
    if (overlay === "shops") {
      return (
        <>
          <BackButton onBack={backToApp} />
          <ShopsScreen />
        </>
      );
    }
    if (overlay === "safety") {
      return (
        <SafetyScreen
          onBack={backToApp}
          onReport={() => { setReportTarget(null); setOverlay("report"); }}
          onTerms={() => setOverlay("terms")}
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
          onReport={(targetId) => { setReportTarget(targetId ?? null); setOverlay("report"); }}
        />
      );
    }
    switch (tab) {
      case "home": return <HomeScreen user={user} onDetail={setDetailId} onCreate={() => setTab("create")} />;
      case "create": return <CreateScreen user={user} onCreated={(id) => { setTab("home"); setDetailId(id); }} />;
      case "chat": return <ChatScreen user={user} openRoom={setChatRoom} openParty={setDetailId} />;
      case "points": return (
        <PointsScreen
          user={user}
          checkoutResult={checkoutResult}
          onCheckoutHandled={clearCheckoutParams}
          onInvite={() => setOverlay("invite")}
        />
      );
      case "mypage": return (
        <MyPageScreen
          user={user}
          onTerms={() => setOverlay("terms")}
          onSupport={() => setOverlay("support")}
          onReport={() => { setReportTarget(null); setOverlay("report"); }}
          onInvite={() => setOverlay("invite")}
          onSafety={() => setOverlay("safety")}
          onShops={() => setOverlay("shops")}
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

      {/* key を切り替えて、タブや画面が変わるたびに入場アニメーションを走らせる */}
      <div className="app-body">
        <div key={`${overlay ?? ""}:${detailId ?? ""}:${tab}`} className="screen-enter">
          <Suspense fallback={<Loading label="読み込み中…" />}>{renderScreen()}</Suspense>
        </div>
        {overlay !== "terms" && <AppFooter onTerms={() => setOverlay("terms")} onSupport={() => setOverlay("support")} />}
      </div>

      <TabBar
        active={tab}
        onTab={(t) => { setTab(t); setDetailId(null); setOverlay(null); setCheckoutResult(null); }}
      />
    </>
  );
}
