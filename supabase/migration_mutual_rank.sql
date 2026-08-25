-- =====================================================================
--  AISEKI — ランクを「参加する側」にも効かせる（2026-08-25）
--
--    1. ランクの表示   … rank_tier を「同じ会のメンバー」にだけ見せる
--    2. min_guest_tier … 会に「参加者に求めるランク」を持たせる
--    3. 申請の判定     … ランクが足りない申し込みを DB で弾く
--    4. ホストの受信箱 … 届いた申請のランクをホストにだけ返す
--    5. my_rank()      … 参加側から見た効果（申し込める会の数）を足す
--
--  何度実行しても同じ結果になる（冪等）。
--  適用方法は scripts/apply_sql.mjs（node pg / IPv6直結）。
--
--  ─────────────────────────────────────────────────────────────
--  依頼された仕様との差分（触る前に必ず読むこと）
--
--  依頼は「男性側にも評価とランクを付け、
--          高ランクの男性が高ランクの女性とマッチングしやすくする」だった。
--  このうち【性別で分ける】部分だけは、そのまま実装していない。
--
--  そもそも評価（user_reviews）とランクは、2026-08-23 / 08-24 の時点で
--  既に全ユーザー共通・双方向になっている。
--    ・user_reviews は「同じ会にいた相手」なら誰から誰へでも書ける。
--      ホスト→ゲストも、ゲスト→ホストも、最初から同じポリシー1本で通る
--      （user_reviews_insert に性別も side も出てこない）。
--    ・refresh_user_rank() は reviewed_id を見るだけで、性別を見ない。
--  したがって「男性にレビューとランクを追加する」ための
--  テーブル追加・双方向化は不要で、実際に足りなかったのは
--  【参加する側にとってランクが何の得にもならない】ことだけだった。
--  （ランクは「主催時に選べる予算帯」にしか効いていなかった。
--    本サービスは おごられる側＝主催する側 なので、
--    参加する側のランクには使い道が無かった。）
--
--  そこで、性別ではなく【ランク対ランク】でマッチングを効かせる:
--    ・会に min_guest_tier（参加者に求めるランク）を持たせる
--    ・ランクの高い人ほど、申し込める会が増える
--    ・ホストは届いた申請をランク付きで見られる（上位から並ぶ）
--  「高ランクのホストが立てた会に、高ランクの参加者が入りやすい」
--  という結果は同じで、性別という条件を1つも足していない。
--
--  性別で分けなかった理由は migration_caste_rank.sql の冒頭と同じ:
--    ・非該当性の中核は「性別を会の条件に使わない」ことで、
--      profiles.gender は列単位で SELECT を落としてある。
--    ・「男性だけ／女性だけのランク」を作ると、ランクの有無そのものが
--      性別の開示になり、かつ性別が会の条件になる。
--    ・min_guest_tier を「性別ごとに違う基準」にした瞬間、
--      参加条件に性別が入る（＝ src/lib/legal.js 第3条・第9条の4 に反する）。
--  ⚠ ここを性別で分けたくなったら、先に legal.js 第3条・第9条の4 と
--    HANDOFF.md §1 の非該当性の表を読み合わせること。UI で隠しても意味がない。
--  ─────────────────────────────────────────────────────────────
--
--  ⚠ 評価そのものの見え方は【変えていない】。
--    ・個別の評価（点数・コメント・誰が付けたか）は、これまでどおり
--      本人にも相手にも見えない（user_reviews の RLS は無変更）。
--    ・平均点・件数も、これまでどおり本人だけ（my_rank）。
--      profiles の列単位 SELECT 権限に review_average / review_count は
--      【入れない】。入れると legal.js 第9条の3 に反する。
--    ・今回あらたに他人へ出すのは rank_tier（4段階の区分）だけで、
--      見えるのは「同じ会に参加が承認されたメンバー」に限られる
--      （profiles_select の RLS はそのまま。氏名・写真と同じ範囲）。
--      これに合わせて legal.js を 2.3 に改訂してある。
-- =====================================================================


-- =====================================================================
--  1. ランクの札を「同じ会のメンバー」にだけ見せる
--
--  profiles_select ポリシー（id = auth.uid() or shares_party(...)）は
--  変更しない。列単位の SELECT 権限に rank_tier を1つ足すだけなので、
--  見える相手は氏名・写真・年齢とまったく同じ範囲になる。
--
--  🚨 review_average / review_count は絶対に足さないこと。
--     足した瞬間に他人の平均点が読めるようになり、
--     「個別の評価はランキング・平均点その他の形式で公開されない」
--     （legal.js 第9条の3）に反する。ランクは4段階の区分にすぎず、
--     平均点そのものではない、という一線でここは通している。
--
--  （gender / birth_date / age_verified_at / referral_code / referred_by は
--    従来どおり除外されたまま）
-- =====================================================================
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, avatar_url, age, bio, created_at,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style, rank_tier)
  on public.profiles to anon, authenticated;

-- 本人であってもランクを自分で書き換えることはできない（UPDATE / INSERT には足さない）。
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
--  2. parties … 参加者に求めるランク
--
--  既定は最下位（＝誰でも申し込める）。ホストが上げたときだけ効く。
--  ホスト自身のランクで上限を設けてはいない（設けると
--  「この会に条件が付いている＝ホストがその段以上」という
--  推測が公開の一覧から成立してしまうため。予算帯と違って
--  参加条件は必ず全員に見える）。
-- =====================================================================
alter table public.parties
  add column if not exists min_guest_tier text not null default 'bronze';

-- 既存の会は「誰でも申し込める」に揃える（成立済みの会の条件は変えない）
update public.parties
   set min_guest_tier = 'bronze'
 where min_guest_tier is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'parties_min_guest_tier_check' and conrelid = 'public.parties'::regclass
  ) then
    alter table public.parties add constraint parties_min_guest_tier_check
      check (public.tier_order_of(min_guest_tier) is not null) not valid;
  end if;
  begin
    alter table public.parties validate constraint parties_min_guest_tier_check;
  exception when check_violation then
    raise notice '未知のランクを持つ会があるため parties_min_guest_tier_check は未検証のままです。';
  end;
end $$;

-- 募集中の会をランク条件で引くための索引（一覧の絞り込みに使う）
create index if not exists parties_min_guest_tier_idx
  on public.parties(min_guest_tier) where status = 'recruiting';

-- ---------------------------------------------------------------------
--  🚨 parties に列を足したので、INSERT 権限（列単位）にも足す。
--     migration_security_hardening.sql が「会を作るときに必要な列」だけに
--     絞っているため、権限の無い列を1つでも積むと insert 全体が
--     42501 permission denied for table parties で落ちる。
--     2026-08-23 から会の作成が丸ごと壊れていたのがこれ（HANDOFF §14）。
-- ---------------------------------------------------------------------
revoke insert on public.parties from anon, authenticated;
grant  insert (host_id, title, location, area, host_group_size, guest_group_size,
               host_member_names, party_time, party_date,
               shop_id, budget_tier, min_guest_tier)
  on public.parties to authenticated;


-- =====================================================================
--  3. 会の作成時の検証
--
--  migration_caste_rank.sql の enforce_group_party() に
--  min_guest_tier の検証を足したもの（既存の規則は1つも削っていない）。
--  ⚠ この関数は schema.sql → migration_reviews_approach_style.sql →
--    migration_caste_rank.sql → ここ、と4回上書きしている。
--    書き換えるときは必ずいちばん新しいもの（＝これ）に手を入れること。
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

  -- 主催者のランクを超える予算帯の会は作れない。
  v_host_tier := public.user_rank_tier(new.host_id);
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
--  4. 参加リクエストの検証にランクの条件を足す
--
--  schema.sql の enforce_group_join() に1つ足したもの
--  （既存の規則は1つも削っていない）。
--
--  ⚠ 判定はここ（BEFORE INSERT トリガー）だけで行い、
--    accept_join_request() では改めて見ない。理由:
--      ・join_requests への行の入口はこのトリガーしかない。
--        画面を迂回して REST で直接 insert しても必ず通る。
--      ・申し込んだあとにランクが下がることはある。そのときに
--        承認まで弾くと、ホストにもゲストにも理由が分からないまま
--        承認ボタンだけが失敗する（成立済みの会をあとから壊さない、
--        という parties.budget_tier の扱いと揃える）。
-- =====================================================================
create or replace function public.enforce_group_join()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_party public.parties;
  v_tier  text;
begin
  -- 20歳未満は参加を申し込めない（飲酒を伴うため）
  perform public.assert_legal_age(new.user_id);

  if coalesce(new.group_size, 0) < 2 then
    raise exception '参加は2名以上のグループ単位でのみ行えます';
  end if;

  select * into v_party from public.parties where id = new.party_id;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id = new.user_id then
    raise exception '自分がホストの会には参加できません';
  end if;
  if v_party.status = 'completed' then
    raise exception 'この会は終了しています';
  end if;
  if public.is_party_member(new.party_id, new.user_id) then
    raise exception '既にこの会に参加しています';
  end if;
  if exists (
    select 1 from public.join_requests r
     where r.party_id = new.party_id
       and r.user_id  = new.user_id
       and r.status in ('pending', 'accepted')
  ) then
    raise exception '既にこの会へ申し込み済みです';
  end if;
  if v_party.current_members + new.group_size > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- 会が参加者に求めるランクを満たしているか（代表者のランクで見る）。
  -- 性別・年齢その他の属性は条件にしない。ランクだけ。
  v_tier := public.user_rank_tier(new.user_id);
  if public.tier_order_of(v_tier)
     < public.tier_order_of(coalesce(v_party.min_guest_tier, 'bronze')) then
    raise exception 'この会は%以上のランクの方が対象です（あなたは%）。会の終了後に受け取る評価でランクが上がります',
      (select tier_label from public.rank_tiers() where tier_key = v_party.min_guest_tier),
      (select tier_label from public.rank_tiers() where tier_key = v_tier);
  end if;

  new.member_names   := public.normalize_member_names(new.member_names, new.group_size);
  new.applicant_name := coalesce(
    (select username from public.profiles where id = new.user_id), 'ゲスト'
  );
  return new;
end;
$$;

drop trigger if exists on_join_request_group_check on public.join_requests;
create trigger on_join_request_group_check
  before insert on public.join_requests
  for each row execute function public.enforce_group_join();


-- =====================================================================
--  5. 自分がこの会に申し込めるか（画面の出し分け用）
--
--  ⚠ 判定できるのは自分についてだけ（auth.uid() 固定）。
--    p_user を受ける形にすると、同じ会の party_members から読める UUID を
--    渡すだけで他人のランクが二分探索できる。
--    can_approach_party() で一度開けた穴と同じ形（HANDOFF §11）。
-- =====================================================================
create or replace function public.can_join_party(p_party uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    public.tier_order_of(public.user_rank_tier(auth.uid()))
      >= public.tier_order_of(coalesce(
           (select min_guest_tier from public.parties where id = p_party), 'bronze')),
    false
  );
$$;

revoke all on function public.can_join_party(uuid) from public, anon;
grant execute on function public.can_join_party(uuid) to authenticated;


-- =====================================================================
--  6. ホストの受信箱に、申し込んだグループのランクを返す
--
--  join_requests の列単位 SELECT からランクは引けない（profiles を
--  参照するため）。申請者はまだ会のメンバーではないので profiles_select
--  でも読めない。ホストにだけ、申請1件につき「ランクの区分」だけを返す。
--
--  ・返すのは自分がホストの会に届いた pending の申請だけ。
--  ・返すのは tier（4段階の区分）のみ。平均点・件数は返さない。
--  ・list_approach_senders() と同じ考え方（承認前に渡すのは最小限）。
-- =====================================================================
create or replace function public.list_incoming_request_ranks()
returns table (request_id uuid, tier_key text, tier_label text, tier_order int)
language sql security definer stable set search_path = public
as $$
  select r.id,
         t.tier_key,
         t.tier_label,
         t.tier_order
    from public.join_requests r
    join public.parties  p on p.id = r.party_id
    join public.profiles u on u.id = r.user_id
    join public.rank_tiers() t on t.tier_key = coalesce(u.rank_tier, 'bronze')
   where p.host_id = auth.uid()
     and r.status = 'pending';
$$;

revoke all on function public.list_incoming_request_ranks() from public, anon;
grant execute on function public.list_incoming_request_ranks() to authenticated;


-- =====================================================================
--  7. my_rank() … 参加する側から見た効果を足す
--
--  これまでは「主催するときに選べる予算帯」しか返していなかった。
--  ランクが参加側にも効くようになったので、
--  「いま募集中の会のうち、何件に申し込めるか」を一緒に返す。
--
--  🚨 引数は取らない（auth.uid() 固定）。ここに p_user を足さないこと。
--     足すと他人の平均点・件数が引ける（migration_caste_rank.sql §3）。
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
    -- 参加する側から見た効果（募集中の会のうち、条件を満たすもの）
    'open_parties',   (
      select count(*)::int from public.parties q
       where q.status = 'recruiting'
         and q.host_id <> p.id
         and public.tier_order_of(coalesce(q.min_guest_tier, 'bronze')) <= c.tier_order
    ),
    'gated_parties',  (
      select count(*)::int from public.parties q
       where q.status = 'recruiting'
         and q.host_id <> p.id
         and public.tier_order_of(coalesce(q.min_guest_tier, 'bronze')) > c.tier_order
    ),
    'next', case when n.tier_key is null then null else jsonb_build_object(
        'tier_key',   n.tier_key,
        'tier_label', n.tier_label,
        'min_avg',    n.min_avg,
        'budget_cap', n.budget_cap,
        -- そのランクまで上がると、あと何件の会に申し込めるようになるか
        'unlocks',    (
          select count(*)::int from public.parties q
           where q.status = 'recruiting'
             and q.host_id <> p.id
             and public.tier_order_of(coalesce(q.min_guest_tier, 'bronze')) > c.tier_order
             and public.tier_order_of(coalesce(q.min_guest_tier, 'bronze')) <= n.tier_order
        )
      ) end
  )
  from public.profiles p
  join public.rank_tiers() c on c.tier_key = coalesce(p.rank_tier, 'bronze')
  left join public.rank_tiers() n on n.tier_order = c.tier_order + 1
  where p.id = auth.uid();
$$;

revoke all on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;


-- =====================================================================
--  適用結果
-- =====================================================================
do $$
declare
  r record;
  v_ok boolean;
begin
  raise notice '── ランクを参加側にも効かせる（適用結果） ──';

  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
       and column_name = 'rank_tier'
  ) into v_ok;
  raise notice 'rank_tier を同じ会のメンバーに公開 : %', case when v_ok then 'した' else '★していない' end;

  select not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
       and column_name in ('review_average', 'review_count', 'gender')
  ) into v_ok;
  raise notice '平均点・件数・性別は非公開のまま   : %', case when v_ok then 'はい' else '★漏れている' end;

  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'parties'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
       and column_name = 'min_guest_tier'
  ) into v_ok;
  raise notice 'min_guest_tier の INSERT 権限      : %', case when v_ok then 'あり' else '★無い（会が作れなくなる）' end;

  for r in select min_guest_tier, count(*)::int as n
             from public.parties group by 1 order by 1 loop
    raise notice '会の参加条件 % … %件', r.min_guest_tier, r.n;
  end loop;

  raise notice '評価の総数: %件 / ランク保有者: %人',
    (select count(*) from public.user_reviews),
    (select count(*) from public.profiles where review_count > 0);
end $$;
