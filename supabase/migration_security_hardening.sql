-- =====================================================================
--  AISEKI — セキュリティ修正（2026-08-23）
--
--  2026-08-23 のセキュリティレビューで実証できた4件を塞ぐ。
--  いずれも「画面からは起こせないが、REST API を直接叩くと通ってしまう」もの。
--  何度実行しても同じ結果になる（冪等）。
--
--   1. アプローチの5通制限が、1リクエストに複数行を積むと回避できた
--   2. 参加承認後の会を、ホストが UPDATE / DELETE で直接消せた
--      （cancel_party() の「承認後は取り消せない」規則を迂回できた）
--   3. points（ポイント履歴）に、利用者が任意の行を書き込めた
--   4. avatars バケットの一覧が、未ログインでも取得できた
--      （＝全ユーザーの写真URLとUUIDが数えられた）
--
--  ついでに is_blocked() を呼び出し本人に縛る（他人同士の
--  ブロック関係を照会できないようにする）。
-- =====================================================================


-- =====================================================================
--  1. アプローチの通数制限を、行が入ったあとに数え直して強制する
--
--  【何が起きていたか】
--  messages_insert の WITH CHECK は
--    approach_message_count(...) < approach_message_limit()
--  で通数を見ていた。approach_message_count() は stable なので、
--  1つの INSERT 文の中では「文の開始時点」の件数しか返さない。
--  そのため
--    insert into messages select party, me, '...' from generate_series(1,50)
--  のように1リクエストへ複数行を積むと、50行すべてが count=0 を見て通った
--  （実測: 上限5に対し50通が保存された）。
--  PostgREST は JSON 配列を投げるだけでこの形になるため、画面を経由しない
--  攻撃者はいくらでも送れた。
--
--  【どう直すか】
--  WITH CHECK はそのまま残す（画面に分かりやすいエラーを出すため）。
--  そのうえで AFTER INSERT のトリガーで、行が入ったあとに数え直す。
--  AFTER トリガーは文の終わりに走るので、同じ文で入った行もすべて見える。
--  同時リクエストで競り合っても超えないように、(会, 送信者) 単位の
--  advisory lock でトランザクションを直列化する。
-- =====================================================================
create or replace function public.enforce_approach_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
  v_limit int := public.approach_message_limit();
begin
  -- 会のメンバーの発言は通常のグループチャット。上限は無い。
  if public.is_party_member(new.party_id, new.user_id) then
    return null;
  end if;

  -- 同じ (会, 送信者) の同時書き込みを直列化する。
  -- これが無いと、並行した2リクエストが互いの行を見ないまま両方通る。
  perform pg_advisory_xact_lock(
    hashtextextended(new.party_id::text || ':' || new.user_id::text, 0)
  );

  select count(*) into v_count
    from public.messages
   where party_id = new.party_id
     and user_id  = new.user_id;

  if v_count > v_limit then
    raise exception '1つの会に送れるメッセージは%通までです', v_limit
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_approach_limit() from public, anon, authenticated;

drop trigger if exists on_message_approach_limit on public.messages;
create trigger on_message_approach_limit
  after insert on public.messages
  for each row execute function public.enforce_approach_limit();


-- =====================================================================
--  2. 会（parties）をクライアントから直接 UPDATE / DELETE させない
--
--  【何が起きていたか】
--  parties_update / parties_delete が「ホスト本人なら何でも可」だったため、
--  ゲストグループの参加を承認して 3,800pt × 人数 を支払わせたあとに、
--    delete from parties where id = ...
--  で会ごと消せた（実測: 成功。席・グループチャット・参加リクエストが
--  cascade で消え、ゲストのポイントは戻らない）。
--  update で status='cancelled' にするのも同様に通った。
--  これは cancel_party() が明示的に禁じている操作
--  （「既に参加が承認されたグループがあるため取り消せません」）で、
--  関数側の規則だけがあり、テーブル側に無かった。
--
--  【どう直すか】
--  画面側（src/lib/api.js）は parties に対して insert しか行わない。
--  状態の変更はすべて security definer の関数
--  （cancel_party / accept_join_request / delete_account / 各トリガー）が行い、
--  これらは所有者権限で動くので RLS を通らない。
--  よってポリシーと権限を落としても機能は一切変わらず、
--  「関数を通らない状態変更」だけが不可能になる。
-- =====================================================================
drop policy if exists parties_update on public.parties;
drop policy if exists parties_delete on public.parties;
revoke update, delete on public.parties from anon, authenticated;

-- 会を作るときに必要な列だけ INSERT を許す
-- （status や current_members はトリガーが確定させるが、
--   そもそもクライアントから積ませない）
revoke insert on public.parties from anon, authenticated;
grant  insert (host_id, title, location, area, host_group_size, guest_group_size,
               host_member_names, party_time, party_date)
  on public.parties to authenticated;


-- =====================================================================
--  3. points（ポイント履歴）への直接 INSERT を止める
--
--  【何が起きていたか】
--  points_insert ポリシー（auth.uid() = user_id）と INSERT 権限が
--  残っていたため、利用者が自分の履歴に
--    amount = 999999, type = 'purchase'
--  のような架空の行を書き込めた（実測: 成功）。
--  残高（point_balances）は別テーブルなので増えないが、
--  マイページの履歴表示と、運営が突き合わせる台帳が汚れる。
--
--  【どう直すか】
--  points に行を作る経路は、いずれも security definer の関数だけ:
--    handle_new_user / purchase_points / convert_points /
--    accept_join_request / apply_referral_code
--  これらは RLS を迂回するので、ポリシーと権限を落としても動く。
--  画面側から points に insert している箇所は無い。
-- =====================================================================
drop policy if exists points_insert on public.points;
revoke insert, update, delete on public.points from anon, authenticated;
grant  select on public.points to authenticated;


-- =====================================================================
--  4. avatars バケットの「一覧」を閉じる
--
--  【何が起きていたか】
--  storage.objects の SELECT ポリシー avatars_public_read が
--    using (bucket_id = 'avatars')
--  で、ロール指定が無い（＝ public ＝ anon も含む）ため、
--  未ログインでも
--    POST /storage/v1/object/list/avatars
--  で全オブジェクトのパスが列挙できた（実測: anon / authenticated とも取得成功）。
--  パスは「<ユーザーUUID>/<ランダム>.jpg」なので、これは
--    ・写真をアップロードした全ユーザーの UUID
--    ・その全員のプロフィール写真の直リンク
--  が誰にでも取れることを意味する。
--  「ファイル名を推測できない値にする」（src/lib/api.js uploadAvatar）という
--  前提が、一覧できる時点で成り立っていなかった。
--  「氏名・写真・年齢は同じ会に参加承認されたメンバーにのみ公開」
--  （schema.sql 冒頭 / HANDOFF.md §1）に反する。
--
--  【どう直すか】
--  avatars は public バケットなので、表示に使う
--    GET /storage/v1/object/public/avatars/<path>
--  は RLS を経由しない。読み取りポリシーが無くても写真は今までどおり表示される。
--  一覧（list）と storage.objects への直接クエリだけが閉じる。
--  画面側は getPublicUrl() と remove() しか使っておらず、list() は使っていない。
--
--  ※ 本人が自分のフォルダを操作するための insert / update / delete
--    ポリシーは残す。remove() には対象行が見える必要があるため、
--    「自分のフォルダだけ」の SELECT を代わりに置く。
-- =====================================================================
drop policy if exists avatars_public_read on storage.objects;

drop policy if exists avatars_owner_read on storage.objects;
create policy avatars_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- =====================================================================
--  5. is_blocked() を呼び出し本人に縛る
--
--  security definer で anon / authenticated に開いているため、
--  UUID を2つ渡せば「他人同士がブロックし合っているか」を照会できた。
--  UUID は同じ会の party_members や会の host_id から手に入る。
--  ブロック関係は当事者以外に見せない。
--
--  ※ null の扱いに注意。この関数は parties_select（not is_blocked(...)）から
--    呼ばれる。未ログイン（auth.uid() が null）のときに null を返すと
--    not null → null → 偽 となり、未ログインの一覧が空になる。
--    必ず false を返すこと。
-- =====================================================================
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when a is null or b is null then false
    when auth.uid() is null then false
    -- 当事者でない組み合わせは、関係があっても無くても false を返す
    when a <> auth.uid() and b <> auth.uid() then false
    else exists (
      select 1 from public.blocks
       where (blocker_id = a and blocked_id = b)
          or (blocker_id = b and blocked_id = a)
    )
  end;
$$;

grant execute on function public.is_blocked(uuid, uuid) to anon, authenticated;


-- =====================================================================
--  適用結果
-- =====================================================================
do $$
declare
  v_ok boolean;
begin
  raise notice '── セキュリティ修正の適用結果 ──';

  select exists (select 1 from pg_trigger where tgname = 'on_message_approach_limit')
    into v_ok;
  raise notice '1. アプローチ通数トリガー : %', case when v_ok then 'あり' else '★無い' end;

  select not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'parties'
       and policyname in ('parties_update', 'parties_delete')
  ) into v_ok;
  raise notice '2. parties の直接更新/削除: %', case when v_ok then '閉じた' else '★残っている' end;

  select not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'points' and policyname = 'points_insert'
  ) into v_ok;
  raise notice '3. points への直接INSERT  : %', case when v_ok then '閉じた' else '★残っている' end;

  select not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_public_read'
  ) into v_ok;
  raise notice '4. avatars の一覧取得     : %', case when v_ok then '閉じた' else '★残っている' end;
end $$;
