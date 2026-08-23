-- =====================================================================
--  AISEKI — 3機能の追加マイグレーション（2026-08-23）
--
--   1. user_reviews  … 相席終了後の内部評価（相手には見えない）
--   2. アプローチ    … 会に参加していない女性ユーザーが、募集中の会の
--                      グループチャットへメッセージを送れるようにする
--   3. drinking_style … 飲みスタイルタグ（全ユーザーが設定できる自己紹介タグ）
--
--  何度実行しても同じ結果になる（冪等）。
--  適用方法は scripts/apply_sql_api.mjs（Management API）または
--  scripts/apply_sql.mjs（node pg / IPv6直結）。
--
--  ─────────────────────────────────────────────────────────────
--  業態上の前提との関係（重要・触る前に必ず読むこと）
--
--  本サービスは「インターネット異性紹介事業に該当しない」ことを前提に
--  設計されている（schema.sql 冒頭 / src/lib/legal.js 第3条）。
--  今回 2 で性別条件を1つ持ち込むため、非該当性を保つ担保を
--  以下のとおり DB 側に置く。UI だけで隠さない。
--
--   ・アプローチは「会（グループ）単位のチャットへの投稿」のまま。
--     個人宛のメッセージ（DM）は依然として存在しない。
--   ・送信者は会の会話を読めない（messages_select は
--     「その会のメンバー」または「自分が書いた行」のみ）。
--   ・送信者のプロフィールはホストに公開しない。
--     ホストが得られるのは表示名だけ（list_approach_senders）。
--     profiles_select ポリシーは一切変更しない。
--   ・1つの会につき approach_message_limit() 通まで。
--   ・会への「参加条件」としての性別指定は、今までどおり存在しない。
--  ─────────────────────────────────────────────────────────────
-- =====================================================================

-- ---------------------------------------------------------------------
--  0. 定数（単一の出典。画面側 src/lib/pricing.js と必ず一致させる）
-- ---------------------------------------------------------------------

-- 1つの会に送れるアプローチの上限（同じ会への連投を止める）
create or replace function public.approach_message_limit()
returns int language sql immutable set search_path = public as $$ select 5 $$;

-- アプローチを送れる性別。ここを変えるだけで条件を切り替えられる。
create or replace function public.approach_gender()
returns text language sql immutable set search_path = public as $$ select '女性'::text $$;

-- 登録できる性別。null（未設定）も許す（性別を集める前に登録した方がいるため）。
create or replace function public.gender_options()
returns text[] language sql immutable set search_path = public as $$
  select array['女性', '男性', 'その他']
$$;

-- 飲みスタイルタグの選択肢（自由入力は受け付けない）
create or replace function public.drinking_style_options()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'オールナイトOK',
    '終電で帰る',
    '2件目OK',
    '2件目NG',
    'まったり派',
    'ガンガン飲む派',
    'お酒は少なめ',
    '食事メイン'
  ]
$$;

-- 1人が設定できるタグの数
create or replace function public.drinking_style_limit()
returns int language sql immutable set search_path = public as $$ select 4 $$;

grant execute on function public.approach_message_limit()  to anon, authenticated;
grant execute on function public.approach_gender()         to anon, authenticated;
grant execute on function public.gender_options()          to anon, authenticated;
grant execute on function public.drinking_style_options()  to anon, authenticated;
grant execute on function public.drinking_style_limit()    to anon, authenticated;

-- =====================================================================
--  1. profiles … 性別（既存カラム／未使用だった）と飲みスタイルタグ
-- =====================================================================

alter table public.profiles
  add column if not exists drinking_style text[] not null default '{}';

-- 性別は自由入力ではなく決まった値のみ。
-- 既存行はすべて null なので検証は通るが、念のため NOT VALID → validate。
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_gender_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_gender_check
      check (gender is null or gender = any (public.gender_options())) not valid;
  end if;
  begin
    alter table public.profiles validate constraint profiles_gender_check;
  exception when check_violation then
    raise notice '想定外の性別が入っている行があるため profiles_gender_check は未検証のままです。';
  end;
end $$;

-- タグは選択肢の中からのみ・上限つき（画面を迂回して API を叩かれても保存されない）
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_drinking_style_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_drinking_style_check
      check (
        coalesce(array_length(drinking_style, 1), 0) <= public.drinking_style_limit()
        and drinking_style <@ public.drinking_style_options()
      ) not valid;
  end if;
  begin
    alter table public.profiles validate constraint profiles_drinking_style_check;
  exception when check_violation then
    raise notice '選択肢に無いタグを持つ行があるため profiles_drinking_style_check は未検証のままです。';
  end;
end $$;

-- ---------------------------------------------------------------------
--  性別は一度だけ設定でき、あとから変えられない。
--
--  アプローチの可否を性別で判定する以上、いつでも書き換えられると
--  条件そのものが意味を失う（送りたいときだけ女性にすればよくなる）。
--  未設定（null）からの初回設定だけを許し、以後は固定する。
-- ---------------------------------------------------------------------
create or replace function public.lock_profile_gender()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.gender is not null and new.gender is distinct from old.gender then
    raise exception '性別は登録後に変更できません。変更が必要な場合はお問い合わせください';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_gender_lock on public.profiles;
create trigger on_profile_gender_lock
  before update on public.profiles
  for each row execute function public.lock_profile_gender();

-- ---------------------------------------------------------------------
--  列単位の権限を新しい項目にも広げる
--  （birth_date / age_verified_at / referred_by は今までどおり遮断）
-- ---------------------------------------------------------------------
-- gender は列ごと遮断する。
-- 同じ会のメンバーであっても他人の性別は読めない（今までどおり「表示しない」）。
-- 本人が自分の設定を確認するための経路だけ my_gender() で開ける。
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, avatar_url, age, bio, created_at,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style)
  on public.profiles to anon, authenticated;

create or replace function public.my_gender()
returns text
language sql security definer stable set search_path = public
as $$
  select gender from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_gender() from public, anon;
grant execute on function public.my_gender() to authenticated;

revoke update on public.profiles from anon, authenticated;
grant  update (username, avatar_url, gender, age, bio,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style)
  on public.profiles to authenticated;

revoke insert on public.profiles from anon, authenticated;
grant  insert (id, username, avatar_url, gender, age, bio,
               photos, hobbies, favorite_food, favorite_drink, occupation, home_area,
               drinking_style)
  on public.profiles to authenticated;

-- =====================================================================
--  2. parties … 会の一覧でホストの飲みスタイルタグを見せる
--
--     profiles は「同じ会に参加承認された相手」にしか見えない（RLS）。
--     一覧でホストのタグを出すために profiles を開くのは本末転倒なので、
--     会の作成時に parties 側へ写す。会の属性として公開する形にする。
-- =====================================================================
alter table public.parties
  add column if not exists host_drinking_style text[] not null default '{}';

-- 会の作成時にホストのタグを写す（クライアントからの値は信用しない）。
-- schema.sql の enforce_group_party() に1行足したもの。
create or replace function public.enforce_group_party()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 20歳未満は会を作成できない（飲酒を伴うため）
  perform public.assert_legal_age(new.host_id);

  if coalesce(new.host_group_size, 0) < 2 then
    raise exception 'ホスト側は2名以上のグループでのみ会を作成できます';
  end if;
  if coalesce(new.guest_group_size, 0) < 2 then
    raise exception '募集は2名以上のグループ単位でのみ行えます';
  end if;
  -- 個室での相席は提供しない。クライアントが何を送っても open に固定する。
  if coalesce(new.room_type, public.allowed_room_type()) <> public.allowed_room_type() then
    raise exception '相席はオープンスペースのみです。個室での会は作成できません';
  end if;
  new.room_type := public.allowed_room_type();

  -- 参加ポイントは全ての会で一律。ホストは金額を決められない。
  new.point_request := public.join_fee_per_person();
  -- ホストは必ずおごられる（当日の飲食代は参加グループが負担する）。
  new.treat_type    := public.allowed_treat_type();

  new.max_members       := new.host_group_size + new.guest_group_size;
  new.current_members   := new.host_group_size;  -- 席作成後にトリガーが再計算する
  new.host_member_names := public.normalize_member_names(new.host_member_names, new.host_group_size);
  new.host_name         := coalesce(
    (select username from public.profiles where id = new.host_id), 'ホスト'
  );
  -- 飲みスタイルタグはホストのプロフィールから写す
  new.host_drinking_style := coalesce(
    (select drinking_style from public.profiles where id = new.host_id), '{}'
  );
  return new;
end;
$$;

drop trigger if exists on_party_group_check on public.parties;
create trigger on_party_group_check
  before insert on public.parties
  for each row execute function public.enforce_group_party();

-- プロフィールのタグを変えたら、募集中・マッチ済の会にも反映する
-- （終了した会は当時の内容のまま残す）
create or replace function public.sync_host_drinking_style()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.drinking_style is distinct from old.drinking_style then
    update public.parties
       set host_drinking_style = new.drinking_style
     where host_id = new.id
       and status in ('recruiting', 'matched');
  end if;
  return null;
end;
$$;

drop trigger if exists on_profile_drinking_style on public.profiles;
create trigger on_profile_drinking_style
  after update on public.profiles
  for each row execute function public.sync_host_drinking_style();

-- 既存の会にも現在のタグを入れておく
update public.parties p
   set host_drinking_style = coalesce(pr.drinking_style, '{}')
  from public.profiles pr
 where pr.id = p.host_id
   and p.status in ('recruiting', 'matched')
   and p.host_drinking_style is distinct from coalesce(pr.drinking_style, '{}');

-- =====================================================================
--  3. user_reviews … 相席終了後の内部評価
--
--     ・相手には一切見えない（SELECT は自分が書いたものだけ）。
--     ・運営は service_role で全件を読む（RLS を迂回できる）。
--     ・同じ会・同じ相手には1回だけ。
--     ・書けるのは「同じ会に参加していた相手」に対してのみ、
--       かつ「会が終わったあと」だけ。
-- =====================================================================

-- 会が終わったか。開催日を過ぎた、または明示的に completed になったもの。
-- 取り消された会は対象外。
--
-- ⚠ 日付は必ず日本時間で比較する。current_date（＝UTC）で比べると、
--   日本時間の 0:00〜9:00 のあいだ「昨日の会」がまだ UTC では今日のままになり、
--   画面には「評価する」が出ているのに DB が弾く、という食い違いが起きる
--   （画面側 api.partyIsOver() は端末のローカル日付で判定している）。
create or replace function public.party_is_over(p_party uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.parties p
     where p.id = p_party
       and p.status <> 'cancelled'
       and (
         p.status = 'completed'
         or (
           p.party_date is not null
           and p.party_date < (now() at time zone 'Asia/Tokyo')::date
         )
       )
  );
$$;

grant execute on function public.party_is_over(uuid) to authenticated;

create table if not exists public.user_reviews (
  id          uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_id uuid not null references public.profiles(id) on delete cascade,
  party_id    uuid not null references public.parties(id)  on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  constraint user_reviews_not_self check (reviewer_id <> reviewed_id),
  constraint user_reviews_comment_len
    check (comment is null or char_length(comment) <= 1000)
);

create unique index if not exists user_reviews_unique
  on public.user_reviews(reviewer_id, reviewed_id, party_id);
create index if not exists user_reviews_reviewed_idx
  on public.user_reviews(reviewed_id, created_at desc);
create index if not exists user_reviews_party_idx
  on public.user_reviews(party_id);

alter table public.user_reviews enable row level security;

-- 書けるのは自分のレビューだけ。相手・会・時期の条件も DB 側で見る。
drop policy if exists user_reviews_insert on public.user_reviews;
create policy user_reviews_insert on public.user_reviews for insert with check (
  reviewer_id = auth.uid()
  and reviewed_id <> auth.uid()
  and public.is_party_member(party_id, auth.uid())
  and public.is_party_member(party_id, reviewed_id)
  and public.party_is_over(party_id)
);

-- 読めるのは自分が書いたものだけ。自分が付けられた評価は本人にも見えない。
drop policy if exists user_reviews_select on public.user_reviews;
create policy user_reviews_select on public.user_reviews for select using (
  reviewer_id = auth.uid()
);

-- 書き換え・削除のポリシーは作らない（＝できない）。
revoke all on public.user_reviews from anon, authenticated;
grant  select, insert on public.user_reviews to authenticated;

-- 運営用: 内部スコアの集計。service_role からのみ読む（利用者には公開しない）。
create or replace view public.user_review_scores as
  select
    reviewed_id,
    count(*)::int          as review_count,
    round(avg(rating), 2)  as average_rating,
    min(rating)            as min_rating,
    max(rating)            as max_rating,
    max(created_at)        as last_reviewed_at
  from public.user_reviews
  group by reviewed_id;

revoke all on public.user_review_scores from anon, authenticated;

-- =====================================================================
--  4. アプローチ（会に参加していない女性ユーザーからのメッセージ）
--
--     messages テーブルはそのまま使う。party_id 必須のグループチャット
--     であることは変えない（個人宛DMは作らない）。
-- =====================================================================

-- メッセージの長さ（画面側 LIMITS.message と一致させる）
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'messages_content_len' and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages add constraint messages_content_len
      check (char_length(content) <= 2000) not valid;
  end if;
end $$;

-- その会に自分が既に何通送ったか（上限判定用）。
-- RLS ポリシーの中から messages を直接数えると評価が入れ子になるため、
-- security definer の関数に閉じ込める。
--
-- ⚠ security definer なので、呼び出した本人の分しか数えない。
--   p_user を他人にして呼ばれても 0 を返す（他人の送信状況は分からない）。
create or replace function public.approach_message_count(p_party uuid, p_user uuid)
returns int
language sql security definer stable set search_path = public
as $$
  select count(*)::int
    from public.messages
   where party_id = p_party
     and user_id = p_user
     and p_user = auth.uid();
$$;

grant execute on function public.approach_message_count(uuid, uuid) to authenticated;

-- アプローチを送れるか。
--   ・募集中の会であること（マッチ済・終了・取り消しには送れない）
--   ・自分がその会のメンバーでないこと（メンバーは普通のチャット）
--   ・性別が approach_gender() であること
--   ・20歳以上であること
--   ・ホストとの間にブロックが無いこと（どちら向きでも）
--
-- ⚠ 判定できるのは「自分が送れるか」だけ。p_user は auth.uid() と一致しないと
--   常に false を返す。
--   security definer なうえ authenticated に開いているため、この縛りが無いと
--   他人の UUID を渡して true/false を見るだけで、その人の性別が分かってしまう
--   （UUID は同じ会の party_members から読める）。
--   性別は他のユーザーに一切開示しない前提なので（src/lib/legal.js）、
--   ここで呼び出し本人に固定する。
create or replace function public.can_approach_party(p_party uuid, p_user uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select p_party is not null
     and p_user  is not null
     and p_user = auth.uid()
     and exists (
       select 1 from public.parties p
        where p.id = p_party
          and p.status = 'recruiting'
          and p.host_id <> p_user
     )
     and coalesce(
           (select gender from public.profiles where id = p_user), ''
         ) = public.approach_gender()
     and public.is_legal_age(p_user)
     and not public.is_party_member(p_party, p_user)
     and not public.is_blocked(p_user, public.party_host(p_party));
$$;

grant execute on function public.can_approach_party(uuid, uuid) to authenticated;

-- 読める範囲: その会のメンバー、または自分が書いた行。
-- アプローチを送った人が会の会話を読めるようになってはいけない。
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  public.is_party_member(party_id, auth.uid())
  or user_id = auth.uid()
);

-- 書ける範囲: その会のメンバー、またはアプローチの条件を満たす人（上限まで）。
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  auth.uid() = user_id
  and (
    public.is_party_member(party_id, auth.uid())
    or (
      public.can_approach_party(party_id, auth.uid())
      and public.approach_message_count(party_id, auth.uid())
          < public.approach_message_limit()
    )
  )
);

-- ---------------------------------------------------------------------
--  ホストに渡すのは「表示名」だけ。
--
--  profiles_select は変更しない。会に参加承認されていない相手の
--  写真・年齢・自己紹介は、アプローチを送っても公開されない。
--  チャットで「誰からの発言か」が分かる最小限だけをこの関数で返す。
-- ---------------------------------------------------------------------
create or replace function public.list_approach_senders(p_party uuid)
returns table (user_id uuid, username text)
language sql security definer stable set search_path = public
as $$
  select distinct m.user_id, coalesce(p.username, 'ゲスト')
    from public.messages m
    left join public.profiles p on p.id = m.user_id
   where m.party_id = p_party
     and public.is_party_member(p_party, auth.uid())
     and not public.is_party_member(p_party, m.user_id);
$$;

grant execute on function public.list_approach_senders(uuid) to authenticated;

-- =====================================================================
--  適用結果
-- =====================================================================
do $$
begin
  raise notice 'アプローチ上限     : %通 / 会', public.approach_message_limit();
  raise notice 'アプローチ可能な性別: %', public.approach_gender();
  raise notice '飲みスタイルタグ   : %種類（1人あたり最大%個）',
    array_length(public.drinking_style_options(), 1), public.drinking_style_limit();
  raise notice 'user_reviews       : %件', (select count(*) from public.user_reviews);
  raise notice '性別が未設定の既存ユーザー: %件',
    (select count(*) from public.profiles where gender is null);
end $$;
