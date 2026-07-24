import { useState } from "react";

/* ── Dark · Gold · Deep Red palette ───────────────────────────── */
const C = {
  panel: "linear-gradient(155deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.02) 100%)",
  panelSoft: "linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)",
  gold: "#e8c874",
  goldBright: "#f7e2a3",
  goldDeep: "#b8863b",
  goldGrad: "linear-gradient(135deg, #f7e6b0 0%, #e0b954 48%, #b8863b 100%)",
  red: "#c0304a",
  redGrad: "linear-gradient(135deg, #c8384f 0%, #7c1626 100%)",
  text: "#f4efe3",
  textSec: "rgba(244,239,227,0.62)",
  textMuted: "rgba(244,239,227,0.4)",
  line: "rgba(232,200,116,0.16)",
  lineSoft: "rgba(255,255,255,0.08)",
};

const FONT_DISPLAY = "'Cormorant Garamond', 'Shippori Mincho', serif";

const goldText = {
  background: C.goldGrad,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

const glass = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 18,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  boxShadow: "0 12px 34px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09)",
};

const goldBtn = {
  background: C.goldGrad,
  color: "#2c1e08",
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  letterSpacing: 0.3,
  boxShadow: "0 8px 22px rgba(184,134,59,0.4), inset 0 1px 0 rgba(255,255,255,0.55)",
};

const img = (gender, n) => `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

const parties = [
  { id: 1, name: "金曜ナイト飲み", area: "渋谷", venue: "炭火居酒屋 山", people: 3, time: "20:00〜", treat: "奢り", points: 500, gender: "女性", tags: ["20代", "社会人"], avatar: "🍸",
    members: [
      { name: "みお", age: 24, photo: img("women", 44) },
      { name: "あや", age: 26, photo: img("women", 68) },
      { name: "りな", age: 23, photo: img("women", 25) },
    ] },
  { id: 2, name: "週末カジュアル会", area: "六本木", venue: "Bar LUNA", people: 2, time: "21:00〜", treat: "割り勘", points: 200, gender: "女性", tags: ["25〜30歳", "お酒好き"], avatar: "🥂",
    members: [
      { name: "さき", age: 27, photo: img("women", 33) },
      { name: "ゆき", age: 29, photo: img("women", 51) },
    ] },
  { id: 3, name: "仕事終わりの一杯", area: "新宿", venue: "和食ダイニング 花", people: 4, time: "19:30〜", treat: "奢り", points: 400, gender: "女性", tags: ["社会人", "まったり"], avatar: "🌸",
    members: [
      { name: "なな", age: 25, photo: img("women", 12) },
      { name: "えみ", age: 28, photo: img("women", 9) },
      { name: "かな", age: 26, photo: img("women", 60) },
      { name: "ほのか", age: 24, photo: img("women", 41) },
    ] },
  { id: 4, name: "土曜ワイン会", area: "恵比寿", venue: "Wine & Dine CAVA", people: 2, time: "19:00〜", treat: "割り勘", points: 300, gender: "女性", tags: ["ワイン好き", "大人"], avatar: "🍷",
    members: [
      { name: "まり", age: 30, photo: img("women", 79) },
      { name: "ちひろ", age: 31, photo: img("women", 90) },
    ] },
];

const TreatBadge = ({ treat }) => {
  const gold = treat === "奢り";
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, whiteSpace: "nowrap",
      padding: "3px 11px", borderRadius: 20,
      color: gold ? "#2c1e08" : C.textSec,
      background: gold ? C.goldGrad : "rgba(255,255,255,0.06)",
      border: gold ? "none" : `1px solid ${C.lineSoft}`,
      boxShadow: gold ? "inset 0 1px 0 rgba(255,255,255,0.5)" : "none",
    }}>{gold ? "◆ 奢り" : "割り勘"}</span>
  );
};

const Tag = ({ children }) => (
  <span style={{
    fontSize: 11, fontWeight: 400, color: C.textSec, whiteSpace: "nowrap",
    padding: "3px 10px", borderRadius: 20,
    background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`,
  }}>{children}</span>
);

const TabBar = ({ active, onTab }) => (
  <div style={{
    display: "flex", padding: "8px 0 4px",
    background: "linear-gradient(180deg, rgba(12,10,14,0.4), rgba(8,7,10,0.92))",
    borderTop: `1px solid ${C.line}`,
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  }}>
    {[
      { key: "home", icon: "🏠", label: "ホーム" },
      { key: "create", icon: "✦", label: "会を作る" },
      { key: "chat", icon: "💬", label: "チャット" },
      { key: "points", icon: "◆", label: "ポイント" },
      { key: "mypage", icon: "👤", label: "マイページ" },
    ].map(t => {
      const on = active === t.key;
      return (
        <button key={t.key} onClick={() => onTab(t.key)} style={{
          flex: 1, background: "none", border: "none", padding: "4px 0", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        }}>
          <span style={{ fontSize: 17, ...(on ? goldText : { filter: "grayscale(0.4) opacity(0.6)" }) }}>{t.icon}</span>
          <span style={{ fontSize: 9.5, letterSpacing: 0.3, color: on ? C.gold : C.textMuted, fontWeight: on ? 600 : 400 }}>{t.label}</span>
        </button>
      );
    })}
  </div>
);

const AvatarBubble = ({ children, size = 46 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5,
    background: "radial-gradient(circle at 35% 30%, rgba(232,200,116,0.22), rgba(168,32,58,0.14))",
    border: `1px solid ${C.line}`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
  }}>{children}</div>
);

const PartyCard = ({ p, onTap }) => (
  <div onClick={onTap} style={{ ...glass, padding: 16, marginBottom: 13, cursor: "pointer", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <AvatarBubble>{p.avatar}</AvatarBubble>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15.5, color: C.text, letterSpacing: 0.2 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{p.venue} · {p.area}</div>
        </div>
      </div>
      <TreatBadge treat={p.treat} />
    </div>
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
      {p.tags.map(t => <Tag key={t}>{t}</Tag>)}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 11, borderTop: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.textSec }}>
        <span>👥 {p.people}名</span>
        <span>🕐 {p.time}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_DISPLAY, ...goldText }}>{p.points}<span style={{ fontSize: 11 }}> pt</span></div>
    </div>
  </div>
);

const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 600, letterSpacing: 0.5, color: C.text }}>{children}</div>
    {sub && <div style={{ fontSize: 11.5, color: C.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>{sub}</div>}
  </div>
);

const HomeScreen = ({ onDetail }) => (
  <div>
    <div style={{ padding: "18px 20px 6px" }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
        {["渋谷", "新宿", "六本木", "恵比寿", "池袋"].map((a, i) => (
          <button key={a} style={{
            padding: "7px 17px", borderRadius: 22, fontSize: 12.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
            ...(i === 0
              ? { ...goldBtn, borderRadius: 22, color: "#2c1e08" }
              : { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
          }}>{a}</button>
        ))}
      </div>
    </div>
    <div style={{ padding: "6px 20px 20px" }}>
      <div style={{ fontSize: 11.5, color: C.textMuted, letterSpacing: 1, marginBottom: 14 }}>近くで募集中の会 — {parties.length}件</div>
      {parties.map(p => <PartyCard key={p.id} p={p} onTap={() => onDetail(p)} />)}
    </div>
  </div>
);

const DetailScreen = ({ party, onBack }) => (
  <div style={{ padding: "0 20px 24px" }}>
    <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 13, color: C.gold, cursor: "pointer", padding: "14px 0", fontWeight: 500, letterSpacing: 0.5 }}>← 戻る</button>
    <div style={{ ...glass, overflow: "hidden" }}>
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }} />
      <div style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <AvatarBubble size={58}>{party.avatar}</AvatarBubble>
          <TreatBadge treat={party.treat} />
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 27, fontWeight: 600, margin: "0 0 5px", color: C.text, letterSpacing: 0.4 }}>{party.name}</h2>
        <p style={{ fontSize: 12.5, color: C.textSec, margin: "0 0 22px", letterSpacing: 0.3 }}>{party.gender}グループ · {party.tags.join(" · ")}</p>

        {party.members && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.gold, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Members · 参加メンバー</div>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
              {party.members.map((m, i) => (
                <div key={i} style={{ textAlign: "center", flexShrink: 0, width: 74 }}>
                  <div style={{ position: "relative", width: 68, height: 68, margin: "0 auto", borderRadius: 34, padding: 2, background: C.goldGrad, boxShadow: "0 6px 16px rgba(0,0,0,0.5)" }}>
                    <img src={m.photo} alt={m.name} loading="lazy"
                      style={{ width: "100%", height: "100%", borderRadius: 32, objectFit: "cover", display: "block", background: "#1a1620" }} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 8 }}>{m.name}</div>
                  <div style={{ fontSize: 10.5, color: C.textMuted }}>{m.age}歳</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 20 }}>
          {[
            { label: "場所", value: `${party.venue}（${party.area}）`, icon: "📍" },
            { label: "時間", value: party.time, icon: "🕐" },
            { label: "人数", value: `${party.people}名`, icon: "👥" },
            { label: "必要ポイント", value: `${party.points}pt / 人`, icon: "◆" },
          ].map(item => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.lineSoft}`, borderRadius: 13, padding: 13 }}>
              <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 5, letterSpacing: 0.5 }}>{item.icon} {item.label}</div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{
          borderRadius: 15, padding: 17, marginBottom: 18, position: "relative", overflow: "hidden",
          background: "linear-gradient(135deg, rgba(168,32,58,0.28), rgba(124,22,38,0.14))",
          border: `1px solid rgba(192,48,74,0.35)`,
        }}>
          <div style={{ fontSize: 10.5, color: "rgba(244,239,227,0.7)", marginBottom: 6, letterSpacing: 1.5, textTransform: "uppercase" }}>合計必要ポイント</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: FONT_DISPLAY, ...goldText }}>{(party.points * party.people).toLocaleString()}<span style={{ fontSize: 15 }}> pt</span></div>
          <div style={{ fontSize: 11, color: C.textSec }}>{party.points}pt × {party.people}名</div>
        </div>

        <button style={{ ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15.5 }}>
          リクエストを送る
        </button>
      </div>
    </div>
  </div>
);

const fieldStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 11, fontSize: 14, outline: "none", boxSizing: "border-box",
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`, color: C.text,
};
const labelStyle = { fontSize: 12, fontWeight: 500, color: C.textSec, display: "block", marginBottom: 7, letterSpacing: 0.5 };

const CreateScreen = () => {
  const [treat, setTreat] = useState("奢り");
  return (
    <div style={{ padding: "14px 20px 24px" }}>
      <SectionTitle sub="Host a table">会を作成</SectionTitle>
      <div style={{ ...glass, padding: 22 }}>
        {[
          { label: "会の名前", placeholder: "例: 金曜ナイト飲み" },
          { label: "お店", placeholder: "店舗を検索" },
          { label: "エリア", placeholder: "例: 渋谷" },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 17 }}>
            <label style={labelStyle}>{f.label}</label>
            <input placeholder={f.placeholder} style={fieldStyle} />
          </div>
        ))}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 17 }}>
          <div>
            <label style={labelStyle}>人数</label>
            <select style={{ ...fieldStyle, colorScheme: "dark" }}>
              {[1,2,3,4,5].map(n => <option key={n}>{n}名</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>時間</label>
            <input type="time" defaultValue="20:00" style={{ ...fieldStyle, colorScheme: "dark" }} />
          </div>
        </div>

        <div style={{ marginBottom: 17 }}>
          <label style={labelStyle}>お会計</label>
          <div style={{ display: "flex", gap: 9 }}>
            {["奢り", "割り勘"].map(t => {
              const on = treat === t;
              return (
                <button key={t} onClick={() => setTreat(t)} style={{
                  flex: 1, padding: "11px 0", borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  ...(on
                    ? { ...goldBtn, borderRadius: 11 }
                    : { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
                }}>{t}</button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>必要ポイント（1人あたり）</label>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <input type="number" defaultValue={300} style={fieldStyle} />
            <span style={{ fontSize: 14, color: C.gold, fontWeight: 600 }}>pt</span>
          </div>
        </div>

        <button style={{ ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15.5 }}>会を作成する</button>
      </div>
    </div>
  );
};

const PointsScreen = () => {
  const [tab, setTab] = useState("buy");
  return (
    <div style={{ padding: "14px 20px 24px" }}>
      <div style={{
        borderRadius: 20, padding: 26, marginBottom: 18, position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #1b1420 0%, #0d0a10 55%, #241118 100%)",
        border: `1px solid ${C.line}`,
        boxShadow: "0 16px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)",
      }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 60, background: "linear-gradient(90deg, rgba(255,255,255,0.18), transparent)", animation: "sheen 5s ease-in-out infinite" }} />
        <div style={{ fontSize: 10.5, color: C.textMuted, marginBottom: 8, letterSpacing: 2, textTransform: "uppercase" }}>◆ Point Balance</div>
        <div style={{ fontSize: 42, fontWeight: 700, fontFamily: FONT_DISPLAY, lineHeight: 1, marginBottom: 8, ...goldText }}>2,450<span style={{ fontSize: 17, fontWeight: 500 }}> pt</span></div>
        <div style={{ fontSize: 11, color: C.textSec }}>有効期限: 2027 / 01 / 23</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[{ key: "buy", label: "購入" }, { key: "convert", label: "オリパpt変換" }, { key: "history", label: "履歴" }].map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "9px 0", borderRadius: 11, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              ...(on
                ? { ...goldBtn, borderRadius: 11 }
                : { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
            }}>{t.label}</button>
          );
        })}
      </div>

      {tab === "buy" && (
        <div style={{ ...glass, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: C.gold, letterSpacing: 1.5, textTransform: "uppercase" }}>Buy Points</div>
          {[
            { amount: 500, price: 500, bonus: 0 },
            { amount: 1100, price: 1000, bonus: 100 },
            { amount: 2400, price: 2000, bonus: 400, popular: true },
            { amount: 5500, price: 5000, bonus: 500 },
            { amount: 12000, price: 10000, bonus: 2000 },
          ].map((p, i, arr) => (
            <div key={p.price} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text }}>{p.amount.toLocaleString()}<span style={{ fontSize: 11 }}> pt</span></span>
                {p.bonus > 0 && <Tag>+{p.bonus} ボーナス</Tag>}
                {p.popular && <span style={{ fontSize: 10, fontWeight: 700, color: "#2c1e08", background: C.goldGrad, padding: "2px 9px", borderRadius: 20, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>人気</span>}
              </div>
              <button style={{ ...goldBtn, padding: "9px 17px", borderRadius: 11, fontSize: 13 }}>¥{p.price.toLocaleString()}</button>
            </div>
          ))}
        </div>
      )}

      {tab === "convert" && (
        <div style={{ ...glass, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: C.gold, letterSpacing: 1.5, textTransform: "uppercase" }}>Convert · オリパpt変換</div>
          <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.lineSoft}`, borderRadius: 14, padding: 17, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted }}>変換元</div>
                <div style={{ fontSize: 21, fontWeight: 700, fontFamily: FONT_DISPLAY, color: C.text }}>1,000<span style={{ fontSize: 12 }}> pt</span></div>
              </div>
              <span style={{ fontSize: 22, ...goldText }}>→</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>変換先（オリパpt）</div>
                <div style={{ fontSize: 21, fontWeight: 700, fontFamily: FONT_DISPLAY, ...goldText }}>850<span style={{ fontSize: 12 }}> pt</span></div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: C.textMuted, textAlign: "center" }}>変換レート: 1pt → 0.85オリパpt（手数料15%）</div>
          </div>
          <input type="range" min={100} max={2450} step={50} defaultValue={1000} style={{ width: "100%", marginBottom: 18, accentColor: C.gold }} />
          <button style={{ ...goldBtn, width: "100%", padding: "15px 0", borderRadius: 14, fontSize: 15.5 }}>変換する</button>
        </div>
      )}

      {tab === "history" && (
        <div style={{ ...glass, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.gold, letterSpacing: 1.5, textTransform: "uppercase" }}>History · 取引履歴</div>
          {[
            { date: "7/22", desc: "ポイント購入", amount: "+2,400pt", up: true },
            { date: "7/21", desc: "相席マッチ（渋谷）", amount: "-1,500pt", up: false },
            { date: "7/20", desc: "オリパpt変換", amount: "-500pt", up: false },
            { date: "7/18", desc: "ポイント購入", amount: "+1,100pt", up: true },
          ].map((h, i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>{h.desc}</div>
                <div style={{ fontSize: 10.5, color: C.textMuted }}>{h.date}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_DISPLAY, color: h.up ? C.gold : C.red }}>{h.amount}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChatScreen = () => (
  <div style={{ padding: "14px 20px 24px" }}>
    <SectionTitle sub="Messages">チャット</SectionTitle>
    {[
      { name: "金曜ナイト飲み", last: "じゃあ20時に集合で!", time: "18:32", unread: 2, avatar: "🍸" },
      { name: "週末カジュアル会", last: "お店変更になりました", time: "昨日", unread: 0, avatar: "🥂" },
    ].map((c, i) => (
      <div key={i} style={{ ...glass, display: "flex", gap: 13, alignItems: "center", padding: 15, marginBottom: 10, cursor: "pointer" }}>
        <AvatarBubble size={44}>{c.avatar}</AvatarBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.name}</span>
            <span style={{ fontSize: 10.5, color: C.textMuted }}>{c.time}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.last}</div>
        </div>
        {c.unread > 0 && <span style={{ background: C.goldGrad, color: "#2c1e08", fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>{c.unread}</span>}
      </div>
    ))}
  </div>
);

const MyPageScreen = () => (
  <div style={{ padding: "14px 20px 24px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 15, marginBottom: 22 }}>
      <div style={{ width: 62, height: 62, borderRadius: 31, padding: 2, background: C.goldGrad, boxShadow: "0 8px 20px rgba(0,0,0,0.5)" }}>
        <img src={img("men", 32)} alt="ザキ" style={{ width: "100%", height: "100%", borderRadius: 29, objectFit: "cover", display: "block", background: "#1a1620" }} />
      </div>
      <div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 23, color: C.text, letterSpacing: 0.3 }}>ザキ</div>
        <div style={{ fontSize: 12, color: C.textSec, letterSpacing: 0.5 }}>東京 · 28歳 · <span style={{ ...goldText, fontWeight: 600 }}>Premium</span></div>
      </div>
    </div>
    <div style={{ ...glass, overflow: "hidden" }}>
      {[
        { icon: "◆", label: "ポイント残高", value: "2,450 pt", gold: true },
        { icon: "📊", label: "相席回数", value: "12回" },
        { icon: "⭐", label: "評価", value: "4.8" },
        { icon: "⚙️", label: "設定" },
        { icon: "📋", label: "利用規約" },
        { icon: "🚪", label: "ログアウト" },
      ].map((item, i, arr) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : "none", cursor: "pointer" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 14, ...(item.gold ? goldText : { opacity: 0.75 }) }}>{item.icon}</span>
            <span style={{ fontSize: 14, color: C.text }}>{item.label}</span>
          </div>
          {item.value && <span style={{ fontSize: 14, fontWeight: 600, fontFamily: FONT_DISPLAY, ...(item.gold ? goldText : { color: C.textSec }) }}>{item.value}</span>}
        </div>
      ))}
    </div>
  </div>
);

export default function App() {
  const [tab, setTab] = useState("home");
  const [detail, setDetail] = useState(null);

  const renderScreen = () => {
    if (detail) return <DetailScreen party={detail} onBack={() => setDetail(null)} />;
    switch (tab) {
      case "home": return <HomeScreen onDetail={setDetail} />;
      case "create": return <CreateScreen />;
      case "chat": return <ChatScreen />;
      case "points": return <PointsScreen />;
      case "mypage": return <MyPageScreen />;
      default: return <HomeScreen onDetail={setDetail} />;
    }
  };

  return (
    <div style={{
      maxWidth: 400, width: "100%", margin: "0 auto", minHeight: 720, display: "flex", flexDirection: "column", overflow: "hidden",
      borderRadius: 28,
      background:
        "radial-gradient(120% 80% at 85% -5%, rgba(168,32,58,0.3), transparent 55%)," +
        "radial-gradient(100% 60% at 0% 5%, rgba(232,200,116,0.1), transparent 50%)," +
        "linear-gradient(180deg, #100b13 0%, #08070a 100%)",
      border: `1px solid ${C.line}`,
      boxShadow: "0 40px 90px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)",
      fontFamily: "'Zen Kaku Gothic New', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.line}`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), transparent)",
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: 1, ...goldText }}>相席</span>
          <span style={{ fontSize: 8, letterSpacing: 3, color: C.textMuted, textTransform: "uppercase", marginTop: -2 }}>Premium Lounge</span>
        </div>
        <span style={{ fontSize: 15, opacity: 0.7 }}>🔔</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {renderScreen()}
      </div>
      <TabBar active={tab} onTab={(t) => { setTab(t); setDetail(null); }} />
    </div>
  );
}
