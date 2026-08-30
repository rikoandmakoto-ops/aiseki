-- =====================================================================
--  AISEKI — インフルエンサー営業リストの管理（2026-08-30）
--
--  冪等（何度流しても同じ）。
--
--  ── 何のためのものか ────────────────────────────────
--  相席・飲み会系のインフルエンサーへ営業DMを出すための、
--  **リスト・文面・送信状況の管理**。運営（ADMIN_EMAILS）だけが使う。
--
--  ⚠ このスキーマは「誰に・何を・どこまで送ったか」を憶えるだけで、
--    送信そのものは行わない。Instagram の初回DM（＝相手から接触が無い状態）は
--    Messaging API では送れず（24時間ウィンドウ）、ブラウザ自動化は
--    Meta Platform Terms が禁じているため、**送信は人が押す**。
--    ここは「次に誰へ出すか」を出し、「出した結果」を記録する台帳。
--
--  ── 入るもの ────────────────────────────────────────
--  ・dm_templates … 文面のひな形（{{username}} 等を差し込める）
--  ・dm_targets   … 送信先リスト（CSV取り込み）。status で進捗を持つ
--  ::  pending → sent / failed / skipped
--  ・dm_events    … 状態遷移の記録（追記のみ・取り消し不可）
--  ・dm_settings  … 1日の上限と最短間隔（作業ペースの目安）
--
--  🚨 全テーブル service_role 専用。anon / authenticated には触らせない。
--    営業リストは利用者に見せるものではないし、書き換えられてもいけない。
--    RLS を有効にしたうえで **ポリシーを1つも作らない**（＝誰も通らない）。
--    revoke は from public だけでは足りず、anon / authenticated を名指しする
--    （[[aiseki-revoke-must-name-roles]]）。
-- =====================================================================

-- ---------------------------------------------------------------------
--  0. 状態の定義
--
--     pending … まだ出していない
--     sent    … 出した
--     failed  … 出そうとしたが出せなかった（アカウント削除・DM不可 等）
--     skipped … 出さないと決めた（対象外・非該当 等）
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dm_status') then
    create type public.dm_status as enum ('pending', 'sent', 'failed', 'skipped');
  end if;
end $$;

-- ---------------------------------------------------------------------
--  1. 文面のひな形
--
--     body に {{username}} / {{display_name}} / {{category}} を書くと、
--     払い出しのときに差し込まれる（差し込みは api/dm/_dm.js が行う）。
-- ---------------------------------------------------------------------
create table if not exists public.dm_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  body        text        not null,
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dm_templates_name_len check (char_length(btrim(name)) between 1 and 80),
  --  Instagram のDMは1000文字を超えると分割されるため、ここで止める
  constraint dm_templates_body_len check (char_length(btrim(body)) between 1 and 1000)
);

comment on table public.dm_templates is
  'インフルエンサー営業DMの文面ひな形。運営（service_role）専用。';

--  既定のひな形は1つだけ
create unique index if not exists dm_templates_default_uniq
  on public.dm_templates (is_default) where is_default;

-- ---------------------------------------------------------------------
--  2. 送信先リスト
--
--     username は必ず正規化して入れる（@ や URL のまま入れない）。
--     同じ相手に二重に出さないよう、正規化した値で一意にする。
-- ---------------------------------------------------------------------
create table if not exists public.dm_targets (
  id             uuid primary key default gen_random_uuid(),
  username       text        not null,
  display_name   text,
  category       text,
  follower_count integer,
  note           text,
  template_id    uuid references public.dm_templates(id) on delete set null,

  status         public.dm_status not null default 'pending',
  sent_at        timestamptz,
  last_error     text,
  attempts       integer     not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  --  正規化済みであること自体を制約にする（小文字・記号なし）
  constraint dm_targets_username_shape
    check (username ~ '^[a-z0-9._]{1,30}$'),
  constraint dm_targets_follower_sane
    check (follower_count is null or follower_count between 0 and 1000000000),
  --  sent なら送信時刻が要る。逆に sent 以外に時刻が入っていてはいけない
  constraint dm_targets_sent_at_matches
    check ((status = 'sent') = (sent_at is not null))
);

comment on table public.dm_targets is
  'インフルエンサー営業の送信先リスト。運営（service_role）専用。送信は人が行い、ここには結果だけが入る。';
comment on column public.dm_targets.username is
  'Instagram のユーザー名。dm_normalize_username() を通した小文字の値のみ（@ や URL は入れない）。';

create unique index if not exists dm_targets_username_uniq on public.dm_targets (username);
create index if not exists dm_targets_status_idx      on public.dm_targets (status, created_at);
create index if not exists dm_targets_sent_at_idx     on public.dm_targets (sent_at desc) where sent_at is not null;

-- ---------------------------------------------------------------------
--  3. 状態遷移の記録（追記のみ）
--
--     「いつ・誰を・どこからどこへ動かしたか」。UPDATE / DELETE の
--     ポリシーを作らない＝運営でも書き換えられない（service_role は通るが、
--     アプリの経路には無い）。あとから送信実績を数えるための一次資料。
-- ---------------------------------------------------------------------
create table if not exists public.dm_events (
  id          bigint generated always as identity primary key,
  target_id   uuid not null references public.dm_targets(id) on delete cascade,
  from_status public.dm_status,
  to_status   public.dm_status not null,
  note        text,
  actor_email text,
  created_at  timestamptz not null default now()
);

create index if not exists dm_events_target_idx on public.dm_events (target_id, created_at desc);
create index if not exists dm_events_created_idx on public.dm_events (created_at desc);

comment on table public.dm_events is
  '送信状況の変更履歴（追記のみ）。運営（service_role）専用。';

-- ---------------------------------------------------------------------
--  4. 作業ペースの設定（1行だけ）
--
--     ⚠ これは「検知を避けるための間隔」ではない。
--       1日にどれだけ営業をかけるかという運用上の上限で、
--       出しすぎ（＝相手にとっての迷惑）を運営側で止めるためのもの。
--       払い出し（dm_next_batch）はこの上限を超えて返さない。
-- ---------------------------------------------------------------------
create table if not exists public.dm_settings (
  id                   boolean primary key default true,
  daily_cap            integer     not null default 30,
  min_interval_seconds integer     not null default 60,
  updated_at           timestamptz not null default now(),
  constraint dm_settings_single_row check (id),
  constraint dm_settings_cap_sane   check (daily_cap between 0 and 200),
  constraint dm_settings_gap_sane   check (min_interval_seconds between 0 and 3600)
);

insert into public.dm_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
--  5. updated_at の自動更新
-- ---------------------------------------------------------------------
create or replace function public.dm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists on_dm_targets_touch on public.dm_targets;
create trigger on_dm_targets_touch
  before update on public.dm_targets
  for each row execute function public.dm_touch_updated_at();

drop trigger if exists on_dm_templates_touch on public.dm_templates;
create trigger on_dm_templates_touch
  before update on public.dm_templates
  for each row execute function public.dm_touch_updated_at();

-- ---------------------------------------------------------------------
--  6. ユーザー名の正規化
--
--     取り込む CSV には @name / https://instagram.com/name/ / NAME が
--     混ざる。全部同じ形に潰してから入れる（二重送信の防止）。
--     取れなければ null を返す（＝取り込み側で弾く）。
-- ---------------------------------------------------------------------
create or replace function public.dm_normalize_username(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(btrim(coalesce(p_raw, '')));
  if v = '' then return null; end if;

  --  URL で渡されたらパス先頭の1区画だけを取る
  v := regexp_replace(v, '^https?://', '');
  v := regexp_replace(v, '^(www\.)?instagram\.com/', '');
  v := regexp_replace(v, '[?#].*$', '');
  v := split_part(v, '/', 1);

  --  先頭の @ を落とす
  v := regexp_replace(v, '^@+', '');

  --  Instagram のユーザー名は英数字・ピリオド・アンダースコアのみ・30文字まで
  if v !~ '^[a-z0-9._]{1,30}$' then return null; end if;
  return v;
end $$;

comment on function public.dm_normalize_username(text) is
  '@ や URL 込みで渡されたInstagramユーザー名を小文字の素の名前に潰す。形が合わなければ null。';

-- ---------------------------------------------------------------------
--  7. 集計（画面の見出しに出す数）
--
--     本日ぶんの判定は **日本時間**。
--     current_date（UTC）で比べると日本時間 0:00〜9:00 にずれる（§11 と同じ罠）。
-- ---------------------------------------------------------------------
create or replace function public.dm_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending',   count(*) filter (where status = 'pending'),
    'sent',      count(*) filter (where status = 'sent'),
    'failed',    count(*) filter (where status = 'failed'),
    'skipped',   count(*) filter (where status = 'skipped'),
    'total',     count(*),
    'sent_today', count(*) filter (
      where status = 'sent'
        and (sent_at at time zone 'Asia/Tokyo')::date
            = (now() at time zone 'Asia/Tokyo')::date
    ),
    'daily_cap',            (select daily_cap            from public.dm_settings where id),
    'min_interval_seconds', (select min_interval_seconds from public.dm_settings where id)
  )
  from public.dm_targets;
$$;

-- ---------------------------------------------------------------------
--  8. 次に出す分の払い出し
--
--     pending を古い順に返す。1日の上限を超える分は返さない
--     （残り0件なら空の配列。画面は「本日はここまで」を出す）。
--
--     ⚠ ここで status は動かさない。実際に出せたかどうかは人にしか
--       分からないので、結果は dm_mark() で別途受け取る。
-- ---------------------------------------------------------------------
create or replace function public.dm_next_batch(p_limit integer default 10)
returns setof public.dm_targets
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cap       integer;
  v_sent      integer;
  v_remaining integer;
begin
  select daily_cap into v_cap from public.dm_settings where id;

  select count(*) into v_sent
  from public.dm_targets
  where status = 'sent'
    and (sent_at at time zone 'Asia/Tokyo')::date
        = (now() at time zone 'Asia/Tokyo')::date;

  v_remaining := greatest(0, coalesce(v_cap, 0) - v_sent);
  if v_remaining = 0 then return; end if;

  return query
    select *
    from public.dm_targets
    where status = 'pending'
    order by created_at
    limit least(greatest(coalesce(p_limit, 10), 1), v_remaining);
end $$;

-- ---------------------------------------------------------------------
--  9. 結果の記録
--
--     状態を動かしつつ dm_events に1行残す。
--     sent のときだけ sent_at を入れる（制約と揃える）。
-- ---------------------------------------------------------------------
create or replace function public.dm_mark(
  p_id     uuid,
  p_status public.dm_status,
  p_note   text default null,
  p_actor  text default null
)
returns public.dm_targets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.dm_status;
  v_row    public.dm_targets;
begin
  select status into v_before from public.dm_targets where id = p_id for update;
  if not found then
    raise exception 'dm_targets の対象が見つかりません: %', p_id using errcode = 'no_data_found';
  end if;

  update public.dm_targets
  set status     = p_status,
      sent_at    = case when p_status = 'sent' then coalesce(sent_at, now()) else null end,
      last_error = case when p_status = 'failed' then p_note else null end,
      attempts   = attempts + case when p_status in ('sent', 'failed') then 1 else 0 end
  where id = p_id
  returning * into v_row;

  insert into public.dm_events (target_id, from_status, to_status, note, actor_email)
  values (p_id, v_before, p_status, nullif(btrim(coalesce(p_note, '')), ''), p_actor);

  return v_row;
end $$;

-- ---------------------------------------------------------------------
--  10. 権限 — service_role 以外は一切通さない
--
--      🚨 revoke ... from public だけでは anon / authenticated に
--        既に付いた権限が残る。必ず名指しする
--        （[[aiseki-revoke-must-name-roles]]）。
-- ---------------------------------------------------------------------
alter table public.dm_templates enable row level security;
alter table public.dm_targets   enable row level security;
alter table public.dm_events    enable row level security;
alter table public.dm_settings  enable row level security;

--  ポリシーは1つも作らない＝ anon / authenticated は RLS で全て落ちる。
--  service_role は RLS を迂回するので API 側からは通る。

revoke all on public.dm_templates from public, anon, authenticated;
revoke all on public.dm_targets   from public, anon, authenticated;
revoke all on public.dm_events    from public, anon, authenticated;
revoke all on public.dm_settings  from public, anon, authenticated;

revoke all on function public.dm_normalize_username(text)                     from public, anon, authenticated;
revoke all on function public.dm_stats()                                      from public, anon, authenticated;
revoke all on function public.dm_next_batch(integer)                          from public, anon, authenticated;
revoke all on function public.dm_mark(uuid, public.dm_status, text, text)     from public, anon, authenticated;

grant all on public.dm_templates to service_role;
grant all on public.dm_targets   to service_role;
grant all on public.dm_events    to service_role;
grant all on public.dm_settings  to service_role;

grant execute on function public.dm_normalize_username(text)                 to service_role;
grant execute on function public.dm_stats()                                  to service_role;
grant execute on function public.dm_next_batch(integer)                      to service_role;
grant execute on function public.dm_mark(uuid, public.dm_status, text, text) to service_role;

-- ---------------------------------------------------------------------
--  11. 検算 — anon / authenticated に権限が残っていないこと
--
--      §12 の「revoke したつもりで残っていた」を繰り返さないための確認。
--      残っていたら例外で落として気付けるようにする。
-- ---------------------------------------------------------------------
do $$
declare
  v_leak text;
begin
  select string_agg(format('%s→%s(%s)', grantee, table_name, privilege_type), ', ')
  into v_leak
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('dm_templates', 'dm_targets', 'dm_events', 'dm_settings')
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  if v_leak is not null then
    raise exception '営業リストの権限が残っています: %', v_leak;
  end if;

  raise notice 'dm_* : anon / authenticated への権限は無し（service_role のみ）';
end $$;

-- ---------------------------------------------------------------------
--  12. 既定のひな形を1つ入れておく（無いときだけ）
--
--      ⚠ 文面は「相席マッチ（AISEKI）の運営です」と名乗り、
--        用件と、断りたいときの導線を必ず入れる。
--        §1 の業態上の制約があるので「出会い」を訴求する文面にはしない。
-- ---------------------------------------------------------------------
insert into public.dm_templates (name, body, is_default)
select
  '初回のご挨拶',
  E'{{display_name}} 様\n\n'
  || E'はじめまして。相席マッチ（AISEKI）運営の者です。\n'
  || E'{{category}}の発信を拝見してご連絡しました。\n\n'
  || E'グループ同士で飲食店に相席する会をつくるサービスを運営しており、\n'
  || E'PR のご相談をさせていただけないかと考えております。\n'
  || E'条件面など、ご興味があればお返事いただけますと幸いです。\n\n'
  || E'ご不要でしたらこのままご放念ください。突然のご連絡失礼いたしました。\n'
  || E'https://aisekimatch.com',
  true
where not exists (select 1 from public.dm_templates);
