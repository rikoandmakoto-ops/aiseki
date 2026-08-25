import { useState, useEffect, useCallback } from "react";
import { Star, Lock, Store, ChevronRight, Wallet, TrendingUp, Crown, DoorOpen } from "lucide-react";
import * as api from "../lib/api.js";
import {
  C, FONT_HEAD, FONT_DISPLAY, FONT_BODY, brandText, card, Eyebrow, Spinner,
  TierBadge, tierColor,
} from "../lib/theme.jsx";

/* 札そのものは theme.jsx に移した（App.jsx など、遅延読み込みでない場所からも
   使うため）。既存の import 経路を壊さないよう、ここからも出しておく。 */
export { TierBadge, tierColor };

/* ══════════════════════════════════════════════════════════════
   ランク（会の終了後に受け取った評価で決まる）

   ランクは主催する側にも参加する側にも効くので、両方をここに出す。
     ・主催するとき … 選べるお店の予算帯
     ・参加するとき … 申し込める会（会ごとの参加条件）

   ・平均点・件数を見られるのは本人だけ（DB の列単位 SELECT 権限で遮断）。
   ・個別の評価（誰がいくつ付けたか・コメント）は、これまでどおり
     本人にも相手にも表示しない。
   ・ランクの区分（ブロンズ〜プラチナ）だけは、同じ会に参加が承認された
     メンバーに見える。氏名・写真と同じ範囲。ここを取り違えて
     「誰にも見えません」と書かないこと（2026-08-25 に変わった）。
   ・規則は性別で分けていない（全ユーザー共通）。理由は
     supabase/migration_caste_rank.sql と migration_mutual_rank.sql の冒頭。
   ══════════════════════════════════════════════════════════════ */

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
  /* 参加する側から見た効果。migration_mutual_rank.sql 未適用の環境では
     my_rank() が返さないので、そのときは件数を出さずに文言だけにする。 */
  const openParties = Number.isFinite(rank.open_parties) ? rank.open_parties : null;
  const gatedParties = Number.isFinite(rank.gated_parties) ? rank.gated_parties : 0;
  const unlocks = Number.isFinite(rank.next?.unlocks) ? rank.next.unlocks : 0;

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

      {/* ── ランクが効く2つの場面 ──
          主催のときだけでなく、参加のときにも効く。
          「評価されると何が良くなるのか」を、この2行で分かるようにする。 */}
      <div style={{ display: "flex", borderTop: `1px solid ${C.lineSoft}` }}>
        <div style={{ flex: 1, padding: "13px 16px 14px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
            <Crown size={11} strokeWidth={2} color={C.primary} /> 主催するとき
          </div>
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.7 }}>
            {capText}のお店で会を立てられます。
          </div>
        </div>
        <div style={{ flex: 1, padding: "13px 16px 14px", borderLeft: `1px solid ${C.lineSoft}` }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
            <DoorOpen size={11} strokeWidth={2} color={C.primary} /> 参加するとき
          </div>
          <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.7 }}>
            {openParties == null ? (
              "ランクの条件が付いた会にも申し込めます。"
            ) : gatedParties > 0 ? (
              <>募集中の会 <b style={{ color: C.text, fontWeight: 700 }}>{openParties}件</b>に申し込めます（残り{gatedParties}件は上位ランク向け）。</>
            ) : (
              <>募集中の会 <b style={{ color: C.text, fontWeight: 700 }}>{openParties}件</b>すべてに申し込めます。</>
            )}
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
              {unlocks > 0 && <>いま募集中の会のうち、あらたに{unlocks}件へ申し込めるようになります。</>}
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
          <b style={{ color: C.textSec, fontWeight: 700 }}>平均点と件数を見られるのはあなただけです。</b>
          <br />
          ランクの名前（{rank.tier_label}）は、同じ会に参加が承認されたメンバーには表示されます
          （お名前・お写真と同じ範囲です）。会の一覧には出ません。
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
