-- =====================================================================
--  新規登録ボーナスを 10,000pt → 5,000pt に変更する
--
--  金額の出典は public.signup_bonus()。付与処理（migration_launch2.sql）は
--  この関数を呼んでいるので、ここを変えれば以後の登録に反映される。
--  アプリ側の src/lib/pricing.js の SIGNUP_BONUS も同じ値にすること。
--
--  ⚠ 適用済みユーザーの残高は遡って変更しない（付与済みは付与済みのまま）。
-- =====================================================================

create or replace function public.signup_bonus()
returns int language sql immutable as $$ select 5000 $$;

grant execute on function public.signup_bonus() to anon, authenticated;

do $$
begin
  if public.signup_bonus() <> 5000 then
    raise exception 'signup_bonus() が 5000 になっていません: %', public.signup_bonus();
  end if;
  raise notice '新規登録ボーナス: %pt', public.signup_bonus();
end $$;
