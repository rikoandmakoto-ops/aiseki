-- =====================================================================
--  AISEKI — 相方の同意と、先に発行する招待リンク（2026-08-29）
--
--  migration_invite_discount_on_signup.sql の続き。冪等（何度流しても同じ）。
--
--  ── 1. 既存の会員と参加（既定の導線）────────────────────
--  既定は【各自払い】。画面に出る参加費は 3,800pt（お一人分）。
--  相方（既存会員）を指定して申し込むと、
--  **相方の画面にも確認が出て、相方が同意して初めてホストに届く。**
--
--    申込者: 「相方の会員コード」を入れて申し込む（3,800pt）
--      ↓
--    相方  : 「◯◯さんと参加しますか？ お支払い 3,800pt」→ 同意 / お断り
--      ↓
--    ホスト: 受信箱に出る → 承認 → 2人からそれぞれ 3,800pt
--
--  🚨 同意が済むまでホストの受信箱には出さない。
--    会員コード（＝紹介コード）は本人が友達に配るものなので、
--    それだけで「相手の残高から 3,800pt 引く」「相手を当日の席に入れる」が
--    できてしまってはいけない。本人の同意を必ず挟む。
--
--  「仲間の分も出す」（bundle）を選ぶと申込者が 7,600pt を持つ。
--  この場合も相方の確認は取る（当日その人が店に行くことになるため）。
--  お支払いが 0pt であることは確認画面に明記する。
--
--  ── 2. 招待して呼ぶ ────────────────────────────────
--  招待リンクを **申し込みより先に** 発行できるようにした。
--  これまでは join_requests に持たせていたので「申し込むまでリンクが出ない」
--  状態だった。専用の join_invites に移し、卓の画面を開いた時点で出せる。
--  招待割（-3,800pt）が効くのは、これまでどおり
--  「招待された方が簡易登録を完了した時点」から。
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. join_invites … 卓ごと・申込者ごとの招待リンク
--
--     join_requests から切り離す。申し込む前に発行できるようにするため。
-- ---------------------------------------------------------------------
create table if not exists public.join_invites (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid not null references public.parties(id)  on delete cascade,
  inviter_id      uuid not null references public.profiles(id) on delete cascade,
  invite_code     text,
  invited_user_id uuid references public.profiles(id) on delete set null,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists join_invites_party_inviter_unique
  on public.join_invites(party_id, inviter_id);
create unique index if not exists join_invites_code_unique
  on public.join_invites(invite_code) where invite_code is not null;
create index if not exists join_invites_invited_idx
  on public.join_invites(invited_user_id);

alter table public.join_invites enable row level security;
-- ポリシーは作らない ＝ security definer の関数だけが触れる。
-- 直接読めると招待コードを総当たりで拾えてしまう。
revoke all on public.join_invites from anon, authenticated;

-- 招待コードは4か所（party_members / group_members / join_requests / join_invites）
-- のどれとも当たらないものを作る。?invite=CODE のリンクは1本なので、
-- 衝突すると行き先が変わってしまう。
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
    exit when not exists (select 1 from public.party_members where invite_code = v_code)
          and not exists (select 1 from public.group_members where invite_code = v_code)
          and not exists (select 1 from public.join_requests where invite_code = v_code)
          and not exists (select 1 from public.join_invites  where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception '招待コードの生成に失敗しました'; end if;
  end loop;
  return v_code;
end $$;

--  既に join_requests 側に持っている招待を join_invites へ移す（冪等）
insert into public.join_invites (party_id, inviter_id, invite_code, invited_user_id, claimed_at)
select r.party_id, r.user_id, r.invite_code, r.invited_user_id,
       case when r.invited_user_id is not null then now() end
  from public.join_requests r
 where r.pay_mode = 'invite'
   and (r.invite_code is not null or r.invited_user_id is not null)
   and not exists (
     select 1 from public.join_invites i
      where i.party_id = r.party_id and i.inviter_id = r.user_id)
on conflict do nothing;

-- ---------------------------------------------------------------------
--  2. 招待リンクを発行する（申し込みの前でよい）
--
--     すでに発行済みならそれを返す（何度押しても増えない）。
--     🚨 発行できるのは「その卓に申し込める人」だけ。
--       ホスト本人・既に参加している人・簡易登録のアカウントは弾く。
-- ---------------------------------------------------------------------
create or replace function public.issue_join_invite(p_party uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_party public.parties;
  v_row   public.join_invites;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  perform public.assert_legal_age(v_uid);
  if public.is_simple_account(v_uid) then
    raise exception '簡易登録のアカウントでは招待できません';
  end if;

  select * into v_party from public.parties where id = p_party;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id = v_uid then raise exception '自分がホストの会には申し込めません'; end if;
  if v_party.status in ('cancelled', 'completed') then
    raise exception 'この会は募集を終了しています';
  end if;
  if public.is_party_member(p_party, v_uid) then
    raise exception '既にこの会に参加しています';
  end if;

  --  同じ卓・同じ人につき1本。同時に押されても増やさない。
  perform pg_advisory_xact_lock(hashtext('aiseki:joininvite:' || p_party::text || ':' || v_uid::text));

  select * into v_row from public.join_invites
   where party_id = p_party and inviter_id = v_uid;

  if not found then
    insert into public.join_invites (party_id, inviter_id, invite_code)
    values (p_party, v_uid, public.gen_invite_code())
    returning * into v_row;
  elsif v_row.invite_code is null and v_row.invited_user_id is null then
    --  承認時に席へ移したあと（コードが空）に、また発行し直したいとき
    update public.join_invites set invite_code = public.gen_invite_code()
     where id = v_row.id returning * into v_row;
  end if;

  return jsonb_build_object(
    'invite_code',  v_row.invite_code,
    'claimed',      (v_row.invited_user_id is not null),
    'invited_name', (select p.username from public.profiles p where p.id = v_row.invited_user_id),
    'total',        public.join_fee_total(public.guest_slot_size()),
    'charge',       public.join_charge_claimed(
                      public.guest_slot_size(), 'invite', v_row.invited_user_id is not null),
    'discount_when_claimed', public.invite_discount()
  );
end $$;

--  自分の招待リンク（発行していなければ null）。申し込みの前後どちらでも引ける。
create or replace function public.my_join_invite(p_party uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'invite_code',  i.invite_code,
    'claimed',      (i.invited_user_id is not null),
    'invited_name', (select p.username from public.profiles p where p.id = i.invited_user_id),
    'total',        public.join_fee_total(public.guest_slot_size()),
    'charge',       public.join_charge_claimed(
                      public.guest_slot_size(), 'invite', i.invited_user_id is not null),
    'discount_when_claimed', public.invite_discount(),
    'status',       (select r.status from public.join_requests r
                      where r.party_id = i.party_id and r.user_id = i.inviter_id
                      order by r.created_at desc limit 1)
  )
  from public.join_invites i
  where i.party_id = p_party and i.inviter_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
--  3. 招待リンクの受け口（?invite=CODE）
-- ---------------------------------------------------------------------
create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_out  jsonb;
begin
  if v_code = '' then return null; end if;

  -- 1) ホストのグループ
  select jsonb_build_object(
           'kind', 'group',
           'group_name', g.name,
           'owner_name', coalesce(o.username, 'ホスト'),
           'display_name', m.display_name,
           'claimed', (m.user_id is not null))
    into v_out
    from public.group_members m
    join public.groups g on g.id = m.group_id
    left join public.profiles o on o.id = g.owner_id
   where m.invite_code = v_code;
  if v_out is not null then return v_out; end if;

  -- 2) 参加申請の招待（承認前）
  select jsonb_build_object(
           'kind', 'join',
           'group_name', coalesce(p.title, '相席の会'),
           'owner_name', coalesce(u.username, 'お連れの方'),
           'display_name', 'ご招待の方',
           'claimed', (i.invited_user_id is not null))
    into v_out
    from public.join_invites i
    left join public.parties  p on p.id = i.party_id
    left join public.profiles u on u.id = i.inviter_id
   where i.invite_code = v_code;
  if v_out is not null then return v_out; end if;

  -- 3) 会の席（承認後）
  select jsonb_build_object(
           'kind', 'seat',
           'group_name', coalesce(p.title, '相席の会'),
           'owner_name', coalesce(u.username, 'お連れの方'),
           'display_name', m.display_name,
           'claimed', (m.user_id is not null))
    into v_out
    from public.party_members m
    left join public.parties  p on p.id = m.party_id
    left join public.profiles u on u.id = m.group_owner_id
   where m.invite_code = v_code;

  return v_out;
end $$;

--  🚨 引き受けられるのは簡易登録（account_type='simple'）の方だけ。
--    既存の会員が踏めるようにすると、会員同士で招待し合って
--    毎回 3,800pt で済ませられてしまう。
create or replace function public.claim_join_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row  public.join_invites;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  if v_code = '' then raise exception '招待コードを入力してください'; end if;
  perform public.assert_legal_age(v_uid);

  select * into v_row from public.join_invites where invite_code = v_code for update;
  if not found then raise exception '招待コードが見つかりません'; end if;
  if v_row.invited_user_id is not null then
    raise exception 'この招待リンクは既に使われています';
  end if;
  if v_row.inviter_id = v_uid then
    raise exception 'ご自身が発行した招待リンクです';
  end if;
  if not public.is_simple_account(v_uid) then
    raise exception '既に会員登録がお済みの方は、この招待リンクではご参加いただけません。お申し込みの方に会員コードをお伝えください';
  end if;
  if public.is_party_member(v_row.party_id, v_uid) then
    raise exception '既にこの会に参加しています';
  end if;
  if public.is_blocked(v_row.inviter_id, v_uid) then
    raise exception 'この招待は使えません';
  end if;
  if exists (select 1 from public.parties
              where id = v_row.party_id and status in ('cancelled', 'completed')) then
    raise exception 'この会は募集を終了しています';
  end if;

  update public.join_invites
     set invited_user_id = v_uid, claimed_at = now()
   where id = v_row.id;

  --  申し込み済みなら、席の表示名を本人のお名前に差し替えておく
  update public.join_requests r
     set member_names = array[coalesce(
           (select username from public.profiles where id = v_uid), 'ご招待の方')]
   where r.party_id = v_row.party_id
     and r.user_id  = v_row.inviter_id
     and r.status   = 'pending';

  return jsonb_build_object('kind', 'join', 'party_id', v_row.party_id);
end $$;

create or replace function public.claim_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  if v_code = '' then raise exception '招待コードを入力してください'; end if;

  if exists (select 1 from public.group_members where invite_code = v_code) then
    return public.claim_group_invite(v_code) || jsonb_build_object('kind', 'group');
  end if;
  if exists (select 1 from public.join_invites where invite_code = v_code) then
    return public.claim_join_invite(v_code);
  end if;
  if exists (select 1 from public.party_members where invite_code = v_code) then
    return public.claim_seat(v_code) || jsonb_build_object('kind', 'seat');
  end if;

  raise exception '招待コードが見つかりません';
end $$;

-- ---------------------------------------------------------------------
--  4. 相方の同意
--
--     partner_status
--       'none'      … 相方を指定していない（招待／お名前だけ／1人）
--       'pending'   … 相方の確認待ち。ホストの受信箱には出さない
--       'confirmed' … 相方が同意した。ここで初めてホストへ届く
--       'declined'  … 相方がお断りした。申し込みごと取り下げる
-- ---------------------------------------------------------------------
alter table public.join_requests
  add column if not exists partner_status text not null default 'none';

alter table public.join_requests drop constraint if exists join_requests_partner_status_check;
alter table public.join_requests add constraint join_requests_partner_status_check
  check (partner_status in ('none', 'pending', 'confirmed', 'declined'));

--  既存の行を埋める（相方つきの承認済みは同意済みとみなす）
update public.join_requests
   set partner_status = case when partner_id is null then 'none' else 'confirmed' end
 where partner_status not in ('none', 'pending', 'confirmed', 'declined')
    or (partner_id is null and partner_status <> 'none');

create index if not exists join_requests_partner_status_idx
  on public.join_requests(partner_id, partner_status) where partner_id is not null;

create or replace function public.enforce_group_join()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_party public.parties;
  v_tier  text;
  v_extra int;
begin
  perform public.assert_legal_age(new.user_id);

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

  --  招待コードと引き受け先は join_invites 側で持つ（この表では使わない）
  new.invited_user_id := null;
  new.invite_code     := null;
  --  同意の状態はサーバが決める（クライアントからは受け取らない）
  new.partner_status  := 'none';

  if new.pay_mode = 'invite' then
    if new.partner_id is not null then
      raise exception '招待して呼ぶ場合、相方の会員コードは指定できません';
    end if;
    if new.group_size <> 2 then
      raise exception '招待して呼ぶ場合は2名でお申し込みください';
    end if;
    --  リンクをまだ発行していなければ、ここで発行しておく
    if not exists (select 1 from public.join_invites
                    where party_id = new.party_id and inviter_id = new.user_id) then
      insert into public.join_invites (party_id, inviter_id, invite_code)
      values (new.party_id, new.user_id, public.gen_invite_code());
    end if;
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
    --  🚨 相方を指定したら、必ず本人の同意を待つ。
    --    会員コードだけで他人の残高から引けてはいけない。
    new.partner_status := 'pending';
  elsif new.pay_mode = 'split' then
    raise exception '各自払いは、相方が既存の会員のときにのみ選べます';
  end if;

  new.billable_size := public.billable_guests(new.group_size);

  if v_party.current_members + new.billable_size > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  v_tier := public.user_rank_tier(new.user_id);
  if public.tier_order_of(v_tier)
     < public.tier_order_of(coalesce(v_party.min_guest_tier, 'bronze')) then
    raise exception 'この会は%以上のランクの方が対象です（あなたは%）。会の終了後に受け取る評価でランクが上がります',
      (select tier_label from public.rank_tiers() where tier_key = v_party.min_guest_tier),
      (select tier_label from public.rank_tiers() where tier_key = v_tier);
  end if;

  v_extra := new.group_size - 1 - (case when new.partner_id is not null then 1 else 0 end);
  new.member_names   := public.normalize_member_names(new.member_names, greatest(v_extra, 0) + 1);
  if new.pay_mode = 'invite'
     and coalesce(array_length(new.member_names, 1), 0) >= 1
     and new.member_names[1] ~ '^メンバー[0-9]+$' then
    new.member_names[1] := 'ご招待の方';
  end if;
  new.applicant_name := coalesce(
    (select username from public.profiles where id = new.user_id), 'ゲスト'
  );
  return new;
end $$;

--  相方に見せる確認（自分が相方に指定されている申し込みだけ）
--  🚨 返してよいのは「誰から・どの会へ・いくら」まで。
--    申込者のプロフィール（年齢・写真・性別・評価）を足さないこと（§1）。
create or replace function public.list_partner_requests()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) from (
    select jsonb_build_object(
             'request_id',     r.id,
             'party_id',       r.party_id,
             'party_title',    p.title,
             'party_date',     p.party_date,
             'party_time',     p.party_time,
             'location',       p.location,
             'area',           p.area,
             'applicant_name', coalesce(r.applicant_name, 'メンバー'),
             'pay_mode',       r.pay_mode,
             'my_charge',      case when r.pay_mode = 'split'
                                    then public.join_fee_total(r.group_size) / 2 else 0 end,
             'my_balance',     coalesce(
                                 (select balance from public.point_balances
                                   where user_id = auth.uid()), 0),
             'created_at',     r.created_at
           ) as x
      from public.join_requests r
      join public.parties p on p.id = r.party_id
     where r.partner_id = auth.uid()
       and r.status = 'pending'
       and r.partner_status = 'pending'
       and p.status not in ('cancelled', 'completed')
  ) s;
$$;

--  相方が同意する
create or replace function public.confirm_join_partner(p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.join_requests;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  perform public.assert_legal_age(v_uid);

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'お誘いが見つかりません'; end if;
  if v_req.partner_id is distinct from v_uid then
    raise exception 'このお誘いはあなた宛てではありません';
  end if;
  if v_req.status <> 'pending' then raise exception 'このお誘いは既に終了しています'; end if;
  if v_req.partner_status = 'confirmed' then
    return jsonb_build_object('party_id', v_req.party_id, 'already', true);
  end if;
  if v_req.partner_status <> 'pending' then
    raise exception 'このお誘いは既に終了しています';
  end if;
  if public.is_party_member(v_req.party_id, v_uid) then
    raise exception '既にこの会に参加しています';
  end if;

  update public.join_requests set partner_status = 'confirmed' where id = p_request_id;
  return jsonb_build_object('party_id', v_req.party_id, 'already', false);
end $$;

--  相方がお断りする。申し込みごと取り下げて、申込者が出し直せるようにする
--  （保留中の重複を防ぐ一意索引は status='pending' にだけ掛かっている）。
create or replace function public.decline_join_partner(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.join_requests;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'お誘いが見つかりません'; end if;
  if v_req.partner_id is distinct from v_uid then
    raise exception 'このお誘いはあなた宛てではありません';
  end if;
  if v_req.status <> 'pending' then raise exception 'このお誘いは既に終了しています'; end if;

  update public.join_requests
     set partner_status = 'declined', status = 'declined'
   where id = p_request_id;
end $$;

-- ---------------------------------------------------------------------
--  5. ホストの受信箱（同意が済んだものだけ）
-- ---------------------------------------------------------------------
create or replace function public.list_incoming_request_charges()
returns table (request_id uuid, invite_claimed boolean, total int, charge int)
language sql stable security definer set search_path = public
as $$
  select r.id,
         coalesce(i.invited_user_id is not null, false),
         public.join_fee_total(r.group_size),
         public.join_charge_claimed(r.group_size, r.pay_mode,
                                    coalesce(i.invited_user_id is not null, false))
    from public.join_requests r
    join public.parties p on p.id = r.party_id
    left join public.join_invites i
           on i.party_id = r.party_id and i.inviter_id = r.user_id
   where p.host_id = auth.uid()
     and r.status = 'pending'
     and r.partner_status in ('none', 'confirmed');
$$;

-- ---------------------------------------------------------------------
--  6. 承認 ＝ マッチ成立 ＝ 決済
-- ---------------------------------------------------------------------
create or replace function public.accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_req      public.join_requests;
  v_party    public.parties;
  v_inv      public.join_invites;
  v_fee      int;
  v_billable int;
  v_total    int;
  v_seats    int;
  v_taken    int;
  v_self     int;
  v_partner  int;
  v_units    int;
  v_bal      int;
  v_seat     uuid;
  v_claimed  boolean;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if not found then raise exception 'リクエストが見つかりません'; end if;
  if v_req.status <> 'pending' then raise exception '既に処理済みのリクエストです'; end if;

  --  🚨 相方を指定した申し込みは、相方本人の同意が済むまで承認できない。
  if v_req.partner_id is not null and v_req.partner_status <> 'confirmed' then
    raise exception 'お相手の確認がまだ済んでいません';
  end if;

  select * into v_party from public.parties where id = v_req.party_id for update;
  if not found then raise exception '会が見つかりません'; end if;
  if v_party.host_id <> auth.uid() then raise exception 'この会のホストのみ承認できます'; end if;
  if v_party.status = 'cancelled' then raise exception 'この会は取り消されています'; end if;
  if public.is_party_member(v_req.party_id, v_req.user_id) then
    raise exception 'この方は既にこの会に参加しています';
  end if;

  select * into v_inv from public.join_invites
   where party_id = v_req.party_id and inviter_id = v_req.user_id;

  v_fee      := public.join_fee_per_person();
  v_billable := public.billable_guests(v_req.group_size);
  --  招待割の可否。ここで見た状態がそのまま料金になる。
  v_claimed  := (v_req.pay_mode = 'invite' and v_inv.invited_user_id is not null);

  select count(*) into v_seats from public.party_members where party_id = v_req.party_id;
  if v_seats + v_billable > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- ── 誰がいくら払うか ────────────────────────────
  v_total := v_fee * v_billable;
  if v_req.pay_mode = 'split' and v_req.partner_id is not null then
    v_self    := public.join_charge_of(v_req.group_size, 'split');
    v_partner := v_total - v_self;
  else
    v_self    := public.join_charge_claimed(v_req.group_size, v_req.pay_mode, v_claimed);
    v_partner := 0;
  end if;

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
  v_units := case when v_self = v_total then v_billable
                  else greatest(v_self / nullif(v_fee, 0), 1) end;

  if v_self > 0 then
    update public.point_balances set balance = balance - v_self
     where user_id = v_req.user_id;
    insert into public.points (user_id, amount, type, description)
    values (v_req.user_id, -v_self, 'spend', 'グループ参加: ' || v_party.title);
    insert into public.platform_revenues
      (party_id, join_request_id, payer_id, group_size, fee_per_person, points)
    values (v_party.id, v_req.id, v_req.user_id, v_units, v_fee, v_self);
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

  -- ── 席を作る ───────────────────────────────────
  perform public.create_group_seats(
    v_req.party_id, v_req.user_id, 'guest',
    v_req.group_size, v_req.member_names,
    coalesce(v_req.partner_id, case when v_claimed then v_inv.invited_user_id end)
  );

  --  まだ登録が済んでいない招待は、同じコードを席へ移す（送ったリンクを生かす）
  if v_req.pay_mode = 'invite' and not v_claimed and v_inv.invite_code is not null then
    select id into v_seat from public.party_members
     where party_id = v_req.party_id
       and group_owner_id = v_req.user_id
       and user_id is null
       and invite_code is not null
     order by joined_at
     limit 1;
    if v_seat is not null then
      update public.join_invites set invite_code = null where id = v_inv.id;
      update public.party_members set invite_code = v_inv.invite_code where id = v_seat;
    end if;
  end if;

  update public.join_requests set status = 'accepted' where id = p_request_id;

  select coalesce(sum(public.billable_guests(group_size)), 0) into v_taken
    from public.join_requests
   where party_id = v_req.party_id and status = 'accepted';

  if v_taken >= v_party.guest_group_size then
    update public.parties set status = 'matched'
     where id = v_req.party_id and status not in ('completed', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------
--  6-b. 招待リンクは「卓 × 申込者」に紐づく（申し込みには紐づかない）
--
--     join_requests.invite_code を見張っていたトリガは要らなくなった。
--     見送られても、同じ卓へもう一度申し込むときに同じリンクを使える
--     （リンクは既に相手に送ってあるため、死なせるほうが不便）。
--     卓そのものが終わったら claim_join_invite が弾く。
-- ---------------------------------------------------------------------
drop trigger if exists on_join_request_dead_invite on public.join_requests;
drop function if exists public.clear_dead_join_invite();

-- ---------------------------------------------------------------------
--  7. 権限
-- ---------------------------------------------------------------------
--  partner_status はホスト・申込者ともに読んでよい（誰が相方かは出ない）。
revoke select, insert on public.join_requests from anon, authenticated;
grant  select (id, party_id, user_id, group_size, applicant_name, status, created_at,
               pay_mode, billable_size, partner_status)
  on public.join_requests to anon, authenticated;
grant insert (party_id, user_id, group_size, member_names, status, pay_mode, partner_id)
  on public.join_requests to authenticated;

revoke all on function public.gen_invite_code()              from public, anon, authenticated;
revoke all on function public.issue_join_invite(uuid)        from public, anon;
revoke all on function public.my_join_invite(uuid)           from public, anon;
revoke all on function public.claim_join_invite(text)        from public, anon;
revoke all on function public.claim_invite(text)             from public, anon;
revoke all on function public.list_partner_requests()        from public, anon;
revoke all on function public.confirm_join_partner(uuid)     from public, anon;
revoke all on function public.decline_join_partner(uuid)     from public, anon;
revoke all on function public.list_incoming_request_charges() from public, anon;

grant execute on function public.issue_join_invite(uuid)         to authenticated;
grant execute on function public.my_join_invite(uuid)            to authenticated;
grant execute on function public.claim_join_invite(text)         to authenticated;
grant execute on function public.claim_invite(text)              to authenticated;
grant execute on function public.list_partner_requests()         to authenticated;
grant execute on function public.confirm_join_partner(uuid)      to authenticated;
grant execute on function public.decline_join_partner(uuid)      to authenticated;
grant execute on function public.list_incoming_request_charges() to authenticated;
grant execute on function public.invite_preview(text)            to anon, authenticated;

-- ---------------------------------------------------------------------
--  8. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  -- 招待リンクの置き場が join_invites になっていること
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'join_invites') then
    raise exception '検算失敗: join_invites がありません';
  end if;
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'join_invites'
       and grantee in ('anon', 'authenticated')
  ) into v_ok;
  if v_ok then raise exception '検算失敗: join_invites を直接読み書きできます'; end if;
  raise notice '✓ 招待リンクは join_invites（直接は触れない）';

  -- 相方の同意
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'join_requests'
                    and column_name = 'partner_status') then
    raise exception '検算失敗: join_requests.partner_status がありません';
  end if;
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'join_requests'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
       and column_name = 'partner_status'
  ) into v_ok;
  if v_ok then raise exception '検算失敗: partner_status をクライアントから指定できます'; end if;
  raise notice '✓ 相方の同意（partner_status）はサーバが決める';

  -- 未ログインから呼べないこと
  select has_function_privilege('anon', 'public.confirm_join_partner(uuid)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: confirm_join_partner を anon が実行できます'; end if;
  select has_function_privilege('anon', 'public.issue_join_invite(uuid)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: issue_join_invite を anon が実行できます'; end if;
  raise notice '✓ 同意・招待の発行は要ログイン';

  raise notice '=== migration_partner_consent.sql 適用完了 ===';
end $$;
