-- =====================================================================
--  AISEKI — ローンチ用マイグレーション
--
--  適用方法: Supabase ダッシュボード → SQL Editor にこのファイルを
--            貼り付けて実行する（何度実行しても安全）。
--            scripts/1_SupabaseにSQLを適用.command からも実行できる。
--
--  このマイグレーションで追加されるもの
--    1. inquiries        … お問い合わせ・ユーザー通報の受け口
--    2. cancel_party()   … ホストによる会の取り消し
--    3. delete_account() … 退会（利用規約 第15条で約束している機能）
--    4. avatars バケット … プロフィール写真のアップロード先
--    5. 入力値の上限制約 … 文字数・ポイント数の上限を DB 側でも強制する
--
--  ※ 既存の仕様（グループ限定・個室禁止・20歳以上限定・DM無し）は
--     一切変更しない。追加のみ。
-- =====================================================================

-- =====================================================================
--  0. 重複した外部キーの掃除（既存の不具合の修正）
--
--  party_members.user_id → profiles.id と messages.user_id → profiles.id に、
--  過去のマイグレーションの名残で外部キーが二重に張られている環境がある
--  （party_members_user_id_fkey と party_members_user_id_fkey_profiles など）。
--
--  この状態だと PostgREST が profiles を埋め込めず、
--    PGRST201 "Could not embed because more than one relationship was found"
--  で 会の詳細（参加メンバー一覧）とグループチャットが必ず失敗する。
--
--  同じ列から profiles を指す外部キーが2本以上あるとき、
--  正式な名前のものだけを残して他を落とす。
-- =====================================================================
do $$
declare
  r record;
  keep text;
begin
  foreach keep in array array['party_members', 'messages'] loop
    for r in
      select con.conname
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class tgt on tgt.oid = con.confrelid
        join pg_namespace ns on ns.oid = src.relnamespace
       where con.contype = 'f'
         and ns.nspname = 'public'
         and src.relname = keep
         and tgt.relname = 'profiles'
         and con.conkey = array[
               (select attnum from pg_attribute
                 where attrelid = src.oid and attname = 'user_id')
             ]::smallint[]
         and con.conname <> keep || '_user_id_fkey'
    loop
      execute format('alter table public.%I drop constraint %I', keep, r.conname);
      raise notice '重複した外部キーを削除しました: %.%', keep, r.conname;
    end loop;

    -- 正式な名前のものが無ければ張り直す
    if not exists (
      select 1 from pg_constraint
       where conname = keep || '_user_id_fkey'
         and conrelid = format('public.%I', keep)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) '
        'references public.profiles(id) on delete cascade',
        keep, keep || '_user_id_fkey'
      );
      raise notice '外部キーを作成しました: %_user_id_fkey', keep;
    end if;
  end loop;
end $$;

-- =====================================================================
--  1. inquiries … お問い合わせ / 通報
--
--  ・ユーザーからの問い合わせと、他ユーザーの通報を同じ表で受ける。
--  ・本人だけが自分の送信内容を読める。運営は service_role で読む。
--  ・通報の対象ユーザー（target_user_id）は、通報者本人には返さない
--    ようにする必要はない（自分が誰を通報したかは分かってよい）。
-- =====================================================================
create table if not exists public.inquiries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete set null,
  kind           text not null default 'question',   -- 'question' | 'report' | 'feedback'
  subject        text,
  body           text not null,
  reply_email    text,                               -- 返信先（未ログイン時・登録外アドレス希望時）
  target_user_id uuid references public.profiles(id) on delete set null, -- 通報対象
  target_party_id uuid references public.parties(id) on delete set null, -- 対象の会
  status         text not null default 'open',       -- 'open' | 'in_progress' | 'closed'
  created_at     timestamptz not null default now()
);

alter table public.inquiries drop constraint if exists inquiries_kind_check;
alter table public.inquiries add constraint inquiries_kind_check
  check (kind in ('question', 'report', 'feedback'));

alter table public.inquiries drop constraint if exists inquiries_body_len;
alter table public.inquiries add constraint inquiries_body_len
  check (char_length(body) between 1 and 4000);

alter table public.inquiries drop constraint if exists inquiries_subject_len;
alter table public.inquiries add constraint inquiries_subject_len
  check (subject is null or char_length(subject) <= 120);

alter table public.inquiries drop constraint if exists inquiries_email_len;
alter table public.inquiries add constraint inquiries_email_len
  check (reply_email is null or char_length(reply_email) <= 254);

create index if not exists inquiries_user_idx   on public.inquiries(user_id, created_at desc);
create index if not exists inquiries_status_idx on public.inquiries(status, created_at desc);

alter table public.inquiries enable row level security;

-- 送信できるのはログイン中の本人のみ（user_id を他人にできない）
drop policy if exists inquiries_insert on public.inquiries;
create policy inquiries_insert on public.inquiries for insert
  with check (user_id = auth.uid());

-- 読めるのは自分が送ったものだけ。運営は service_role で読む。
drop policy if exists inquiries_select on public.inquiries;
create policy inquiries_select on public.inquiries for select
  using (user_id = auth.uid());

-- status は運営だけが動かす（利用者に書き換えさせない）
revoke all on public.inquiries from anon, authenticated;
grant select (id, user_id, kind, subject, body, reply_email,
              target_user_id, target_party_id, status, created_at)
  on public.inquiries to authenticated;
grant insert (user_id, kind, subject, body, reply_email,
              target_user_id, target_party_id)
  on public.inquiries to authenticated;

-- =====================================================================
--  2. cancel_party() … ホストによる会の取り消し
--
--  ポイントはゲストグループの参加が承認された時点で消費される
--  （全額が運営の収益になり、ホストには渡らない）。
--  取り消しでポイントを戻す処理を入れると、
--  「承認 → 取り消し」を繰り返して枠だけ空ける操作ができてしまうため、
--  取り消せるのは「まだゲストグループを1組も承認していない会」だけにする。
--  承認済みの会を中止したい場合はグループチャットで相談してもらう。
-- =====================================================================
create or replace function public.cancel_party(p_party uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_host   uuid;
  v_status text;
  v_guests int;
begin
  if auth.uid() is null then
    raise exception '認証が必要です';
  end if;

  select host_id, status into v_host, v_status
    from public.parties where id = p_party;
  if not found then
    raise exception '会が見つかりません';
  end if;
  if v_host <> auth.uid() then
    raise exception 'この会のホストのみ取り消せます';
  end if;
  if v_status = 'cancelled' then
    return;  -- 二重取り消しは黙って成功にする
  end if;

  -- ゲスト側の席が1つでも埋まっていたら取り消せない
  select count(*) into v_guests
    from public.party_members
   where party_id = p_party and side = 'guest';
  if v_guests > 0 then
    raise exception '既に参加が承認されたグループがあるため取り消せません。グループチャットでご相談ください。';
  end if;

  -- 保留中のリクエストは自動的に見送りにする（申請者を待たせ続けないため）
  update public.join_requests
     set status = 'rejected'
   where party_id = p_party and status = 'pending';

  update public.parties set status = 'cancelled' where id = p_party;
end;
$$;

-- 'cancelled' を status に保存できるようにする（既存の制約があれば張り替える）
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'parties_status_check' and conrelid = 'public.parties'::regclass
  ) then
    alter table public.parties drop constraint parties_status_check;
  end if;
  alter table public.parties add constraint parties_status_check
    check (status in ('recruiting', 'matched', 'completed', 'cancelled'));
exception when check_violation then
  raise notice '想定外の status を持つ会が存在するため parties_status_check は追加しませんでした。';
end $$;

revoke all on function public.cancel_party(uuid) from public, anon;
grant execute on function public.cancel_party(uuid) to authenticated;

-- =====================================================================
--  3. delete_account() … 退会
--
--  auth.users の行を消すと、profiles / point_balances / points /
--  parties / party_members / join_requests / messages はすべて
--  on delete cascade で追随して消える（schema.sql の定義どおり）。
--
--  security definer（所有者 = postgres）なので auth スキーマに触れる。
--  自分自身の行しか消せない（auth.uid() で固定している）。
-- =====================================================================
create or replace function public.delete_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '認証が必要です';
  end if;

  -- 同伴者として引き受けた席は「未登録の席」に戻す。
  -- 行ごと消すとグループの人数が減り、相手グループの会が壊れるため。
  update public.party_members
     set user_id = null
   where user_id = v_uid
     and role <> 'host';

  -- ホストとして募集中の会は取り消す（相手を待たせたままにしない）
  update public.parties
     set status = 'cancelled'
   where host_id = v_uid and status = 'recruiting';

  update public.join_requests
     set status = 'rejected'
   where user_id = v_uid and status = 'pending';

  -- 本体を削除。残りは cascade で消える。
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- =====================================================================
--  4. avatars … プロフィール写真のバケット
--
--  ・公開読み取り（プロフィール写真は同じ会のメンバーに表示するため、
--    URL を知っていれば読める公開バケットにする。URL は推測できない
--    ユーザーID + ランダム文字列で構成する）
--  ・書き込めるのは「自分のユーザーIDのフォルダ配下」だけ。
--  ・1ファイル 2MB まで、画像のみ。
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
--  5. 入力値の上限（画面側のバリデーションを DB でも二重に強制する）
--
--  画面だけで長さを絞っても、API を直接叩けば無制限に入る。
--  巨大な文字列で他ユーザーの画面を壊せないよう、DB 側でも止める。
-- =====================================================================
do $$
begin
  -- プロフィール
  alter table public.profiles drop constraint if exists profiles_username_len;
  alter table public.profiles add constraint profiles_username_len
    check (username is null or char_length(username) <= 20) not valid;

  alter table public.profiles drop constraint if exists profiles_bio_len;
  alter table public.profiles add constraint profiles_bio_len
    check (bio is null or char_length(bio) <= 500) not valid;

  -- 写真の URL は「自前の avatars バケットの公開URL」だけを許す。
  --
  -- javascript: 等を保存させないためだけではない。外部URLを許すと、
  -- それを設定した本人が「同じ会のメンバーが画面を開いた時刻とIPアドレス」を
  -- 自分のサーバのアクセスログから取得できてしまう。
  -- 写真はアップロード方式に統一したので、外部URLは受け付けない。
  alter table public.profiles drop constraint if exists profiles_avatar_url_scheme;
  alter table public.profiles add constraint profiles_avatar_url_scheme
    check (
      avatar_url is null
      or avatar_url ~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/avatars/'
    ) not valid;

  -- 会
  alter table public.parties drop constraint if exists parties_title_len;
  alter table public.parties add constraint parties_title_len
    check (char_length(title) between 1 and 60) not valid;

  alter table public.parties drop constraint if exists parties_location_len;
  alter table public.parties add constraint parties_location_len
    check (location is null or char_length(location) <= 60) not valid;

  alter table public.parties drop constraint if exists parties_point_range;
  alter table public.parties add constraint parties_point_range
    check (point_request between 0 and 100000) not valid;

  -- メッセージ
  alter table public.messages drop constraint if exists messages_content_len;
  alter table public.messages add constraint messages_content_len
    check (char_length(content) between 1 and 2000) not valid;
end $$;

-- 既存データが上限を超えていないなら検証まで済ませる。
-- 超えていても新規行・更新行には制約が効くので、失敗しても止めない。
do $$
declare
  c text;
begin
  foreach c in array array[
    'public.profiles|profiles_username_len',
    'public.profiles|profiles_bio_len',
    'public.profiles|profiles_avatar_url_scheme',
    'public.parties|parties_title_len',
    'public.parties|parties_location_len',
    'public.parties|parties_point_range',
    'public.messages|messages_content_len'
  ] loop
    begin
      execute format('alter table %s validate constraint %s',
                     split_part(c, '|', 1), split_part(c, '|', 2));
    exception when others then
      raise notice '% は既存データが条件を満たさないため未検証です（新規行には有効）', c;
    end;
  end loop;
end $$;

-- =====================================================================
--  適用結果の確認
-- =====================================================================
do $$
begin
  raise notice '── AISEKI ローンチ用マイグレーション 適用完了 ──';
  raise notice 'inquiries        : %', (select count(*) from information_schema.tables
                                         where table_schema = 'public' and table_name = 'inquiries');
  raise notice 'cancel_party()   : %', (select count(*) from pg_proc
                                         where proname = 'cancel_party');
  raise notice 'delete_account() : %', (select count(*) from pg_proc
                                         where proname = 'delete_account');
  raise notice 'avatars バケット : %', (select count(*) from storage.buckets where id = 'avatars');
end $$;
