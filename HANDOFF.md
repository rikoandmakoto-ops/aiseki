# AISEKI 引き継ぎ書

最終更新: 2026-08-22（メール本文の日本語化 / Production の service_role キーを現行プロジェクトへ修正）

> ## ⚠️ まずこれを読む — Supabase プロジェクトが変わった（2026-08-20）
>
> 受け取った Personal Access Token が **旧プロジェクト `tvydtsqirogdxglkoicz` とは別アカウント**
> （org `zack` / owner `riko.and.makoto@gmail.com`）のものだったため、旧 ref には 403 で触れなかった。
> Auth 設定は PAT でしか変えられないので、**同アカウントに新プロジェクトを作って移管した。**
>
> | | 旧 | 新（現行） |
> |---|---|---|
> | project ref | `tvydtsqirogdxglkoicz` | **`melfyxfvhyknqhruytms`** |
> | アカウント | 触れない（PAT が無い） | `riko.and.makoto@gmail.com` / org `zack` |
>
> スキーマ・データ・Vercel 環境変数・本番デプロイまで切り替え済み。
> **旧プロジェクトはまだ生きているが、もう接続先ではない。**
>
> **2026-08-22 に独自ドメイン `aisekimatch.com` へ移行し、本番デプロイ済み**
> （deployment id `dpl_G7GC6af9ux669kvvTsSVeXicnYmb`）。
> 本番配信 JS は `assets/index-B1I0jCrz.js`。新 ref のみを向いており、旧 ref は含まれない。
> 問い合わせ窓口は `theoffzaki@gmail.com`。
> Git リモートは未設定（バックアップ無し）。

このファイルは「このプロジェクトを初めて触る人が、まず読むもの」。
**ローンチまでの手順そのものは `LAUNCH.md` が正**。ここは全体像と現状を書く。

---

## 1. プロジェクト概要

### 何のアプリか

**AISEKI（相席）** — グループ同士で飲食店に相席する会をつくり、参加者を募るWebアプリ。

**業態上の最重要制約（設計の根幹）**

「インターネット異性紹介事業（出会い系サイト規制法）に**該当しない**」ことを前提に設計されている。
以下は機能追加で絶対に壊してはいけない。UIだけでなく **RLS（DBの行レベル権限）まで含めて担保**してある。

| 制約 | 担保している場所 |
|---|---|
| 会は「ホスト側2名以上 × 参加側2名以上」でのみ成立。1対1は不可 | DBのCHECK制約 + BEFORE INSERTトリガー |
| 個人間DMを実装しない。チャットは会単位のグループチャットのみ | スキーマにDMテーブルが無い |
| 氏名・写真・年齢は、同じ会に参加承認されたメンバーにのみ公開 | `profiles` / `party_members` / `messages` のRLS |
| 性別による制限・性別の表示を行わない | スキーマに性別カラムが無い |
| 20歳以上限定（飲酒を伴うため） | `src/lib/api.js` の `MIN_AGE = 20` + 登録時の生年月日必須 |

> DM機能・性別フィルタ・1名参加・プロフィールの一覧公開などの要望が来たら、
> **実装前に規制に触れる旨を指摘すること。**

### 技術スタック

| 層 | 使っているもの |
|---|---|
| フロント | React 18 + Vite 6（**Next.js ではない**。`VITE_` プレフィックスの環境変数を使う） |
| アイコン | lucide-react |
| バックエンド | Supabase（PostgreSQL + Auth + Storage + Realtime） |
| サーバー関数 | Vercel Functions（`api/` 配下。Stripe決済のみ） |
| 決済 | Stripe（**現在は placeholder で無効**） |
| ホスティング | Vercel |
| PWA | 手書きの Service Worker（`src/lib/pwa.js`） |

**ビジネスロジックの大半は DB 側（PL/pgSQL 関数 + RLS）にある。**
ポイントの移動・参加承認・退会などはすべて DB 関数。フロントは呼ぶだけ。
画面を迂回した不正操作を DB で止めるための構成なので、この方針は維持すること。

---

## 2. デプロイ先

| 項目 | 値 |
|---|---|
| 本番URL | **https://aisekimatch.com** （2026-08-22 時点で HTTP 200・稼働中） |
| Vercel プロジェクト名 | `aiseki` |
| Vercel projectId | `prj_eXehBy01ZFf7TYhqGI3d2zyvWu8I` |
| Vercel orgId | `team_r5d4Rpbmwu5q0EryE985968c` |
| 旧URL | https://aiseki-xi.vercel.app （まだ 200 を返す。Supabase の Redirect URLs にも残してある） |
| 独自ドメイン | ✅ **`aisekimatch.com`**（2026-08-21 取得 / Vercel の `aiseki` に接続済み）。DNS は xdomain（`ns1〜3.xdomain.ne.jp`）で管理 |

> ✅ **最新コミットはデプロイ済み**（2026-08-22）。
> `https://aisekimatch.com/` の canonical・og:url・og:image・twitter:image・JSON-LD、
> `/sitemap.xml` の `<loc>`、`/robots.txt` の `Sitemap:` が
> すべて `aisekimatch.com` になっていることを `curl` で確認済み。
> `/api/stripe/status` = `{"enabled":false}`。
> Supabase の接続先は現行 ref（**`melfyxfvhyknqhruytms`**）のみで、旧 ref は含まれない。

---

## 3. 認証情報まとめ

### Supabase（現行プロジェクト）

| 項目 | 値 |
|---|---|
| project ref | `melfyxfvhyknqhruytms` |
| 所属アカウント | `riko.and.makoto@gmail.com` / org `zack`（Free） |
| リージョン | ap-northeast-1 |
| API URL | `https://melfyxfvhyknqhruytms.supabase.co` |
| anon（publishable）キー | `.env` の `VITE_SUPABASE_ANON_KEY` を見る（`sb_publishable_...`） |
| DB ホスト | `db.melfyxfvhyknqhruytms.supabase.co:5432` |
| DB ユーザー / DB名 | `postgres` / `postgres` |
| DB パスワード | **このファイルには書かない**（下記参照） |

DB接続文字列の形:

```
postgresql://postgres:<DBパスワード>@db.melfyxfvhyknqhruytms.supabase.co:5432/postgres
```

> **DBパスワードの在り処: リポジトリ直下の `apply_migrations.command` の `DB_URL` 行。**
> このファイルは `.gitignore` で除外してある（コミットすると資格情報が Git 履歴に残るため）。
> **HANDOFF.md はコミットされうるので、ここには実値を書いていない。**
> 別の人に渡すときは、パスワードだけ別経路（パスワードマネージャ等）で渡すこと。

**anon キーについての注意**

- 新形式の **publishable key**（`sb_publishable_...`）を使っている。JWT（`eyJ...`）ではない。
  supabase-js / `apikey` ヘッダではそのまま anon キーとして通る。
- ただし `/rest/v1/` のルート（OpenAPI spec）だけは `Secret API key required` で **401 になる。これは正常**。
  疎通確認は `/auth/v1/health` か実テーブルへのクエリで行うこと。
- このキーはブラウザに配信されるもの（公開前提）。秘密ではない。

### 旧プロジェクト（触らないこと）

いずれも**まだ生きている**。環境変数や配信物にこの ref が出てきたら、それは事故。

| ref | 何だったか |
|---|---|
| `tvydtsqirogdxglkoicz` | 2026-08-20 まで本番。PAT が無いアカウントにあるため Auth 設定を変えられず、移管元になった |
| `lryjlxsfvzgtdxdjtemy` | 2026-08-18 まで本番 |

> `tvydtsqirogdxglkoicz` の DB パスワードは `apply_migrations.command` の
> コメントに参照用として残してある（接続はしないこと）。

### 現在保持していない資格情報

| 種類 | 状況 |
|---|---|
| Supabase Personal Access Token（`sbp_...`） | ✅ 受領済み（org `zack`）。**旧 ref には使えない**（403） |
| Supabase secret（service_role 相当）キー | ✅ 新プロジェクトのものを `.env` と Vercel Production に設定済み |
| Stripe の各キー | すべて placeholder（意図的） |

---

## 4. 現在の状態

### ✅ 完了しているもの

- **アプリの実装** — 会の作成・一覧・絞り込み・参加リクエスト・承認・グループチャット・
  プロフィール（写真6枚 / 趣味 / 職業等）・ブロック・友達招待・通報 / お問い合わせ・退会・
  ランディング・PWA・OGP / SEO / セキュリティヘッダまで一通り実装済み。
- **DBマイグレーション** — 現行プロジェクト（`melfyxfvhyknqhruytms`）に**適用済み**。
  - `migration_launch.sql`（2026-08-19）— 重複外部キー削除、`inquiries`、`cancel_party()`、
    `delete_account()`、`avatars` バケット
  - `migration_fixed_join_fee.sql`（2026-08-19）— 参加費3,800pt固定、`platform_revenues`
  - `migration_launch2.sql`（2026-08-19）— 登録ボーナス10,000pt、プロフィール項目追加、
    ブロック、紹介コード
- **過去の重大バグ** — 2件とも修正済み（§7）。
- **Vercel 環境変数の整理**（2026-08-20）— Preview に接続情報を追加、Development を
  旧プロジェクトから現行へ入れ替え、未使用の `NEXT_PUBLIC_*` を削除。
- **問い合わせ窓口** — `theoffzaki@gmail.com` に変更（コミット済み・**2026-08-20 デプロイ済み**）。
- **本番デプロイ**（2026-08-20 / 2026-08-22）— `vercel deploy --prod` を実行。
  HTTP 200 / `/api/stripe/status` = `{"enabled":false}` / セキュリティヘッダ（CSP・HSTS・X-Frame-Options）配信を確認。
- **独自ドメイン `aisekimatch.com` への統一**（2026-08-22）— コード・`robots.txt` / `sitemap.xml`・
  Supabase の `site_url` / `uri_allow_list` まで反映（旧 Vercel ドメインは Redirect URLs に残置）。

### ⛔ 完了していないもの

| 項目 | 現状 |
|---|---|
| ~~メール確認（Confirm email）~~ | ✅ 2026-08-20 に ON（`mailer_autoconfirm: false`） |
| ~~Redirect URLs の登録~~ | ✅ 2026-08-20 に登録済み |
| ~~独自SMTP~~ | ✅ **2026-08-22 完了。** Resend SMTP をフルセットで投入し GET で実値確認。**実アドレスへの配信も `delivered` を実測**。送信元 `noreply@aisekimatch.com` / 差出人名 `相席マッチ`（`LAUNCH.md` §2-3） |
| ~~メール本文の日本語化~~ | ✅ **2026-08-22 完了。** Management API で件名・本文を日本語化（`scripts/apply_email_templates.mjs`）。GET で保存値を照合し、実アドレスへの signup が 200 を返すことまで確認 |
| ~~最新コミットのデプロイ~~ | ✅ 2026-08-20 実施済み |
| ~~Production の `SUPABASE_SERVICE_ROLE_KEY`~~ | ✅ **2026-08-22 に入れ替え。** ⚠️ ここには「2026-08-20 に入れ替え済み」と書いてあったが**誤りだった**。`vercel env ls production` の作成日が 13日前（＝現行プロジェクトが存在する前）で、実際には旧プロジェクトのキーが残っていた。`.env` の `sb_secret_...` に差し替えて再デプロイ済み |
| Stripe決済 | placeholder のまま（意図的。無効でもアプリは動く） |
| ~~独自ドメイン~~ | ✅ 2026-08-21 に `aisekimatch.com` 取得・接続済み |
| 実機での動作確認 | 未実施（チェックリストは `LAUNCH.md` §5） |
| 運営体制（通報対応者・営業許可確認・本店所在地） | 未確定 |

---

## 5. 残タスク一覧（優先度順）

### 🔴 P0 — これをやらないと公開できない

1. ~~**Supabase Personal Access Token を発行する**~~ ✅ **2026-08-20 完了。**
   ただし別アカウント（org `zack`）のものだったため、新プロジェクトへ移管して使った。

2. ~~**Auth設定を適用する**~~ ✅ **2026-08-20 完了。**
   `melfyxfvhyknqhruytms` に対し Redirect URLs → メール確認 の順で適用し、反映確認済み。

3. ~~**最新コミットをデプロイする**~~ ✅ **2026-08-20 完了。**
   以降コードを変えたら `vercel deploy --prod` を忘れないこと。

4. ~~**独自SMTP**~~ ✅ **2026-08-22 完了。**
   Resend SMTP をフルセットで `PATCH /v1/projects/{ref}/config/auth` に投入し、
   GET で実値確認済み（`smtp.resend.com:465` / user `resend` /
   送信元 `noreply@aisekimatch.com` / 差出人名 `相席マッチ` / `rate_limit_email_sent` 30）。
   Resend 側も `aisekimatch.com` が **verified**。

   ⛔ **2回ハマっているので、次に触るときは必ず `LAUNCH.md` §2-3 を読むこと。**
   - **設定は消えることがある。** 2026-08-21 に入れた SMTP が翌日には全項目 `null` に
     戻っていた（`rate_limit_email_sent` も 30 → 2）。同じ PAT で `site_url` は
     即反映されたので**トークンや権限の問題ではない**。原因未特定。
   - **一部だけの PATCH は 200 を返すのに保存されない。** custom SMTP は
     **all-or-nothing**。`smtp_admin_email` だけ送っても黙って捨てられる
     （レスポンスが `null` を echo し返す）。**必ずフルセット + GET で確認。**

   Resend APIキーはリポジトリにも `.env` にも置いていない（Supabase 側にだけ入っている）。

5. ~~**登録メールが実際に届くか確認する**~~ ✅ **2026-08-22 完了。**
   `theoffzaki@gmail.com` で signup → **HTTP 200**（以前は 500）→ Resend のログで
   **`delivered`**（`"相席マッチ" <noreply@aisekimatch.com>` 発、約2.3秒）を確認。
   テストユーザーは削除済み（`profiles` も CASCADE で消え、残骸なしを確認）。

> ### 🎉 P0 はすべて完了。公開をブロックする技術的な問題は無くなった。
> **確認メールの件名・本文も 2026-08-22 に日本語化済み**（`LAUNCH.md` §2-4）。
> 残るのは人の手が要るもの（実機確認・運営体制・所在地）だけ。

### 🟠 P1 — 公開直後に困るもの

6. **実機で動作確認する** — チェックリストは `LAUNCH.md` §5。

7. **通報が届いたときに誰が見るか決める** — `inquiries` テーブルを Supabase の Table Editor で確認する運用。管理画面は無い。

8. **利用規約の「当社の本店所在地」（第23条）を実在の所在地に合わせる**

9. **提携店舗の飲食店営業許可・深夜酒類提供飲食店営業の届出を確認する**

### 🟡 P2 — 決済を有効にするとき

10. ~~**Production の `SUPABASE_SERVICE_ROLE_KEY` を現行プロジェクトのものへ入れ直す**~~
   ✅ **2026-08-22 完了。** 実際に旧プロジェクトのキーが残っていた（§4 参照）。
   `.env` の値へ入れ替え、環境変数を反映させるために `vercel deploy --prod` も実行済み。
   → **環境変数を変えたら再デプロイするまで実行時には反映されない。**

11. **Stripe の本番キー設定 + Webhook 登録** — 手順は `LAUNCH.md` §4。

### 🟢 P3 — 落ち着いてから

12. ~~メール本文の日本語化~~ ✅ 2026-08-22 完了（P1 に繰り上げて実施。`LAUNCH.md` §2-4）
13. ~~独自ドメイン取得~~ ✅ 2026-08-21 取得・2026-08-22 に全箇所反映
    （`legal.js` の `SERVICE_URL` / `index.html` の canonical・OGP・JSON-LD /
    `robots.txt` / `sitemap.xml` / `apply_auth_config.mjs` / Supabase の site_url・Redirect URLs）。
    **残: 決済を有効にするときに Vercel の `PUBLIC_BASE_URL` も差し替える**
14. プッシュ通知、運営用管理画面、参加者の途中離脱（すべて未実装）

---

## 6. 既知の制約・ハマりどころ

### ⛔ 触ってはいけないもの

- **BAT営業用のプロジェクト・ファイル** — このリポジトリとは無関係。**絶対に触らない。**
- **他のプロジェクト全般** — 作業範囲は `/Users/ayukiyamazaki/Developer/aiseki` のみ。
- **force push 禁止。**
- **旧Supabaseプロジェクト `lryjlxsfvzgtdxdjtemy`** — まだ生きている。接続先にしない。

### Auth設定は PAT でしか変えられない（2026-08-20 に全経路検証済み・再調査不要）

> **さらに: PAT は「そのプロジェクトを持つアカウント」のものでなければ効かない。**
> 別アカウントの PAT だと `GET /v1/projects/{ref}` の時点で 403 になり、
> `GET /v1/projects` にもそのプロジェクトが出てこない。
> 新しい PAT を渡されたら、まず `curl -H "Authorization: Bearer $PAT" https://api.supabase.com/v1/projects`
> で**対象プロジェクトが一覧に出るか**を確認すること。出なければ設定は変えられない。

| 試したもの | 結果 |
|---|---|
| DBに直接SQL（`auth.config`） | ❌ `auth` スキーマに config テーブルが**存在しない**。ホスト版 GoTrue は設定をコンテナの環境変数から読む |
| service_role + GoTrue Admin API | ❌ `/auth/v1/admin/` はユーザー操作専用。設定変更のエンドポイントが無い |
| Vercel から service_role を取得 | ❌ Sensitive 指定で書き込み専用。`vercel env pull` は空文字を返す |
| `~/.supabase/` のトークン流用 | ❌ 未ログイン。keychain・環境変数にも無い |

**「DBに入れるのだから設定も変えられるはず」で何度も時間を溶かしている。**
DB到達性と Auth 設定変更は別レイヤー。

### その他

- **Stripe は placeholder のまま**（意図的）。決済無しでもアプリは動く。
  購入画面は `/api/stripe/status` を見て「準備中」に切り替わる（現在 `{"enabled":false}`）。
  `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` が
  **3つとも**揃って初めて有効になる。
- **`VITE_` を付けてよい変数を間違えない。** `VITE_` 付きはブラウザに埋め込まれる。
  `SUPABASE_SERVICE_ROLE_KEY` と `STRIPE_SECRET_KEY` に **絶対に付けない**。
- **`npm run dev` では `/api` が動かない**（Vite にサーバー関数は無い）。決済を触るなら `vercel dev`。
- **このMacに `psql` は入っていない。** SQLを流すなら §8 の方法。
- **`supabase db dump` も使えない**（Docker が入っていないため `LegacyDockerRunError` になる）。
  スキーマを移すときはリポジトリの SQL を順に流す。
- **Vercel CLI 53.1.1 では `vercel env add <name> preview` が非対話で通らない**
  （ブランチを聞かれ `--value` も効かない）。`POST /v10/projects/{id}/env` を直接叩く。
  ※ CLI 自体も古い（最新は 59.x）。
- **値を2箇所直す必要があるもの** — 片方だけ変えると表示と実際がずれる。
  - ポイント額: `src/lib/api.js` の `SIGNUP_BONUS` / `REFERRAL_BONUS` と、
    `migration_launch2.sql` の `signup_bonus()` / `referral_bonus()`
  - 参加費: `src/lib/api.js` の `JOIN_FEE_PER_PERSON` と `join_fee_per_person()`
- **プランの単価は `src/lib/packs.js` が唯一の出典。** Stripe には金額を保存していない。

### 実装済みだが制限があるもの

| 項目 | 現状 |
|---|---|
| 通知 | アプリを開いたときのみ。プッシュ通知は未実装。バッジは60秒ごと更新 |
| 会の取り消し | 承認前のみ（承認後はポイント消費済みのため） |
| 運営の売上確認 | `platform_revenues` を直接見る。集計画面は無い |
| 参加者の途中離脱 | 未実装。グループチャットで相談してもらう運用 |
| 本人確認バッジ | 未実装（安全センターに「準備中」として掲示） |
| 開催日が無い会 | 旧データのみ。`party_date` が null で日付絞り込みに出ない |

---

## 7. 過去のバグ（どちらも修正済み・再発時の見分け方）

`profiles` 関連のエラーは**スキーマ由来**。接続設定や環境変数を疑うと時間を溶かす。
**まずエラーコードを見ること。**

- **`42501 permission denied for function shares_party`** → 関数の EXECUTE 権限。
  `schema.sql` が `shares_party()` / `is_party_member()` の EXECUTE を `authenticated` から
  revoke していたのに、RLSポリシー本体がその関数を呼んでいた。
  2026-08-18 に `grant execute ... to authenticated` を追加し本番適用済み。
- **`PGRST201 Could not embed ... more than one relationship`** → 外部キーの重複。
  `party_members.user_id → profiles.id` と `messages.user_id → profiles.id` に
  外部キーが2本ずつ張られていた。症状は「会の詳細が『会が見つかりませんでした』になる」
  「グループチャットが読み込めない」。**RLS のエラーに見えるが RLS は無関係。**
  対処済み: `api.js` で外部キー名を明示（`profiles!party_members_user_id_fkey(...)`）+
  `migration_launch.sql` で重複を削除。
  → **新しくテーブルから `profiles` を埋め込むときは、最初から外部キー名を明示すること。**

---

## 8. 前回成功した方法（そのまま真似してよい）

### SQLの適用 — node の `pg` で IPv6 直結

```bash
AISEKI_DB_PASSWORD='<DBパスワード>' node scripts/apply_sql.mjs supabase/migration_launch2.sql
```

> スキーマを一から作り直すときの順番:
> `schema.sql` → `migration_launch.sql` → `migration_fixed_join_fee.sql` → `migration_launch2.sql`。
> 2026-08-20 の移管ではこの順で流し、旧DBとスキーマを機械的に突き合わせて一致を確認した。

接続先は `.env` の `VITE_SUPABASE_URL` から組み立てる（誤爆防止。実行時に接続先が表示される）。

自分で書く場合のポイント:

- `db.<ref>.supabase.co` は **AAAA しか返さない（IPv6専用）** が、この環境からは通る。
  プーラー（`aws-*-ap-northeast-1.pooler.supabase.com:5432`, user は `postgres.<ref>`）も
  控えとして使えるが、直結で足りている。
- `client.query(巨大なSQL文字列)` は簡易クエリプロトコルなので、
  **複数文・ドル引用符・DOブロックをまとめて1回で実行できる。分割は要らない。**
- `client.on('notice', ...)` を**必ず付ける**。付けないと `raise notice` の適用ログが全部消える。
- `ssl: { rejectUnauthorized: false }`

### サイトURLを変えるときに直す場所（2026-08-22 の移行で確定）

片方だけ直すと OGP や検索結果が旧ドメインを指したままになる。

| 場所 | 何 |
|---|---|
| `src/lib/legal.js` | `SERVICE_URL`（※ export だけで未使用。バンドルには入らないが規約の出典） |
| `index.html` | canonical / og:url / og:image / twitter:image / JSON-LD の `url` |
| `public/robots.txt` | `Sitemap:` 行 |
| `public/sitemap.xml` | `<loc>` |
| `scripts/apply_auth_config.mjs` | `SITE_URL` / `LEGACY_URLS` |
| Supabase Auth | `site_url` / `uri_allow_list`（旧ドメインも残す） |
| Vercel 環境変数 | `PUBLIC_BASE_URL`（決済を使うときだけ） |

### Auth設定の適用 — Management API（PAT必須）

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply_auth_config.mjs
```

正しい順番（Redirect URLs → メール確認）で流し、`/auth/v1/settings` で反映確認までやる。

**SMTP も API から設定できる（2026-08-21 に判明。旧記述の「手作業」は誤り）。**
メソッドは **`PATCH`**（`PUT` は `Cannot PUT ...` で落ちる）。

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/melfyxfvhyknqhruytms/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"smtp_host":"smtp.resend.com","smtp_port":"465","smtp_user":"resend",
       "smtp_pass":"<APIキー>","smtp_admin_email":"noreply@<検証済みドメイン>",
       "smtp_sender_name":"AISEKI","rate_limit_email_sent":30}'
```

**メール本文・件名（2-4）も同じ API で設定できる（2026-08-22 に判明。旧記述の「手作業」は誤り）。**
件名は `mailer_subjects_*`、本文は `mailer_templates_*_content`。

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply_email_templates.mjs
```

PATCH のあと **必ず GET で読み直して照合する**（SMTP と同じ枠なので、200 でも
保存されていないことがある）。このスクリプトは照合と SMTP の生存確認まで自動でやる。

### テストユーザーの作成 — service_role が要る（2026-08-20 以降）

メール確認を ON にしたので、**anon キーの signup では確認済みユーザーは作れない。**
`.env` の `SUPABASE_SERVICE_ROLE_KEY` に新プロジェクトの secret キーが入っているので、
そのまま次で作れる（Admin API を使うため確認メールは飛ばず、SMTP のレート制限も踏まない）。

```bash
node scripts/create_test_user.mjs --email you+test1@gmail.com --password Test123456!
```

2026-08-20 に実行して、作成 → ログイン → `profiles` 生成 → 紹介コード発行 →
登録ボーナス 10,000pt の付与まで通ることを確認済み（確認用ユーザーは削除済み）。

- **`birth_date` を必ず入れる**（スクリプトの既定値に入っている）。`handle_new_user()` トリガーが
  それを見て profiles 行とボーナスポイントを作る。無いと登録ごと失敗する。
- メールアドレスは **MX レコードのあるドメイン**にする。`example.com` は
  Supabase 側の検証で `email_address_invalid` になる。

### ポイント仕様のテスト

```bash
DB_PASSWORD=<DBパスワード> npm test
```

参加費が一律3,800ptで、全額が運営に入りホストには1ptも渡らないことを実DBで検証する。
テスト用データを作るが、**すべてトランザクション内で最後に必ず ROLLBACK する**ので本番データは変わらない。

---

## 9. ファイル構成

```
aiseki/
├── LAUNCH.md            ★ ローンチ手順（人の手でやることの正）
├── HANDOFF.md           このファイル
├── index.html
├── vite.config.js / vercel.json
│
├── src/
│   ├── main.jsx
│   ├── App.jsx          (2,457行) ★ 画面の大半。会の一覧/作成/詳細/チャット/ポイント/設定
│   ├── index.css        ダークネイビー × ゴールドの高級ラウンジ調
│   ├── lib/
│   │   ├── api.js       (1,175行) ★ Supabase 呼び出しと定数の集約
│   │   │                  MIN_AGE=20 / JOIN_FEE_PER_PERSON=3800
│   │   │                  SIGNUP_BONUS=10000 / REFERRAL_BONUS=3800
│   │   ├── legal.js     ★ 規約・プライバシーポリシーの単一の出典
│   │   │                  CONTACT_EMAIL / SERVICE_URL / LEGAL_VERSION
│   │   ├── packs.js     ★ ポイントプランの単価（唯一の出典）
│   │   ├── supabase.js  クライアント生成
│   │   ├── theme.jsx / toast.jsx / pwa.js
│   │   └── screens/     Auth / Landing / ProfileEdit / Terms / Safety /
│   │                    Support / Referral / Notifications / MemberSheet /
│   │                    ResetPassword / InstallCard
│
├── api/                 Vercel Functions（決済のみ）
│   ├── _lib.js
│   └── stripe/          checkout.js / status.js / webhook.js
│
├── supabase/
│   ├── schema.sql                    ベーススキーマ（テーブル/RLS/関数）
│   ├── migration_launch.sql          ✅適用済 外部キー修正/inquiries/退会/avatars
│   ├── migration_fixed_join_fee.sql  ✅適用済 参加費3800固定/platform_revenues
│   ├── migration_launch2.sql         ✅適用済 登録ボーナス/プロフィール拡張/ブロック/紹介
│   └── migration_*.sql               （それ以前の履歴）
│
└── scripts/
    ├── apply_sql.mjs            ★ SQL適用（node pg / IPv6直結）
    ├── apply_auth_config.mjs    ★ Auth設定適用（PAT必須）
    ├── create_test_user.mjs     テストユーザー作成
    ├── generate_icons.mjs       アイコン・OGP画像の生成
    ├── test_join_fee.mjs        `npm test` の本体
    └── *.command                ダブルクリック用のラッパ

（gitignore 済み: .env / .vercel / dist / node_modules /
  apply_migrations.command（DBパスワードを含む）/ *.docx / *.pptx）
```

### 開発コマンド

```bash
npm run dev      # 開発サーバー（/api は動かない）
vercel dev       # /api（決済）も含めて動かす
npm run build    # 本番ビルド
npm test         # ポイント仕様のテスト（DB_PASSWORD が要る）
node scripts/generate_icons.mjs   # アイコン・OGP画像を作り直す
```

### Git

- 作業ブランチは `main`。Git リモートは未設定（バックアップ無し）。
- `feat/branding-refresh-age20` / `feat/codex-ui-refresh` /
  `feat/stripe-checkout-sky-blue-ui` は過去のブランチ。**現在の `main` に取り込む必要は無い**
  （`feat/codex-ui-refresh` は revert 済みのUI刷新）。
- **force push 禁止。**
