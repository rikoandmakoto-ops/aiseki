-- =====================================================================
--  AISEKI — 店舗カタログのサンプル（2026-08-24）
--
--  ⚠ これは【動作確認用のダミーデータ】であって、実在の提携店舗ではない。
--    店名はすべて「【サンプル】」で始めてあり、画面にもそのまま出る。
--    実際の提携店舗が決まったら、この行を消してから登録すること。
--
--      delete from public.shops where name like '【サンプル】%';
--
--    掲載を止めるだけなら:
--      update public.shops set is_active = false where name like '【サンプル】%';
--
--  予算帯（rank_tiers）との対応:
--    〜3,000円 … ブロンズ / 〜5,000円 … シルバー
--    〜8,000円 … ゴールド / 8,000円〜 … プラチナ
--
--  適用:
--    AISEKI_DB_PASSWORD='...' node scripts/apply_sql.mjs supabase/seed_shops_sample.sql
-- =====================================================================

insert into public.shops (name, area, genre, avg_budget, description)
select v.name, v.area, v.genre, v.avg_budget, v.description
  from (values
    -- ブロンズ（〜3,000円）
    ('【サンプル】立ち飲み やまと',   '新宿',   '立ち飲み',   2200,
     'カウンター中心の立ち飲み。1杯目から気楽に話せます。'),
    ('【サンプル】炭火酒場 とり源',   '渋谷',   '焼き鳥',     2800,
     '串とハイボール。フロア席のみの賑やかな一軒。'),
    ('【サンプル】バル ソレイユ',     '池袋',   'スペインバル', 3000,
     'タパスとグラスワイン。テーブル席が広め。'),

    -- シルバー（〜5,000円）
    ('【サンプル】海鮮居酒屋 汐路',   '新橋',   '海鮮',       4200,
     '刺身の盛り合わせが名物。オープンフロアの座席。'),
    ('【サンプル】ビストロ ルミエール', '恵比寿', 'ビストロ',   4800,
     '気取らないフレンチ。カウンターとテーブル。'),
    ('【サンプル】焼肉 정（じょん）',  '六本木', '焼肉',       5000,
     '一頭買いの焼肉。フロア席のみ。'),

    -- ゴールド（〜8,000円）
    ('【サンプル】和食 花あかり',     '銀座',   '和食',       6800,
     '季節のコースと日本酒。落ち着いたフロア席。'),
    ('【サンプル】鮨 なぎさ',         '恵比寿', '鮨',         7500,
     'つまみと握り。カウンター中心の構え。'),
    ('【サンプル】Wine Room CAVA',    '中目黒', 'ワインバー', 8000,
     'グラスで30種。立ち飲みとテーブルの併設。'),

    -- プラチナ（8,000円〜）
    ('【サンプル】鉄板焼 燿（よう）', '銀座',   '鉄板焼',    12000,
     '目の前で焼き上げる鉄板焼。カウンターのみ。'),
    ('【サンプル】THE LOUNGE 麻布',   '麻布十番', 'ラウンジバー', 15000,
     'シガーとオールドボトル。ソファのオープンフロア。')
  ) as v(name, area, genre, avg_budget, description)
 where not exists (select 1 from public.shops s where s.name = v.name);

do $$
declare r record;
begin
  for r in
    select public.budget_tier_for(avg_budget) as tier, count(*)::int as n
      from public.shops where is_active group by 1 order by 1
  loop
    raise notice '掲載中の店舗 … % : %件', r.tier, r.n;
  end loop;
end $$;
