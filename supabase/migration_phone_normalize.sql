-- =====================================================================
--  AISEKI — 電話番号を「日本の携帯番号」に絞り、E.164 に正規化する（2026-08-29）
--
--  冪等（何度流しても同じ）。
--
--  ── なぜ ────────────────────────────────────────────
--  §24 の CHECK は `^[0-9+()\- ]{8,20}$`（数字を1つ含む）と緩く、
--  `00000000` や `--------1` のような番号が通ってしまっていた。
--  SMS 認証を入れるまでの間、せめて**掛からない番号は弾く**。
--
--  ⚠ これは SMS 認証の代わりにはならない。
--    「その番号が実在し、本人のものである」ことは確認していない。
--    本人確認は Twilio 等を入れて初めて成立する（HANDOFF §25）。
--
--  ── 何をするか ──────────────────────────────────────
--  ・保存形は **E.164（+81XXXXXXXXX）** に統一する。
--    Twilio に渡す形がこれなので、後から入れるときに変換が要らない。
--  ・受け付けるのは日本の携帯（070 / 080 / 090）だけ。
--    SMS を送る前提なので固定電話は受け付けない。
--  ・全角・ハイフン・空白・国番号つきの表記はすべて吸収する。
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. 正規化関数（唯一の出典）
--
--     🚨 画面（src/lib/api.js の normalizePhone / isValidPhone）と
--       同じ規則にしてあること。片方だけ変えると、画面を通ったのに
--       保存で CHECK に落ちる（§24 の注意と同じ）。
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone_jp(p_raw text)
returns text
language plpgsql immutable
as $$
declare
  v text := coalesce(p_raw, '');
begin
  --  全角の数字・記号を半角へ
  v := translate(v,
        '０１２３４５６７８９＋（）－ー―‐',
        '0123456789+()-----');
  --  数字と + 以外は捨てる（ハイフン・空白・括弧など）
  v := regexp_replace(v, '[^0-9+]', '', 'g');

  if v = '' then return null; end if;

  --  国番号つきの表記を 0 始まりへ寄せる
  --    +81 90.... / 81 90.... / 0081 90....
  v := regexp_replace(v, '^(\+81|0081|81)', '0');

  --  日本の携帯（070 / 080 / 090 ＋ 8桁）だけを受け付ける
  if v ~ '^0[789]0[0-9]{8}$' then
    return '+81' || substring(v from 2);
  end if;

  return null;   -- それ以外は「番号として受け取らない」
end $$;

comment on function public.normalize_phone_jp(text) is
  '電話番号を E.164(+81…) に正規化する。日本の携帯(070/080/090)以外は null を返す。画面の normalizePhone と同じ規則。';

-- ---------------------------------------------------------------------
--  2. 既存の値を新しい形へ寄せる
--     （寄せられないものは null にする。掛からない番号を残す意味が無い）
-- ---------------------------------------------------------------------
update public.profiles
   set phone_number = public.normalize_phone_jp(phone_number)
 where phone_number is not null
   and phone_number is distinct from public.normalize_phone_jp(phone_number);

-- ---------------------------------------------------------------------
--  3. CHECK を E.164 に締め直す
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_phone_number_fmt;
alter table public.profiles add constraint profiles_phone_number_fmt
  check (phone_number is null or phone_number ~ '^\+81[789]0[0-9]{8}$');

comment on column public.profiles.phone_number is
  '後日の年齢確認・本人確認用の電話番号。E.164(+81…) で保存する。他のユーザーには開示しない（列単位の SELECT 権限を付けないこと）。⚠ SMS 認証は未実装なので「実在する本人の番号」ではない。';

-- ---------------------------------------------------------------------
--  4. 受け取り口を正規化関数に通す
--
--     ⚠ 画面が正規化して送ってきても、REST を直接叩けば何でも送れる。
--       サーバ側で必ず通し直すこと。
--     ⚠ real_name（§22）の受け取りは消さないこと。
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_birth  date;
  v_age    int;
  v_kind   text;
  v_intent text;
  v_real   text;
  v_phone  text;
begin
  v_birth := nullif(new.raw_user_meta_data->>'birth_date', '')::date;
  v_age   := coalesce(
    public.age_from_birth_date(v_birth),
    nullif(new.raw_user_meta_data->>'age', '')::int
  );

  if v_age is null then
    raise exception '年齢確認のため生年月日の登録が必要です';
  end if;
  if v_age < public.min_age() then
    raise exception '本サービスは%歳未満の方はご利用いただけません', public.min_age();
  end if;

  v_kind := coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'full');
  if not (v_kind = any (public.account_types())) then v_kind := 'full'; end if;

  v_intent := nullif(new.raw_user_meta_data->>'signup_intent', '');
  if v_intent is not null and v_intent not in ('host', 'guest') then
    v_intent := null;
  end if;

  v_real := nullif(btrim(coalesce(new.raw_user_meta_data->>'real_name', '')), '');
  if v_real is not null then v_real := left(v_real, 60); end if;

  --  掛からない番号は null にする（登録そのものは落とさない）
  v_phone := public.normalize_phone_jp(new.raw_user_meta_data->>'phone_number');

  insert into public.profiles (
    id, username, gender, age, birth_date, age_verified_at,
    referral_code, account_type, signup_intent, real_name, phone_number
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'gender',
    v_age,
    v_birth,
    now(),
    public.gen_referral_code(),
    v_kind,
    v_intent,
    v_real,
    v_phone
  )
  on conflict (id) do nothing;

  insert into public.point_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_my_phone_number(p_phone text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is null then
    update public.profiles set phone_number = null where id = v_uid;
    return null;
  end if;
  v_phone := public.normalize_phone_jp(p_phone);
  if v_phone is null then
    raise exception '携帯電話番号（070/080/090）を正しく入力してください';
  end if;
  update public.profiles set phone_number = v_phone where id = v_uid;
  return v_phone;
end $$;

revoke all on function public.set_my_phone_number(text) from public, anon;
grant execute on function public.set_my_phone_number(text) to authenticated;
revoke all on function public.normalize_phone_jp(text) from public, anon;

-- ---------------------------------------------------------------------
--  5. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_n int;
begin
  --  正規化の規則（画面側と同じ表を使うこと）
  if public.normalize_phone_jp('090-1234-5678') is distinct from '+819012345678' then
    raise exception '検算失敗: 090-1234-5678 が +819012345678 になりません';
  end if;
  if public.normalize_phone_jp('０９０１２３４５６７８') is distinct from '+819012345678' then
    raise exception '検算失敗: 全角が正規化されません';
  end if;
  if public.normalize_phone_jp('+81 90 1234 5678') is distinct from '+819012345678' then
    raise exception '検算失敗: +81 表記が正規化されません';
  end if;
  if public.normalize_phone_jp('08012345678') is distinct from '+818012345678' then
    raise exception '検算失敗: 080 が正規化されません';
  end if;
  raise notice '✓ 正規化: 090/080/全角/+81 いずれも E.164 になる';

  --  弾けていること
  if public.normalize_phone_jp('00000000')   is not null then raise exception '検算失敗: 00000000 が通ります'; end if;
  if public.normalize_phone_jp('--------1')  is not null then raise exception '検算失敗: --------1 が通ります'; end if;
  if public.normalize_phone_jp('0312345678') is not null then raise exception '検算失敗: 固定電話が通ります'; end if;
  if public.normalize_phone_jp('でたらめ')    is not null then raise exception '検算失敗: 文字列が通ります'; end if;
  raise notice '✓ 掛からない番号・固定電話は受け取らない';

  --  受け取り口が正規化を通っていること
  if pg_get_functiondef('public.handle_new_user()'::regprocedure) not ilike '%normalize_phone_jp%' then
    raise exception '検算失敗: handle_new_user が正規化を通っていません';
  end if;
  if pg_get_functiondef('public.handle_new_user()'::regprocedure) not ilike '%real_name%' then
    raise exception '検算失敗: handle_new_user がご本名を取り込まなくなっています';
  end if;
  raise notice '✓ handle_new_user は正規化を通し、ご本名も残っている';

  --  🚨 他のユーザーから読めないこと（§24 から変わっていないこと）
  select count(*) into v_n from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and column_name in ('phone_number','real_name') and grantee in ('anon','authenticated')
     and privilege_type in ('SELECT','INSERT','UPDATE');
  if v_n <> 0 then
    raise exception '検算失敗: 氏名・電話番号に anon/authenticated の権限が % 件あります', v_n;
  end if;
  raise notice '✓ 氏名・電話番号は引き続き他のユーザーから読めない';

  --  残っている値がすべて新しい形であること
  select count(*) into v_n from public.profiles
   where phone_number is not null and phone_number !~ '^\+81[789]0[0-9]{8}$';
  if v_n <> 0 then raise exception '検算失敗: 旧形式の番号が % 件残っています', v_n; end if;
  raise notice '✓ 保存済みの番号はすべて E.164';

  raise notice '=== migration_phone_normalize.sql 適用完了 ===';
end $$;
