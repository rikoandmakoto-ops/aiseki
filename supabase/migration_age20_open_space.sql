-- =====================================================================
--  マイグレーション: 20歳以上限定 ＋ 個室相席の禁止（オープンスペースのみ）
--
--  【背景】
--   本サービスは「相席居酒屋」型の業態であり、風俗営業許可を要しない
--   設計を維持する必要がある。必要な許認可は次の2つのみ。
--     ・飲食店営業許可（保健所）
--     ・深夜における酒類提供飲食店営業の届出（所轄警察署）
--
--   そのために、次をシステム側で担保する。
--     ・20歳以上限定 … 飲酒を伴うため。生年月日で年齢を確認する。
--     ・個室相席の禁止 … 個室での相席は出会い系喫茶に該当するリスクが
--                        あるため、オープンスペース以外は保存できない。
--     ・接待をしない／サクラを置かない … 運用上の要件（規約に明記）。
--
--  【この変更で追加されるもの】
--   ・public.min_age() / public.allowed_room_type() … 定数
--   ・profiles.birth_date / profiles.age_verified_at … 年齢確認の根拠
--   ・profiles の 20歳未満を弾く CHECK 制約
--   ・parties.room_type（'open' 固定の CHECK 制約付き）
--   ・年齢判定のヘルパー（age_from_birth_date / is_legal_age / assert_legal_age）
--   ・会の作成・参加申込・席の引き受け・新規登録での年齢チェック
--   ・birth_date を誰にも見せず、クライアントから更新もさせない列単位の権限
--
--  適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行。
--  何度実行しても安全です（冪等）。
--  ※ 先に migration_group_only.sql と migration_group_members.sql が
--    適用済みであることを前提とします。
--  ※ このマイグレーションは aiseki のデータベースにのみ適用してください。
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. 定数
-- ---------------------------------------------------------------------
create or replace function public.min_age()
returns int language sql immutable set search_path = public as $$ select 20 $$;

create or replace function public.allowed_room_type()
returns text language sql immutable set search_path = public as $$ select 'open'::text $$;

-- ---------------------------------------------------------------------
--  2. profiles … 年齢確認の根拠となる列と制約
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists birth_date      date;
alter table public.profiles add column if not exists age_verified_at timestamptz;

-- 20歳未満を保存できないようにする。
-- 既存行に 20歳未満が残っている可能性があるため NOT VALID で追加し、
-- 問題なければ検証する（検証に失敗しても新規行・更新行には制約が効く）。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_min_age' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_min_age check (age is null or age >= 20) not valid;
  end if;
  begin
    alter table public.profiles validate constraint profiles_min_age;
  exception when check_violation then
    raise notice '20歳未満の既存プロフィールが存在するため profiles_min_age は未検証のままです。該当アカウントを確認してください。';
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_birth_date_sane' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_birth_date_sane
      check (birth_date is null or birth_date > date '1900-01-01') not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  3. 年齢判定のヘルパー
-- ---------------------------------------------------------------------
create or replace function public.age_from_birth_date(p_birth date)
returns int
language sql stable set search_path = public   -- current_date を参照するため stable
as $$
  select case when p_birth is null then null
              else date_part('year', age(current_date, p_birth))::int end;
$$;

create or replace function public.is_legal_age(p_user uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select coalesce(public.age_from_birth_date(p.birth_date), p.age)
       from public.profiles p where p.id = p_user),
    -1
  ) >= public.min_age();
$$;

create or replace function public.assert_legal_age(p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_legal_age(p_user) then
    raise exception '本サービスは%歳未満の方はご利用いただけません（年齢確認が必要です）', public.min_age();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
--  4. parties … 席の種別（個室相席の禁止）
-- ---------------------------------------------------------------------
alter table public.parties add column if not exists room_type text not null default 'open';

-- 既存の会はすべてオープンスペース扱いにそろえる
update public.parties set room_type = 'open' where room_type is distinct from 'open';

alter table public.parties drop constraint if exists parties_open_space_only;
alter table public.parties add constraint parties_open_space_only check (room_type = 'open');

-- ---------------------------------------------------------------------
--  5. 新規登録時の年齢確認（20歳未満は登録自体を失敗させる）
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_birth date;
  v_age   int;
begin
  v_birth := nullif(new.raw_user_meta_data->>'birth_date', '')::date;
  v_age   := coalesce(
    public.age_from_birth_date(v_birth),
    nullif(new.raw_user_meta_data->>'age', '')::int
  );

  if v_age is null then
    raise exception '年齢確認のため生年月日の登録が必要です';
  end if;
  if v_age < public.min_age() then
    raise exception '本サービスは%歳未満の方はご利用いただけません', public.min_age();
  end if;

  insert into public.profiles (id, username, gender, age, birth_date, age_verified_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'gender',
    v_age,
    v_birth,
    now()
  )
  on conflict (id) do nothing;

  -- 新規登録ボーナス。金額は migration_launch2.sql の signup_bonus() が正。
  -- ここは旧マイグレーションを単体で流したときの値なので、同じ額に揃えてある。
  insert into public.point_balances (user_id, balance)
  values (new.id, 10000)
  on conflict (user_id) do nothing;

  insert into public.points (user_id, amount, type, description)
  values (new.id, 10000, 'earn', '新規登録ボーナス')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  6. 会の作成 … 20歳以上のみ／オープンスペース固定
-- ---------------------------------------------------------------------
create or replace function public.enforce_group_party()
returns trigger
language plpgsql
security definer set search_path = public
as $$
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

  new.max_members       := new.host_group_size + new.guest_group_size;
  new.current_members   := new.host_group_size;  -- 席作成後にトリガーが再計算する
  new.host_member_names := public.normalize_member_names(new.host_member_names, new.host_group_size);
  new.host_name         := coalesce(
    (select username from public.profiles where id = new.host_id), 'ホスト'
  );
  return new;
end;
$$;

drop trigger if exists on_party_group_check on public.parties;
create trigger on_party_group_check
  before insert on public.parties
  for each row execute function public.enforce_group_party();

-- ---------------------------------------------------------------------
--  7. 参加リクエスト … 20歳以上のみ
-- ---------------------------------------------------------------------
create or replace function public.enforce_group_join()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_party public.parties;
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

-- ---------------------------------------------------------------------
--  8. 席の作成 … グループ代表者は20歳以上
-- ---------------------------------------------------------------------
create or replace function public.create_group_seats(
  p_party uuid,
  p_owner uuid,
  p_side  text,
  p_size  int,
  p_names text[]
)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_owner_name text;
  v_names      text[];
  i            int;
begin
  if p_size is null or p_size < 2 then
    raise exception 'グループは2名以上で登録してください';
  end if;
  if p_side not in ('host', 'guest') then
    raise exception 'グループの区分が不正です';
  end if;
  -- グループの代表者は20歳以上であること
  perform public.assert_legal_age(p_owner);
  if public.is_party_member(p_party, p_owner) then
    raise exception '既にこの会に参加しています';
  end if;

  select username into v_owner_name from public.profiles where id = p_owner;
  v_names := public.normalize_member_names(p_names, p_size);

  -- 代表者本人の席
  insert into public.party_members
    (party_id, user_id, role, side, group_owner_id, display_name)
  values (
    p_party, p_owner,
    case when p_side = 'host' then 'host' else 'member' end,
    p_side, p_owner,
    coalesce(v_owner_name, case when p_side = 'host' then 'ホスト' else 'ゲスト' end)
  );

  -- 同伴者の席（未登録。招待コードで本人が引き受けられる）
  for i in 1..(p_size - 1) loop
    insert into public.party_members
      (party_id, user_id, role, side, group_owner_id, display_name, invite_code)
    values (p_party, null, 'member', p_side, p_owner, v_names[i], public.gen_invite_code());
  end loop;

  return p_size;
end;
$$;

-- ---------------------------------------------------------------------
--  9. 招待コードでの席の引き受け … 同伴者本人も20歳以上
-- ---------------------------------------------------------------------
create or replace function public.claim_seat(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_seat  public.party_members;
  v_party public.parties;
  v_name  text;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  -- 同伴者本人も20歳以上でなければ席を引き受けられない
  perform public.assert_legal_age(auth.uid());
  if p_code is null or btrim(p_code) = '' then
    raise exception '招待コードを入力してください';
  end if;

  select * into v_seat from public.party_members
   where invite_code = upper(btrim(p_code)) for update;
  if not found then raise exception '招待コードが見つかりません'; end if;
  if v_seat.user_id is not null then raise exception 'この招待コードは既に使われています'; end if;

  if public.is_party_member(v_seat.party_id, auth.uid()) then
    raise exception '既にこの会に参加しています';
  end if;

  select * into v_party from public.parties where id = v_seat.party_id;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.status = 'completed' then raise exception 'この会は終了しています'; end if;

  select username into v_name from public.profiles where id = auth.uid();

  -- 席は既に人数に含まれているので current_members は変わらない
  update public.party_members
     set user_id      = auth.uid(),
         display_name = coalesce(v_name, display_name),
         invite_code  = null,
         joined_at    = now()
   where id = v_seat.id;

  return jsonb_build_object('party_id', v_party.id, 'title', v_party.title);
end;
$$;

-- ---------------------------------------------------------------------
--  10. 列単位の権限
--      ・birth_date / age_verified_at は誰にも見せない（本人にも返さない）
--      ・birth_date / age_verified_at はクライアントから更新できない
--        （更新できると年齢確認を後から書き換えられてしまう）
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, avatar_url, gender, age, bio, created_at)
  on public.profiles to anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant  update (username, avatar_url, gender, age, bio)
  on public.profiles to authenticated;
-- profiles 行の作成は handle_new_user()（security definer）が行う。
-- 万一クライアントから作られても、年齢確認の列は自己申告できないようにする。
revoke insert on public.profiles from anon, authenticated;
grant  insert (id, username, avatar_url, gender, age, bio)
  on public.profiles to authenticated;

-- 年齢判定は内部専用（他人の年齢を総当たりで調べられないようにする）
revoke all on function public.is_legal_age(uuid)     from public, anon, authenticated;
revoke all on function public.assert_legal_age(uuid) from public, anon, authenticated;

-- =====================================================================
--  適用後の確認
--   select room_type, count(*) from public.parties group by 1;        -- open のみ
--   select count(*) from public.profiles where age < 20;              -- 0 件であること
--   select count(*) from public.profiles where birth_date is null;    -- 既存ユーザーは
--                                                                    -- age 列で判定される
-- =====================================================================
