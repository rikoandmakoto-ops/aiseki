-- =====================================================================
--  マイグレーション: 参加ポイントの一律化（1人あたり 3,800pt）と
--                    「ホストは必ずおごられる」構造への変更
--
--  変更点
--   1. 参加ポイントは会ごとの設定をやめ、1人あたり 3,800pt の一律とする。
--      ホストは金額を選べない（スライド／入力欄は画面からも削除）。
--   2. 会の募集（ホスト）は引き続き無料。ポイントは参加側だけが支払う。
--   3. 支払われたポイントは全額が運営（当社）の収益になる。
--      ホストへのポイント移転（報酬）は廃止する。
--   4. そのかわり、ホストグループの当日の飲食代は参加グループが負担する
--      （＝ホストは必ずおごられる）。treat_type は「ゲストのおごり」に固定する。
--
--  適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行。
--            （何度実行しても安全）
--
--  ※ 既存の仕様（グループ限定・個室禁止・20歳以上限定・DM無し）は変更しない。
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  1. サービス共通の定数
--     金額と区分の唯一の出典。画面側（src/lib/api.js）の
--     JOIN_FEE_PER_PERSON / TREAT_TYPE_GUEST_TREATS と一致させること。
-- ---------------------------------------------------------------------

-- 参加ポイント（1人あたり・全ての会で一律）
create or replace function public.join_fee_per_person()
returns int language sql immutable set search_path = public as $$ select 3800 $$;

-- お会計の区分。ホストは必ずおごられるため、これ以外は保存できない。
create or replace function public.allowed_treat_type()
returns text language sql immutable set search_path = public as $$ select 'ゲストのおごり'::text $$;

-- 制約・トリガーの中から呼ばれるので、実行権限は落とさない（既定のまま公開）。

-- ---------------------------------------------------------------------
--  2. platform_revenues … 運営の収益台帳
--     参加が承認されるたび、支払われたポイントの全額をここに記録する。
--     （ホストの残高には一切入らない）
--     書き込むのは accept_join_request()（security definer）だけ。
--     利用者には見せない（RLS を有効にしてポリシーを作らない）。
-- ---------------------------------------------------------------------
create table if not exists public.platform_revenues (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid references public.parties(id)       on delete set null,
  join_request_id uuid references public.join_requests(id) on delete set null,
  payer_id        uuid references public.profiles(id)      on delete set null,
  group_size      int  not null check (group_size    > 0),
  fee_per_person  int  not null check (fee_per_person >= 0),
  points          int  not null check (points        >= 0),  -- 運営に入る合計
  created_at      timestamptz not null default now()
);
create index if not exists platform_revenues_created_idx
  on public.platform_revenues(created_at desc);
create index if not exists platform_revenues_party_idx
  on public.platform_revenues(party_id);

alter table public.platform_revenues enable row level security;
-- ポリシーは作らない ＝ RLS を迂回できる service_role だけが読み書きできる。
drop policy if exists platform_revenues_select on public.platform_revenues;
revoke all on public.platform_revenues from anon, authenticated;

-- ---------------------------------------------------------------------
--  3. 既存データの補正（制約を付ける前に実施）
-- ---------------------------------------------------------------------
update public.parties
   set point_request = public.join_fee_per_person()
 where point_request is distinct from public.join_fee_per_person();

update public.parties
   set treat_type = public.allowed_treat_type()
 where treat_type is distinct from public.allowed_treat_type();

-- ---------------------------------------------------------------------
--  4. 制約 … 画面を迂回して直接 API を叩かれても値を変えられないようにする
-- ---------------------------------------------------------------------
alter table public.parties drop constraint if exists parties_fixed_fee;
alter table public.parties add constraint parties_fixed_fee
  check (point_request = public.join_fee_per_person());

alter table public.parties drop constraint if exists parties_treat_type_check;
alter table public.parties add constraint parties_treat_type_check
  check (treat_type = public.allowed_treat_type());

-- ---------------------------------------------------------------------
--  5. 会の作成時 … 参加ポイントとお会計の区分をサーバ側で確定させる
--     （enforce_group_party を、金額を固定する形に作り直す）
-- ---------------------------------------------------------------------
create or replace function public.enforce_group_party()
returns trigger
language plpgsql security definer set search_path = public
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

  -- 参加ポイントは全ての会で一律。ホストは金額を決められない。
  new.point_request := public.join_fee_per_person();
  -- ホストは必ずおごられる（当日の飲食代は参加グループが負担する）。
  new.treat_type    := public.allowed_treat_type();

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

-- 会の更新時も、参加ポイントとお会計の区分は書き換えさせない。
create or replace function public.enforce_party_fee_on_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.point_request := public.join_fee_per_person();
  new.treat_type    := public.allowed_treat_type();
  return new;
end;
$$;

drop trigger if exists on_party_fee_lock on public.parties;
create trigger on_party_fee_lock
  before update on public.parties
  for each row execute function public.enforce_party_fee_on_update();

-- ---------------------------------------------------------------------
--  6. 参加リクエストの承認
--     ・参加グループが 3,800pt × 人数 を支払う
--     ・支払われたポイントは全額が運営の収益になる（ホストは受け取らない）
--     ・ホストは当日の飲食代を参加グループに負担してもらう
-- ---------------------------------------------------------------------
create or replace function public.accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req   public.join_requests;
  v_party public.parties;
  v_bal   int;
  v_fee   int;
  v_cost  int;
  v_seats int;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  if v_req.status <> 'pending' then raise exception '既に処理済みのリクエストです'; end if;

  select * into v_party from public.parties where id = v_req.party_id for update;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id <> auth.uid() then raise exception 'この会のホストのみ承認できます'; end if;
  if v_req.group_size < 2 then raise exception 'グループ単位の参加のみ承認できます'; end if;
  if public.is_party_member(v_req.party_id, v_req.user_id) then
    raise exception 'この方は既にこの会に参加しています';
  end if;

  -- 空き枠は「宣言された人数」ではなく実際の席数で判定する
  select count(*) into v_seats from public.party_members where party_id = v_req.party_id;
  if v_seats + v_req.group_size > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- 参加グループの残高チェック（一律 3,800pt × 人数）
  v_fee  := public.join_fee_per_person();
  v_cost := v_fee * v_req.group_size;
  select balance into v_bal from public.point_balances where user_id = v_req.user_id for update;
  if coalesce(v_bal, 0) < v_cost then
    raise exception '参加者のポイントが不足しています';
  end if;

  if v_cost > 0 then
    -- 参加グループが支払う（募集側＝ホストは無料）
    update public.point_balances set balance = balance - v_cost
    where user_id = v_req.user_id;
    insert into public.points (user_id, amount, type, description)
    values (v_req.user_id, -v_cost, 'spend', 'グループ参加: ' || v_party.title);

    -- 支払われたポイントは全額が運営の収益。ホストの残高には入れない。
    -- （ホストへの報酬は無し。ホストは当日の飲食代をゲストに負担してもらう）
    insert into public.platform_revenues
      (party_id, join_request_id, payer_id, group_size, fee_per_person, points)
    values
      (v_party.id, v_req.id, v_req.user_id, v_req.group_size, v_fee, v_cost);
  end if;

  -- 参加グループの席を人数分作る（current_members はトリガーが同期する）
  perform public.create_group_seats(
    v_req.party_id, v_req.user_id, 'guest', v_req.group_size, v_req.member_names
  );

  update public.join_requests set status = 'accepted' where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------
--  7. 過去に「相席報酬 / グループ受入」としてホストへ渡ったポイントの扱い
--     既に付与済みの残高は、利用者の不利益になるため回収しない。
--     以後は上記のとおり一切付与されない。
-- ---------------------------------------------------------------------
do $$
declare v_n bigint;
begin
  select count(*) into v_n from public.points where type = 'earn'
     and (description like '相席報酬%' or description like 'グループ受入%');
  if v_n > 0 then
    raise notice 'ホストへの旧報酬の履歴が % 件あります（残高はそのまま維持します）', v_n;
  end if;
end $$;
