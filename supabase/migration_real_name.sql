-- =====================================================================
--  AISEKI — 招待からの簡易登録で「ご本名」を預かる（2026-08-29）
--
--  冪等（何度流しても同じ）。
--
--  ── 何を足したか ────────────────────────────────────
--  `profiles.real_name`。招待リンクから簡易登録した方に、当日の本人確認用として
--  ご本名を入力してもらう。通常登録（full）では今までどおり集めない。
--
--  🚨 ご本名は「他のユーザーには一切見せない」。
--    ・列単位の SELECT 権限を anon / authenticated に **付けない**
--      （profiles の権限は列ごとに明示してあるので、足しただけでは誰も読めない）
--    ・同じ会のメンバーにも見えない。画面に出るのは今までどおりニックネームだけ
--    ・本人が自分の分を見る経路だけ my_real_name() で開ける（auth.uid() 固定）
--    ・運営（service_role）は通報対応のために読める
--
--    §1 の「性別を他のユーザーに表示しない」と同じ形（gender / my_gender()）。
--    ここを緩めて一覧や party_host_preview() に足すと、
--    マッチ前の他人に本名が開示されることになる。**絶対に足さないこと。**
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. 列
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists real_name text;

alter table public.profiles drop constraint if exists profiles_real_name_len;
alter table public.profiles add constraint profiles_real_name_len
  check (real_name is null or char_length(real_name) <= 60);

comment on column public.profiles.real_name is
  '当日の本人確認用のご本名。招待からの簡易登録でのみ取得する。他のユーザーには開示しない（列単位の SELECT 権限を付けないこと）。';

-- ---------------------------------------------------------------------
--  2. 登録時に受け取る
--
--     handle_new_user() は security definer なので列の権限を通らない。
--     raw_user_meta_data の real_name をそのまま写す。
--     ⚠ 既存の中身（年齢確認・account_type・signup_intent）は変えていない。
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

  insert into public.profiles (
    id, username, gender, age, birth_date, age_verified_at,
    referral_code, account_type, signup_intent, real_name
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
    v_real
  )
  on conflict (id) do nothing;

  -- 登録ボーナスはここでは付けない。カード登録後に grant_card_bonus() が付ける。
  -- ホストはカードを登録しないので、ボーナスも付かない（仕様どおり）。
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
create or replace function public.my_real_name()
returns text
language sql stable security definer set search_path = public
as $$
  select real_name from public.profiles where id = auth.uid();
$$;

create or replace function public.set_my_real_name(p_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_uid is null then raise exception '認証が必要です'; end if;
  if v_name is not null and char_length(v_name) > 60 then
    raise exception 'お名前が長すぎます（60文字まで）';
  end if;
  update public.profiles set real_name = v_name where id = v_uid;
  return v_name;
end $$;

--  既定で public スキーマの全関数に EXECUTE が付くので、anon は名指しで落とす
--  （§20「新しく作った関数は anon から revoke する」）。
revoke all on function public.my_real_name()          from public, anon;
revoke all on function public.set_my_real_name(text)  from public, anon;
grant execute on function public.my_real_name()          to authenticated;
grant execute on function public.set_my_real_name(text)  to authenticated;

-- ---------------------------------------------------------------------
--  4. 適用の検算
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_n  int;
begin
  -- 列があること
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'real_name'
  ) then
    raise exception '検算失敗: profiles.real_name がありません';
  end if;

  -- 🚨 いちばん大事な検算。他のユーザーから読み書きできてはいけない。
  --    ⚠ REFERENCES / TRIGGER は表全体に付いていて全列に出てくるが、
  --      データを読めるものではない。見るのは SELECT / INSERT / UPDATE だけ。
  for v_n in
    select count(*) from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'real_name' and grantee in ('anon', 'authenticated')
       and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
  loop
    if v_n <> 0 then
      raise exception '検算失敗: profiles.real_name に anon/authenticated の読み書き権限が % 件あります', v_n;
    end if;
  end loop;
  raise notice '✓ ご本名は anon / authenticated から読めない（列単位の権限なし）';

  -- 表全体の SELECT が残っていると列単位の制限が意味を失う（§20 の注意）
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'profiles'
       and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
  ) then
    raise exception '検算失敗: profiles に表全体の SELECT が残っています';
  end if;
  raise notice '✓ profiles に表全体の SELECT は無い';

  -- 本人の経路は要ログイン
  select has_function_privilege('anon', 'public.my_real_name()', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: my_real_name を anon が実行できます'; end if;
  select has_function_privilege('anon', 'public.set_my_real_name(text)', 'execute') into v_ok;
  if v_ok then raise exception '検算失敗: set_my_real_name を anon が実行できます'; end if;
  raise notice '✓ ご本名の読み書きは要ログイン（auth.uid() 固定）';

  -- マッチ前の閲覧経路に混ざっていないこと（§18-b）
  if pg_get_functiondef('public.party_host_preview(uuid)'::regprocedure) ilike '%real_name%' then
    raise exception '検算失敗: party_host_preview がご本名を返しています';
  end if;
  raise notice '✓ party_host_preview はご本名を返さない';

  raise notice '=== migration_real_name.sql 適用完了 ===';
end $$;
