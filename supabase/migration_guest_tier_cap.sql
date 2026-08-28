-- =====================================================================
--  参加者に求めるランクの上限を「主催者自身のランク」までにする
--
--  これまで min_guest_tier は「ランクとして正しい値か」しか見ておらず、
--  ブロンズの人がプラチナ限定の会を作れてしまった（画面が出していない
--  だけで、REST から直接 insert すれば通った）。
--
--  予算帯（budget_tier）には既に同じ規則がある
--  （migration_mutual_rank.sql の「主催者のランクを超える予算帯の会は
--    作れない」）。参加条件にも同じ上限をかける。
--
--  ⚠ enforce_group_party() は schema.sql →
--    migration_reviews_approach_style.sql → migration_caste_rank.sql →
--    migration_mutual_rank.sql → ここ、と5回目の上書き。
--    以降に書き換えるときは必ずこのファイルの内容に手を入れること。
--    既存の規則は1つも削っていない（追加は「参加条件の上限」1つだけ）。
--
--  ⚠ BEFORE INSERT にしか効かない。すでに公開されている会の条件は
--    そのまま残す。作ったあとに主催者のランクが下がっても会は壊さない
--    （budget_tier と同じ扱い。成立済みの会をあとから壊さない）。
--
--  ⚠ 性別・年齢その他の属性を参加条件にできない前提は変えていない。
--    条件にできるのは今までどおりランクだけ
--    （migration_mutual_rank.sql 冒頭・src/lib/legal.js 第3条）。
-- =====================================================================

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

  -- 主催者のランク。予算帯と参加条件の両方の上限になる。
  v_host_tier := public.user_rank_tier(new.host_id);

  -- 主催者のランクを超える予算帯の会は作れない。
  if public.tier_order_of(v_host_tier) < public.tier_order_of(new.budget_tier) then
    raise exception '現在のランク（%）では、この予算帯（%）のお店で会を作れません。会の終了後に受け取る評価でランクが上がります',
      (select tier_label from public.rank_tiers() where tier_key = v_host_tier),
      (select tier_label from public.rank_tiers() where tier_key = new.budget_tier);
  end if;

  -- ── 参加者に求めるランク ────────────────────────
  -- 既定は最下位（＝誰でも申し込める）。性別その他の属性は条件にできない。
  new.min_guest_tier := coalesce(new.min_guest_tier, 'bronze');
  if public.tier_order_of(new.min_guest_tier) is null then
    raise exception '参加者に求めるランクの指定が正しくありません';
  end if;

  -- ★ここが追加：主催者のランクを超える条件は付けられない。
  --   （ゴールドの人が求められるのはゴールド以下だけ）
  if public.tier_order_of(v_host_tier) < public.tier_order_of(new.min_guest_tier) then
    raise exception '現在のランク（%）では、参加する方に%以上を求めることはできません。求められるのはご自身のランクまでです',
      (select tier_label from public.rank_tiers() where tier_key = v_host_tier),
      (select tier_label from public.rank_tiers() where tier_key = new.min_guest_tier);
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


-- =====================================================================
--  確認
-- =====================================================================
do $$
declare
  v_src  text;
  v_bad  int;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_group_party';

  raise notice 'トリガー on_party_group_check           : %',
    case when exists (
      select 1 from pg_trigger where tgname = 'on_party_group_check' and not tgisinternal
    ) then 'あり' else '★無い' end;

  raise notice '参加条件の上限チェック                  : %',
    case when v_src like '%min_guest_tier)%' and v_src like '%参加する方に%'
         then 'あり' else '★入っていない' end;

  raise notice '予算帯の上限チェック（既存・消えてない） : %',
    case when v_src like '%budget_tier)%' then 'あり' else '★消えた' end;

  -- 既存の会に、いまの規則だと作れないものがどれだけあるか（壊さないが件数は見る）
  select count(*) into v_bad
    from public.parties q
   where public.tier_order_of(public.user_rank_tier(q.host_id))
       < public.tier_order_of(coalesce(q.min_guest_tier, 'bronze'));
  raise notice '既存の会のうち条件が主催者のランク超え   : %件（そのまま残る）', v_bad;
end $$;
