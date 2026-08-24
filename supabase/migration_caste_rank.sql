-- =====================================================================
--  AISEKI — ランク（評価に応じた予算帯）と店舗カタログ（2026-08-24）
--
--   1. shops        … 提携店舗のカタログ（1人あたりの平均予算つき）
--   2. ランク       … 受け取った評価の平均星数で決まる4段階
--   3. parties      … 会に「お店」と「予算帯」を持たせ、
--                     主催者のランクを超える予算帯の会は作れないようにする
--
--  何度実行しても同じ結果になる（冪等）。
--  適用方法は scripts/apply_sql.mjs（node pg / IPv6直結）。
--
--  ─────────────────────────────────────────────────────────────
--  業態上の前提との関係（重要・触る前に必ず読むこと）
--
--  依頼された仕様は「女性ユーザーだけをレビューで格付けし、
--  ランクが高い女性ほど高い予算のお店に行ける」というものだった。
--  そのうち【性別で分ける】部分だけは、そのまま実装していない。
--
--  理由:
--    ・schema.sql 冒頭 / src/lib/legal.js 第3条のとおり、本サービスは
--      「インターネット異性紹介事業に該当しない」ことを前提に設計されている。
--      その担保の中核が「性別を会の条件に使わない」ことで、
--      profiles.gender は列単位で SELECT を落としてある
--      （同じ会のメンバーですら他人の性別を読めない）。
--    ・ランクを女性だけに持たせると、
--        - 「ランクを持っているか」自体が性別の開示になる
--        - 主催できる会の予算帯が性別で変わる＝性別が会の条件になる
--      の2つが同時に起き、上の担保が DB レベルで壊れる。
--    ・男性ユーザーにランクが無いと、男性が主催する会が
--      どの予算帯も選べなくなり、機能として破綻する。
--
--  そこで【規則は全ユーザー共通】にした。
--    ・評価を受け取った人のランクが上がる（性別を見ない）
--    ・会を主催する人のランクで、選べる予算帯が決まる
--  本サービスでは「おごられる側＝会を主催する側」なので、
--  依頼の狙い（高評価の人ほど良いお店に行ける）はそのまま成立する。
--  性別という条件を1つも足さずに同じ結果になる、という判断。
--
--  ⚠ ここを「女性だけ」に変えたくなったら、先に legal.js 第3条と
--    §1 の非該当性の表を読み合わせること。UI で隠しても意味がない。
--  ─────────────────────────────────────────────────────────────
--
--  ⚠ 評価そのものの見え方は変えていない。
--    ・個別の評価（点数・コメント・誰が付けたか）は、これまでどおり
--      本人にも他人にも見えない（user_reviews の RLS は無変更）。
--    ・本人が見られるのは「自分のランクと平均点」だけ（my_rank）。
--    ・他人のランクは誰からも見えない。profiles の列単位 SELECT 権限に
--      rank_tier / review_average / review_count を【入れていない】。
--      入れると「評価の平均点を公開する」ことになり、
--      legal.js 第9条の3 に真っ向から反する。
-- =====================================================================

-- ---------------------------------------------------------------------
--  0. 定数（単一の出典。画面側 src/lib/pricing.js と必ず一致させる）
-- ---------------------------------------------------------------------

--  tier_key   … 内部キー
--  tier_label … 画面に出す名前
--  min_avg    … このランクになる平均星数の下限
--  budget_cap … 1人あたりの平均予算の上限（円）。null は上限なし
--  tier_order … 大小比較用（大きいほど上位）
create or replace function public.rank_tiers()
returns table (tier_key text, tier_label text, min_avg numeric, budget_cap int, tier_order int)
language sql immutable set search_path = public as $$
  select * from (values
    ('bronze'::text,   'ブロンズ'::text, 0.0::numeric, 3000::int,   1::int),
    ('silver',         'シルバー',       2.0,          5000,        2),
    ('gold',           'ゴールド',       3.0,          8000,        3),
    ('platinum',       'プラチナ',       4.0,          null,        4)
  ) as t(tier_key, tier_label, min_avg, budget_cap, tier_order);
$$;

-- ランクが確定するまでに必要な評価の件数。
-- 1件だけで最上位まで跳ねないようにする（逆に、1件の低評価で落ちることも防ぐ）。
create or replace function public.rank_min_reviews()
returns int language sql immutable set search_path = public as $$ select 3 $$;

grant execute on function public.rank_tiers()       to anon, authenticated;
grant execute on function public.rank_min_reviews() to anon, authenticated;

-- ランクキー → 並び順（不正な値なら null）
create or replace function public.tier_order_of(p_key text)
returns int language sql immutable set search_path = public as $$
  select t.tier_order from public.rank_tiers() t where t.tier_key = p_key;
$$;

-- 平均星数と件数から、そのユーザーのランクを求める。
-- 件数が rank_min_reviews() に満たないあいだは最下位から始まる。
create or replace function public.rank_for(p_avg numeric, p_count int)
returns text language sql immutable set search_path = public as $$
  select case
    when coalesce(p_count, 0) < public.rank_min_reviews() then 'bronze'
    else coalesce((
      select t.tier_key
        from public.rank_tiers() t
       where t.min_avg <= coalesce(p_avg, 0)
       order by t.min_avg desc
       limit 1
    ), 'bronze')
  end;
$$;

-- 1人あたりの平均予算（円）が、どの予算帯にあたるか。
-- 上限のあるランクのうち、いちばん安いものに割り当てる。
-- どの上限も超えるものは最上位（上限なし）。
create or replace function public.budget_tier_for(p_budget int)
returns text language sql immutable set search_path = public as $$
  select case when p_budget is null then null else coalesce((
    select t.tier_key
      from public.rank_tiers() t
     where t.budget_cap is not null and p_budget <= t.budget_cap
     order by t.budget_cap asc
     limit 1
  ), (
    select t.tier_key from public.rank_tiers() t
     where t.budget_cap is null order by t.tier_order desc limit 1
  )) end;
$$;

grant execute on function public.tier_order_of(text)  to anon, authenticated;
grant execute on function public.budget_tier_for(int) to anon, authenticated;

-- =====================================================================
--  1. profiles … 受け取った評価の集計とランクを持たせる
--
--  ⚠ user_reviews は「自分が書いた行」しか読めない（RLS）。
--    そのため本人が自分の平均点を集計することはできず、
--    ここに書き出しておく必要がある。書き込むのは
--    security definer のトリガーだけ。
-- =====================================================================
alter table public.profiles
  add column if not exists review_count   int not null default 0,
  add column if not exists review_average numeric(3,2),
  add column if not exists rank_tier      text not null default 'bronze';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_rank_tier_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_rank_tier_check
      check (public.tier_order_of(rank_tier) is not null) not valid;
  end if;
  begin
    alter table public.profiles validate constraint profiles_rank_tier_check;
  exception when check_violation then
    raise notice '未知のランクを持つ行があるため profiles_rank_tier_check は未検証のままです。';
  end;
end $$;

-- ---------------------------------------------------------------------
--  列単位の権限を「今までどおり」に保つ。
--
--  🚨 rank_tier / review_average / review_count を下の grant に足してはいけない。
--     足した瞬間、他人の評価の平均点が誰からでも読めるようになり、
--     「評価はランキング・平均点その他の形式で公開されない」という
--     利用規約（legal.js 第9条の3）に反する。
--     本人が自分の分を見る経路は my_rank() だけ。
--
--  （gender / birth_date / age_verified_at / referral_code / referred_by も
--    従来どおり除外されたまま）
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, avatar_url, age, bio, created_at,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style)
  on public.profiles to anon, authenticated;

-- 本人であっても、ランクを自分で書き換えることはできない
-- （UPDATE / INSERT の列一覧に加えない）。
revoke update on public.profiles from anon, authenticated;
grant  update (username, avatar_url, gender, age, bio,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style)
  on public.profiles to authenticated;

revoke insert on public.profiles from anon, authenticated;
grant  insert (id, username, avatar_url, gender, age, bio,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style)
  on public.profiles to authenticated;

-- =====================================================================
--  2. ランクの再計算
-- =====================================================================

-- 1人分を数え直して profiles に書き戻す。
-- 呼べるのはトリガー（＝所有者権限）だけ。利用者には開けない。
create or replace function public.refresh_user_rank(p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
  v_avg   numeric;
begin
  if p_user is null then return; end if;

  select count(*)::int, round(avg(rating), 2)
    into v_count, v_avg
    from public.user_reviews
   where reviewed_id = p_user;

  update public.profiles
     set review_count   = coalesce(v_count, 0),
         review_average = v_avg,
         rank_tier      = public.rank_for(v_avg, v_count)
   where id = p_user
     and (review_count   is distinct from coalesce(v_count, 0)
       or review_average is distinct from v_avg
       or rank_tier      is distinct from public.rank_for(v_avg, v_count));
end;
$$;

revoke all on function public.refresh_user_rank(uuid) from public, anon, authenticated;

create or replace function public.on_user_review_written()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.refresh_user_rank(new.reviewed_id);
  return null;
end;
$$;

-- user_reviews は UPDATE / DELETE のポリシーが無い（＝取り消せない）ので
-- INSERT だけを見れば足りる。
drop trigger if exists on_user_review_rank on public.user_reviews;
create trigger on_user_review_rank
  after insert on public.user_reviews
  for each row execute function public.on_user_review_written();

-- 既存の評価からランクを作り直す（初回適用時のバックフィル）
do $$
declare r record;
begin
  for r in select distinct reviewed_id from public.user_reviews loop
    perform public.refresh_user_rank(r.reviewed_id);
  end loop;
end $$;

-- =====================================================================
--  3. 自分のランクを見る（本人だけ）
--
--  🚨 引数を取らない。auth.uid() に固定してある。
--     p_user を受け取る形にすると、他人の UUID（同じ会の party_members から
--     読める）を渡すだけで他人の評価の平均点が引けてしまう。
--     can_approach_party() で一度同じ穴を開けている（HANDOFF §11）。
--     ここに引数を足さないこと。
-- =====================================================================
create or replace function public.my_rank()
returns jsonb
language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'tier_key',       c.tier_key,
    'tier_label',     c.tier_label,
    'tier_order',     c.tier_order,
    'budget_cap',     c.budget_cap,
    'review_count',   p.review_count,
    'review_average', p.review_average,
    'min_reviews',    public.rank_min_reviews(),
    'ranked',         p.review_count >= public.rank_min_reviews(),
    'next', case when n.tier_key is null then null else jsonb_build_object(
        'tier_key',   n.tier_key,
        'tier_label', n.tier_label,
        'min_avg',    n.min_avg,
        'budget_cap', n.budget_cap
      ) end
  )
  from public.profiles p
  join public.rank_tiers() c on c.tier_key = coalesce(p.rank_tier, 'bronze')
  left join public.rank_tiers() n on n.tier_order = c.tier_order + 1
  where p.id = auth.uid();
$$;

revoke all on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;

-- 指定したユーザーのランク。トリガーからのみ使う（利用者には開けない）。
create or replace function public.user_rank_tier(p_user uuid)
returns text
language sql security definer stable set search_path = public
as $$
  select coalesce((select rank_tier from public.profiles where id = p_user), 'bronze');
$$;

revoke all on function public.user_rank_tier(uuid) from public, anon, authenticated;

-- 自分がその予算帯を選べるか（画面の出し分け用）。
-- 判定できるのは自分についてだけ。
create or replace function public.can_use_budget_tier(p_tier text)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    public.tier_order_of(public.user_rank_tier(auth.uid()))
      >= public.tier_order_of(p_tier),
    false
  );
$$;

revoke all on function public.can_use_budget_tier(text) from public, anon;
grant execute on function public.can_use_budget_tier(text) to authenticated;

-- =====================================================================
--  4. shops … 提携店舗のカタログ
--
--  店舗の公開情報（店名・エリア・平均予算）であって個人情報ではないため、
--  未ログインでも読める。書き込めるのは運営（service_role）だけ。
--  ランクによる制限は「読めるかどうか」ではなく
--  「その店で会を作れるかどうか」で効かせる（下の enforce_group_party）。
--  読める範囲を絞ってしまうと、参加者側から会のお店が見えなくなる。
-- =====================================================================
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  area        text,
  address     text,
  genre       text,
  avg_budget  int  not null check (avg_budget >= 0),  -- 1人あたりの平均予算（円）
  description text,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint shops_name_len check (char_length(name) between 1 and 80),
  constraint shops_desc_len check (description is null or char_length(description) <= 300)
);

create index if not exists shops_active_idx on public.shops(is_active, avg_budget);
create index if not exists shops_area_idx   on public.shops(area) where is_active;

alter table public.shops enable row level security;

drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops for select using (is_active);

-- INSERT / UPDATE / DELETE のポリシーは作らない（＝運営だけが触れる）
revoke all on public.shops from anon, authenticated;
grant  select on public.shops to anon, authenticated;

-- =====================================================================
--  5. parties … お店と予算帯
-- =====================================================================
alter table public.parties
  add column if not exists shop_id     uuid references public.shops(id) on delete set null,
  add column if not exists avg_budget  int,     -- 1人あたりの目安予算（円／お店を選んだときだけ）
  add column if not exists budget_tier text;    -- 予算帯（トリガーが確定させる）

create index if not exists parties_budget_idx on public.parties(budget_tier)
  where status = 'recruiting';

-- 会を作るときに送ってよい列に、お店と予算帯を足す。
-- avg_budget は【足さない】。クライアントの金額は信用せず、
-- 選ばれた shops の値をトリガーが写す。
revoke insert on public.parties from anon, authenticated;
grant  insert (host_id, title, location, area, host_group_size, guest_group_size,
               host_member_names, party_time, party_date,
               shop_id, budget_tier)
  on public.parties to authenticated;

-- ---------------------------------------------------------------------
--  会の作成時の検証。
--  schema.sql → migration_reviews_approach_style.sql と引き継いできた
--  内容に、予算帯の判定を足したもの（既存の規則は1つも削っていない）。
-- ---------------------------------------------------------------------
create or replace function public.enforce_group_party()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_shop      public.shops%rowtype;
  v_host_tier text;
begin
  -- 20歳未満は会を作成できない（飲酒を伴うため）
  perform public.assert_legal_age(new.host_id);

  if coalesce(new.host_group_size, 0) < 2 then
    raise exception 'ホスト側は2名以上のグループでのみ会を作成できます';
  end if;
  if coalesce(new.guest_group_size, 0) < 2 then
    raise exception '募集は2名以上のグループ単位でのみ行えます';
  end if;
  -- 個室での相席は提供しない。クライアントが何を送っても open に固定する。
  if coalesce(new.room_type, public.allowed_room_type()) <> public.allowed_room_type() then
    raise exception '相席はオープンスペースのみです。個室での会は作成できません';
  end if;
  new.room_type := public.allowed_room_type();

  -- 参加ポイントは全ての会で一律。ホストは金額を決められない。
  new.point_request := public.join_fee_per_person();
  -- ホストは必ずおごられる（当日の飲食代は参加グループが負担する）。
  new.treat_type    := public.allowed_treat_type();

  -- ── お店と予算帯 ────────────────────────────────
  -- カタログから選んだときは、店名・エリア・予算をカタログの値で上書きする
  -- （クライアントが送ってきた予算は使わない）。
  if new.shop_id is not null then
    select * into v_shop from public.shops where id = new.shop_id and is_active;
    if not found then
      raise exception 'そのお店は選べません（掲載が終了している可能性があります）';
    end if;
    new.location    := v_shop.name;
    new.area        := coalesce(v_shop.area, new.area);
    new.avg_budget  := v_shop.avg_budget;
    new.budget_tier := public.budget_tier_for(v_shop.avg_budget);
  else
    -- お店を自分で書くときは予算帯だけを選ぶ。金額は持たせない。
    new.avg_budget  := null;
    new.budget_tier := coalesce(new.budget_tier, 'bronze');
  end if;

  if public.tier_order_of(new.budget_tier) is null then
    raise exception '予算帯の指定が正しくありません';
  end if;

  -- 主催者のランクを超える予算帯の会は作れない。
  v_host_tier := public.user_rank_tier(new.host_id);
  if public.tier_order_of(v_host_tier) < public.tier_order_of(new.budget_tier) then
    raise exception '現在のランク（%）では、この予算帯（%）のお店で会を作れません。会の終了後に受け取る評価でランクが上がります',
      (select tier_label from public.rank_tiers() where tier_key = v_host_tier),
      (select tier_label from public.rank_tiers() where tier_key = new.budget_tier);
  end if;

  new.max_members       := new.host_group_size + new.guest_group_size;
  new.current_members   := new.host_group_size;  -- 席作成後にトリガーが再計算する
  new.host_member_names := public.normalize_member_names(new.host_member_names, new.host_group_size);
  new.host_name         := coalesce(
    (select username from public.profiles where id = new.host_id), 'ホスト'
  );
  -- 飲みスタイルタグはホストのプロフィールから写す
  new.host_drinking_style := coalesce(
    (select drinking_style from public.profiles where id = new.host_id), '{}'
  );
  return new;
end;
$$;

drop trigger if exists on_party_group_check on public.parties;
create trigger on_party_group_check
  before insert on public.parties
  for each row execute function public.enforce_group_party();

-- 既存の会には予算帯が無い。最下位を入れて、一覧の表示を揃える。
-- （ランクは作成後に下がることもあるが、成立済みの会は当時のまま残す）
update public.parties
   set budget_tier = 'bronze'
 where budget_tier is null;

-- =====================================================================
--  適用結果
-- =====================================================================
do $$
declare r record;
begin
  raise notice 'ランク確定に必要な評価件数: %件', public.rank_min_reviews();
  for r in select * from public.rank_tiers() order by tier_order loop
    raise notice '  % （%）… 平均%以上 / 予算 %',
      r.tier_label, r.tier_key, r.min_avg,
      coalesce(r.budget_cap::text || '円まで', '上限なし');
  end loop;
  raise notice '掲載中の店舗: %件', (select count(*) from public.shops where is_active);
  for r in select rank_tier, count(*)::int as n from public.profiles group by 1 order by 1 loop
    raise notice 'ランク別の利用者: % … %人', r.rank_tier, r.n;
  end loop;
end $$;
