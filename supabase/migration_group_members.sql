-- =====================================================================
--  マイグレーション: グループメンバー登録ロジックの修正
--
--  【これまでの問題】
--   ・会を作ると current_members = ホスト側人数（例:3）になるのに、
--     party_members にはホスト1人しか登録されていなかった。
--   ・参加が承認されると current_members += グループ人数 になるのに、
--     party_members には代表者1人しか登録されていなかった。
--     → 同伴者は DB 上に存在せず、グループチャットにも入れない。
--   ・承認済みの人が再申請でき、人数・ポイントが二重に加算された。
--   ・party_members.user_id / messages.user_id の外部キーが auth.users を
--     指していたため、PostgREST が profiles の埋め込みを解決できなかった。
--
--  【この修正の方針】
--   party_members を「席（seat）」テーブルにし、人数の唯一の真実にする。
--    ・グループの人数分だけ必ず席の行を作る（代表者 + 同伴者）。
--    ・同伴者の席は user_id = null（アプリ未登録）で作られ、
--      招待コードで本人のアカウントに引き受けられる（claim_seat）。
--    ・parties.current_members は席数からトリガーで自動同期する。
--
--  【設計方針は維持】（インターネット異性紹介事業に該当しないための要件）
--    ・グループ限定（2名以上 × 2名以上）／1対1は不可
--    ・個人間DMなし（チャットは会単位のみ）
--    ・個人プロフィールは同じ会の承認済みメンバーにのみ公開
--    ・性別による制限を一切持たない
--
--  適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて実行。
--  何度実行しても安全です（冪等）。
--  ※ 先に migration_group_only.sql が適用済みであることを前提とします。
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
--  1. 列の追加
-- ---------------------------------------------------------------------

-- parties: 会の作成時に、ホスト側同伴者の表示名を受け取る
alter table public.parties
  add column if not exists host_member_names text[] not null default '{}';

-- join_requests: 参加申込時に、同伴者の表示名を受け取る
alter table public.join_requests
  add column if not exists member_names text[] not null default '{}';

-- party_members: 席（seat）としての属性
--   id             … 席の識別子（未登録席は user_id が null のため主キーに使えない）
--   group_owner_id … その席が属するグループの代表者
--   side           … 'host'（募集した側） | 'guest'（参加した側）
--   display_name   … 席の表示名（代表者はニックネームのスナップショット）
--   invite_code    … 未登録席を本人が引き受けるための招待コード
alter table public.party_members add column if not exists id             uuid not null default gen_random_uuid();
alter table public.party_members add column if not exists group_owner_id uuid;
alter table public.party_members add column if not exists side           text not null default 'guest';
alter table public.party_members add column if not exists display_name   text;
alter table public.party_members add column if not exists invite_code    text;

-- ---------------------------------------------------------------------
--  2. 主キーを (party_id, user_id) から id に付け替える
--     （未登録席は user_id が null になるため）
-- ---------------------------------------------------------------------
do $$
declare
  v_con  text;
  v_cols text;
begin
  select c.conname,
         (select string_agg(a.attname, ',' order by a.attnum)
            from unnest(c.conkey) k
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
    into v_con, v_cols
    from pg_constraint c
   where c.conrelid = 'public.party_members'::regclass
     and c.contype = 'p';

  if v_con is not null and v_cols is distinct from 'id' then
    execute format('alter table public.party_members drop constraint %I', v_con);
  end if;
end $$;

alter table public.party_members alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.party_members'::regclass and contype = 'p'
  ) then
    alter table public.party_members add primary key (id);
  end if;
end $$;

-- 同じ会に同じユーザーが二重に座らないようにする（未登録席は対象外）
create unique index if not exists party_members_party_user_unique
  on public.party_members(party_id, user_id) where user_id is not null;

create unique index if not exists party_members_invite_code_unique
  on public.party_members(invite_code) where invite_code is not null;

create index if not exists party_members_party_idx on public.party_members(party_id);
create index if not exists party_members_user_idx  on public.party_members(user_id);

alter table public.party_members drop constraint if exists party_members_side_check;
alter table public.party_members add constraint party_members_side_check
  check (side in ('host', 'guest'));

-- ---------------------------------------------------------------------
--  3. 外部キーを profiles に付け替える
--     PostgREST は FK からリレーションを推論するため、profiles を
--     埋め込んで取得する（メンバー一覧・チャットの表示名）には
--     profiles への FK が必要。profiles.id 自体が auth.users を参照している。
-- ---------------------------------------------------------------------
-- 外部キーを張る前に、profiles が無いユーザーの行を補完しておく
insert into public.profiles (id, username, age)
select u.id,
       coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
       nullif(u.raw_user_meta_data->>'age', '')::int
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);

alter table public.party_members drop constraint if exists party_members_user_id_fkey;
alter table public.party_members
  add constraint party_members_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.messages drop constraint if exists messages_user_id_fkey;
alter table public.messages
  add constraint messages_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ---------------------------------------------------------------------
--  4. 共通関数
-- ---------------------------------------------------------------------

-- 招待コード（8桁・重複しないもの）
create or replace function public.gen_invite_code()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (
      select 1 from public.party_members where invite_code = v_code
    );
    v_try := v_try + 1;
    if v_try > 20 then raise exception '招待コードの生成に失敗しました'; end if;
  end loop;
  return v_code;
end $$;

-- 同伴者名の正規化（代表者を除く size-1 件に揃える。空欄は既定名で埋める）
create or replace function public.normalize_member_names(p_names text[], p_size int)
returns text[]
language plpgsql immutable set search_path = public
as $$
declare
  v_out text[] := '{}';
  v     text;
  i     int;
begin
  for i in 1..greatest(coalesce(p_size, 0) - 1, 0) loop
    v := nullif(btrim(coalesce(p_names[i], '')), '');
    v_out := v_out || coalesce(left(v, 20), 'メンバー' || (i + 1));
  end loop;
  return v_out;
end $$;

-- グループ人数分の席をまとめて作る（代表者 1席 + 同伴者 size-1席）
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
end $$;

-- 席数を parties.current_members に同期する（席の増減で自動実行）
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
                    when status = 'completed' then status
                    when v_count >= max_members then 'matched'
                    else 'recruiting'
                  end
   where id = v_party;

  return null;
end $$;

drop trigger if exists on_party_members_change on public.party_members;
create trigger on_party_members_change
  after insert or delete on public.party_members
  for each row execute function public.sync_party_member_count();

-- ---------------------------------------------------------------------
--  5. 会の作成 … ホスト側グループの席を人数分作る
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

  new.max_members       := new.host_group_size + new.guest_group_size;
  new.current_members   := new.host_group_size;  -- 席作成後にトリガーが再計算する
  new.host_member_names := public.normalize_member_names(new.host_member_names, new.host_group_size);
  new.host_name         := coalesce(
    (select username from public.profiles where id = new.host_id), 'ホスト'
  );
  return new;
end $$;

drop trigger if exists on_party_group_check on public.parties;
create trigger on_party_group_check
  before insert on public.parties
  for each row execute function public.enforce_group_party();

create or replace function public.handle_new_party()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.create_group_seats(
    new.id, new.host_id, 'host', new.host_group_size, new.host_member_names
  );
  return new;
end $$;

drop trigger if exists on_party_created on public.parties;
create trigger on_party_created
  after insert on public.parties
  for each row execute function public.handle_new_party();

-- ---------------------------------------------------------------------
--  6. 参加リクエスト … 重複申込・重複参加を防ぐ
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
end $$;

drop trigger if exists on_join_request_group_check on public.join_requests;
create trigger on_join_request_group_check
  before insert on public.join_requests
  for each row execute function public.enforce_group_join();

-- ---------------------------------------------------------------------
--  7. 承認 … グループ人数分の席を作る（人数はトリガーが同期）
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
  select count(*) into v_seats
    from public.party_members where party_id = v_req.party_id;
  if v_seats + v_req.group_size > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- 参加グループの残高チェック（1人あたり point_request × 人数）
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

  -- 参加グループの席を人数分作る（current_members はトリガーが同期する）
  perform public.create_group_seats(
    v_req.party_id, v_req.user_id, 'guest', v_req.group_size, v_req.member_names
  );

  update public.join_requests set status = 'accepted' where id = p_request_id;
end $$;

-- ---------------------------------------------------------------------
--  8. 招待コードで席を引き受ける
--     （同伴者が自分のアカウントでグループチャットに参加するための入口）
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
  if p_code is null or btrim(p_code) = '' then
    raise exception '招待コードを入力してください';
  end if;

  select * into v_seat
    from public.party_members
   where invite_code = upper(btrim(p_code))
   for update;
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
end $$;

-- 自分のグループの席（招待コードを含む）だけを返す。
-- 招待コードは他グループには見せない。
create or replace function public.list_my_seats(p_party uuid)
returns table (id uuid, display_name text, invite_code text, user_id uuid, side text)
language sql security definer stable set search_path = public
as $$
  select m.id, m.display_name, m.invite_code, m.user_id, m.side
    from public.party_members m
   where m.party_id = p_party
     and m.group_owner_id = auth.uid()
     and public.is_party_member(p_party, auth.uid())
   order by m.joined_at, m.id;
$$;

-- ---------------------------------------------------------------------
--  9. 既存データの補正（席が足りていない会を埋める）
-- ---------------------------------------------------------------------
do $$
declare
  r      record;
  v_have int;
  v_need int;
  i      int;
begin
  -- 既存行の side / group_owner_id を補完
  update public.party_members m
     set group_owner_id = coalesce(m.group_owner_id, m.user_id),
         side           = case when m.role = 'host' then 'host' else 'guest' end
   where m.group_owner_id is null;

  update public.party_members m
     set display_name = coalesce(m.display_name, pr.username, 'ゲスト')
    from public.profiles pr
   where pr.id = m.user_id and m.display_name is null;

  -- ホストの席が無い会にホストの席を作る
  insert into public.party_members (party_id, user_id, role, side, group_owner_id, display_name)
  select p.id, p.host_id, 'host', 'host', p.host_id, coalesce(pr.username, 'ホスト')
    from public.parties p
    left join public.profiles pr on pr.id = p.host_id
   where not exists (
     select 1 from public.party_members m
      where m.party_id = p.id and m.user_id = p.host_id
   );

  -- 承認済みリクエストの代表者の席が無い場合に作る
  insert into public.party_members (party_id, user_id, role, side, group_owner_id, display_name)
  select jr.party_id, jr.user_id, 'member', 'guest', jr.user_id, coalesce(pr.username, 'ゲスト')
    from public.join_requests jr
    left join public.profiles pr on pr.id = jr.user_id
   where jr.status = 'accepted'
     and not exists (
       select 1 from public.party_members m
        where m.party_id = jr.party_id and m.user_id = jr.user_id
     );

  -- ホストグループの不足席を未登録席として作る
  for r in select p.id as party_id, p.host_id, p.host_group_size from public.parties p loop
    select count(*) into v_have from public.party_members m
     where m.party_id = r.party_id and m.group_owner_id = r.host_id;
    v_need := r.host_group_size - v_have;
    for i in 1..greatest(v_need, 0) loop
      insert into public.party_members
        (party_id, user_id, role, side, group_owner_id, display_name, invite_code)
      values (r.party_id, null, 'member', 'host', r.host_id,
              'メンバー' || (v_have + i), public.gen_invite_code());
    end loop;
  end loop;

  -- 承認済み参加グループの不足席を未登録席として作る
  for r in select jr.party_id, jr.user_id, jr.group_size
             from public.join_requests jr where jr.status = 'accepted' loop
    select count(*) into v_have from public.party_members m
     where m.party_id = r.party_id and m.group_owner_id = r.user_id;
    v_need := r.group_size - v_have;
    for i in 1..greatest(v_need, 0) loop
      insert into public.party_members
        (party_id, user_id, role, side, group_owner_id, display_name, invite_code)
      values (r.party_id, null, 'member', 'guest', r.user_id,
              'メンバー' || (v_have + i), public.gen_invite_code());
    end loop;
  end loop;
end $$;

-- 全ての会の人数を席数に合わせ直す
update public.parties p
   set current_members = c.cnt,
       status = case
                  when p.status = 'completed' then p.status
                  when c.cnt >= p.max_members then 'matched'
                  else 'recruiting'
                end
  from (select party_id, count(*) as cnt from public.party_members group by party_id) c
 where c.party_id = p.id;

-- ---------------------------------------------------------------------
--  10. RLS / 列単位の権限
-- ---------------------------------------------------------------------
alter table public.party_members enable row level security;

-- 席の閲覧は、その会の承認済みメンバーのみ
drop policy if exists members_select on public.party_members;
create policy members_select on public.party_members for select using (
  public.is_party_member(party_id, auth.uid())
);

-- 席の作成・引き受けは security definer 関数のみが行う。
-- クライアントからの直接 INSERT / DELETE は許可しない（人数がずれるため）。
drop policy if exists members_insert on public.party_members;
drop policy if exists members_delete on public.party_members;

-- 参加リクエストは、承認前は「代表者のニックネーム」と「人数」しか見せない。
-- 自分がホストの会には申し込めない。既に参加中の会にも申し込めない。
drop policy if exists join_insert on public.join_requests;
create policy join_insert on public.join_requests for insert with check (
  user_id = auth.uid()
  and not exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
  and not public.is_party_member(party_id, auth.uid())
);

-- 招待コードは list_my_seats() 経由でのみ取得できるようにする（列単位で遮断）。
-- 同伴者の名前も承認前にホストへ渡らないようにする。
revoke select on public.party_members from anon, authenticated;
grant  select (id, party_id, user_id, role, side, group_owner_id, display_name, joined_at)
  on public.party_members to anon, authenticated;

revoke select on public.join_requests from anon, authenticated;
grant  select (id, party_id, user_id, group_size, applicant_name, status, created_at)
  on public.join_requests to anon, authenticated;
grant  insert on public.join_requests to authenticated;

-- 内部用の security definer 関数は RPC として公開しない。
-- （公開されていると、ポイントを払わずに任意の会へ席を追加できてしまう）
revoke all on function public.create_group_seats(uuid, uuid, text, int, text[])
  from public, anon, authenticated;
revoke all on function public.gen_invite_code()            from public, anon, authenticated;
revoke all on function public.normalize_member_names(text[], int) from public, anon, authenticated;
revoke all on function public.is_party_member(uuid, uuid)  from public, anon, authenticated;
revoke all on function public.shares_party(uuid, uuid)     from public, anon, authenticated;

-- クライアントから呼ぶ RPC はこれだけ
grant execute on function public.claim_seat(text)      to authenticated;
grant execute on function public.list_my_seats(uuid)   to authenticated;
