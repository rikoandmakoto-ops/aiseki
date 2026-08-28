-- =====================================================================
--  マイグレーション: 新しい決済・マッチングフロー（2026-08-28）
--
--  【何が変わるか】
--
--  ■ ホスト側（卓を立てる）
--    1. 登録はプロフィール＋年齢確認のみ。カード登録は不要でボーナスも無い。
--    2. 招待リンクで友達を呼ぶ。友達は「簡易登録」（名前＋年齢確認＋写真）。
--       グループは本人を含めて2名以上でなければ卓を立てられない。
--    3. グループを作ってから卓（会）を立てる。
--    4. ゲストのリクエストを承認するとマッチ成立。
--    ホストは完全無料（1ptも払わない・受け取らない）。
--
--  ■ ゲスト側（卓に参加する）
--    1. フル登録（プロフィール＋年齢確認＋カード登録 → 5,000pt）。
--    2. 卓を探す。マッチ前のホストの写真は「ぼかし」だけが配信される。
--    3. 参加は既定2名。相方は「招待リンク（簡易登録）」か「既存会員」を指定する。
--       ・相方が既存会員 … 各自払い（3,800ptずつ）／まとめ払い（7,600pt）を選べる
--       ・相方が簡易登録 … まとめ払い（7,600pt）のみ
--       ・1人で参加      … 7,600pt（2名分。裏技的な位置づけ）
--    4. リクエスト送信の時点では決済しない。
--    5. ホストが承認した時点（＝マッチ成立）で決済する。
--    6. マッチ後にモザイクが外れ、グループチャットが開く。
--
--  【設計方針は維持】（インターネット異性紹介事業に該当しないための要件）
--    ・ホスト側は2名以上のグループ限定。1対1の「会」は作れない
--      （ゲストが1名で申し込んでも、相手は必ず2名以上のグループ）
--    ・個人間DMなし。チャットは会単位のみ
--    ・個人プロフィールは同じ会の承認済みメンバーにのみ公開
--    ・性別を会の条件に使わない・他のユーザーに表示しない
--    ・20歳以上限定（簡易登録でも年齢確認は必須）
--
--  適用方法:
--    AISEKI_DB_PASSWORD=... node scripts/apply_sql.mjs supabase/migration_new_flow.sql
--  何度実行しても安全です（冪等）。
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  0. 料金・人数の出典（src/lib/pricing.js と一致させること）
-- ---------------------------------------------------------------------

-- 募集する側（ホスト）のグループ最小人数。1対1を作らせないための下限。
create or replace function public.min_host_group_size()
returns int language sql immutable set search_path = public as $$ select 2 $$;

-- 参加する側（ゲスト）のグループ最小人数。1名での参加を認める。
create or replace function public.min_guest_group_size()
returns int language sql immutable set search_path = public as $$ select 1 $$;

-- 卓が確保するゲスト側の枠。ホストは人数を選ばない（常に2名分の枠）。
create or replace function public.guest_slot_size()
returns int language sql immutable set search_path = public as $$ select 2 $$;

-- 課金人数。1名で参加しても2名分を頂く（＝ SOLO_FEE）。
create or replace function public.billable_guests(p_size int)
returns int language sql immutable set search_path = public as $$
  select greatest(coalesce(p_size, 0), public.guest_slot_size())
$$;

-- 参加グループが支払う合計ポイント（人数によらず 3,800 × 課金人数）
create or replace function public.join_fee_total(p_size int)
returns int language sql stable set search_path = public as $$
  select public.join_fee_per_person() * public.billable_guests(p_size)
$$;

-- 1名で参加するときの金額（表示用）。pricing.js の SOLO_FEE と一致させる。
create or replace function public.solo_fee()
returns int language sql stable set search_path = public as $$
  select public.join_fee_total(1)
$$;

-- 支払い方式
create or replace function public.pay_modes()
returns text[] language sql immutable set search_path = public as $$
  select array['bundle', 'split']::text[]
$$;

-- アカウント種別。'full' は通常登録、'simple' は招待リンクからの簡易登録。
create or replace function public.account_types()
returns text[] language sql immutable set search_path = public as $$
  select array['full', 'simple']::text[]
$$;

-- 1つのグループに登録できる人数の上限（代表者を含む）
create or replace function public.max_group_members()
returns int language sql immutable set search_path = public as $$ select 8 $$;

-- ---------------------------------------------------------------------
--  1. profiles … 簡易登録とモザイク用の列
-- ---------------------------------------------------------------------

--  account_type … 'full'（通常登録）| 'simple'（招待リンクからの簡易登録）
--    簡易登録のアカウントは、卓を立てることも参加を申し込むこともできない。
--    招待されたグループのメンバーとして会に入り、チャットに参加するだけ。
alter table public.profiles
  add column if not exists account_type text not null default 'full';

--  signup_intent … 登録時にどちらの入口から来たか（'host' | 'guest'）。
--    カード登録を促すかどうかの出し分けにだけ使う。権限には影響しない。
alter table public.profiles
  add column if not exists signup_intent text;

--  ぼかし写真。マッチ前はこちらだけを配信する（元画像のURLは渡さない）。
alter table public.profiles
  add column if not exists avatar_blur_url text;
alter table public.profiles
  add column if not exists photos_blur text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type = any (public.account_types()));

alter table public.profiles drop constraint if exists profiles_signup_intent_check;
alter table public.profiles add constraint profiles_signup_intent_check
  check (signup_intent is null or signup_intent in ('host', 'guest'));

-- ぼかし写真も自前のストレージのものだけ（avatar_url と同じ規則）
alter table public.profiles drop constraint if exists profiles_avatar_blur_scheme;
alter table public.profiles add constraint profiles_avatar_blur_scheme
  check (
    avatar_blur_url is null
    or avatar_blur_url ~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/avatars/'
  );

alter table public.profiles drop constraint if exists profiles_photos_blur_len;
alter table public.profiles add constraint profiles_photos_blur_len
  check (coalesce(array_length(photos_blur, 1), 0) <= 5);

-- 自分のアカウント種別（他人のものは引けない）
create or replace function public.my_account()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'account_type',    coalesce(p.account_type, 'full'),
    'signup_intent',   p.signup_intent,
    'card_registered', coalesce(p.card_registered, false),
    'has_photo',       (p.avatar_url is not null)
  )
  from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_simple_account(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select account_type = 'simple' from public.profiles where id = p_user),
    false
  );
$$;

-- ---------------------------------------------------------------------
--  2. グループ（ホストが友達を集めておく箱）
--
--     卓を立てる前に作る。招待リンクで呼んだ友達は簡易登録を済ませると
--     このグループの実体（user_id）と結びつく。
--     卓を立てると、このグループの人数分の席が会に作られる。
-- ---------------------------------------------------------------------
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'マイグループ',
  created_at timestamptz not null default now()
);

alter table public.groups drop constraint if exists groups_name_len;
alter table public.groups add constraint groups_name_len
  check (char_length(name) between 1 and 30);

create index if not exists groups_owner_idx on public.groups(owner_id);

create table if not exists public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  display_name text not null,
  invite_code  text,
  is_owner     boolean not null default false,
  created_at   timestamptz not null default now(),
  joined_at    timestamptz
);

alter table public.group_members drop constraint if exists group_members_name_len;
alter table public.group_members add constraint group_members_name_len
  check (char_length(display_name) between 1 and 20);

create unique index if not exists group_members_invite_code_unique
  on public.group_members(invite_code) where invite_code is not null;
create unique index if not exists group_members_group_user_unique
  on public.group_members(group_id, user_id) where user_id is not null;
create index if not exists group_members_group_idx on public.group_members(group_id);
create index if not exists group_members_user_idx  on public.group_members(user_id);

-- グループ用の招待コード（会の席のコードとは別の空間だが、混同しないよう
-- どちらにも当たっていないものだけを返す）
create or replace function public.gen_group_invite_code()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.group_members where invite_code = v_code)
          and not exists (select 1 from public.party_members where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception '招待コードの生成に失敗しました'; end if;
  end loop;
  return v_code;
end $$;

-- グループを作る（代表者の行も同時に作る）
create or replace function public.create_group(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_name text;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  perform public.assert_legal_age(v_uid);
  if public.is_simple_account(v_uid) then
    raise exception '簡易登録のアカウントではグループを作成できません';
  end if;

  insert into public.groups (owner_id, name)
  values (v_uid, coalesce(nullif(btrim(p_name), ''), 'マイグループ'))
  returning id into v_id;

  select coalesce(username, 'ホスト') into v_name from public.profiles where id = v_uid;

  insert into public.group_members (group_id, user_id, display_name, is_owner, joined_at)
  values (v_id, v_uid, v_name, true, now());

  return v_id;
end $$;

-- グループに友達の枠を足す（招待コードを返す）。
-- 実体（アカウント）は、その友達が簡易登録を済ませたときに結びつく。
create or replace function public.add_group_member(p_group uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_count int;
  v_code  text;
  v_id    uuid;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;

  select owner_id into v_owner from public.groups where id = p_group;
  if not found then raise exception 'グループが見つかりません'; end if;
  if v_owner <> v_uid then raise exception 'ご自身のグループにのみ追加できます'; end if;

  -- 同時に押されても上限を超えないよう、グループ単位で直列化する
  perform pg_advisory_xact_lock(hashtext('aiseki:group:' || p_group::text));

  select count(*) into v_count from public.group_members where group_id = p_group;
  if v_count >= public.max_group_members() then
    raise exception 'グループに登録できるのは%名までです', public.max_group_members();
  end if;

  v_code := public.gen_group_invite_code();

  insert into public.group_members (group_id, display_name, invite_code)
  values (
    p_group,
    coalesce(nullif(left(btrim(p_name), 20), ''), 'メンバー' || (v_count + 1)),
    v_code
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'invite_code', v_code);
end $$;

-- まだ誰も引き受けていない枠だけ削除できる（引き受け済みの人は外せない）
create or replace function public.remove_group_member(p_member uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_row   public.group_members;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;

  select m.* into v_row from public.group_members m where m.id = p_member;
  if not found then raise exception 'メンバーが見つかりません'; end if;
  if v_row.is_owner then raise exception '代表者は外せません'; end if;

  select owner_id into v_owner from public.groups where id = v_row.group_id;
  if v_owner <> v_uid then raise exception 'ご自身のグループのみ編集できます'; end if;

  delete from public.group_members where id = p_member;
end $$;

-- 自分のグループ一覧（招待コード込み）。他人のグループは返さない。
create or replace function public.list_my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'created_at', g.created_at,
        'members', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'display_name', m.display_name,
              'invite_code', m.invite_code,
              'is_owner', m.is_owner,
              'joined', (m.user_id is not null),
              'avatar_url', (select pr.avatar_url from public.profiles pr where pr.id = m.user_id)
            ) order by m.is_owner desc, m.created_at
          ), '[]'::jsonb)
          from public.group_members m where m.group_id = g.id
        )
      ) order by g.created_at
    ), '[]'::jsonb)
  from public.groups g
  where g.owner_id = auth.uid();
$$;

-- 招待リンクを開いたときの表示（まだ登録していない人も見る）。
-- 返すのは「誰のグループか」だけ。プロフィールは渡さない。
create or replace function public.group_invite_preview(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'group_name', g.name,
    'owner_name', coalesce(o.username, 'ホスト'),
    'display_name', m.display_name,
    'claimed', (m.user_id is not null)
  )
  from public.group_members m
  join public.groups   g on g.id = m.group_id
  left join public.profiles o on o.id = g.owner_id
  where m.invite_code = upper(btrim(p_code));
$$;

-- 招待コードでグループの枠を引き受ける（簡易登録の直後に呼ぶ）
create or replace function public.claim_group_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  public.group_members;
  v_name text;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  perform public.assert_legal_age(v_uid);
  if p_code is null or btrim(p_code) = '' then
    raise exception '招待コードを入力してください';
  end if;

  select * into v_row from public.group_members
   where invite_code = upper(btrim(p_code)) for update;
  if not found then raise exception '招待コードが見つかりません'; end if;
  if v_row.user_id is not null then raise exception 'この招待コードは既に使われています'; end if;

  if exists (
    select 1 from public.group_members
     where group_id = v_row.group_id and user_id = v_uid
  ) then
    raise exception '既にこのグループに参加しています';
  end if;

  select username into v_name from public.profiles where id = v_uid;

  update public.group_members
     set user_id      = v_uid,
         display_name = coalesce(nullif(btrim(v_name), ''), display_name),
         invite_code  = null,
         joined_at    = now()
   where id = v_row.id;

  return jsonb_build_object('group_id', v_row.group_id);
end $$;

-- ---------------------------------------------------------------------
--  3. parties … グループ参照とモザイク用の写真
-- ---------------------------------------------------------------------
alter table public.parties
  add column if not exists group_id uuid references public.groups(id) on delete set null;

--  ホストのぼかし写真。会の一覧に出すため非正規化する
--  （profiles は同じ会のメンバーにしか見えないので、一覧からは引けない）。
alter table public.parties
  add column if not exists host_avatar_blur_url text;

create index if not exists parties_group_idx on public.parties(group_id);

--  ゲスト側は1名から。ホスト側は2名以上のまま。
alter table public.parties drop constraint if exists parties_group_only;
alter table public.parties add constraint parties_group_only check (
  host_group_size  >= 2
  and guest_group_size >= 1
  and max_members  >= (host_group_size + guest_group_size)
);

-- ---------------------------------------------------------------------
--  4. join_requests … 支払い方式と相方
-- ---------------------------------------------------------------------
--  pay_mode      … 'bundle'（まとめ払い）| 'split'（各自払い）
--  partner_id    … 相方が既存会員のときだけ入る
--  billable_size … 課金人数。1名参加でも2（＝ 7,600pt）。サーバが決める。
alter table public.join_requests
  add column if not exists pay_mode text not null default 'bundle';
alter table public.join_requests
  add column if not exists partner_id uuid references public.profiles(id) on delete set null;
alter table public.join_requests
  add column if not exists billable_size int not null default 2;

alter table public.join_requests drop constraint if exists join_requests_pay_mode_check;
alter table public.join_requests add constraint join_requests_pay_mode_check
  check (pay_mode = any (public.pay_modes()));

--  1名での申し込みを認める（相手のホストグループは必ず2名以上）
alter table public.join_requests drop constraint if exists join_requests_group_only;
alter table public.join_requests add constraint join_requests_group_only
  check (group_size >= 1);

alter table public.join_requests drop constraint if exists join_requests_billable_check;
alter table public.join_requests add constraint join_requests_billable_check
  check (billable_size >= 2);

create index if not exists join_requests_partner_idx on public.join_requests(partner_id);

-- ---------------------------------------------------------------------
--  5. 席をつくる … ゲストは1名から。相方が既存会員なら実体のある席を作る。
-- ---------------------------------------------------------------------
--  🚨 引数が5つ → 6つに変わる。旧シグネチャは必ず落とすこと。
--     2つ残すと PostgREST / plpgsql が呼び分けられず PGRST201（曖昧な関数）になる
--     （HANDOFF §17 で grant_card_bonus が同じ形でハマっている）。
drop function if exists public.create_group_seats(uuid, uuid, text, int, text[]);

create or replace function public.create_group_seats(
  p_party   uuid,
  p_owner   uuid,
  p_side    text,
  p_size    int,
  p_names   text[],
  p_partner uuid default null
)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_owner_name   text;
  v_partner_name text;
  v_names        text[];
  v_min          int;
  v_extra        int;
  i              int;
begin
  if p_side not in ('host', 'guest') then
    raise exception 'グループの区分が不正です';
  end if;

  -- ホスト側は2名以上、ゲスト側は1名以上。
  v_min := case when p_side = 'host'
                then public.min_host_group_size()
                else public.min_guest_group_size() end;
  if p_size is null or p_size < v_min then
    raise exception '%側のグループは%名以上で登録してください',
      case when p_side = 'host' then 'ホスト' else '参加' end, v_min;
  end if;

  -- グループの代表者は20歳以上であること
  perform public.assert_legal_age(p_owner);
  if public.is_party_member(p_party, p_owner) then
    raise exception '既にこの会に参加しています';
  end if;

  if p_partner is not null then
    if p_partner = p_owner then raise exception '相方にご自身は指定できません'; end if;
    if p_size < 2 then raise exception '相方を指定するときは2名でお申し込みください'; end if;
    perform public.assert_legal_age(p_partner);
    if public.is_party_member(p_party, p_partner) then
      raise exception '相方の方は既にこの会に参加しています';
    end if;
  end if;

  select username into v_owner_name from public.profiles where id = p_owner;

  -- 代表者本人の席
  insert into public.party_members
    (party_id, user_id, role, side, group_owner_id, display_name)
  values (
    p_party, p_owner,
    case when p_side = 'host' then 'host' else 'member' end,
    p_side, p_owner,
    coalesce(v_owner_name, case when p_side = 'host' then 'ホスト' else 'ゲスト' end)
  );

  -- 相方（既存会員）の席。招待コードは要らない（もうアカウントがある）。
  if p_partner is not null then
    select username into v_partner_name from public.profiles where id = p_partner;
    insert into public.party_members
      (party_id, user_id, role, side, group_owner_id, display_name, joined_at)
    values (p_party, p_partner, 'member', p_side, p_owner,
            coalesce(v_partner_name, 'メンバー'), now());
  end if;

  -- 残り（未登録の同伴者）。招待コードで本人が引き受けられる。
  v_extra := p_size - 1 - (case when p_partner is not null then 1 else 0 end);
  v_names := public.normalize_member_names(p_names, v_extra + 1);
  for i in 1..greatest(v_extra, 0) loop
    insert into public.party_members
      (party_id, user_id, role, side, group_owner_id, display_name, invite_code)
    values (p_party, null, 'member', p_side, p_owner, v_names[i], public.gen_invite_code());
  end loop;

  return p_size;
end $$;

-- グループの実体から、そのまま会の席を作る（ホスト側）。
-- 既にアプリを使っているメンバーは実体つきの席、まだの人は招待コードつきの席。
create or replace function public.create_seats_from_group(p_party uuid, p_group uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r     record;
  v_n   int := 0;
  v_own uuid;
begin
  select owner_id into v_own from public.groups where id = p_group;
  if not found then raise exception 'グループが見つかりません'; end if;

  for r in
    select m.user_id, m.display_name, m.is_owner
      from public.group_members m
     where m.group_id = p_group
     order by m.is_owner desc, m.created_at
  loop
    if r.user_id is not null then
      perform public.assert_legal_age(r.user_id);
      insert into public.party_members
        (party_id, user_id, role, side, group_owner_id, display_name, joined_at)
      values (p_party, r.user_id,
              case when r.is_owner then 'host' else 'member' end,
              'host', v_own, r.display_name, now());
    else
      insert into public.party_members
        (party_id, user_id, role, side, group_owner_id, display_name, invite_code)
      values (p_party, null, 'member', 'host', v_own,
              r.display_name, public.gen_invite_code());
    end if;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

--  席数の同期。いちど成立（matched）した会は、席の増減で募集中へ戻さない。
create or replace function public.sync_party_member_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_party uuid;
  v_count int;
begin
  v_party := coalesce(new.party_id, old.party_id);

  select count(*) into v_count
    from public.party_members where party_id = v_party;

  update public.parties
     set current_members = v_count,
         status = case
                    when status in ('completed', 'cancelled', 'matched') then status
                    when v_count >= max_members then 'matched'
                    else 'recruiting'
                  end
   where id = v_party;

  return null;
end $$;

-- ---------------------------------------------------------------------
--  6. 卓を立てる
--     ・グループ（2名以上）が要る
--     ・ホストは人数を選ばない。ゲスト側の枠は常に guest_slot_size()
--     ・ホストのぼかし写真を会へ写す（一覧でモザイク表示するため）
-- ---------------------------------------------------------------------
create or replace function public.enforce_group_party()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_shop      public.shops%rowtype;
  v_host_tier text;
  v_group     public.groups;
  v_size      int;
  v_names     text[];
begin
  -- 20歳未満は会を作成できない（飲酒を伴うため）
  perform public.assert_legal_age(new.host_id);

  -- 簡易登録のアカウントは卓を立てられない
  if public.is_simple_account(new.host_id) then
    raise exception '簡易登録のアカウントでは会を作成できません';
  end if;

  -- ── ホスト側グループ ───────────────────────────
  if new.group_id is not null then
    select * into v_group from public.groups where id = new.group_id;
    if not found then raise exception 'グループが見つかりません'; end if;
    if v_group.owner_id <> new.host_id then
      raise exception 'ご自身のグループでのみ会を作成できます';
    end if;

    select count(*) into v_size from public.group_members where group_id = new.group_id;
    select coalesce(array_agg(display_name order by created_at), '{}')
      into v_names
      from public.group_members
     where group_id = new.group_id and not is_owner;

    new.host_group_size   := v_size;
    new.host_member_names := coalesce(v_names, '{}');
  end if;

  if coalesce(new.host_group_size, 0) < public.min_host_group_size() then
    raise exception 'ホスト側は%名以上のグループでのみ会を作成できます。先に友達を招待してください',
      public.min_host_group_size();
  end if;

  -- ゲスト側の枠はホストが選ばない（常に2名分）。
  -- 参加する側は1名でも申し込めるが、その場合も2名分をお支払いいただく。
  new.guest_group_size := public.guest_slot_size();

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
    new.avg_budget  := null;
    new.budget_tier := coalesce(new.budget_tier, 'bronze');
  end if;

  if public.tier_order_of(new.budget_tier) is null then
    raise exception '予算帯の指定が正しくありません';
  end if;

  v_host_tier := public.user_rank_tier(new.host_id);

  if public.tier_order_of(v_host_tier) < public.tier_order_of(new.budget_tier) then
    raise exception '現在のランク（%）では、この予算帯（%）のお店で会を作れません。会の終了後に受け取る評価でランクが上がります',
      (select tier_label from public.rank_tiers() where tier_key = v_host_tier),
      (select tier_label from public.rank_tiers() where tier_key = new.budget_tier);
  end if;

  -- ── 参加者に求めるランク ────────────────────────
  new.min_guest_tier := coalesce(new.min_guest_tier, 'bronze');
  if public.tier_order_of(new.min_guest_tier) is null then
    raise exception '参加者に求めるランクの指定が正しくありません';
  end if;
  if public.tier_order_of(v_host_tier) < public.tier_order_of(new.min_guest_tier) then
    raise exception '現在のランク（%）では、参加する方に%以上を求めることはできません。求められるのはご自身のランクまでです',
      (select tier_label from public.rank_tiers() where tier_key = v_host_tier),
      (select tier_label from public.rank_tiers() where tier_key = new.min_guest_tier);
  end if;

  new.max_members       := new.host_group_size + new.guest_group_size;
  new.current_members   := new.host_group_size;  -- 席作成後にトリガーが再計算する
  new.host_member_names := public.normalize_member_names(
    new.host_member_names, new.host_group_size
  );
  new.host_name := coalesce(
    (select username from public.profiles where id = new.host_id), 'ホスト'
  );
  new.host_drinking_style := coalesce(
    (select drinking_style from public.profiles where id = new.host_id), '{}'
  );
  -- マッチ前に配信するのは、ぼかした写真だけ
  new.host_avatar_blur_url := (
    select avatar_blur_url from public.profiles where id = new.host_id
  );
  return new;
end $$;

create or replace function public.handle_new_party()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.group_id is not null then
    perform public.create_seats_from_group(new.id, new.group_id);
  else
    perform public.create_group_seats(
      new.id, new.host_id, 'host', new.host_group_size, new.host_member_names, null
    );
  end if;
  return new;
end $$;

--  プロフィールの写真・飲みスタイルを、募集中／成立済みの会へ写す
create or replace function public.sync_host_drinking_style()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.drinking_style  is distinct from old.drinking_style
     or new.avatar_blur_url is distinct from old.avatar_blur_url then
    update public.parties
       set host_drinking_style   = new.drinking_style,
           host_avatar_blur_url  = new.avatar_blur_url
     where host_id = new.id
       and status in ('recruiting', 'matched');
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
--  7. 参加リクエスト
--     ・1名から申し込める（課金は2名分）
--     ・相方が既存会員なら「各自払い」を選べる
--     ・相方が簡易登録（招待）なら「まとめ払い」だけ
--     ・この時点では決済しない（承認時に決済する）
-- ---------------------------------------------------------------------
create or replace function public.enforce_group_join()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_party public.parties;
  v_tier  text;
  v_extra int;
begin
  -- 20歳未満は参加を申し込めない（飲酒を伴うため）
  perform public.assert_legal_age(new.user_id);

  -- 簡易登録のアカウントからは申し込めない（招待されて参加するだけ）
  if public.is_simple_account(new.user_id) then
    raise exception '簡易登録のアカウントでは参加を申し込めません';
  end if;

  if coalesce(new.group_size, 0) < public.min_guest_group_size() then
    raise exception '参加人数の指定が正しくありません';
  end if;

  select * into v_party from public.parties where id = new.party_id;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id = new.user_id then
    raise exception '自分がホストの会には参加できません';
  end if;
  if v_party.status = 'completed' then
    raise exception 'この会は終了しています';
  end if;
  if v_party.status = 'cancelled' then
    raise exception 'この会は取り消されています';
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

  -- ── 支払い方式と相方 ────────────────────────────
  new.pay_mode := coalesce(nullif(btrim(new.pay_mode), ''), 'bundle');
  if not (new.pay_mode = any (public.pay_modes())) then
    raise exception 'お支払い方法の指定が正しくありません';
  end if;

  if new.partner_id is not null then
    if new.partner_id = new.user_id then
      raise exception '相方にご自身は指定できません';
    end if;
    if new.group_size <> 2 then
      raise exception '相方を指定するときは2名でお申し込みください';
    end if;
    if not exists (select 1 from public.profiles where id = new.partner_id) then
      raise exception '指定された相方が見つかりません';
    end if;
    if public.is_simple_account(new.partner_id) then
      raise exception '簡易登録の方は、招待リンクからのご参加のみとなります';
    end if;
    perform public.assert_legal_age(new.partner_id);
    if v_party.host_id = new.partner_id then
      raise exception 'ホストの方を相方に指定することはできません';
    end if;
    if public.is_party_member(new.party_id, new.partner_id) then
      raise exception '相方の方は既にこの会に参加しています';
    end if;
    if public.is_blocked(new.user_id, new.partner_id) then
      raise exception 'この方を相方に指定することはできません';
    end if;
  elsif new.pay_mode = 'split' then
    -- 各自払いは「相方が既存会員のとき」だけ。招待（簡易登録）の相方は
    -- 自分で支払う手段を持たないため、まとめ払いに限る。
    raise exception '各自払いは、相方が既存の会員のときにのみ選べます';
  end if;

  -- 課金人数はサーバが決める（1名で申し込んでも2名分）
  new.billable_size := public.billable_guests(new.group_size);

  -- 枠の確認は「課金人数」で行う（1名参加でも2名分の枠を押さえる）
  if v_party.current_members + new.billable_size > v_party.max_members then
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

  -- 同伴者名は「代表者と相方を除いた人数分」に整える
  v_extra := new.group_size - 1 - (case when new.partner_id is not null then 1 else 0 end);
  new.member_names   := public.normalize_member_names(new.member_names, greatest(v_extra, 0) + 1);
  new.applicant_name := coalesce(
    (select username from public.profiles where id = new.user_id), 'ゲスト'
  );
  return new;
end $$;

--  申し込む前に金額を確かめる（表示用）。他人の残高は返さない。
create or replace function public.join_charge_preview(p_size int, p_mode text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'group_size',    coalesce(p_size, 1),
    'billable_size', public.billable_guests(p_size),
    'total',         public.join_fee_total(p_size),
    'per_person',    public.join_fee_per_person(),
    'my_charge',     case when p_mode = 'split'
                          then public.join_fee_total(p_size) / 2
                          else public.join_fee_total(p_size) end,
    'my_balance',    coalesce(
                       (select balance from public.point_balances where user_id = auth.uid()), 0)
  );
$$;

--  相方（既存会員）を指定するための照会。
--  会員コード（＝紹介コード。本人が自分で相手に伝えるもの）から、
--  相方に指定できるかどうかと表示名だけを返す。
--
--  🚨 返してよいのは「表示名」だけ。年齢・写真・性別・評価を足さないこと。
--    プロフィールは同じ会に参加が承認されてから見えるもの（§1）。
create or replace function public.find_partner_by_code(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row  public.profiles;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  if v_code = '' then raise exception '会員コードを入力してください'; end if;

  select * into v_row from public.profiles where referral_code = v_code;
  if not found then raise exception 'その会員コードの方が見つかりません'; end if;

  if v_row.id = v_uid then raise exception 'ご自身のコードは指定できません'; end if;
  if coalesce(v_row.account_type, 'full') = 'simple' then
    raise exception '簡易登録の方は、招待リンクからのご参加のみとなります';
  end if;
  if not public.is_legal_age(v_row.id) then
    raise exception 'この方は相方に指定できません';
  end if;
  -- どちらかがブロックしている相手は指定できない
  if public.is_blocked(v_uid, v_row.id) then
    raise exception 'この方は相方に指定できません';
  end if;

  return jsonb_build_object('user_id', v_row.id, 'username', coalesce(v_row.username, 'メンバー'));
end $$;

-- ---------------------------------------------------------------------
--  8. 承認 ＝ マッチ成立 ＝ 決済
--
--     ここが唯一の決済ポイント。リクエストを送った時点では1ptも動かない。
--     ・まとめ払い … 代表者が課金人数ぶん（既定 7,600pt）払う
--     ・各自払い   … 代表者と相方が半分ずつ（3,800ptずつ）払う
--     支払われたポイントは全額が運営の収益。ホストには1ptも渡らない。
-- ---------------------------------------------------------------------
create or replace function public.accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req      public.join_requests;
  v_party    public.parties;
  v_fee      int;
  v_billable int;
  v_total    int;
  v_seats    int;
  v_taken    int;
  v_self     int;
  v_partner  int;
  v_bal      int;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  if v_req.status <> 'pending' then raise exception '既に処理済みのリクエストです'; end if;

  select * into v_party from public.parties where id = v_req.party_id for update;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id <> auth.uid() then raise exception 'この会のホストのみ承認できます'; end if;
  if v_party.status = 'cancelled' then raise exception 'この会は取り消されています'; end if;
  if public.is_party_member(v_req.party_id, v_req.user_id) then
    raise exception 'この方は既にこの会に参加しています';
  end if;

  v_fee      := public.join_fee_per_person();
  v_billable := public.billable_guests(v_req.group_size);

  -- 空き枠は「宣言された人数」ではなく実際の席数で判定する
  select count(*) into v_seats from public.party_members where party_id = v_req.party_id;
  if v_seats + v_billable > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- ── 誰がいくら払うか ────────────────────────────
  v_total := v_fee * v_billable;
  if v_req.pay_mode = 'split' and v_req.partner_id is not null then
    v_self    := v_total / 2;
    v_partner := v_total - v_self;
  else
    v_self    := v_total;
    v_partner := 0;
  end if;

  -- 残高の確認（足りない側の名前を出さず、どちらが足りないかだけ伝える）
  select balance into v_bal from public.point_balances
   where user_id = v_req.user_id for update;
  if coalesce(v_bal, 0) < v_self then
    raise exception '参加者のポイントが不足しています';
  end if;

  if v_partner > 0 then
    select balance into v_bal from public.point_balances
     where user_id = v_req.partner_id for update;
    if coalesce(v_bal, 0) < v_partner then
      raise exception 'お相手（各自払い）のポイントが不足しています';
    end if;
  end if;

  -- ── 決済 ────────────────────────────────────────
  if v_self > 0 then
    update public.point_balances set balance = balance - v_self
     where user_id = v_req.user_id;
    insert into public.points (user_id, amount, type, description)
    values (v_req.user_id, -v_self, 'spend', 'グループ参加: ' || v_party.title);
    insert into public.platform_revenues
      (party_id, join_request_id, payer_id, group_size, fee_per_person, points)
    values (v_party.id, v_req.id, v_req.user_id,
            case when v_partner > 0 then 1 else v_billable end, v_fee, v_self);
  end if;

  if v_partner > 0 then
    update public.point_balances set balance = balance - v_partner
     where user_id = v_req.partner_id;
    insert into public.points (user_id, amount, type, description)
    values (v_req.partner_id, -v_partner, 'spend', 'グループ参加: ' || v_party.title);
    insert into public.platform_revenues
      (party_id, join_request_id, payer_id, group_size, fee_per_person, points)
    values (v_party.id, v_req.id, v_req.partner_id, 1, v_fee, v_partner);
  end if;

  -- ── 席を作る（current_members はトリガーが同期する）───
  perform public.create_group_seats(
    v_req.party_id, v_req.user_id, 'guest',
    v_req.group_size, v_req.member_names, v_req.partner_id
  );

  update public.join_requests set status = 'accepted' where id = p_request_id;

  -- ── マッチ成立 ───────────────────────────────────
  -- 1名で参加した場合、席は1つしか増えないが枠は2名分を押さえている。
  -- 課金人数の合計で判定して成立させる（席数だけで見ると募集中に見えてしまう）。
  select coalesce(sum(public.billable_guests(group_size)), 0) into v_taken
    from public.join_requests
   where party_id = v_req.party_id and status = 'accepted';

  if v_taken >= v_party.guest_group_size then
    update public.parties set status = 'matched'
     where id = v_req.party_id and status not in ('completed', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------
--  9. 返金（通報を受けた運営の操作）
--
--     画面には出さない。service_role だけが実行できる。
--     承認済みのリクエストについて、支払った人へポイントを戻し、
--     運営の収益からも同額を打ち消す。
-- ---------------------------------------------------------------------
create or replace function public.refund_join_payment(p_request_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req    public.join_requests;
  v_party  public.parties;
  r        record;
  v_sum    int := 0;
  v_reason text;
begin
  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  if v_req.status <> 'accepted' then
    raise exception '返金できるのは承認済みのリクエストだけです（現在: %）', v_req.status;
  end if;

  select * into v_party from public.parties where id = v_req.party_id;
  v_reason := coalesce(nullif(btrim(p_reason), ''), '通報対応');

  -- 支払った人ごとに戻す（各自払いなら2人に戻る）。
  -- 既に返金済みの分（points が負でない行）は作らない。
  for r in
    select payer_id, sum(points) as points
      from public.platform_revenues
     where join_request_id = p_request_id
     group by payer_id
    having sum(points) > 0
  loop
    update public.point_balances set balance = balance + r.points
     where user_id = r.payer_id;
    insert into public.point_balances (user_id, balance)
    select r.payer_id, r.points
     where not exists (select 1 from public.point_balances where user_id = r.payer_id);

    insert into public.points (user_id, amount, type, description)
    values (r.payer_id, r.points, 'refund',
            '返金（' || v_reason || '）: ' || coalesce(v_party.title, '会'));

    -- 収益の打ち消し（0以上の CHECK があるため、行は消さずに削除で相殺する）
    delete from public.platform_revenues
     where join_request_id = p_request_id and payer_id = r.payer_id;

    v_sum := v_sum + r.points;
  end loop;

  update public.join_requests set status = 'refunded' where id = p_request_id;

  return jsonb_build_object('refunded', v_sum, 'request_id', p_request_id);
end $$;

-- ---------------------------------------------------------------------
-- 10. モザイク … マッチ前に見せてよいホストの情報
--
--     profiles は「同じ会の承認済みメンバー」にしか見えない（RLS）。
--     卓を探している人にホストの雰囲気だけ伝えるため、
--     ぼかした写真と、当たり障りのない項目だけを返す関数を用意する。
--
--     🚨 ここに gender / review_average / review_count / rank_tier を
--       足してはいけない。足した瞬間に「マッチ前の他人」に対して
--       性別や評価が開示され、§1 の担保が壊れる。
-- ---------------------------------------------------------------------
create or replace function public.party_host_preview(p_party uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_party public.parties;
  v_full  boolean;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;

  select * into v_party from public.parties where id = p_party;
  if not found then return null; end if;

  -- ブロックしている相手の会は返さない（一覧と同じ扱い）
  if public.is_blocked(auth.uid(), v_party.host_id) then return null; end if;

  -- 同じ会のメンバーになっていれば、素の写真が見える（RLS で直接引ける）
  v_full := public.is_party_member(p_party, auth.uid());

  return (
    select jsonb_build_object(
      'user_id',    p.id,
      'username',   p.username,
      'age',        p.age,
      'bio',        p.bio,
      'hobbies',    p.hobbies,
      'occupation', p.occupation,
      'home_area',  p.home_area,
      'drinking_style', p.drinking_style,
      'matched',    v_full,
      -- マッチ前は「ぼかし」だけ。素のURLは渡さない。
      'avatar_url', case when v_full then p.avatar_url else p.avatar_blur_url end,
      'photos',     case when v_full then p.photos     else p.photos_blur end,
      'blurred',    (not v_full)
    )
    from public.profiles p where p.id = v_party.host_id
  );
end $$;

-- ---------------------------------------------------------------------
-- 11. 新規登録 … 簡易登録に対応する
--
--     簡易登録（account_type = 'simple'）は名前・生年月日・写真だけ。
--     性別は聞かない（アプローチ機能を使えないため必要が無い）。
--     年齢確認は通常登録と同じく必須。
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_birth  date;
  v_age    int;
  v_kind   text;
  v_intent text;
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

  v_kind := coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'full');
  if not (v_kind = any (public.account_types())) then v_kind := 'full'; end if;

  v_intent := nullif(new.raw_user_meta_data->>'signup_intent', '');
  if v_intent is not null and v_intent not in ('host', 'guest') then
    v_intent := null;
  end if;

  insert into public.profiles (
    id, username, gender, age, birth_date, age_verified_at,
    referral_code, account_type, signup_intent
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'gender',
    v_age,
    v_birth,
    now(),
    public.gen_referral_code(),
    v_kind,
    v_intent
  )
  on conflict (id) do nothing;

  -- 登録ボーナスはここでは付けない。カード登録後に grant_card_bonus() が付ける。
  -- ホストはカードを登録しないので、ボーナスも付かない（仕様どおり）。
  insert into public.point_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 12. 既存データの移行
-- ---------------------------------------------------------------------
do $$
begin
  -- 既存のリクエストの課金人数を埋める
  update public.join_requests
     set billable_size = public.billable_guests(group_size)
   where billable_size is null or billable_size < 2;

  -- 成立済みの会（席が埋まっている）を matched のままにしておく
  update public.parties p
     set status = 'matched'
   where p.status = 'recruiting'
     and p.current_members >= p.max_members;
end $$;

-- ---------------------------------------------------------------------
-- 13. RLS と権限
-- ---------------------------------------------------------------------
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

--  グループは代表者だけが読める。書き込みは security definer 関数のみ
--  （直接 insert できると、他人のグループに人数を足せてしまう）。
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select using (owner_id = auth.uid());

--  自分が引き受けた枠は、自分でも見える（「どのグループに入っているか」）。
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select using (
  user_id = auth.uid()
  or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
);

--  招待コードは list_my_groups() / group_invite_preview() 経由でのみ返す。
--  テーブルから直接読めると、総当たりで他人のグループに入れてしまう。
revoke select on public.group_members from anon, authenticated;
grant  select (id, group_id, user_id, display_name, is_owner, created_at, joined_at)
  on public.group_members to authenticated;

revoke all on public.groups        from anon;
revoke all on public.group_members from anon;
grant select on public.groups to authenticated;

--  parties … group_id を列単位の INSERT 権限に足す。
--  🚨 ここに足し忘れると insert 全体が 42501 で落ちる（HANDOFF §14）。
--     host_avatar_blur_url はサーバが入れるので INSERT 権限に入れない。
grant insert (
  title, location, area, party_date, party_time,
  host_id, host_group_size, host_member_names,
  budget_tier, min_guest_tier, shop_id, guest_group_size, group_id
) on public.parties to authenticated;

grant select (
  id, host_id, title, location, area, host_group_size, guest_group_size,
  host_member_names, host_name, max_members, current_members, party_time,
  treat_type, room_type, point_request, status, created_at, party_date,
  host_drinking_style, shop_id, avg_budget, budget_tier, min_guest_tier,
  group_id, host_avatar_blur_url
) on public.parties to anon, authenticated;

--  join_requests … 支払い方式と相方を受け取れるようにする。
--  billable_size はサーバが決めるので INSERT 権限に入れない。
--  member_names / partner_id は承認前にホストへ渡さない（SELECT から外す）。
revoke select on public.join_requests from anon, authenticated;
grant  select (id, party_id, user_id, group_size, applicant_name, status, created_at,
               pay_mode, billable_size)
  on public.join_requests to anon, authenticated;
grant insert (party_id, user_id, group_size, member_names, status, pay_mode, partner_id)
  on public.join_requests to authenticated;

--  profiles … ぼかし写真を自分で保存できるようにする。
--  ⚠ avatar_blur_url / photos_blur は「マッチ前でも見えてよい」値だが、
--    profiles の行そのものが RLS で隠れているため、他人が直接読むことはできない。
--    マッチ前の閲覧経路は party_host_preview() だけ。
grant insert (avatar_blur_url, photos_blur) on public.profiles to authenticated;
grant update (avatar_blur_url, photos_blur) on public.profiles to authenticated;
--  読み取りも開ける。RLS が行そのものを「本人＋同じ会のメンバー」に絞るので、
--  マッチ前の他人がここから引くことはできない（経路は party_host_preview だけ）。
grant select (avatar_blur_url, photos_blur) on public.profiles to authenticated;

--  内部用の関数は RPC として公開しない
revoke all on function public.create_group_seats(uuid, uuid, text, int, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.create_seats_from_group(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.gen_group_invite_code()
  from public, anon, authenticated;
revoke all on function public.refund_join_payment(uuid, text)
  from public, anon, authenticated;
revoke all on function public.is_simple_account(uuid)
  from public, anon, authenticated;

--  画面から呼ぶ RPC
grant execute on function public.create_group(text)              to authenticated;
grant execute on function public.add_group_member(uuid, text)    to authenticated;
grant execute on function public.remove_group_member(uuid)       to authenticated;
grant execute on function public.list_my_groups()                to authenticated;
grant execute on function public.claim_group_invite(text)        to authenticated;
grant execute on function public.my_account()                    to authenticated;
grant execute on function public.party_host_preview(uuid)        to authenticated;
grant execute on function public.join_charge_preview(int, text)  to authenticated;
grant execute on function public.find_partner_by_code(text)      to authenticated;

--  招待リンクは未登録の人も開く（返すのはグループ名と代表者の表示名だけ）
grant execute on function public.group_invite_preview(text) to anon, authenticated;

--  料金・人数の定数は画面が読む
grant execute on function public.min_host_group_size()   to anon, authenticated;
grant execute on function public.min_guest_group_size()  to anon, authenticated;
grant execute on function public.guest_slot_size()       to anon, authenticated;
grant execute on function public.billable_guests(int)    to anon, authenticated;
grant execute on function public.join_fee_total(int)     to anon, authenticated;
grant execute on function public.solo_fee()              to anon, authenticated;
grant execute on function public.pay_modes()             to anon, authenticated;
grant execute on function public.account_types()         to anon, authenticated;
grant execute on function public.max_group_members()     to anon, authenticated;

-- ---------------------------------------------------------------------
-- 14. 適用の検算（raise notice で結果を出す）
-- ---------------------------------------------------------------------
do $$
declare
  v_ok  boolean;
  v_txt text;
begin
  -- 料金
  if public.solo_fee() <> 7600 then
    raise exception '検算失敗: solo_fee() が % （期待 7600）', public.solo_fee();
  end if;
  if public.join_fee_total(2) <> 7600 then
    raise exception '検算失敗: 2名の合計が % （期待 7600）', public.join_fee_total(2);
  end if;
  if public.join_fee_total(1) <> 7600 then
    raise exception '検算失敗: 1名の合計が % （期待 7600）', public.join_fee_total(1);
  end if;
  raise notice '✓ 料金: 1名=% / 2名=% / 1人あたり=%',
    public.join_fee_total(1), public.join_fee_total(2), public.join_fee_per_person();

  -- 制約
  select pg_get_constraintdef(oid) into v_txt
    from pg_constraint where conname = 'join_requests_group_only';
  if v_txt !~ 'group_size >= 1' then
    raise exception '検算失敗: join_requests_group_only が緩和されていません（%）', v_txt;
  end if;
  select pg_get_constraintdef(oid) into v_txt
    from pg_constraint where conname = 'parties_group_only';
  if v_txt !~ 'host_group_size >= 2' or v_txt !~ 'guest_group_size >= 1' then
    raise exception '検算失敗: parties_group_only が想定と違います（%）', v_txt;
  end if;
  raise notice '✓ 人数: ホスト側は2名以上のまま / ゲスト側は1名から';

  -- parties の INSERT 権限に group_id があるか（HANDOFF §14 の再発防止）
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'parties'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
       and column_name = 'group_id'
  ) into v_ok;
  if not v_ok then raise exception '検算失敗: parties.group_id の INSERT 権限がありません'; end if;
  raise notice '✓ parties.group_id の列単位 INSERT 権限あり';

  -- 招待コードがテーブルから直接読めないこと
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'group_members'
       and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
       and column_name = 'invite_code'
  ) into v_ok;
  if v_ok then raise exception '検算失敗: group_members.invite_code が読めてしまいます'; end if;
  raise notice '✓ グループの招待コードは列単位で遮断されている';

  -- 返金は service_role だけ
  select has_function_privilege('authenticated', 'public.refund_join_payment(uuid, text)', 'execute')
    into v_ok;
  if v_ok then raise exception '検算失敗: refund_join_payment を authenticated が実行できます'; end if;
  select has_function_privilege('anon', 'public.refund_join_payment(uuid, text)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: refund_join_payment を anon が実行できます'; end if;
  raise notice '✓ 返金RPCは service_role 専用';

  -- 席を作る関数が公開されていないこと
  select has_function_privilege('authenticated',
    'public.create_seats_from_group(uuid, uuid)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: create_seats_from_group が公開されています'; end if;
  raise notice '✓ 席を作る関数は非公開';

  -- モザイク列
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_blur_url'
  ) then raise exception '検算失敗: profiles.avatar_blur_url がありません'; end if;
  raise notice '✓ モザイク用の列あり（avatar_blur_url / photos_blur）';

  raise notice '=== migration_new_flow.sql 適用完了 ===';
end $$;
