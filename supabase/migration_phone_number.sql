-- =====================================================================
--  AISEKI — 電話番号を預かる（2026-08-29）
--
--  冪等（何度流しても同じ）。
--
--  ── 何を足したか ────────────────────────────────────
--  `profiles.phone_number`。通常登録・簡易登録の**どちらでも**取得する。
--  用途は後日の年齢確認・本人確認および安全な運営（`real_name` と同じ枠）。
--
--  🚨 電話番号は「他のユーザーには一切見せない」。
--    ・列単位の SELECT 権限を anon / authenticated に **付けない**
--      （profiles の権限は列ごとに明示してあるので、足しただけでは誰も読めない）
--    ・同じ会のメンバーにも見えない
--    ・本人が自分の分を見る経路だけ my_phone_number() で開ける（auth.uid() 固定）
--    ・運営（service_role）は通報対応のために読める
--
--    §11 の gender / §22 の real_name とまったく同じ形。
--    ここを緩めて一覧や party_host_preview() に足すと、
--    マッチ前の他人に連絡先が渡ることになる。**絶対に足さないこと。**
--    （個人間の連絡手段を渡すことは、DM を実装しない前提＝§1 とも衝突する。）
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. 列
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists phone_number text;

--  形式は緩く見る（+ 半角数字 - ( ) 空白のみ・8〜20文字）。
--  国際表記や市外局番の書き方を縛ると、正しい番号まで弾いてしまう。
alter table public.profiles drop constraint if exists profiles_phone_number_fmt;
alter table public.profiles add constraint profiles_phone_number_fmt
  check (
    phone_number is null
    or (phone_number ~ '^[0-9+()\- ]{8,20}$' and phone_number ~ '[0-9]')
  );

comment on column public.profiles.phone_number is
  '後日の年齢確認・本人確認用の電話番号。他のユーザーには開示しない（列単位の SELECT 権限を付けないこと）。';

-- ---------------------------------------------------------------------
--  2. 登録時に受け取る
--
--     handle_new_user() は security definer なので列の権限を通らない。
--     ⚠ real_name（§22）の内容はそのまま残すこと。ここで上書きすると
--       ご本名の受け取りが消える。
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

  --  ご本名。長すぎるものは切る（登録そのものは落とさない）。
  v_real := nullif(btrim(coalesce(new.raw_user_meta_data->>'real_name', '')), '');
  if v_real is not null then v_real := left(v_real, 60); end if;

  --  電話番号。CHECK に通らない形なら null にする（登録そのものは落とさない）。
  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone_number', '')), '');
  if v_phone is not null
     and not (v_phone ~ '^[0-9+()\- ]{8,20}$' and v_phone ~ '[0-9]') then
    v_phone := null;
  end if;

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

  -- 登録ボーナスはここでは付けない。カード登録後に grant_card_bonus() が付ける。
  insert into public.point_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  3. 本人だけが読み書きできる経路
--
--     🚨 引数で他人の UUID を渡せる形にしないこと（§11 の
--       can_approach_party と同じ理由）。auth.uid() に固定する。
-- ---------------------------------------------------------------------
create or replace function public.my_phone_number()
returns text
language sql stable security definer set search_path = public
as $$
  select phone_number from public.profiles where id = auth.uid();
$$;

create or replace function public.set_my_phone_number(p_phone text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  if v_phone is not null
     and not (v_phone ~ '^[0-9+()\- ]{8,20}$' and v_phone ~ '[0-9]') then
    raise exception '電話番号の形式が正しくありません';
  end if;
  update public.profiles set phone_number = v_phone where id = v_uid;
  return v_phone;
end $$;

--  既定で public スキーマの全関数に EXECUTE が付くので、anon は名指しで落とす
--  （§20「新しく作った関数は anon から revoke する」）。
revoke all on function public.my_phone_number()           from public, anon;
revoke all on function public.set_my_phone_number(text)   from public, anon;
grant execute on function public.my_phone_number()           to authenticated;
grant execute on function public.set_my_phone_number(text)   to authenticated;

-- ---------------------------------------------------------------------
--  4. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_n  int;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_number'
  ) then
    raise exception '検算失敗: profiles.phone_number がありません';
  end if;

  -- 🚨 いちばん大事な検算。他のユーザーから読み書きできてはいけない。
  --    ⚠ REFERENCES / TRIGGER は表全体に付いていて全列に出てくるので、
  --      見るのは SELECT / INSERT / UPDATE だけ（§22 の注意）。
  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and column_name = 'phone_number' and grantee in ('anon', 'authenticated')
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE');
  if v_n <> 0 then
    raise exception '検算失敗: profiles.phone_number に anon/authenticated の権限が % 件あります', v_n;
  end if;
  raise notice '✓ 電話番号は anon / authenticated から読めない（列単位の権限なし）';

  -- ご本名の受け取りが残っていること（この migration で消していないか）
  if pg_get_functiondef('public.handle_new_user()'::regprocedure) not ilike '%real_name%' then
    raise exception '検算失敗: handle_new_user がご本名を取り込まなくなっています';
  end if;
  if pg_get_functiondef('public.handle_new_user()'::regprocedure) not ilike '%phone_number%' then
    raise exception '検算失敗: handle_new_user が電話番号を取り込みません';
  end if;
  raise notice '✓ handle_new_user はご本名と電話番号の両方を取り込む';

  select has_function_privilege('anon', 'public.my_phone_number()', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: my_phone_number を anon が実行できます'; end if;
  select has_function_privilege('anon', 'public.set_my_phone_number(text)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: set_my_phone_number を anon が実行できます'; end if;
  raise notice '✓ 電話番号の読み書きは要ログイン（auth.uid() 固定）';

  -- マッチ前の閲覧経路に混ざっていないこと（§18-b）
  if pg_get_functiondef('public.party_host_preview(uuid)'::regprocedure) ilike '%phone_number%' then
    raise exception '検算失敗: party_host_preview が電話番号を返しています';
  end if;
  raise notice '✓ party_host_preview は電話番号を返さない';

  raise notice '=== migration_phone_number.sql 適用完了 ===';
end $$;
