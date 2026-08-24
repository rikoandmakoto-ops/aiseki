import { useState, useEffect, useCallback } from "react";
import { Star, Lock, Store, ChevronRight, Wallet, TrendingUp } from "lucide-react";
import * as api from "../lib/api.js";
import { C, FONT_HEAD, FONT_DISPLAY, FONT_BODY, brandText, card, Eyebrow, Spinner } from "../lib/theme.jsx";

/* ══════════════════════════════════════════════════════════════
   ランク（会の終了後に受け取った評価で決まる予算帯）

   ・見えるのは自分のランクだけ。他のユーザーのランク・平均点は
     どの画面からも見えない（DB の列単位 SELECT 権限で遮断）。
   ・個別の評価（誰がいくつ付けたか・コメント）は、これまでどおり
     本人にも表示しない。ここに出るのは平均点と件数だけ。
   ・規則は性別で分けていない（全ユーザー共通）。理由は
     supabase/migration_caste_rank.sql の冒頭にある。
   ══════════════════════════════════════════════════════════════ */

/* ランクごとの色。金一色だと段差が出ないので、下位ほど彩度を落とす。 */
const TIER_COLOR = {
  bronze:   { fg: "#c98f63", line: "rgba(201,143,99,0.42)",  bg: "rgba(201,143,99,0.10)" },
  silver:   { fg: "#c7ced8", line: "rgba(199,206,216,0.40)", bg: "rgba(199,206,216,0.10)" },
  gold:     { fg: C.primaryDeep, line: C.linePrimary,        bg: "rgba(232,201,135,0.12)" },
  platinum: { fg: "#eae4f2", line: "rgba(234,228,242,0.50)", bg: "rgba(234,228,242,0.13)" },
};
export const tierColor = (key) => TIER_COLOR[key] ?? TIER_COLOR.bronze;

/* ランクの札。予算帯の選択肢にも使う。 */
export const TierBadge = ({ tierKey, label, size = "md" }) => {
  const c = tierColor(tierKey);
  const sm = size === "sm";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: sm ? "3px 9px" : "5px 13px", borderRadius: 999,
      fontSize: sm ? 10.5 : 12, fontWeight: 700, letterSpacing: 0.6,
      color: c.fg, background: c.bg, border: `1px solid ${c.line}`,
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
};

const Stars = ({ value, size = 14 }) => (
  <span style={{ display: "inline-flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={size} strokeWidth={1.8}
        color={n <= Math.round(value) ? C.primary : C.textFaint}
        fill={n <= Math.round(value) ? C.primary : "none"} />
    ))}
  </span>
);

/* 次のランクまでの進み具合。平均点そのものを棒で見せる。 */
const Progress = ({ average, from, to }) => {
  const span = Math.max(0.01, to - from);
  const pct = Math.max(0, Math.min(100, ((Number(average) || 0) - from) / span * 100));
  return (
    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: C.primaryGrad, borderRadius: 3 }} />
    </div>
  );
};

export default function RankCard({ onShops }) {
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRank(await api.getMyRank());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ ...card, padding: 20, marginBottom: 16, display: "flex", justifyContent: "center" }}>
        <Spinner label="ランクを読み込み中…" />
      </div>
    );
  }
  if (error || !rank) {
    return (
      <div style={{ ...card, padding: "15px 17px", marginBottom: 16, fontSize: 11.5, color: C.textMuted, lineHeight: 1.75 }}>
        ランクを読み込めませんでした。{error ? `（${error}）` : ""}
      </div>
    );
  }

  const c = tierColor(rank.tier_key);
  const avg = Number(rank.review_average) || 0;
  const capText = rank.budget_cap
    ? `お一人 〜${Number(rank.budget_cap).toLocaleString()}円`
    : "お一人 上限なし";
  const remain = Math.max(0, (rank.min_reviews ?? 0) - (rank.review_count ?? 0));

  return (
    <div className="fade" style={{
      ...card, padding: 0, marginBottom: 16, overflow: "hidden",
      border: `1px solid ${c.line}`,
    }}>
      {/* ── いまのランク ── */}
      <div style={{ padding: "18px 19px 17px", background: c.bg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow style={{ marginBottom: 8 }}>あなたのランク</Eyebrow>
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 700, lineHeight: 1,
              color: c.fg, letterSpacing: 1,
            }}>{rank.tier_label}</div>
            {/* 評価がまだ無いときは、空の星を並べても意味が無いので言葉だけにする */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
              {rank.review_count > 0 ? (
                <>
                  <Stars value={avg} />
                  <span style={{ fontSize: 12, color: C.textSec, fontFamily: FONT_BODY, whiteSpace: "nowrap" }}>
                    平均 <b style={{ color: C.text, fontWeight: 700 }}>{avg.toFixed(2)}</b> · {rank.review_count}件
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, color: C.textMuted, fontFamily: FONT_BODY }}>
                  評価はまだありません
                </span>
              )}
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
              <Wallet size={11} strokeWidth={2} /> 選べるお店
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: FONT_HEAD, color: c.fg, whiteSpace: "nowrap" }}>
              {capText}
            </div>
          </div>
        </div>
      </div>

      {/* ── 次のランクまで ── */}
      <div style={{ padding: "15px 19px", borderTop: `1px solid ${C.lineSoft}` }}>
        {!rank.ranked ? (
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85 }}>
            ランクは、相席した方から受け取った評価が
            <b style={{ color: C.text, fontWeight: 700 }}>{rank.min_reviews}件</b>集まると動き始めます。
            あと<b style={{ color: C.primaryDeep, fontWeight: 700 }}>{remain}件</b>です。
          </div>
        ) : rank.next ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.textSec }}>
                <TrendingUp size={12} strokeWidth={2} color={C.primary} />
                次は <TierBadge tierKey={rank.next.tier_key} label={rank.next.tier_label} size="sm" />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, ...brandText, fontFamily: FONT_DISPLAY }}>
                平均 {Number(rank.next.min_avg).toFixed(1)} で到達
              </span>
            </div>
            <Progress average={avg} from={api.rankTier(rank.tier_key).minAvg} to={Number(rank.next.min_avg)} />
            <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 8, lineHeight: 1.7 }}>
              到達すると、お一人{rank.next.budget_cap
                ? ` 〜${Number(rank.next.budget_cap).toLocaleString()}円`
                : " 上限なし"}のお店で会を主催できます。
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.85 }}>
            最上位のランクです。予算の上限なくお店を選べます。
          </div>
        )}
      </div>

      {/* ── 評価の見え方（誤解が起きやすいので必ず書く） ── */}
      <div style={{
        display: "flex", gap: 9, alignItems: "flex-start",
        padding: "13px 19px", borderTop: `1px solid ${C.lineSoft}`,
        background: "rgba(255,255,255,0.02)",
      }}>
        <Lock size={13} strokeWidth={1.9} color={C.primary} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.8 }}>
          個別の評価（点数・コメント・誰が付けたか）は、あなたにも他の方にも表示されません。
          ここに出るのは平均点と件数だけです。
          <b style={{ color: C.textSec, fontWeight: 700 }}>あなたのランクは他のユーザーには見えません。</b>
        </div>
      </div>

      {onShops && (
        <div className="lux-row" onClick={onShops} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 19px", borderTop: `1px solid ${C.lineSoft}`, cursor: "pointer",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 13.5, color: C.text }}>
            <Store size={16} strokeWidth={1.8} color={C.primary} /> 選べるお店を見る
          </span>
          <ChevronRight size={16} strokeWidth={2} color={C.textMuted} />
        </div>
      )}
    </div>
  );
}
