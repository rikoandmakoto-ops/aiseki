-- =====================================================================
--  AISEKI — SMS（電話番号）認証（2026-08-30）
--
--  冪等（何度流しても同じ）。
--
--  ── 何を入れるか ────────────────────────────────────
--  ・profiles.phone_verified / phone_verified_at
--  ・本人だけが自分の状態を見る my_phone_status()
--  ・電話番号を変えたら認証は自動で外れる（on_profile_phone_verify_reset）
--  ・認証済みの番号は1アカウントにつき1つ（部分一意索引）
--  ・**認証が済むまで「会を立てる」「参加を申し込む」「相方として同意する」を通さない**
--    （HANDOFF §25-a の案A ＝ メール確認 → 初回ログイン → SMS認証 → 参加許可）
--  ・送信・照合の回数制限（phone_verify_attempts + service_role 専用の関数）
--
--  ── 実際にコードを送るのはサーバ側 ──────────────────
--  Twilio Verify を叩くのは `api/sms/start.js` / `api/sms/check.js`。
--  OTP は Twilio が持つので、このスキーマにコードは一切保存しない。
--
--  🚨 phone_verified を authenticated の列単位 UPDATE 権限に足さないこと。
--    足した瞬間に、SMS を受け取らずに REST から自分を認証済みにできる。
--    書き換えてよいのは service_role（＝ sms_verify_mark）だけ。
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. 列
--
--     ⚠ profiles は列単位で権限を配ってある（§12 / §24）。
--       新しい列には anon / authenticated の権限が付かないので、
--       ここでは何も grant しない（＝それが正しい状態）。
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists phone_verified boolean not null default false;
alter table public.profiles add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.phone_verified is
  'SMS認証（Twilio Verify）で本人の受信を確認できた番号かどうか。書き換えてよいのは service_role のみ。電話番号を変えると自動で false に戻る。';

--  番号が入っていないのに認証済み、という状態を作らせない
alter table public.profiles drop constraint if exists profiles_phone_verified_needs_number;
alter table public.profiles add constraint profiles_phone_verified_needs_number
  check (not phone_verified or phone_number is not null);

--  🚨 認証済みの番号は1アカウントにつき1つ。
--    （§17 のカード1枚＝1アカウントと同じ考え方。ここを開けると
--      番号を1つ持っているだけでアカウントを量産できる）
create unique index if not exists profiles_phone_verified_uniq
  on public.profiles (phone_number) where phone_verified;

-- ---------------------------------------------------------------------
--  2. 電話番号を変えたら認証は外れる
--
--     set_my_phone_number() は本人が何度でも呼べる。認証済みのまま
--     番号だけ差し替えられると「認証済み」の意味が無くなる。
--     関数側ではなくテーブル側で外す（§12「関数側だけの規則はテーブル側にも要る」）。
-- ---------------------------------------------------------------------
create or replace function public.reset_phone_verified()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.phone_number is distinct from old.phone_number then
    new.phone_verified    := false;
    new.phone_verified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists on_profile_phone_verify_reset on public.profiles;
create trigger on_profile_phone_verify_reset
  before update on public.profiles
  for each row execute function public.reset_phone_verified();

-- ---------------------------------------------------------------------
--  3. 本人が自分の状態を見る（他人の分は取れない）
--
--     ⚠ 引数を取らない。auth.uid() 固定
--       （[[aiseki-security-definer-rpc-must-bind-caller]] / §11 の教訓）。
-- ---------------------------------------------------------------------
create or replace function public.my_phone_status()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
           'phone_number', p.phone_number,
           'verified',     coalesce(p.phone_verified, false),
           'verified_at',  p.phone_verified_at
         )
    from public.profiles p
   where p.id = auth.uid();
$$;

comment on function public.my_phone_status() is
  '自分の電話番号とSMS認証の状態。auth.uid() 固定なので他人の分は取れない。';

revoke all on function public.my_phone_status() from public, anon;
grant execute on function public.my_phone_status() to authenticated;

-- ---------------------------------------------------------------------
--  4. 参加の関門
--
--     assert_legal_age() と同じ形。認証が済むまで
--     「会を立てる」「参加を申し込む」「相方として同意する」を通さない。
-- ---------------------------------------------------------------------
create or replace function public.is_phone_verified(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select phone_verified from public.profiles where id = p_user), false);
$$;

create or replace function public.assert_phone_verified(p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_phone_verified(p_user) then
    raise exception 'ご利用にはSMS認証が必要です。マイページから電話番号の認証を行ってください';
  end if;
end $$;

--  🚨 他人について判定できると、番号を登録しているかどうかが漏れる。
--    どちらも authenticated からは呼ばせない（画面は my_phone_status() を使う）。
revoke all on function public.is_phone_verified(uuid)     from public, anon, authenticated;
revoke all on function public.assert_phone_verified(uuid) from public, anon, authenticated;

-- 会を立てる
create or replace function public.enforce_party_phone_verified()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_phone_verified(new.host_id);
  return new;
end $$;

drop trigger if exists on_party_phone_verified on public.parties;
create trigger on_party_phone_verified
  before insert on public.parties
  for each row execute function public.enforce_party_phone_verified();

-- 参加を申し込む
--   ⚠ 相方（partner_id）はここでは見ない。相方が実際に加わるのは
--     confirm_join_partner を通ったときで、そちらで見る。
create or replace function public.enforce_join_phone_verified()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_phone_verified(new.user_id);
  return new;
end $$;

drop trigger if exists on_join_request_phone_verified on public.join_requests;
create trigger on_join_request_phone_verified
  before insert on public.join_requests
  for each row execute function public.enforce_join_phone_verified();

-- 相方として同意する（＝ポイントが引かれる側になる）
--   migration_partner_consent.sql の定義に assert_phone_verified を足しただけ。
--   ⚠ 中身を変えるときは向こうも直すこと。
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
  perform public.assert_phone_verified(v_uid);

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

revoke all on function public.confirm_join_partner(uuid) from public, anon;
grant execute on function public.confirm_join_partner(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  5. 送信・照合の回数制限
--
--     Twilio Verify にも制限はあるが、こちらでも数える。
--     SMS は1通ごとに課金されるので、ログイン済みの1アカウントが
--     再送を押し続けるだけで費用が出る。
--
--     🚨 この表と関数は service_role だけが触れる。
--       画面から回数を書き換えられたら制限にならない。
-- ---------------------------------------------------------------------
create or replace function public.sms_resend_interval_seconds() returns int
  language sql immutable as $$ select 60 $$;
create or replace function public.sms_max_sends_per_day() returns int
  language sql immutable as $$ select 5 $$;
create or replace function public.sms_max_checks_per_hour() returns int
  language sql immutable as $$ select 15 $$;

create table if not exists public.phone_verify_attempts (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  phone_number            text,
  send_count              int not null default 0,
  send_window_started_at  timestamptz not null default now(),
  last_sent_at            timestamptz,
  check_count             int not null default 0,
  check_window_started_at timestamptz not null default now(),
  verified_at             timestamptz,
  updated_at              timestamptz not null default now()
);

comment on table public.phone_verify_attempts is
  'SMS認証の送信・照合の回数。service_role だけが読み書きする（RLS を有効にしてポリシーを1つも作らない）。';

alter table public.phone_verify_attempts enable row level security;
revoke all on table public.phone_verify_attempts from public, anon, authenticated;

--  送信の可否を判定して、通るときは回数を1つ進める（同じトランザクションで行う）。
--  戻り: { ok, reason, retry_after, remaining }
create or replace function public.sms_verify_begin(p_user uuid, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.phone_verify_attempts;
  v_gap int := public.sms_resend_interval_seconds();
  v_max int := public.sms_max_sends_per_day();
  v_wait int;
begin
  if p_user is null then raise exception 'p_user は必須です'; end if;

  insert into public.phone_verify_attempts (user_id, phone_number)
  values (p_user, p_phone)
  on conflict (user_id) do nothing;

  select * into v_row from public.phone_verify_attempts where user_id = p_user for update;

  --  24時間の窓が切れていたら数え直す
  if v_row.send_window_started_at < now() - interval '24 hours' then
    v_row.send_count := 0;
    v_row.send_window_started_at := now();
  end if;

  --  番号が変わったら数え直す（別の番号でやり直す人を巻き込まない）
  if v_row.phone_number is distinct from p_phone then
    v_row.send_count := 0;
    v_row.send_window_started_at := now();
    v_row.phone_number := p_phone;
  end if;

  --  連打の間隔
  if v_row.last_sent_at is not null
     and v_row.last_sent_at > now() - make_interval(secs => v_gap) then
    v_wait := ceil(extract(epoch from (v_row.last_sent_at + make_interval(secs => v_gap)) - now()));
    return jsonb_build_object('ok', false, 'reason', 'too_soon',
                              'retry_after', greatest(v_wait, 1), 'remaining', v_max - v_row.send_count);
  end if;

  --  1日あたりの上限
  if v_row.send_count >= v_max then
    v_wait := ceil(extract(epoch from (v_row.send_window_started_at + interval '24 hours') - now()));
    return jsonb_build_object('ok', false, 'reason', 'daily_limit',
                              'retry_after', greatest(v_wait, 1), 'remaining', 0);
  end if;

  update public.phone_verify_attempts
     set phone_number           = v_row.phone_number,
         send_count             = v_row.send_count + 1,
         send_window_started_at = v_row.send_window_started_at,
         last_sent_at           = now(),
         updated_at             = now()
   where user_id = p_user;

  return jsonb_build_object('ok', true, 'reason', null,
                            'retry_after', v_gap, 'remaining', v_max - v_row.send_count - 1);
end $$;

--  照合（コード入力）の回数。総当たりを止める。
create or replace function public.sms_verify_touch_check(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.phone_verify_attempts;
  v_max int := public.sms_max_checks_per_hour();
  v_wait int;
begin
  if p_user is null then raise exception 'p_user は必須です'; end if;

  insert into public.phone_verify_attempts (user_id) values (p_user)
  on conflict (user_id) do nothing;

  select * into v_row from public.phone_verify_attempts where user_id = p_user for update;

  if v_row.check_window_started_at < now() - interval '1 hour' then
    v_row.check_count := 0;
    v_row.check_window_started_at := now();
  end if;

  if v_row.check_count >= v_max then
    v_wait := ceil(extract(epoch from (v_row.check_window_started_at + interval '1 hour') - now()));
    return jsonb_build_object('ok', false, 'reason', 'check_limit', 'retry_after', greatest(v_wait, 1));
  end if;

  update public.phone_verify_attempts
     set check_count             = v_row.check_count + 1,
         check_window_started_at = v_row.check_window_started_at,
         updated_at              = now()
   where user_id = p_user;

  return jsonb_build_object('ok', true, 'reason', null, 'retry_after', 0);
end $$;

--  Twilio が approved を返したときだけ呼ぶ。ここが唯一の「認証済み」の付け方。
--  戻り: { ok, reason, phone_number }
create or replace function public.sms_verify_mark(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_phone text;
  v_dup   int;
begin
  if p_user is null then raise exception 'p_user は必須です'; end if;

  select phone_number into v_phone from public.profiles where id = p_user;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'no_phone', 'phone_number', null);
  end if;

  --  同じ番号で別のアカウントが認証済みなら通さない（番号1つ＝1アカウント）
  select count(*) into v_dup from public.profiles
   where phone_number = v_phone and phone_verified and id <> p_user;
  if v_dup > 0 then
    return jsonb_build_object('ok', false, 'reason', 'duplicate', 'phone_number', v_phone);
  end if;

  begin
    update public.profiles
       set phone_verified = true, phone_verified_at = now()
     where id = p_user;
  exception when unique_violation then
    --  索引で弾かれた（同時に走った場合）
    return jsonb_build_object('ok', false, 'reason', 'duplicate', 'phone_number', v_phone);
  end;

  update public.phone_verify_attempts
     set verified_at = now(), check_count = 0, send_count = 0, updated_at = now()
   where user_id = p_user;

  return jsonb_build_object('ok', true, 'reason', null, 'phone_number', v_phone);
end $$;

--  🚨 service_role 専用。anon / authenticated を名指しで revoke する
--    （public だけでは既定の grant が残る。[[aiseki-revoke-must-name-roles]]）
revoke all on function public.sms_verify_begin(uuid, text)  from public, anon, authenticated;
revoke all on function public.sms_verify_touch_check(uuid)  from public, anon, authenticated;
revoke all on function public.sms_verify_mark(uuid)         from public, anon, authenticated;
grant execute on function public.sms_verify_begin(uuid, text) to service_role;
grant execute on function public.sms_verify_touch_check(uuid) to service_role;
grant execute on function public.sms_verify_mark(uuid)        to service_role;

-- ---------------------------------------------------------------------
--  6. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_n  int;
  v_ok boolean;
begin
  --  列がある
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name in ('phone_verified','phone_verified_at');
  if v_n <> 2 then raise exception '検算失敗: phone_verified / phone_verified_at がありません'; end if;

  --  🚨 利用者からは書き換えられない（読めもしない）
  select count(*) into v_n from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and column_name in ('phone_verified','phone_verified_at')
     and grantee in ('anon','authenticated')
     and privilege_type in ('SELECT','INSERT','UPDATE');
  if v_n <> 0 then
    raise exception '検算失敗: phone_verified に anon/authenticated の権限が % 件あります', v_n;
  end if;
  raise notice '✓ phone_verified は利用者から読めず、書き換えられない';

  --  service_role 専用の関数が authenticated から呼べない
  select has_function_privilege('authenticated', 'public.sms_verify_mark(uuid)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: sms_verify_mark を authenticated が実行できます'; end if;
  select has_function_privilege('authenticated', 'public.sms_verify_begin(uuid, text)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: sms_verify_begin を authenticated が実行できます'; end if;
  select has_function_privilege('authenticated', 'public.sms_verify_touch_check(uuid)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: sms_verify_touch_check を authenticated が実行できます'; end if;
  select has_function_privilege('authenticated', 'public.assert_phone_verified(uuid)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: assert_phone_verified を authenticated が実行できます'; end if;
  select has_function_privilege('service_role', 'public.sms_verify_mark(uuid)', 'execute') into v_ok;
  if not v_ok then raise exception '検算失敗: sms_verify_mark を service_role が実行できません'; end if;
  raise notice '✓ 付与系の関数は service_role だけが呼べる';

  --  本人向けの RPC は authenticated だけ
  select has_function_privilege('anon', 'public.my_phone_status()', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: my_phone_status を anon が実行できます'; end if;
  select has_function_privilege('authenticated', 'public.my_phone_status()', 'execute') into v_ok;
  if not v_ok then raise exception '検算失敗: my_phone_status を authenticated が実行できません'; end if;
  if pg_get_functiondef('public.my_phone_status()'::regprocedure) not ilike '%auth.uid()%' then
    raise exception '検算失敗: my_phone_status が auth.uid() に固定されていません';
  end if;
  raise notice '✓ my_phone_status は本人分だけを返す';

  --  関門のトリガが両方に付いている
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and t.tgname in ('on_party_phone_verified','on_join_request_phone_verified')
     and c.relname in ('parties','join_requests');
  if v_n <> 2 then raise exception '検算失敗: 参加の関門トリガが % 件しかありません', v_n; end if;
  if pg_get_functiondef('public.confirm_join_partner(uuid)'::regprocedure) not ilike '%assert_phone_verified%' then
    raise exception '検算失敗: confirm_join_partner が SMS認証を見ていません';
  end if;
  raise notice '✓ 会の作成・参加申込・相方の同意は SMS認証が必要';

  --  番号を変えたら認証が外れる
  if pg_get_functiondef('public.reset_phone_verified()'::regprocedure) not ilike '%phone_verified%' then
    raise exception '検算失敗: reset_phone_verified が認証を外していません';
  end if;
  select count(*) into v_n from pg_trigger where tgname = 'on_profile_phone_verify_reset' and not tgisinternal;
  if v_n <> 1 then raise exception '検算失敗: on_profile_phone_verify_reset がありません'; end if;
  raise notice '✓ 電話番号を変えると認証は外れる';

  --  認証済みの番号は1つのアカウントだけ
  if to_regclass('public.profiles_phone_verified_uniq') is null then
    raise exception '検算失敗: profiles_phone_verified_uniq がありません';
  end if;
  raise notice '✓ 認証済みの番号は1アカウントにつき1つ';

  --  回数制限の表は service_role だけ
  select count(*) into v_n from information_schema.table_privileges
   where table_schema='public' and table_name='phone_verify_attempts'
     and grantee in ('anon','authenticated');
  if v_n <> 0 then
    raise exception '検算失敗: phone_verify_attempts に anon/authenticated の権限が % 件あります', v_n;
  end if;
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='phone_verify_attempts';
  if v_n <> 0 then raise exception '検算失敗: phone_verify_attempts にポリシーがあります（service_role 専用のはず）'; end if;
  raise notice '✓ 回数制限の表は service_role だけが触れる';

  --  §24 / §25-b が壊れていない
  select count(*) into v_n from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and column_name in ('phone_number','real_name') and grantee in ('anon','authenticated')
     and privilege_type in ('SELECT','INSERT','UPDATE');
  if v_n <> 0 then raise exception '検算失敗: 氏名・電話番号の権限が % 件あります', v_n; end if;
  if public.normalize_phone_jp('090-1234-5678') is distinct from '+819012345678' then
    raise exception '検算失敗: normalize_phone_jp が壊れています';
  end if;
  raise notice '✓ 氏名・電話番号の非公開と E.164 正規化は据え置き';

  raise notice '=== migration_sms_verify.sql 適用完了 ===';
end $$;
