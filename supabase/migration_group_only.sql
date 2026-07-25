-- =====================================================================
--  マイグレーション: 「インターネット異性紹介事業」非該当化
--
--  方針
--   (1) グループ限定  … ホスト側 2名以上 × 参加側 2名以上。1対1は DB レベルで不可。
--   (2) 1対1メッセージ禁止 … messages は会（グループ）単位のみ。参加メンバー以外は閲覧不可。
--   (3) 個人プロフィール非公開 … 会の情報は公開、個人（名前・写真・年齢・性別）は
--                                 同じ会に参加承認された相手にのみ公開。
--   (4) 性別による制限なし … 同性グループ同士の参加も可（性別条件は一切持たない）。
--
--  適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行。
--  既存DBに対して安全に追加実行できます（再実行も可）。
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  1. parties … グループ人数カラムを追加
--     host_group_size  … ホスト側グループの人数（2名以上）
--     guest_group_size … 募集するグループの人数（2名以上）
--     host_name        … ホストのニックネームのスナップショット
--                        （一覧で profiles を join しないため。ニックネームのみ公開）
-- ---------------------------------------------------------------------
alter table public.parties add column if not exists host_group_size  int not null default 2;
alter table public.parties add column if not exists guest_group_size int not null default 2;
alter table public.parties add column if not exists host_name        text;

-- 既存データの補正（制約を付ける前に実施）
update public.parties set host_group_size  = greatest(coalesce(host_group_size, 2), 2);
update public.parties set guest_group_size = greatest(coalesce(guest_group_size, 2), 2);
update public.parties set max_members      = host_group_size + guest_group_size
  where max_members is distinct from host_group_size + guest_group_size;
update public.parties set current_members  = greatest(coalesce(current_members, 0), host_group_size)
  where current_members < host_group_size;
update public.parties p
   set host_name = coalesce(pr.username, 'ホスト')
  from public.profiles pr
 where pr.id = p.host_id and p.host_name is null;
update public.parties set host_name = 'ホスト' where host_name is null;

-- 1対1マッチングを DB レベルで禁止する制約
alter table public.parties drop constraint if exists parties_group_only;
alter table public.parties add constraint parties_group_only check (
  host_group_size  >= 2
  and guest_group_size >= 2
  and max_members  >= host_group_size + guest_group_size
);

-- ---------------------------------------------------------------------
--  2. join_requests … グループ単位の参加リクエストに変更
--     group_size     … 参加するグループの人数（2名以上）
--     applicant_name … 申請者のニックネームのスナップショット
--                      （承認前にホストが profiles を参照できないようにするため）
-- ---------------------------------------------------------------------
alter table public.join_requests add column if not exists group_size     int not null default 2;
alter table public.join_requests add column if not exists applicant_name text;

update public.join_requests set group_size = greatest(coalesce(group_size, 2), 2);

alter table public.join_requests drop constraint if exists join_requests_group_only;
alter table public.join_requests add constraint join_requests_group_only check (group_size >= 2);

-- ---------------------------------------------------------------------
--  3. RLS 用ヘルパー（security definer で再帰を回避）
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  4. 会作成時のグループ強制（BEFORE INSERT）
--     人数・ニックネームはサーバ側で確定させ、クライアント値を信用しない。
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  5. 参加リクエスト時のグループ強制（BEFORE INSERT）
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  6. 承認 RPC … グループ人数分のポイント移動 / 人数加算
-- ---------------------------------------------------------------------
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

  v_cost := v_party.point_request * v_req.group_size;

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

    -- ホストが受け取る
    insert into public.point_balances (user_id, balance)
    values (v_party.host_id, v_cost)
    on conflict (user_id) do update
      set balance = public.point_balances.balance + v_cost;
    insert into public.points (user_id, amount, type, description)
    values (v_party.host_id, v_cost, 'earn', 'グループ受入: ' || v_party.title);
  end if;

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

-- ---------------------------------------------------------------------
--  7. RLS の締め直し
-- ---------------------------------------------------------------------

-- profiles: 本人 / 同じ会に参加承認された相手のみ閲覧可（不特定多数には非公開）
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.shares_party(auth.uid(), id)
);

-- party_members: 参加が承認されたメンバーのみ、その会のメンバー一覧を閲覧可
drop policy if exists members_select on public.party_members;
create policy members_select on public.party_members for select using (
  public.is_party_member(party_id, auth.uid())
);

-- messages: グループチャット限定。参加メンバーのみ閲覧・投稿可。
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  public.is_party_member(party_id, auth.uid())
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  auth.uid() = user_id and public.is_party_member(party_id, auth.uid())
);

-- parties: 会の情報（場所・時間・人数・ポイント・ホストのニックネーム）は公開のまま。
--          個人を特定する情報は parties に保持しない。
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties for select using (true);
