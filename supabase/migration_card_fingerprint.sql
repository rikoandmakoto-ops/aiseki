-- =====================================================================
--  同じカードで 5,000pt を何度も受け取れないようにする
--
--  これまで: カードを登録すれば誰でも 5,000pt。カードは同じでも、
--            アカウントを作り直せば何度でも受け取れた。
--            （CAPTCHA は「自動化」を止めるだけで、手作業の複数取得は止まらない）
--  これから: **カード1枚につき1アカウント**。Stripe の fingerprint
--            （カード番号ごとに一意な文字列。カード番号そのものではない）を
--            保存し、既に別のユーザーが使っていればボーナスを付けない。
--
--  ・fingerprint は Stripe の PaymentMethod から取る（api/_card.js）。
--    同じカード番号なら、Customer が違っても・再登録しても同じ値になる。
--    カード番号を復元できる値ではないので、保存してよい。
--  ・「持ち主」の確定と付与は grant_card_bonus() の中で1トランザクションで行う。
--    先に insert して勝った側だけが持ち主になるので、
--    2アカウントから同時に登録されても片方しか通らない。
--  ・拒否するのは**ボーナスだけ**。カードの登録（Stripe 側）は成立している。
--    profiles.card_registered も false のままにする。
--    → 別の未使用カードで登録し直せば、ボーナスは受け取れる。
--
--  ⚠ この migration より前に登録されたカードは記録が無い（遡れない）。
--    その分は「1枚目のカード」として扱われる。
--
--  適用: AISEKI_DB_PASSWORD=... node scripts/apply_sql.mjs supabase/migration_card_fingerprint.sql
--
--  🚨 適用したら**すぐにデプロイすること**。grant_card_bonus() の引数が
--    1つ（p_user）から2つ（p_user, p_fingerprint）に変わるため、
--    古い api/ が動いているあいだカード登録ボーナスが失敗する。
--    （confirm-card は 500、Webhook は再送されるので、デプロイ後に自然に回復する）
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. card_fingerprints … どのカードがどのアカウントのものか
--
--     fingerprint が主キー。1枚のカードは1行しか持てない。
-- ---------------------------------------------------------------------
create table if not exists public.card_fingerprints (
  fingerprint text primary key,
  -- アカウントを消しても行は残す（cascade にすると、退会 → 再登録で
  -- 同じカードのボーナスをもう一度受け取れてしまう）。
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists card_fingerprints_user_id_idx
  on public.card_fingerprints (user_id);

/* アプリ（anon / authenticated）からは一切触らせない。
   ・読めると「このカードは使用済みか」を総当たりで調べられる。
   ・書けると、他人のカードを先に登録してボーナスを封じられる。
   service_role は RLS を迂回するので、/api からは今までどおり読み書きできる。

   ポリシーを1つも作らない ＝ RLS 有効下では誰にも通らない。
   Supabase の既定 grant はロール名を名指しで revoke する（from public だけでは残る）。 */
alter table public.card_fingerprints enable row level security;
revoke all on table public.card_fingerprints from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  2. カード登録ボーナスの付与に fingerprint の判定を足す
--
--     引数が増えるので、古い1引数版は落とす。
--     残したまま2引数版を作ると、PostgREST が
--     どちらを呼ぶか決められず PGRST201（曖昧な関数）になる。
-- ---------------------------------------------------------------------
drop function if exists public.grant_card_bonus(uuid);

create or replace function public.grant_card_bonus(p_user uuid, p_fingerprint text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_bonus   int  := public.signup_bonus();
  v_fp      text := nullif(btrim(p_fingerprint), '');
  v_owner   uuid;
  v_claimed boolean;
  v_granted boolean;
  v_balance int;
begin
  if p_user is null then raise exception 'ユーザーが指定されていません'; end if;
  /* fingerprint が取れないカードにはボーナスを付けない（fail-closed）。
     取れないまま通すと、この仕組み全体が素通しになる。 */
  if v_fp is null then raise exception 'カードの識別子が渡されていません'; end if;

  /* このカードの持ち主を確定させる。
     勝った側だけが insert できる（fingerprint は主キー）。
     同時に走ったときは、後発が先発の commit を待ってから do nothing になる。 */
  insert into public.card_fingerprints (fingerprint, user_id)
  values (v_fp, p_user)
  on conflict (fingerprint) do nothing;
  v_claimed := found;

  if not v_claimed then
    -- 既にある行の持ち主を見る（退会済みなら null。null も「別人」として扱う）
    select user_id into v_owner from public.card_fingerprints where fingerprint = v_fp;

    if v_owner is distinct from p_user then
      select coalesce(balance, 0) into v_balance
        from public.point_balances where user_id = p_user;
      /* card_registered には触らない。別のカードで登録し直せば受け取れる。 */
      return jsonb_build_object(
        'granted', false, 'duplicate', true, 'points', 0, 'balance', coalesce(v_balance, 0)
      );
    end if;
    -- 同じ人の再登録（Stripe の再送・2枚目の登録）。このまま下の冪等判定に任せる。
  end if;

  update public.profiles
     set card_registered = true
   where id = p_user
     and card_registered is not true;
  v_granted := found;

  if not v_granted then
    -- 付与済み（再送・2枚目）か、プロフィールが無い。どちらも残高だけ返す。
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

revoke all on function public.grant_card_bonus(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_card_bonus(uuid, text) to service_role;

-- ---------------------------------------------------------------------
--  検算
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'card_fingerprints'
  ) then
    raise exception 'card_fingerprints が作られていません';
  end if;

  if not (select relrowsecurity from pg_class
           where oid = 'public.card_fingerprints'::regclass) then
    raise exception 'card_fingerprints の RLS が有効になっていません';
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'card_fingerprints') then
    raise exception 'card_fingerprints にポリシーがあります（誰にも通さない想定）';
  end if;

  -- アプリから読めない／書けないこと
  if has_table_privilege('authenticated', 'public.card_fingerprints', 'select')
     or has_table_privilege('anon', 'public.card_fingerprints', 'select') then
    raise exception 'card_fingerprints をアプリから読めてしまいます';
  end if;
  if has_table_privilege('authenticated', 'public.card_fingerprints', 'insert') then
    raise exception 'card_fingerprints にアプリから書けてしまいます';
  end if;

  -- 旧シグネチャが残っていないこと（残ると PGRST201 になる）
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'grant_card_bonus'
       and pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) then
    raise exception '旧 grant_card_bonus(uuid) が残っています';
  end if;

  -- 付与関数は service_role 専用であること
  if has_function_privilege('authenticated', 'public.grant_card_bonus(uuid, text)', 'execute') then
    raise exception 'grant_card_bonus() を authenticated が実行できてしまいます';
  end if;
  if not has_function_privilege('service_role', 'public.grant_card_bonus(uuid, text)', 'execute') then
    raise exception 'grant_card_bonus() を service_role が実行できません';
  end if;

  raise notice 'カード1枚につき1アカウント: card_fingerprints を作成、grant_card_bonus(uuid, text) に差し替え';
end $$;
