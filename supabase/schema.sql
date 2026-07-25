-- =====================================================================
--  グループ飲み会マッチングアプリ  Supabase スキーマ
--  Supabase の SQL Editor に貼り付けてそのまま実行してください。
--  （再実行しても安全なように IF NOT EXISTS / DROP ... IF EXISTS を使用）
--
--  設計方針（インターネット異性紹介事業に該当しないための要件）
--   ・グループ限定      … ホスト側 2名以上 × 参加側 2名以上。1対1は成立しない。
--   ・1対1メッセージ禁止 … messages は会（グループ）単位のみ。個人間DMは存在しない。
--   ・個人情報の非公開   … 個人の名前・写真・年齢・性別は、同じ会に参加承認された
--                          相手にのみ公開（不特定多数には非公開）。
--   ・性別による制限なし … 同性グループ同士でも参加できる（性別条件を一切持たない）。
--
--  ※ 既存DBへの差分適用は supabase/migration_group_only.sql を使用してください。
-- =====================================================================

-- ---------------------------------------------------------------------
--  拡張
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =====================================================================
--  1. profiles  … ユーザープロフィール（auth.users と 1:1）
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text,
  avatar_url  text,
  gender      text,                       -- '男性' / '女性' / 'その他'
  age         int,
  bio         text,
  created_at  timestamptz not null default now()
);

-- =====================================================================
--  2. point_balances … ポイント残高（ユーザー 1:1）
-- =====================================================================
create table if not exists public.point_balances (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  balance  int not null default 0
);

-- =====================================================================
--  3. points … ポイント取引履歴
-- =====================================================================
create table if not exists public.points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      int  not null,              -- +購入/獲得, -消費
  type        text not null,              -- 'purchase' | 'earn' | 'convert' | 'spend'
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists points_user_idx on public.points(user_id, created_at desc);

-- =====================================================================
--  4. parties … 会（募集）
-- =====================================================================
create table if not exists public.parties (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  location         text,                   -- 店舗名
  area             text,                   -- エリア（渋谷 等）
  host_group_size  int  not null default 2, -- ホスト側グループの人数（2名以上）
  guest_group_size int  not null default 2, -- 募集するグループの人数（2名以上）
  host_name        text,                    -- ホストのニックネーム（公開してよい範囲のみ）
  max_members      int  not null default 4,
  current_members  int  not null default 2,
  party_time       text,                   -- 集合時間（'20:00' 等）
  treat_type       text not null default '割り勘',   -- '奢り' | '割り勘'
  point_request    int  not null default 0,          -- 1人あたり必要ポイント
  status           text not null default 'recruiting', -- 'recruiting' | 'matched' | 'completed'
  created_at       timestamptz not null default now()
);
create index if not exists parties_status_idx on public.parties(status, created_at desc);

-- 1対1マッチングを DB レベルで禁止する制約
alter table public.parties drop constraint if exists parties_group_only;
alter table public.parties add constraint parties_group_only check (
  host_group_size  >= 2
  and guest_group_size >= 2
  and max_members  >= host_group_size + guest_group_size
);

-- =====================================================================
--  5. party_members … 会の参加メンバー
-- =====================================================================
create table if not exists public.party_members (
  party_id  uuid not null references public.parties(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member',   -- 'host' | 'member'
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

-- =====================================================================
--  6. join_requests … 参加リクエスト（参加者 → ホストの会）
--     ・募集する側（ホスト）はポイント不要。
--     ・参加する側（参加者）が point_request を支払い、ホストが受け取る。
--     ・ポイント移動は承認時に accept_join_request() 関数内で実行。
-- =====================================================================
create table if not exists public.join_requests (
  id             uuid primary key default gen_random_uuid(),
  party_id       uuid not null references public.parties(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade, -- 申請グループの代表者
  group_size     int  not null default 2,  -- 参加するグループの人数（2名以上）
  applicant_name text,                     -- 代表者のニックネーム（承認前に公開されるのはここまで）
  status         text not null default 'pending',  -- 'pending' | 'accepted' | 'rejected'
  created_at     timestamptz not null default now()
);
alter table public.join_requests drop constraint if exists join_requests_group_only;
alter table public.join_requests add constraint join_requests_group_only check (group_size >= 2);
create index if not exists join_party_idx on public.join_requests(party_id);
create index if not exists join_user_idx  on public.join_requests(user_id);
-- 同じ会への重複リクエスト（保留中）を防止
create unique index if not exists join_requests_pending_unique
  on public.join_requests(party_id, user_id) where status = 'pending';

-- =====================================================================
--  7. messages … チャット
-- =====================================================================
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.parties(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_party_idx on public.messages(party_id, created_at);

-- =====================================================================
--  新規ユーザー登録時に profile / 残高を自動作成するトリガー
--  （初回登録ボーナスとして 1,000pt 付与）
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, gender, age)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'gender',
    nullif(new.raw_user_meta_data->>'age', '')::int
  )
  on conflict (id) do nothing;

  insert into public.point_balances (user_id, balance)
  values (new.id, 1000)
  on conflict (user_id) do nothing;

  insert into public.points (user_id, amount, type, description)
  values (new.id, 1000, 'earn', '新規登録ボーナス')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
--  会作成時にホストを party_members に登録するトリガー
-- =====================================================================
create or replace function public.handle_new_party()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.party_members (party_id, user_id, role)
  values (new.id, new.host_id, 'host')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_party_created on public.parties;
create trigger on_party_created
  after insert on public.parties
  for each row execute function public.handle_new_party();

-- =====================================================================
--  グループ限定の強制（BEFORE INSERT）
--  人数とニックネームはサーバ側で確定させ、クライアント値を信用しない。
-- =====================================================================
create or replace function public.enforce_group_party()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.host_group_size, 0) < 2 then
    raise exception 'ホスト側は2名以上のグループでのみ会を作成できます';
  end if;
  if coalesce(new.guest_group_size, 0) < 2 then
    raise exception '募集は2名以上のグループ単位でのみ行えます';
  end if;

  new.max_members     := new.host_group_size + new.guest_group_size;
  new.current_members := new.host_group_size;
  new.host_name       := coalesce(
    (select username from public.profiles where id = new.host_id), 'ホスト'
  );
  return new;
end;
$$;

drop trigger if exists on_party_group_check on public.parties;
create trigger on_party_group_check
  before insert on public.parties
  for each row execute function public.enforce_group_party();

create or replace function public.enforce_group_join()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_party public.parties;
begin
  if coalesce(new.group_size, 0) < 2 then
    raise exception '参加は2名以上のグループ単位でのみ行えます';
  end if;

  select * into v_party from public.parties where id = new.party_id;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.current_members + new.group_size > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

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
--  RLS 用ヘルパー（security definer で再帰を回避）
-- =====================================================================
create or replace function public.is_party_member(p_party uuid, p_user uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.party_members
    where party_id = p_party and user_id = p_user
  );
$$;

-- 2人が同じ会に参加しているか（＝プロフィール公開可否の判定）
create or replace function public.shares_party(p_a uuid, p_b uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1
      from public.party_members m1
      join public.party_members m2 on m1.party_id = m2.party_id
     where m1.user_id = p_a and m2.user_id = p_b
  );
$$;

-- =====================================================================
--  ポイント関連 RPC（すべて security definer で残高を安全に更新）
--  ※ point_balances は本人以外の残高を更新できないため、
--    参加者→ホストのポイント移動は必ずこの関数を経由する。
-- =====================================================================

-- 購入：自分の残高に加算
create or replace function public.purchase_points(p_amount int, p_description text default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_balance int;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '金額が不正です'; end if;

  insert into public.point_balances (user_id, balance)
  values (auth.uid(), p_amount)
  on conflict (user_id) do update
    set balance = public.point_balances.balance + p_amount
  returning balance into v_balance;

  insert into public.points (user_id, amount, type, description)
  values (auth.uid(), p_amount, 'purchase', p_description);

  return v_balance;
end;
$$;

-- 変換：自分の残高を減算（オリパpt変換など）
create or replace function public.convert_points(p_amount int, p_description text default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_balance int;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '金額が不正です'; end if;

  select balance into v_balance from public.point_balances where user_id = auth.uid() for update;
  if coalesce(v_balance, 0) < p_amount then raise exception 'ポイントが不足しています'; end if;

  update public.point_balances set balance = balance - p_amount
  where user_id = auth.uid()
  returning balance into v_balance;

  insert into public.points (user_id, amount, type, description)
  values (auth.uid(), -p_amount, 'convert', p_description);

  return v_balance;
end;
$$;

-- 参加リクエスト承認：参加者が支払い → ホストが受け取る
create or replace function public.accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req   public.join_requests;
  v_party public.parties;
  v_bal   int;
  v_cost  int;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  if v_req.status <> 'pending' then raise exception '既に処理済みのリクエストです'; end if;

  select * into v_party from public.parties where id = v_req.party_id for update;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id <> auth.uid() then raise exception 'この会のホストのみ承認できます'; end if;
  if v_req.group_size < 2 then raise exception 'グループ単位の参加のみ承認できます'; end if;
  if v_party.current_members + v_req.group_size > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- 参加グループの残高チェック（1人あたり point_request × 人数）
  v_cost := v_party.point_request * v_req.group_size;
  select balance into v_bal from public.point_balances where user_id = v_req.user_id for update;
  if coalesce(v_bal, 0) < v_cost then
    raise exception '参加者のポイントが不足しています';
  end if;

  -- 参加グループが支払う（募集側＝ホストは無料）
  if v_cost > 0 then
    update public.point_balances set balance = balance - v_cost
    where user_id = v_req.user_id;
    insert into public.points (user_id, amount, type, description)
    values (v_req.user_id, -v_cost, 'spend', 'グループ参加: ' || v_party.title);

    -- ホストが受け取る
    insert into public.point_balances (user_id, balance)
    values (v_party.host_id, v_cost)
    on conflict (user_id) do update
      set balance = public.point_balances.balance + v_cost;
    insert into public.points (user_id, amount, type, description)
    values (v_party.host_id, v_cost, 'earn', 'グループ受入: ' || v_party.title);
  end if;

  -- 参加グループの代表者をメンバーに追加
  insert into public.party_members (party_id, user_id, role)
  values (v_req.party_id, v_req.user_id, 'member')
  on conflict do nothing;

  update public.parties
  set current_members = current_members + v_req.group_size,
      status = case when current_members + v_req.group_size >= max_members
                    then 'matched' else status end
  where id = v_req.party_id;

  update public.join_requests set status = 'accepted' where id = p_request_id;
end;
$$;

-- 参加リクエスト拒否（ホストのみ）
create or replace function public.reject_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req   public.join_requests;
  v_party public.parties;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  select * into v_req from public.join_requests where id = p_request_id;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  select * into v_party from public.parties where id = v_req.party_id;
  if v_party.host_id <> auth.uid() then raise exception 'この会のホストのみ操作できます'; end if;
  update public.join_requests set status = 'rejected'
  where id = p_request_id and status = 'pending';
end;
$$;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.point_balances enable row level security;
alter table public.points         enable row level security;
alter table public.parties        enable row level security;
alter table public.party_members  enable row level security;
alter table public.join_requests  enable row level security;
alter table public.messages       enable row level security;

-- profiles: 本人 / 同じ会に参加承認された相手のみ閲覧可（不特定多数には非公開）
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.shares_party(auth.uid(), id)
);
drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id);

-- point_balances: 本人のみ閲覧
drop policy if exists balances_select on public.point_balances;
create policy balances_select on public.point_balances for select using (auth.uid() = user_id);

-- points: 本人のみ閲覧・追加
drop policy if exists points_select on public.points;
create policy points_select on public.points for select using (auth.uid() = user_id);
drop policy if exists points_insert on public.points;
create policy points_insert on public.points for insert with check (auth.uid() = user_id);

-- parties: 会の情報（場所・時間・人数・ポイント・ホストのニックネーム）は公開。
--          個人を特定する情報は parties に保持しない。作成は本人がホスト、更新/削除はホストのみ。
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties for select using (true);
drop policy if exists parties_insert on public.parties;
create policy parties_insert on public.parties for insert with check (auth.uid() = host_id);
drop policy if exists parties_update on public.parties;
create policy parties_update on public.parties for update using (auth.uid() = host_id);
drop policy if exists parties_delete on public.parties;
create policy parties_delete on public.parties for delete using (auth.uid() = host_id);

-- party_members: 参加が承認されたメンバーのみ、その会のメンバー一覧を閲覧可
drop policy if exists members_select on public.party_members;
create policy members_select on public.party_members for select using (
  public.is_party_member(party_id, auth.uid())
);
drop policy if exists members_insert on public.party_members;
create policy members_insert on public.party_members for insert with check (auth.uid() = user_id);
drop policy if exists members_delete on public.party_members;
create policy members_delete on public.party_members for delete using (auth.uid() = user_id);

-- join_requests: 参加者本人と、対象の会のホストが閲覧可
drop policy if exists join_select on public.join_requests;
create policy join_select on public.join_requests for select using (
  user_id = auth.uid()
  or exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
);
-- 送信は本人のリクエストのみ。自分がホストの会には参加リクエスト不可。
drop policy if exists join_insert on public.join_requests;
create policy join_insert on public.join_requests for insert with check (
  user_id = auth.uid()
  and not exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
);
-- 承認/拒否は accept_join_request() / reject_join_request()（security definer）経由で行う。

-- messages: グループチャット限定。個人間DMは存在しない。
--           参加が承認されたメンバーのみ、その会のチャットを閲覧・投稿できる。
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  public.is_party_member(party_id, auth.uid())
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  auth.uid() = user_id and public.is_party_member(party_id, auth.uid())
);

-- =====================================================================
--  Realtime（チャット用）
-- =====================================================================
alter publication supabase_realtime add table public.messages;
