import { useState, useEffect, useCallback } from "react";
import { Lock, Store, MapPin, Check } from "lucide-react";
import * as api from "../lib/api.js";
import { C, FONT_HEAD, FONT_DISPLAY, card, SectionTitle, Eyebrow, EmptyState, SkeletonList } from "../lib/theme.jsx";
import { TierBadge, tierColor } from "./RankCard.jsx";

/* ══════════════════════════════════════════════════════════════
   お店の一覧（ランクごとの予算帯つき）

   ・全店を出し、いまのランクで選べないものは鍵つきで見せる。
     隠してしまうと「何を目指すのか」が分からなくなるため。
   ・ここに出るのは店舗の公開情報だけ（個人に関する情報は無い）。
   ・実際に会を作れるかどうかは DB 側でも判定される
     （enforce_group_party）。この画面の出し分けは案内にすぎない。
   ══════════════════════════════════════════════════════════════ */

/* 1軒分。選択できるときは押せる（会の作成画面から使う）。 */
export const ShopRow = ({ shop, selected, onSelect }) => {
  const c = tierColor(shop.tier?.key);
  const locked = !shop.allowed;
  return (
    <button
      type="button"
      onClick={() => (locked ? onSelect?.(null, shop) : onSelect?.(shop))}
      aria-disabled={locked}
      style={{
        width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start",
        padding: "13px 14px", borderRadius: 14, cursor: "pointer", marginBottom: 8,
        background: selected ? c.bg : "rgba(255,255,255,0.04)",
        border: `1px solid ${selected ? c.line : C.lineSoft}`,
        opacity: locked ? 0.48 : 1,
        color: "inherit", font: "inherit",
      }}
    >
      <span style={{
        flexShrink: 0, width: 34, height: 34, borderRadius: 17,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: c.bg, border: `1px solid ${c.line}`, color: c.fg,
      }}>
        {locked ? <Lock size={14} strokeWidth={2} />
          : selected ? <Check size={15} strokeWidth={2.6} />
          : <Store size={15} strokeWidth={1.9} />}
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          display: "block", fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600,
          color: C.text, letterSpacing: 0.2, lineHeight: 1.4,
        }}>{shop.name}</span>

        <span style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 5, flexWrap: "wrap" }}>
          {shop.area && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: C.textMuted }}>
              <MapPin size={11} strokeWidth={1.9} />{shop.area}
            </span>
          )}
          {shop.genre && <span style={{ fontSize: 11, color: C.textMuted }}>{shop.genre}</span>}
        </span>

        {shop.description && (
          <span style={{ display: "block", fontSize: 11, color: C.textSec, lineHeight: 1.7, marginTop: 6 }}>
            {shop.description}
          </span>
        )}

        {locked && (
          <span style={{ display: "block", fontSize: 10.5, color: C.textMuted, lineHeight: 1.7, marginTop: 6 }}>
            {shop.tier?.label}ランクから選べます
          </span>
        )}
      </span>

      <span style={{ flexShrink: 0, textAlign: "right" }}>
        <span style={{
          display: "block", fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700,
          color: c.fg, whiteSpace: "nowrap",
        }}>
          {Number(shop.avg_budget).toLocaleString()}<span style={{ fontSize: 10 }}>円</span>
        </span>
        <span style={{ display: "block", marginTop: 5 }}>
          <TierBadge tierKey={shop.tier?.key} label={shop.tier?.label} size="sm" />
        </span>
      </span>
    </button>
  );
};

export default function ShopsScreen({ onSelect, selectedId, myRankKey, embedded }) {
  const [shops, setShops] = useState([]);
  const [area, setArea] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* 会の作成画面から使うときはランクを渡してもらう。
     単独で開いたときはここで自分のランクを引く（他人のランクは引けない）。 */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = myRankKey ?? (await api.getMyRank().catch(() => null))?.tier_key;
      setShops(await api.listShops({ myRankKey: key }));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [myRankKey]);

  useEffect(() => { load(); }, [load]);

  const areas = api.shopAreas(shops);
  const rows = area ? shops.filter((s) => s.area === area) : shops;
  const usable = shops.filter((s) => s.allowed).length;

  const body = (
    <>
      {areas.length > 1 && (
        <div className="scroll-x" style={{ display: "flex", gap: 7, marginBottom: 13, paddingBottom: 2 }}>
          {["すべて", ...areas].map((a) => {
            const key = a === "すべて" ? "" : a;
            const on = area === key;
            return (
              <button key={a} className="chip" onClick={() => setArea(key)} style={{
                padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap",
                ...(on
                  ? { background: C.primaryGrad, border: "1px solid transparent", color: "#2a1e08" }
                  : { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.lineSoft}`, color: C.textSec }),
              }}>{a}</button>
            );
          })}
        </div>
      )}

      {loading ? <SkeletonList count={3} />
        : error ? (
          <div style={{ ...card, padding: "15px 17px", fontSize: 11.5, color: C.textMuted, lineHeight: 1.75 }}>
            お店を読み込めませんでした。（{error}）
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Store size={22} strokeWidth={1.6} />}>
            掲載中のお店はまだありません。お店を選ばずに、予算帯だけを決めて会を作ることもできます。
          </EmptyState>
        ) : rows.map((s) => (
          <ShopRow key={s.id} shop={s} selected={selectedId === s.id} onSelect={onSelect} />
        ))}
    </>
  );

  if (embedded) return body;

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <SectionTitle sub="Where you can go">選べるお店</SectionTitle>
      <div style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 7 }}>いまのランクで選べるお店</Eyebrow>
        <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85 }}>
          掲載{shops.length}軒のうち<b style={{ color: C.text, fontWeight: 700 }}>{usable}軒</b>で会を主催できます。
          鍵のかかったお店は、相席の評価でランクが上がると選べるようになります。
          <br />
          金額は<b style={{ color: C.textSec }}>お一人あたりの目安</b>です。当日のホストグループの飲食代は参加グループが負担します。
        </div>
      </div>
      {body}
    </div>
  );
}
