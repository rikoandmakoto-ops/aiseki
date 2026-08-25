-- =====================================================================
--  AISEKI — ローンチ強化マイグレーション（2026-08-19）
--
--  1. 新規登録ボーナスを 1,000pt → 10,000pt に引き上げる
--     （参加が 1人あたり 3,800pt のため、1,000pt では登録直後に
--       1回も参加できなかった。10,000pt なら 2名グループで1回、
--       もしくは同伴者と分担して数回参加できる）
--  2. プロフィールの充実（写真の複数枚・趣味・好きな食べ物 など）
--  3. 会に開催日（party_date）を持たせ、日付での絞り込みを可能にする
--  4. ブロック機能（blocks）
--  5. 友達紹介（招待コード）… 紹介した側・された側の双方にボーナス
--
--  何度実行しても同じ結果になる（冪等）。
--  適用方法は memory の aiseki-db-direct-connection を参照。
-- =====================================================================

-- ---------------------------------------------------------------------
--  0. 金額の定数（単一の出典）
-- ---------------------------------------------------------------------
-- 新規登録ボーナス。参加は1人あたり 3,800pt。
-- （2026-08-25 に 10,000pt から変更。supabase/migration_signup_bonus_5000.sql）
create or replace function public.signup_bonus()
returns int language sql immutable as $$ select 5000 $$;

-- 友達紹介ボーナス（紹介した人・された人の双方に付与）。
-- ちょうど参加1名分にあたる。
create or replace function public.referral_bonus()
returns int language sql immutable as $$ select 3800 $$;

grant execute on function public.signup_bonus() to anon, authenticated;
grant execute on function public.referral_bonus() to anon, authenticated;

-- ---------------------------------------------------------------------
--  1. プロフィールの追加項目
--     写真は avatar_url（メイン）＋ photos（サブ・最大5枚）で最大6枚。
--     いずれも「同じ会に参加が承認されたメンバー」にしか見えない
--     （profiles_select ポリシーは変更しない）。
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists photos          text[] not null default '{}';
alter table public.profiles add column if not exists hobbies         text[] not null default '{}';
alter table public.profiles add column if not exists favorite_food   text;
alter table public.profiles add column if not exists favorite_drink  text;
alter table public.profiles add column if not exists occupation      text;
alter table public.profiles add column if not exists home_area       text;
alter table public.profiles add column if not exists referral_code   text;
alter table public.profiles add column if not exists referred_by     uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists referred_at     timestamptz;

-- 上限（画面を迂回して API を直接叩かれても保存されない）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_photos_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_photos_len
      check (coalesce(array_length(photos, 1), 0) <= 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_hobbies_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_hobbies_len
      check (coalesce(array_length(hobbies, 1), 0) <= 8) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_text_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_text_len check (
      (favorite_food  is null or char_length(favorite_food)  <= 60) and
      (favorite_drink is null or char_length(favorite_drink) <= 60) and
      (occupation     is null or char_length(occupation)     <= 40) and
      (home_area      is null or char_length(home_area)      <= 40)
    ) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  2. 招待コード（友達紹介用）
--     8桁の英数字。紛らわしい文字（0/O, 1/I）は使わない。
-- ---------------------------------------------------------------------
create or replace function public.gen_referral_code()
returns text
language plpgsql
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
  i       int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- 既存ユーザーにも配る
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

create unique index if not exists profiles_referral_code_key on public.profiles(referral_code);

-- ---------------------------------------------------------------------
--  3. 新規登録トリガー … ボーナスを 10,000pt にし、招待コードも発行する
--     （年齢確認の扱いは今までどおり。20歳未満は登録自体を失敗させる）
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_birth date;
  v_age   int;
  v_bonus int := public.signup_bonus();
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

  insert into public.profiles (id, username, gender, age, birth_date, age_verified_at, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'gender',
    v_age,
    v_birth,
    now(),
    public.gen_referral_code()
  )
  on conflict (id) do nothing;

  insert into public.point_balances (user_id, balance)
  values (new.id, v_bonus)
  on conflict (user_id) do nothing;

  insert into public.points (user_id, amount, type, description)
  values (new.id, v_bonus, 'earn', '新規登録ボーナス')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  4. 友達紹介の適用
--     ・自分のコードは使えない
--     ・1人につき1回だけ（referred_by が埋まっていたら以後は不可）
--     ・紹介した側・された側の双方に referral_bonus() を付与する
--     ・登録から14日以内に限る（あとから遡って適用できないようにする）
-- ---------------------------------------------------------------------
create or replace function public.apply_referral_code(p_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_used    uuid;
  v_owner   uuid;
  v_name    text;
  v_bonus   int  := public.referral_bonus();
  v_created timestamptz;
begin
  if v_me is null then
    raise exception 'ログインが必要です';
  end if;
  if v_code = '' then
    raise exception '招待コードを入力してください';
  end if;

  select created_at, referred_by into v_created, v_used from public.profiles where id = v_me;
  if v_used is not null then
    raise exception 'すでに紹介コードを利用済みです';
  end if;
  if v_created < now() - interval '14 days' then
    raise exception '紹介コードは登録から14日以内にご利用ください';
  end if;

  select id, username into v_owner, v_name
    from public.profiles where referral_code = v_code;

  if v_owner is null then
    raise exception 'この招待コードは見つかりませんでした';
  end if;
  if v_owner = v_me then
    raise exception 'ご自身の招待コードは利用できません';
  end if;

  update public.profiles set referred_by = v_owner, referred_at = now() where id = v_me;

  -- 紹介された側
  insert into public.points (user_id, amount, type, description)
  values (v_me, v_bonus, 'earn', '友達紹介ボーナス（招待コードの利用）');
  insert into public.point_balances (user_id, balance) values (v_me, v_bonus)
    on conflict (user_id) do update set balance = point_balances.balance + v_bonus;

  -- 紹介した側
  insert into public.points (user_id, amount, type, description)
  values (v_owner, v_bonus, 'earn', '友達紹介ボーナス（お友達の登録）');
  insert into public.point_balances (user_id, balance) values (v_owner, v_bonus)
    on conflict (user_id) do update set balance = point_balances.balance + v_bonus;

  return jsonb_build_object('bonus', v_bonus, 'host_name', coalesce(v_name, 'メンバー'));
end;
$$;

revoke all on function public.apply_referral_code(text) from public, anon;
grant execute on function public.apply_referral_code(text) to authenticated;

-- 自分の紹介実績（何人招待できたか）。他人の情報は返さない。
create or replace function public.my_referral_stats()
returns jsonb
language sql
security definer set search_path = public
stable
as $$
  select jsonb_build_object(
    'code',   (select referral_code from public.profiles where id = auth.uid()),
    'count',  (select count(*) from public.profiles where referred_by = auth.uid()),
    'used',   (select referred_by is not null from public.profiles where id = auth.uid()),
    'bonus',  public.referral_bonus()
  );
$$;

revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated;

-- ---------------------------------------------------------------------
--  5. 会の開催日
--     旧データは null（＝日付未定）。絞り込みでは「すべて」にのみ出る。
-- ---------------------------------------------------------------------
alter table public.parties add column if not exists party_date date;
create index if not exists parties_date_idx on public.parties(party_date, status);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parties_date_sane' and conrelid = 'public.parties'::regclass) then
    -- 遠すぎる日付を弾く（誤入力・いたずら対策）
    alter table public.parties add constraint parties_date_sane
      check (party_date is null or party_date >= date '2026-01-01') not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  6. ブロック
--     ブロックすると、相手の会は一覧・詳細に出なくなり、
--     相手の会へ参加を申し込むこともできなくなる（逆方向も同じ）。
--     すでに同じ会に参加しているグループチャットは対象外
--     （途中で会話が消えると当日の待ち合わせに支障が出るため。
--       その場合は通報からの対応となる）。
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);

alter table public.blocks enable row level security;

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select using (auth.uid() = blocker_id);
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete using (auth.uid() = blocker_id);

grant select, insert, delete on public.blocks to authenticated;

-- どちらの向きでもブロックされているか。
-- RLS ポリシーの中から呼ぶため security definer にする
-- （呼び出しロールの権限で評価されると blocks の RLS が二重にかかる）。
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

-- RLS から呼ぶ関数は authenticated にも EXECUTE が要る
-- （権限が無いと、自分の行を引くだけでも 42501 で落ちる）
grant execute on function public.is_blocked(uuid, uuid) to anon, authenticated;

-- 会の一覧・詳細からブロック相手を外す
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties for select using (
  not public.is_blocked(auth.uid(), host_id)
);

-- 会のホストを引く。
-- ポリシーの中から parties を直接 select してはいけない:
-- 上の parties_select がブロック相手の会を隠すため、
-- 「見えない ＝ 該当なし ＝ ブロックされていない」と評価されてしまう。
-- RLS を通さずに host_id だけを返す関数にして、その穴を塞ぐ。
create or replace function public.party_host(p_party uuid)
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select host_id from public.parties where id = p_party;
$$;

grant execute on function public.party_host(uuid) to anon, authenticated;

-- ブロックした相手の会へは申し込めない
drop policy if exists join_insert on public.join_requests;
create policy join_insert on public.join_requests for insert with check (
  auth.uid() = user_id
  and not public.is_blocked(auth.uid(), public.party_host(join_requests.party_id))
);

-- 一覧に出す用（ブロックした相手の名前は本人にだけ見えれば足りる）
create or replace function public.my_blocks()
returns table (blocked_id uuid, username text, created_at timestamptz)
language sql
security definer set search_path = public
stable
as $$
  select b.blocked_id, p.username, b.created_at
    from public.blocks b
    left join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- ---------------------------------------------------------------------
--  7. 列単位の権限を追加項目にも広げる
--     birth_date / age_verified_at / referred_by は今までどおり遮断する
--     （年齢確認の根拠と、誰に紹介されたかは他人に見せない）。
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, avatar_url, gender, age, bio, created_at,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area)
  on public.profiles to anon, authenticated;

revoke update on public.profiles from anon, authenticated;
grant  update (username, avatar_url, gender, age, bio,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area)
  on public.profiles to authenticated;

revoke insert on public.profiles from anon, authenticated;
grant  insert (id, username, avatar_url, gender, age, bio,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area)
  on public.profiles to authenticated;

-- 招待コードは my_referral_stats() 経由でのみ返す（一覧で総当たりされないため）

-- ---------------------------------------------------------------------
--  8. 通報の対応状況を利用者に返せるようにする
--     inquiries.status は 'open' | 'in_review' | 'resolved' | 'closed'
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'inquiries') then
    alter table public.inquiries drop constraint if exists inquiries_status_check;
    alter table public.inquiries add constraint inquiries_status_check
      check (status in ('open', 'in_review', 'resolved', 'closed'));
  end if;
end $$;

-- ---------------------------------------------------------------------
--  適用結果
-- ---------------------------------------------------------------------
do $$
begin
  raise notice '新規登録ボーナス: %pt', public.signup_bonus();
  raise notice '友達紹介ボーナス: %pt', public.referral_bonus();
  raise notice '招待コード未発行のユーザー: %件',
    (select count(*) from public.profiles where referral_code is null);
end $$;
