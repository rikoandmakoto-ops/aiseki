-- =====================================================================
--  登録ボーナス 5,000pt を「新規登録時」から「カード登録後」に移す
--
--  これまで: auth.users への insert（handle_new_user）で無条件に付与
--  これから: Stripe に有効なカードが登録できたときだけ付与
--
--  ・付与するのは public.grant_card_bonus() だけ。service_role 専用なので、
--    アプリ（authenticated）からは呼べない。呼ぶのは /api/stripe/*。
--  ・冪等。profiles.card_registered を false → true にできた呼び出しだけが
--    付与するので、Stripe の再送や二重確認でも増えない。
--  ・金額の出典は今までどおり public.signup_bonus()（= 5,000pt）。
--    アプリ側の src/lib/pricing.js の SIGNUP_BONUS と同じ値にすること。
--
--  ⚠ 適用済みユーザーの残高は遡って変更しない（付与済みは付与済みのまま）。
--    既存ユーザーは card_registered = false で始まるため、カードを登録すると
--    もう一度 5,000pt を受け取れる。それが困る場合は、末尾の
--    「既存ユーザーの締め出し」のコメントを外してから流すこと。
--
--  適用: AISEKI_DB_PASSWORD=... node scripts/apply_sql.mjs supabase/migration_card_bonus.sql
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. profiles.card_registered … カードを登録済みか
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists card_registered boolean not null default false;

/* この列はアプリから直接読ませない。
   profiles の SELECT ポリシーは「自分」か「同じ会のメンバー」を通すので、
   列単位で grant すると、同席者に他人の決済状況まで見えてしまう。
   自分の分だけを返す my_card_registered() を下に用意する。

   UPDATE も同様に grant しない。profiles の列単位 UPDATE 権限
   （username / bio / photos …）に card_registered は入っていないため、
   authenticated からの update は権限エラーで弾かれる。 */

-- ---------------------------------------------------------------------
--  2. card_registered をアプリ側から書き換えられないようにする
--
--     列単位の grant だけでも塞がっているが、あとから
--     `grant update on public.profiles to authenticated` を一度でも流すと
--     穴が開く。開いたら「false に戻してもう一度ボーナスをもらう」ができる。
--     テーブル側にも規則を置いておく。
-- ---------------------------------------------------------------------
create or replace function public.lock_card_registered()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- security definer 関数（所有者 postgres）と service_role からの変更だけ通す。
  -- それ以外（authenticated / anon）は、黙って元の値に戻す。
  -- 例外にしないのは、プロフィール編集そのものを巻き添えで失敗させないため。
  if new.card_registered is distinct from old.card_registered
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.card_registered := old.card_registered;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_card_lock on public.profiles;
create trigger on_profile_card_lock
  before update on public.profiles
  for each row execute function public.lock_card_registered();

-- ---------------------------------------------------------------------
--  3. 自分がカードを登録済みかどうか（本人のぶんだけ）
--
--     my_gender() と同じ形。引数でユーザーを受け取らないので、
--     他人の UUID を渡して決済状況を探ることはできない。
-- ---------------------------------------------------------------------
create or replace function public.my_card_registered()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(card_registered, false) from public.profiles where id = auth.uid();
$$;

/* Supabase は「public スキーマに作られた関数は anon / authenticated が実行できる」
   という既定権限を入れてある。revoke は public だけでなくロール名も名指しする。 */
revoke all on function public.my_card_registered() from public, anon;
grant execute on function public.my_card_registered() to authenticated;

-- ---------------------------------------------------------------------
--  4. 新規登録トリガー … ボーナスの付与をやめる
--
--     残高の行（point_balances）は 0 で作る。行が無いままだと、
--     参加費の引き落としや残高表示が「行なし」を毎回考える必要が出る。
--     年齢確認・招待コードの発行は今までどおり。
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_birth date;
  v_age   int;
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

  insert into public.profiles (id, username, gender, age, birth_date, age_verified_at, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'gender',
    v_age,
    v_birth,
    now(),
    public.gen_referral_code()
  )
  on conflict (id) do nothing;

  -- 登録ボーナスはここでは付けない。カード登録後に grant_card_bonus() が付ける。
  insert into public.point_balances (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  5. カード登録ボーナスの付与
--
--     ・呼べるのは service_role だけ（= /api/stripe/* のサーバ側）。
--       アプリから呼べると、カードを登録しなくても 5,000pt が手に入る。
--     ・冪等。card_registered を false → true にできた呼び出しだけが付与する。
--       update ... where card_registered = false は行ロックを取るので、
--       Stripe の再送で同時に2本走っても、通るのは片方だけ。
-- ---------------------------------------------------------------------
create or replace function public.grant_card_bonus(p_user uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_bonus   int := public.signup_bonus();
  v_granted boolean;
  v_balance int;
begin
  if p_user is null then raise exception 'ユーザーが指定されていません'; end if;

  update public.profiles
     set card_registered = true
   where id = p_user
     and card_registered is not true;
  v_granted := found;

  if not v_granted then
    -- 付与済み（再送）か、プロフィールが無い。どちらも残高だけ返す。
    select coalesce(balance, 0) into v_balance
      from public.point_balances where user_id = p_user;
    return jsonb_build_object('granted', false, 'balance', coalesce(v_balance, 0));
  end if;

  insert into public.point_balances (user_id, balance)
  values (p_user, v_bonus)
  on conflict (user_id) do update
    set balance = public.point_balances.balance + v_bonus
  returning balance into v_balance;

  insert into public.points (user_id, amount, type, description)
  values (p_user, v_bonus, 'earn', 'カード登録ボーナス');

  return jsonb_build_object('granted', true, 'points', v_bonus, 'balance', v_balance);
end;
$$;

revoke all on function public.grant_card_bonus(uuid) from public, anon, authenticated;
grant execute on function public.grant_card_bonus(uuid) to service_role;

-- ---------------------------------------------------------------------
--  既存ユーザーの締め出し（既定では行わない）
--
--  すでに新規登録ボーナスを受け取っているユーザーに、カード登録で
--  もう一度 5,000pt を渡したくない場合は、次の1文を有効にしてから流す。
-- ---------------------------------------------------------------------
-- update public.profiles p set card_registered = true
--  where exists (select 1 from public.points t
--                 where t.user_id = p.id and t.description = '新規登録ボーナス');

-- ---------------------------------------------------------------------
--  検算
-- ---------------------------------------------------------------------
do $$
declare v_src text;
begin
  if public.signup_bonus() <> 5000 then
    raise exception 'signup_bonus() が 5000 になっていません: %', public.signup_bonus();
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'card_registered'
  ) then
    raise exception 'profiles.card_registered が作られていません';
  end if;

  -- 新規登録トリガーからボーナスが消えていること
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_user';
  if v_src like '%新規登録ボーナス%' then
    raise exception 'handle_new_user() にまだ登録ボーナスの付与が残っています';
  end if;

  -- 付与関数は service_role 専用であること
  if has_function_privilege('authenticated', 'public.grant_card_bonus(uuid)', 'execute') then
    raise exception 'grant_card_bonus() を authenticated が実行できてしまいます';
  end if;
  if not has_function_privilege('service_role', 'public.grant_card_bonus(uuid)', 'execute') then
    raise exception 'grant_card_bonus() を service_role が実行できません';
  end if;

  raise notice 'カード登録ボーナス: %pt（新規登録時の自動付与は廃止）', public.signup_bonus();
end $$;
