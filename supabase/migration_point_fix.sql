-- =====================================================================
--  マイグレーション: ポイント仕様の修正
--  「参加する側が支払い、募集する側（ホスト）は無料でポイントを受け取る」
--
--  適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行。
--  既存DBに対して安全に追加実行できます（再実行も可）。
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  1. join_requests … 参加リクエスト（参加者 → ホストの会）
-- ---------------------------------------------------------------------
create table if not exists public.join_requests (
  id          uuid primary key default gen_random_uuid(),
  party_id    uuid not null references public.parties(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending',  -- 'pending' | 'accepted' | 'rejected'
  created_at  timestamptz not null default now()
);
create index if not exists join_party_idx on public.join_requests(party_id);
create index if not exists join_user_idx  on public.join_requests(user_id);
create unique index if not exists join_requests_pending_unique
  on public.join_requests(party_id, user_id) where status = 'pending';

alter table public.join_requests enable row level security;

drop policy if exists join_select on public.join_requests;
create policy join_select on public.join_requests for select using (
  user_id = auth.uid()
  or exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
);
drop policy if exists join_insert on public.join_requests;
create policy join_insert on public.join_requests for insert with check (
  user_id = auth.uid()
  and not exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
);

-- ---------------------------------------------------------------------
--  2. ポイント RPC（security definer）
-- ---------------------------------------------------------------------

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

-- 変換：自分の残高を減算
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
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  if v_req.status <> 'pending' then raise exception '既に処理済みのリクエストです'; end if;

  select * into v_party from public.parties where id = v_req.party_id for update;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id <> auth.uid() then raise exception 'この会のホストのみ承認できます'; end if;
  if v_party.current_members >= v_party.max_members then raise exception '定員に達しています'; end if;

  select balance into v_bal from public.point_balances where user_id = v_req.user_id for update;
  if coalesce(v_bal, 0) < v_party.point_request then
    raise exception '参加者のポイントが不足しています';
  end if;

  if v_party.point_request > 0 then
    -- 参加者が支払う（募集側＝ホストは無料）
    update public.point_balances set balance = balance - v_party.point_request
    where user_id = v_req.user_id;
    insert into public.points (user_id, amount, type, description)
    values (v_req.user_id, -v_party.point_request, 'spend', '相席参加: ' || v_party.title);

    -- ホストが受け取る
    insert into public.point_balances (user_id, balance)
    values (v_party.host_id, v_party.point_request)
    on conflict (user_id) do update
      set balance = public.point_balances.balance + v_party.point_request;
    insert into public.points (user_id, amount, type, description)
    values (v_party.host_id, v_party.point_request, 'earn', '相席報酬: ' || v_party.title);
  end if;

  insert into public.party_members (party_id, user_id, role)
  values (v_req.party_id, v_req.user_id, 'member')
  on conflict do nothing;

  update public.parties
  set current_members = current_members + 1,
      status = case when current_members + 1 >= max_members then 'matched' else status end
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
