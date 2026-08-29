-- =====================================================================
--  AISEKI — 参加申請の3つの導線と「招待割」（2026-08-29）
--
--  migration_new_flow.sql の続き。冪等（何度流しても同じ）。
--
--  参加申請の画面を、次の3つに整理した。
--
--    1. 既存の会員と参加（既定）… 会員コードで相方を指定する
--         ・各自払い   … 3,800pt ずつ
--         ・まとめ払い … 7,600pt を自分が持つ
--
--    2. 招待して呼ぶ … まだ会員でない方を招待リンクで連れてくる
--         参加費 7,600pt − 招待割 3,800pt ＝ お支払い 3,800pt
--         🚨 割引であって、ポイントの付与ではない。1ptも増えない。
--
--    3. 相方は登録しない（下部の小さな導線）
--         ・相方の名前を入れる（アカウントなし）… 7,600pt
--         ・1人で参加申請を出す              … 7,600pt
--
--  ── なぜ「付与」ではなく「割引」なのか ──────────────────
--  招待した側にポイントを配ると、アカウントを作っては招待する形で
--  ポイントだけを抜ける（§16 CAPTCHA / §17 カード1枚1アカウント と同じ形）。
--  割引なら、実際に卓へ申し込んで承認されたときにしか効かず、
--  持ち出せる残高も生まれない。
--
--  ── 招待リンクの扱い ────────────────────────────────
--  申し込み（join_requests）に招待コードを持たせる。リンクを送るのは
--  承認を待たずにできる。招待された方は簡易登録（account_type='simple'）で
--  席を引き受ける。承認までに引き受けが間に合わなくても、承認時に
--  同じコードが会の席（party_members）へ移るのでリンクは生き続ける。
--
--  🚨 招待割を使えるのは「簡易登録で新しく入った方」だけ。
--     既存の会員がリンクを踏んでも引き受けられない（claim_join_invite）。
--     ここを緩めると、会員同士で招待し合って毎回半額にできてしまう。
-- =====================================================================

-- ---------------------------------------------------------------------
--  0. 料金の出典（src/lib/pricing.js と一致させること）
-- ---------------------------------------------------------------------

--  招待割の割引額。pricing.js の INVITE_DISCOUNT と一致させる。
create or replace function public.invite_discount()
returns int language sql immutable set search_path = public as $$ select 3800 $$;

--  支払い方式に 'invite'（招待割）を足す。
--  'bundle' … 代表者が全額（7,600pt）
--  'split'  … 相方が既存会員のときだけ。3,800pt ずつ
--  'invite' … 招待して呼ぶ。7,600 − 3,800 ＝ 3,800pt
create or replace function public.pay_modes()
returns text[] language sql immutable set search_path = public as $$
  select array['bundle', 'split', 'invite']::text[]
$$;

--  請求額（誰がいくら払うか）。画面と承認処理で同じ式を使うため関数にする。
--  🚨 accept_join_request() もこの関数を通すこと。片方だけ直すと
--    「画面に出ていた額」と「実際に引かれた額」がずれる。
create or replace function public.join_charge_of(p_size int, p_mode text)
returns int language sql stable set search_path = public as $$
  select case
           when p_mode = 'split'  then public.join_fee_total(p_size) / 2
           when p_mode = 'invite' then greatest(
                  public.join_fee_total(p_size) - public.invite_discount(), 0)
           else public.join_fee_total(p_size)
         end
$$;

-- ---------------------------------------------------------------------
--  1. join_requests … 招待リンク
-- ---------------------------------------------------------------------
--  invite_code     … 招待リンクのコード。pay_mode='invite' のとき自動で入る。
--                    サーバが決める（列単位の INSERT 権限に入れない）。
--  invited_user_id … 簡易登録して枠を引き受けた方。
alter table public.join_requests
  add column if not exists invite_code text;
alter table public.join_requests
  add column if not exists invited_user_id uuid references public.profiles(id) on delete set null;

create unique index if not exists join_requests_invite_code_unique
  on public.join_requests(invite_code) where invite_code is not null;
create index if not exists join_requests_invited_idx
  on public.join_requests(invited_user_id);

-- ---------------------------------------------------------------------
--  2. 招待コードの生成 … 3つの置き場すべてと突き合わせる
--
--     party_members / group_members / join_requests の3か所にコードがある。
--     ?invite=CODE のリンクは1本なので、どこに当たるかで扱いを変える。
--     衝突するとリンクの行き先が変わってしまうため、生成時に全部を見る。
-- ---------------------------------------------------------------------
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
    exit when not exists (select 1 from public.party_members  where invite_code = v_code)
          and not exists (select 1 from public.group_members  where invite_code = v_code)
          and not exists (select 1 from public.join_requests  where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception '招待コードの生成に失敗しました'; end if;
  end loop;
  return v_code;
end $$;

create or replace function public.gen_group_invite_code()
returns text
language plpgsql volatile security definer set search_path = public
as $$
  -- 置き場ごとに関数を分けていたが、生成規則は完全に同じになった。
  -- 呼び出し側（add_group_member 等）を書き換えずに済むよう残してある。
  begin return public.gen_invite_code(); end
$$;

-- ---------------------------------------------------------------------
--  3. 申し込みの検査（enforce_group_join）
--
--     migration_new_flow.sql の版に「招待して呼ぶ」を足したもの。
--     それ以外の規則（年齢・簡易登録・ランク・枠・ブロック）は変えていない。
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

  -- 招待コードと引き受け先はサーバが決める（クライアントからは受け取らない）
  new.invited_user_id := null;
  new.invite_code     := null;

  if new.pay_mode = 'invite' then
    -- 招待して呼ぶ … 相方はまだ会員ではないので partner_id は付かない
    if new.partner_id is not null then
      raise exception '招待して呼ぶ場合、相方の会員コードは指定できません';
    end if;
    if new.group_size <> 2 then
      raise exception '招待して呼ぶ場合は2名でお申し込みください';
    end if;
    new.invite_code := public.gen_invite_code();
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
  --  招待して呼ぶ場合、お名前はご本人が簡易登録のときに入れる。
  --  それまでの仮の表示名を、既定の「メンバー2」より分かるものにしておく。
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

-- ---------------------------------------------------------------------
--  4. 申し込む前の金額（表示用）
--     画面はこの値を出す。招待割の内訳も一緒に返す。
-- ---------------------------------------------------------------------
create or replace function public.join_charge_preview(p_size int, p_mode text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'group_size',    coalesce(p_size, 1),
    'billable_size', public.billable_guests(p_size),
    'total',         public.join_fee_total(p_size),
    'per_person',    public.join_fee_per_person(),
    'discount',      case when p_mode = 'invite'
                          then least(public.invite_discount(), public.join_fee_total(p_size))
                          else 0 end,
    'my_charge',     public.join_charge_of(p_size, p_mode),
    'my_balance',    coalesce(
                       (select balance from public.point_balances where user_id = auth.uid()), 0)
  );
$$;

-- ---------------------------------------------------------------------
--  5. 自分が発行した招待リンク
--
--     invite_code をテーブルから直接読ませない（総当たりで他人の枠を
--     引き受けられてしまう）。自分の申し込みの分だけ、この関数で返す。
-- ---------------------------------------------------------------------
create or replace function public.my_join_invite(p_party uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'request_id',   r.id,
    'status',       r.status,
    'invite_code',  r.invite_code,
    'claimed',      (r.invited_user_id is not null),
    'invited_name', (select p.username from public.profiles p where p.id = r.invited_user_id)
  )
  from public.join_requests r
  where r.party_id = p_party
    and r.user_id  = auth.uid()
    and r.pay_mode = 'invite'
    and r.status in ('pending', 'accepted')
  order by r.created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
--  6. 招待リンク（?invite=CODE）の受け口
--
--     コードの置き場は3か所ある。リンクは1本なので、ここで振り分ける。
--       group_members … ホストが友達を集めるグループの枠
--       join_requests … 参加申請の「招待して呼ぶ」（承認前）
--       party_members … 会の席（承認後・未登録の同伴者）
-- ---------------------------------------------------------------------

--  リンクを開いた人に見せる情報。未登録の人も呼ぶ（anon）。
--  🚨 返してよいのは「誰に招かれたか」だけ。招いた人のプロフィール
--    （年齢・写真・性別・評価）を足さないこと（§1）。
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
           'display_name', coalesce(r.member_names[1], 'ご招待の方'),
           'claimed', (r.invited_user_id is not null))
    into v_out
    from public.join_requests r
    left join public.parties  p on p.id = r.party_id
    left join public.profiles u on u.id = r.user_id
   where r.invite_code = v_code;
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

--  参加申請の招待を引き受ける（簡易登録の直後に呼ばれる）。
--
--  🚨 引き受けられるのは簡易登録（account_type='simple'）の方だけ。
--    既存の会員が踏めるようにすると、会員同士で招待し合って
--    毎回 3,800pt で済ませられてしまう（招待割の前提が崩れる）。
create or replace function public.claim_join_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_req  public.join_requests;
  v_name text;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  if v_code = '' then raise exception '招待コードを入力してください'; end if;
  perform public.assert_legal_age(v_uid);

  select * into v_req from public.join_requests
   where invite_code = v_code for update;
  if not found then raise exception '招待コードが見つかりません'; end if;
  if v_req.invited_user_id is not null then
    raise exception 'この招待リンクは既に使われています';
  end if;
  if v_req.status not in ('pending', 'accepted') then
    raise exception 'この招待は使えなくなりました';
  end if;
  if v_req.user_id = v_uid then
    raise exception 'ご自身が発行した招待リンクです';
  end if;
  if not public.is_simple_account(v_uid) then
    raise exception '既に会員登録がお済みの方は、この招待リンクではご参加いただけません。お申し込みの方に会員コードをお伝えください';
  end if;
  if public.is_party_member(v_req.party_id, v_uid) then
    raise exception '既にこの会に参加しています';
  end if;
  if public.is_blocked(v_req.user_id, v_uid) then
    raise exception 'この招待は使えません';
  end if;

  select username into v_name from public.profiles where id = v_uid;

  update public.join_requests
     set invited_user_id = v_uid,
         member_names    = array[coalesce(nullif(btrim(v_name), ''), member_names[1])]
   where id = v_req.id;

  return jsonb_build_object('kind', 'join', 'party_id', v_req.party_id);
end $$;

--  ?invite=CODE の入口。どの置き場のコードでも、ここ1本で引き受ける。
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
  if exists (select 1 from public.join_requests where invite_code = v_code) then
    return public.claim_join_invite(v_code);
  end if;
  if exists (select 1 from public.party_members where invite_code = v_code) then
    return public.claim_seat(v_code) || jsonb_build_object('kind', 'seat');
  end if;

  raise exception '招待コードが見つかりません';
end $$;

-- ---------------------------------------------------------------------
--  7. 承認 ＝ マッチ成立 ＝ 決済
--
--     migration_new_flow.sql の版に招待割を足したもの。
--     請求額は join_charge_of() が唯一の出典（画面と同じ式）。
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
  v_units    int;
  v_bal      int;
  v_seat     uuid;
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
  --   まとめ払い … 代表者が全額
  --   各自払い   … 代表者と相方が半分ずつ
  --   招待       … 代表者が「招待割」を引いた額。招待された方は払わない
  v_total := v_fee * v_billable;
  if v_req.pay_mode = 'split' and v_req.partner_id is not null then
    v_self    := public.join_charge_of(v_req.group_size, 'split');
    v_partner := v_total - v_self;
  else
    v_self    := public.join_charge_of(v_req.group_size, v_req.pay_mode);
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
  --   台帳の group_size は「何名分を受け取ったか」。
  --   割り勘・招待割のときは1名分になる（金額と辻褄を合わせる）。
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

  -- ── 席を作る（current_members はトリガーが同期する）───
  --   招待された方が既に簡易登録を済ませていれば、実体つきの席にする。
  perform public.create_group_seats(
    v_req.party_id, v_req.user_id, 'guest',
    v_req.group_size, v_req.member_names,
    coalesce(v_req.partner_id, v_req.invited_user_id)
  );

  --   まだ登録が済んでいない招待は、同じコードを席へ移す。
  --   こうしておくと、既に送ってあるリンクが承認後もそのまま使える。
  if v_req.pay_mode = 'invite'
     and v_req.invited_user_id is null
     and v_req.invite_code is not null then
    select id into v_seat from public.party_members
     where party_id = v_req.party_id
       and group_owner_id = v_req.user_id
       and user_id is null
       and invite_code is not null
     order by joined_at
     limit 1;
    if v_seat is not null then
      update public.join_requests set invite_code = null where id = v_req.id;
      update public.party_members set invite_code = v_req.invite_code where id = v_seat;
    end if;
  end if;

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
--  8. 見送り・取り消しのときに招待リンクを無効にする
--     （拒否されたリクエストのリンクが生き続けると、
--       押した人が「使えないリンク」に当たり続ける）
-- ---------------------------------------------------------------------
create or replace function public.clear_dead_join_invite()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status not in ('pending', 'accepted') and new.invite_code is not null then
    new.invite_code := null;
  end if;
  return new;
end $$;

drop trigger if exists on_join_request_dead_invite on public.join_requests;
create trigger on_join_request_dead_invite
  before update of status on public.join_requests
  for each row execute function public.clear_dead_join_invite();

-- ---------------------------------------------------------------------
--  9. 権限
-- ---------------------------------------------------------------------
--  invite_code / invited_user_id は列単位で遮断したまま
--  （my_join_invite() / invite_preview() 経由でしか取れない）。
--  INSERT 権限にも入れない ＝ クライアントからは指定できない。
--  ⚠ 列単位で grant する前に、テーブル全体の権限を落とすこと。
--    Supabase の既定で public スキーマの全テーブルに ALL が付いているため、
--    列を並べて grant しても「表全体の権限」が残っていれば意味が無い
--    （invite_code を自分で指定して insert できてしまう。
--      トリガーが上書きするので実害は無いが、二重の守りとして塞ぐ）。
revoke select, insert on public.join_requests from anon, authenticated;
grant  select (id, party_id, user_id, group_size, applicant_name, status, created_at,
               pay_mode, billable_size)
  on public.join_requests to anon, authenticated;
grant insert (party_id, user_id, group_size, member_names, status, pay_mode, partner_id)
  on public.join_requests to authenticated;

--  ⚠ Supabase の既定で「public スキーマの全関数」に EXECUTE が付く。
--    新しく作った関数は、要らない相手から明示的に revoke しないと
--    未ログイン（anon）からも呼べてしまう。
revoke all on function public.gen_invite_code()        from public, anon, authenticated;
revoke all on function public.gen_group_invite_code()  from public, anon, authenticated;
revoke all on function public.clear_dead_join_invite() from public, anon, authenticated;
revoke all on function public.claim_invite(text)       from public, anon;
revoke all on function public.claim_join_invite(text)  from public, anon;
revoke all on function public.my_join_invite(uuid)     from public, anon;
revoke all on function public.join_charge_preview(int, text) from public, anon;

grant execute on function public.invite_discount()               to anon, authenticated;
grant execute on function public.join_charge_of(int, text)       to anon, authenticated;
grant execute on function public.join_charge_preview(int, text)  to authenticated;
grant execute on function public.my_join_invite(uuid)            to authenticated;
grant execute on function public.claim_invite(text)              to authenticated;
grant execute on function public.claim_join_invite(text)         to authenticated;

--  招待リンクは未登録の人も開く（返すのは招いた人の表示名と会の名前だけ）
grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------
--  9-b. 追いかけメール（簡易登録の方に正規会員化をおすすめする）
--
--     招待リンクから来た方は、名前と年齢確認だけの簡易登録で会に入る。
--     そのままだと自分から卓に申し込めないので、
--     「カードを登録すると 5,000pt が付いて、自分でも申し込める」ことを
--     何日かあとにメールでお知らせする。
--
--     送信そのものは Vercel の日次 Cron（/api/cron/followup）が行う。
--     ここには「誰に送るか」と「もう送ったか」だけを置く。
--
--     🚨 この2つの関数は service_role 専用。
--       メールアドレスを返すので、authenticated から呼べてはいけない。
-- ---------------------------------------------------------------------
create table if not exists public.followup_emails (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists followup_emails_user_kind_unique
  on public.followup_emails(user_id, kind);

alter table public.followup_emails enable row level security;
-- ポリシーを作らない ＝ RLS を迂回できる service_role だけが読み書きできる
revoke all on public.followup_emails from anon, authenticated;

--  送る相手。まだカードを登録していない簡易登録の方のうち、
--  登録から p_min_age 以上たっていて、その種類をまだ送っていない人。
create or replace function public.followup_candidates(p_kind text, p_min_age interval)
returns table (user_id uuid, email text, username text)
language sql stable security definer set search_path = public
as $$
  select p.id, u.email::text, coalesce(p.username, 'ゲスト')
    from public.profiles p
    join auth.users u on u.id = p.id
   where coalesce(p.account_type, 'full') = 'simple'
     and coalesce(p.card_registered, false) = false
     and u.email is not null
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     and p.created_at <= now() - p_min_age
     and not exists (
           select 1 from public.followup_emails f
            where f.user_id = p.id and f.kind = p_kind)
   order by p.created_at
   limit 200;
$$;

--  送った記録。二重送信を止めるのはこの一意制約（on conflict do nothing）。
create or replace function public.record_followup_email(p_user uuid, p_kind text)
returns boolean
language sql security definer set search_path = public
as $$
  insert into public.followup_emails (user_id, kind)
  values (p_user, p_kind)
  on conflict (user_id, kind) do nothing
  returning true;
$$;

revoke all on function public.followup_candidates(text, interval)
  from public, anon, authenticated;
revoke all on function public.record_followup_email(uuid, text)
  from public, anon, authenticated;
grant execute on function public.followup_candidates(text, interval) to service_role;
grant execute on function public.record_followup_email(uuid, text)   to service_role;

-- ---------------------------------------------------------------------
-- 10. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  -- 料金（pricing.js と一致すること）
  if public.invite_discount() <> 3800 then
    raise exception '検算失敗: invite_discount() が %（期待 3800）', public.invite_discount();
  end if;
  if public.join_charge_of(2, 'invite') <> 3800 then
    raise exception '検算失敗: 招待割のお支払いが %（期待 3800）', public.join_charge_of(2, 'invite');
  end if;
  if public.join_charge_of(2, 'split') <> 3800 then
    raise exception '検算失敗: 各自払いのお支払いが %（期待 3800）', public.join_charge_of(2, 'split');
  end if;
  if public.join_charge_of(2, 'bundle') <> 7600 then
    raise exception '検算失敗: まとめ払いのお支払いが %（期待 7600）', public.join_charge_of(2, 'bundle');
  end if;
  if public.join_charge_of(1, 'bundle') <> 7600 then
    raise exception '検算失敗: 1人参加のお支払いが %（期待 7600）', public.join_charge_of(1, 'bundle');
  end if;
  raise notice '✓ 料金: 既存会員(各自)=3800 / 招待割=3800 / まとめ=7600 / 1人=7600';

  if not ('invite' = any (public.pay_modes())) then
    raise exception '検算失敗: pay_modes() に invite がありません';
  end if;
  raise notice '✓ pay_modes に invite を追加';

  -- 招待コードがテーブルから直接読めないこと（列単位の SELECT 権限が無いこと）。
  -- ⚠ privilege_type を絞ること。Supabase の既定で UPDATE/REFERENCES は
  --   全列に付いたままなので、絞らないと必ず引っかかる
  --   （UPDATE は RLS に更新ポリシーが無いので実際には通らない）。
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'join_requests'
       and grantee in ('anon', 'authenticated')
       and privilege_type = 'SELECT'
       and column_name in ('invite_code', 'invited_user_id')
  ) into v_ok;
  if v_ok then raise exception '検算失敗: join_requests.invite_code が読めてしまいます'; end if;

  -- 更新ポリシーが無いこと（あると invite_code を自分で書き換えられる）
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'join_requests'
       and cmd in ('UPDATE', 'ALL')
  ) into v_ok;
  if v_ok then raise exception '検算失敗: join_requests に UPDATE ポリシーがあります'; end if;
  raise notice '✓ 参加申請の招待コードは列単位で遮断されている（更新ポリシーも無し）';

  -- 招待の引き受けは authenticated だけ（anon は不可）
  select has_function_privilege('anon', 'public.claim_invite(text)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: claim_invite を anon が実行できます'; end if;
  select has_function_privilege('anon', 'public.invite_preview(text)', 'execute') into v_ok;
  if not v_ok then raise exception '検算失敗: invite_preview を anon が実行できません'; end if;
  raise notice '✓ 招待リンク: 表示は未登録でも可 / 引き受けは要ログイン';

  -- 追いかけメールはメールアドレスを返す ＝ service_role 専用
  select has_function_privilege('authenticated',
    'public.followup_candidates(text, interval)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: followup_candidates を authenticated が実行できます'; end if;
  select has_function_privilege('anon',
    'public.followup_candidates(text, interval)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: followup_candidates を anon が実行できます'; end if;
  select has_function_privilege('service_role',
    'public.followup_candidates(text, interval)', 'execute') into v_ok;
  if not v_ok then raise exception '検算失敗: followup_candidates を service_role が実行できません'; end if;
  raise notice '✓ 追いかけメールの宛先取得は service_role 専用';

  raise notice '=== migration_invite_discount.sql 適用完了 ===';
end $$;
