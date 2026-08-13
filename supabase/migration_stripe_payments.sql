-- =====================================================================
--  マイグレーション: Stripe によるポイント購入
--
--  ねらい
--   1. ポイントが増える経路を「支払いが確認できた場合」だけに限定する。
--      これまで purchase_points() は認証済みユーザーなら誰でも呼べたため、
--      ブラウザから直接呼び出せばポイントを無限に増やせてしまった。
--      → purchase_points() は service_role 専用にし、
--        アプリからは呼べないようにする。
--   2. Stripe の Webhook は同じイベントを再送することがあるため、
--      Checkout セッションIDを一意キーにして二重付与を防ぐ。
--
--  適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行。
--            （再実行しても安全）
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  1. point_purchases … 決済の記録（冪等キー）
--     行が入るのは Webhook（service_role）経由のときだけ。
-- ---------------------------------------------------------------------
create table if not exists public.point_purchases (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  stripe_session_id     text not null unique,   -- 冪等キー（同じ決済では二度付与しない）
  stripe_payment_intent text,
  pack_id               text not null default 'unknown',
  points                int  not null check (points > 0),
  amount_jpy            int  not null default 0 check (amount_jpy >= 0),
  created_at            timestamptz not null default now()
);
create index if not exists point_purchases_user_idx
  on public.point_purchases(user_id, created_at desc);

alter table public.point_purchases enable row level security;

-- 本人だけが自分の購入履歴を見られる。
-- insert / update / delete のポリシーは作らない
-- （RLS を迂回できる service_role = Webhook だけが書き込める）。
drop policy if exists point_purchases_select on public.point_purchases;
create policy point_purchases_select on public.point_purchases
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
--  2. purchase_points … service_role 専用に作り直す
--     旧: purchase_points(int, text)  … auth.uid() の残高に自分で加算できた
--     新: purchase_points(uuid, int, text) … 対象ユーザーを引数で受け取る
-- ---------------------------------------------------------------------
drop function if exists public.purchase_points(int, text);

create or replace function public.purchase_points(
  p_user        uuid,
  p_amount      int,
  p_description text default null
)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_balance int;
begin
  if p_user is null then raise exception 'ユーザーが指定されていません'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'ポイント数が不正です'; end if;

  insert into public.point_balances (user_id, balance)
  values (p_user, p_amount)
  on conflict (user_id) do update
    set balance = public.point_balances.balance + p_amount
  returning balance into v_balance;

  insert into public.points (user_id, amount, type, description)
  values (p_user, p_amount, 'purchase', p_description);

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------
--  3. grant_purchased_points … Stripe の支払い完了で呼ばれる唯一の入口
--     同じ stripe_session_id では二度目以降は何もしない（冪等）。
--     戻り値: { "granted": true/false, "balance": 残高 }
-- ---------------------------------------------------------------------
create or replace function public.grant_purchased_points(
  p_user           uuid,
  p_points         int,
  p_session        text,
  p_pack           text default null,
  p_amount_jpy     int  default 0,
  p_payment_intent text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_balance int;
  v_new     boolean;
begin
  if p_user is null then raise exception 'ユーザーが指定されていません'; end if;
  if p_points is null or p_points <= 0 then raise exception 'ポイント数が不正です'; end if;
  if p_session is null or btrim(p_session) = '' then raise exception '決済セッションIDが必要です'; end if;

  insert into public.point_purchases
    (user_id, stripe_session_id, stripe_payment_intent, pack_id, points, amount_jpy)
  values
    (p_user, p_session, p_payment_intent, coalesce(p_pack, 'unknown'), p_points, coalesce(p_amount_jpy, 0))
  on conflict (stripe_session_id) do nothing
  returning true into v_new;

  -- 既に同じ決済で付与済み（Webhook の再送）
  if not found then
    select coalesce(balance, 0) into v_balance
    from public.point_balances where user_id = p_user;
    return jsonb_build_object('granted', false, 'balance', coalesce(v_balance, 0));
  end if;

  v_balance := public.purchase_points(
    p_user,
    p_points,
    'ポイント購入（¥' || coalesce(p_amount_jpy, 0)::text || '）'
  );

  return jsonb_build_object('granted', true, 'balance', v_balance);
end;
$$;

-- ---------------------------------------------------------------------
--  4. 権限
--     ポイントを増やせる関数は、アプリ（anon / authenticated）から
--     一切呼べないようにする。呼べるのはサーバ側の service_role のみ。
-- ---------------------------------------------------------------------
revoke all on function public.purchase_points(uuid, int, text)
  from public, anon, authenticated;
grant execute on function public.purchase_points(uuid, int, text) to service_role;

revoke all on function public.grant_purchased_points(uuid, int, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.grant_purchased_points(uuid, int, text, text, int, text)
  to service_role;

-- point_purchases はアプリから書き換えられないようにする（閲覧のみ）。
revoke insert, update, delete on public.point_purchases from anon, authenticated;
grant select on public.point_purchases to authenticated;

-- 変換（減算）は従来どおり本人が呼べる。
grant execute on function public.convert_points(int, text) to authenticated;
