-- =====================================================================
--  AISEKI — 招待割は「相方が登録を完了した時点」で適用する（2026-08-29）
--
--  migration_invite_discount.sql の続き。冪等（何度流しても同じ）。
--
--  ── 何を変えたか ────────────────────────────────────
--  招待割（-3,800pt）が効くタイミングを、
--    旧: 招待リンクを発行した時点（＝「招待して呼ぶ」を選んだだけ）
--    新: 招待された方が実際に簡易登録を完了して枠を引き受けた時点
--  に変えた。
--
--    リンク発行だけ … 参加費 7,600pt ／ お支払い 7,600pt（割引なし）
--    相方が登録完了 … 参加費 7,600pt − 招待割 3,800pt ＝ お支払い 3,800pt
--
--  ── なぜ ────────────────────────────────────────
--  リンクを出しただけで割り引くと、誰も呼ばずに「招待して呼ぶ」を選ぶだけで
--  半額になってしまう（承認時に相方の席は名前だけの未登録席になる）。
--  実際に人が増えたときにだけ割り引く。
--
--  🚨 判定は `join_requests.invited_user_id is not null` ひとつ。
--    決済が起きるのは承認の瞬間なので、そこで見た状態がそのまま料金になる。
--    「リンクを送った」「プレビューを開いた」では割り引かない。
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. 請求額（唯一の出典）
--
--     🚨 引数は増やさない。`join_charge_of(int, text)` のまま中身だけ変え、
--       「相方が登録を終えているか」を見る版は別名にする。
--       同じ名前で引数を増やすと、前の migration を流し直したときに
--       2つのシグネチャが並んで「関数が一意でない」で全部落ちる
--       （HANDOFF §17 / §18 の create_group_seats・grant_card_bonus と同じ形）。
-- ---------------------------------------------------------------------

--  引数を増やした版を一度でも作った環境のための後始末。
--  残っていると同名2つになり、呼び出しが「関数が一意でない」で落ちる。
drop function if exists public.join_charge_of(int, text, boolean);
drop function if exists public.join_charge_preview(int, text, boolean);

--  申し込む時点の請求額。招待（invite）は【割引なし】＝ 7,600pt。
--  リンクを出しただけでは安くならない。
create or replace function public.join_charge_of(p_size int, p_mode text)
returns int language sql stable set search_path = public as $$
  select case
           when p_mode = 'split' then public.join_fee_total(p_size) / 2
           else public.join_fee_total(p_size)
         end
$$;

--  決済の時点の請求額。招待割は「相方が簡易登録を完了している」ときだけ引く。
--  🚨 accept_join_request() はこちらを通すこと。
create or replace function public.join_charge_claimed(
  p_size int,
  p_mode text,
  p_invite_claimed boolean
)
returns int language sql stable set search_path = public as $$
  select case
           when p_mode = 'invite' and coalesce(p_invite_claimed, false) then greatest(
                  public.join_charge_of(p_size, p_mode) - public.invite_discount(), 0)
           else public.join_charge_of(p_size, p_mode)
         end
$$;

-- ---------------------------------------------------------------------
--  2. 申し込む前の金額（表示用）
--
--     discount              … いま効いている割引。招待はまだ 0
--     discount_when_claimed … 相方が登録を終えたら引かれる額（案内用）
--     ⚠ こちらも引数を増やさない。相方の登録後の金額は my_join_invite() が返す。
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
    --  申し込む時点では招待割はまだ効かない（相方が登録していないため）
    'discount',      0,
    'discount_when_claimed',
                     case when p_mode = 'invite'
                          then least(public.invite_discount(), public.join_fee_total(p_size))
                          else 0 end,
    'my_charge',     public.join_charge_of(p_size, p_mode),
    'my_balance',    coalesce(
                       (select balance from public.point_balances where user_id = auth.uid()), 0)
  );
$$;

-- ---------------------------------------------------------------------
--  3. 自分が発行した招待リンク（いまいくら払うことになるかも返す）
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
    'invited_name', (select p.username from public.profiles p where p.id = r.invited_user_id),
    'total',        public.join_fee_total(r.group_size),
    'charge',       public.join_charge_claimed(r.group_size, r.pay_mode, r.invited_user_id is not null),
    'discount_when_claimed', public.invite_discount()
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
--  4. ホストの受信箱に出す「承認するといくら預かるか」
--
--     招待割が効いているかどうかで額が変わるが、ホストは
--     invited_user_id を読めない（列単位で遮断してある）。
--     自分がホストの会の分だけ、金額と「相方が登録済みか」を返す。
--
--     🚨 返してよいのは金額と真偽値だけ。招待された方の
--       ユーザーIDや表示名を足さないこと（承認前に相手の素性を渡さない §1）。
-- ---------------------------------------------------------------------
create or replace function public.list_incoming_request_charges()
returns table (request_id uuid, invite_claimed boolean, total int, charge int)
language sql stable security definer set search_path = public
as $$
  select r.id,
         (r.invited_user_id is not null),
         public.join_fee_total(r.group_size),
         public.join_charge_claimed(r.group_size, r.pay_mode, r.invited_user_id is not null)
    from public.join_requests r
    join public.parties p on p.id = r.party_id
   where p.host_id = auth.uid()
     and r.status = 'pending';
$$;

-- ---------------------------------------------------------------------
--  5. 承認 ＝ マッチ成立 ＝ 決済
--
--     migration_invite_discount.sql の版から、請求額の求め方だけを変えた。
--     承認の瞬間に「相方が登録を終えているか」を見て割引を決める。
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
  v_claimed  boolean;
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
  --  招待割の可否。ここで見た状態がそのまま料金になる。
  v_claimed  := (v_req.invited_user_id is not null);

  -- 空き枠は「宣言された人数」ではなく実際の席数で判定する
  select count(*) into v_seats from public.party_members where party_id = v_req.party_id;
  if v_seats + v_billable > v_party.max_members then
    raise exception '残りの枠が足りません';
  end if;

  -- ── 誰がいくら払うか ────────────────────────────
  --   まとめ払い … 代表者が全額
  --   各自払い   … 代表者と相方が半分ずつ
  --   招待       … 相方が登録を終えていれば「招待割」を引いた額。
  --                 まだなら割引なし（全額）
  v_total := v_fee * v_billable;
  if v_req.pay_mode = 'split' and v_req.partner_id is not null then
    v_self    := public.join_charge_of(v_req.group_size, 'split');
    v_partner := v_total - v_self;
  else
    v_self    := public.join_charge_claimed(v_req.group_size, v_req.pay_mode, v_claimed);
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
  --   ⚠ この場合は割引が効いていない（全額を頂いている）。あとから
  --     登録されても遡って返金はしない（返金は refund_join_payment だけ）。
  if v_req.pay_mode = 'invite'
     and not v_claimed
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
  select coalesce(sum(public.billable_guests(group_size)), 0) into v_taken
    from public.join_requests
   where party_id = v_req.party_id and status = 'accepted';

  if v_taken >= v_party.guest_group_size then
    update public.parties set status = 'matched'
     where id = v_req.party_id and status not in ('completed', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------
--  6. 権限
--     ⚠ Supabase の既定で「public スキーマの全関数」に EXECUTE が付く。
--       新しい／作り直した関数は、要らない相手から明示的に revoke すること。
-- ---------------------------------------------------------------------
revoke all on function public.join_charge_preview(int, text)   from public, anon;
revoke all on function public.list_incoming_request_charges()  from public, anon;

grant execute on function public.join_charge_of(int, text)             to anon, authenticated;
grant execute on function public.join_charge_claimed(int, text, boolean) to anon, authenticated;
grant execute on function public.join_charge_preview(int, text)        to authenticated;
grant execute on function public.my_join_invite(uuid)                  to authenticated;
grant execute on function public.list_incoming_request_charges()       to authenticated;

-- ---------------------------------------------------------------------
--  7. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_ok  boolean;
  v_n   int;
begin
  -- 同じ名前が2つ以上あってはいけない（あると呼び分けできず全部落ちる）
  for v_n in
    select count(*) from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname in ('join_charge_of', 'join_charge_preview', 'join_charge_claimed')
     group by p.proname
  loop
    if v_n <> 1 then
      raise exception '検算失敗: 料金の関数が % 個ある（それぞれ1個であること）', v_n;
    end if;
  end loop;
  raise notice '✓ 料金の関数は名前ごとに1つだけ（引数を増やしていない）';

  -- 招待割は「登録が完了したときだけ」
  if public.join_charge_of(2, 'invite') <> 7600 then
    raise exception '検算失敗: 申し込み時の招待が %（期待 7600）', public.join_charge_of(2, 'invite');
  end if;
  if public.join_charge_claimed(2, 'invite', false) <> 7600 then
    raise exception '検算失敗: 未登録の招待が %（期待 7600）', public.join_charge_claimed(2, 'invite', false);
  end if;
  if public.join_charge_claimed(2, 'invite', true) <> 3800 then
    raise exception '検算失敗: 登録済みの招待が %（期待 3800）', public.join_charge_claimed(2, 'invite', true);
  end if;
  -- ほかの導線は変わっていないこと
  if public.join_charge_of(2, 'split') <> 3800
     or public.join_charge_claimed(2, 'split', true) <> 3800 then
    raise exception '検算失敗: 各自払いが 3800 でない';
  end if;
  if public.join_charge_of(2, 'bundle') <> 7600 or public.join_charge_of(1, 'bundle') <> 7600 then
    raise exception '検算失敗: まとめ払い／1人参加が 7600 でない';
  end if;
  raise notice '✓ 招待割は相方の登録完了後だけ（未登録=7600 / 登録済=3800）';

  -- 見積りの内訳
  if (public.join_charge_preview(2, 'invite') ->> 'discount')::int <> 0 then
    raise exception '検算失敗: 申し込み時の見積りに割引が入っている';
  end if;
  if (public.join_charge_preview(2, 'invite') ->> 'my_charge')::int <> 7600 then
    raise exception '検算失敗: 申し込み時の見積りが 7600 でない';
  end if;
  if (public.join_charge_preview(2, 'invite') ->> 'discount_when_claimed')::int <> 3800 then
    raise exception '検算失敗: 登録後に引かれる額の案内が 3800 でない';
  end if;
  if (public.join_charge_preview(2, 'bundle') ->> 'discount_when_claimed')::int <> 0 then
    raise exception '検算失敗: 招待以外に「登録後の割引」を案内している';
  end if;
  raise notice '✓ 見積りの内訳（discount=0 / discount_when_claimed=3800）';

  -- ホスト向けの金額 RPC は authenticated だけ
  select has_function_privilege('anon', 'public.list_incoming_request_charges()', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: list_incoming_request_charges を anon が実行できます'; end if;
  raise notice '✓ ホスト向けの金額 RPC は要ログイン';

  raise notice '=== migration_invite_discount_on_signup.sql 適用完了 ===';
end $$;
