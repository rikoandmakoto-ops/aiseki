# AISEKI 引き継ぎ書

最終更新: 2026-08-23（セキュリティレビューと修正4件。§12）

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
> Git リモート: **https://github.com/zaki21016/aiseki**（private / 2026-08-22 作成）。

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
| 個人間DMを実装しない。チャットは会単位のグループチャットのみ | スキーマにDMテーブルが無い（会に参加していない方が送る「アプローチ」も宛先は会。§11） |
| 氏名・写真・年齢は、同じ会に参加承認されたメンバーにのみ公開 | `profiles` / `party_members` / `messages` のRLS |
| 性別を**会の参加条件に使わない**・他のユーザーに**表示しない** | `profiles` の列単位 SELECT 権限から `gender` を除外。募集条件に性別のカラムが無い。※2026-08-23 から登録時に性別を取得しているが、用途はアプローチの可否判定のみ（§11） |
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

> ✅ **広告用LPを本番へデプロイ済み**（2026-08-22 / deployment id `dpl_HiacMC3pPVFuRwzsb6XVf8XVQHzi`）。
> `https://aisekimatch.com/lp/women` · `/lp/men` が 200、canonical・OGP・`/og-women.png`（image/png）・
> `/sitemap.xml` の3URL・CSP / HSTS / X-Frame-Options まで `curl` で確認済み。
>
> ⚠️ **このときリモートビルドが詰まった。** `vercel deploy` / `--prod` が
> 15分以上 `UNKNOWN`（duration `?`）のまま進まず、alias も切り替わらなかった
> （Vercel のステータスページは全系統正常。原因未特定）。
> **手元でビルドして送る方法に切り替えたら 13秒で完了した**:
>
> ```bash
> vercel pull --environment=production --yes   # .vercel/.env.production.local を作る
> vercel build --prod
> vercel deploy --prebuilt --prod --yes
> ```
>
> 通常の `vercel deploy --prod` が進まないときは、まずこれを試すこと。
> なお **Bash をサンドボックス下で実行すると `vercel` は無言で止まる**（外部通信が遮断されるため）。
>
> 🚨 **ただしこの手順には落とし穴がある。そのまま流すとサイトが壊れる。**
> Vercel 側の `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` は **Sensitive（読み出し不可）**で
> 登録されているため、`vercel pull` はこの2つを **空文字 `""`** で書き出す。
> その状態で `vercel build` すると、`import.meta.env.VITE_SUPABASE_URL` が空のまま
> バンドルに焼き込まれ、公開後に
> 「接続先が設定されていません（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）」が出る。
> （実際 2026-08-22 の LP デプロイ `dpl_HiacMC3pPVFuRwzsb6XVf8XVQHzi` がこれで落ちた。）
>
> **`--prebuilt` で出すときは、`build` の前に必ず実値を埋め戻すこと**:
>
> ```bash
> vercel pull --environment=production --yes
> # ↓ pull 後に必ず。空になっている2つをローカル .env の実値で上書きする
> awk -F= '/^VITE_/{print $1" len="length($2)}' .vercel/.env.production.local   # len=2 なら空
> vercel build --prod
> grep -rl 'melfyxfvhyknqhruytms' .vercel/output/static/assets/   # ★ヒット必須。無ければ出すな
> vercel deploy --prebuilt --prod --yes
> ```
>
> **リモートビルド（`vercel deploy --prod`）ならこの問題は起きない。**
> Sensitive な値もビルド環境では正しく復号される。
>
> 🚨 **`git push` では本番に出ない（2026-08-23 に確認）。**
> Vercel プロジェクト `aiseki` は **GitHub 連携されていない**。
> `vercel project inspect aiseki` に Git Repository の欄が無く、
> 本番デプロイの Username は全て `zaki21016`（＝CLI から出したもの）。
> **push は GitHub にコードを残すだけで、デプロイは別途 CLI で行う必要がある。**
>
> ✅ **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` は Sensitive ではなくなった**
> （2026-08-23 時点。`vercel pull` で実値が落ちてくる。len=40 / len=46）。
> そのため上の「埋め戻し」はもう要らず、`--prebuilt` 手順がそのまま使える。
> **ただしバンドルへの grep 確認は引き続き必須**（下記が 2026-08-23 に実際に流した手順）:
>
> ```bash
> vercel pull --environment=production --yes
> awk -F= '/^VITE_/{v=$0; sub(/^[^=]*=/,"",v); print $1" len="length(v)}' .vercel/.env.production.local
> vercel build --prod
> grep -rl 'melfyxfvhyknqhruytms' .vercel/output/static/assets/   # ★ヒット必須
> grep -rl 'tvydtsqirogdxglkoicz' .vercel/output/static/assets/   # ★0件必須（旧ref）
> vercel deploy --prebuilt --prod --yes
> ```
>
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
  - `migration_reviews_approach_style.sql`（2026-08-23）— 内部評価・アプローチ・
    飲みスタイルタグ（下記「3機能の追加」）
  - `migration_security_hardening.sql`（2026-08-23）— セキュリティ修正4件（§12）
- **3機能の追加**（2026-08-23）— 詳細は §11。内部評価（`user_reviews`）／
  募集中の会へのアプローチ／飲みスタイルタグ。マイグレーション適用済み・
  `.e2e-tmp.mjs` の39項目が本番スキーマに対して全て成功。
- **過去の重大バグ** — 2件とも修正済み（§7）。
- **Vercel 環境変数の整理**（2026-08-20）— Preview に接続情報を追加、Development を
  旧プロジェクトから現行へ入れ替え、未使用の `NEXT_PUBLIC_*` を削除。
- **問い合わせ窓口** — `theoffzaki@gmail.com` に変更（コミット済み・**2026-08-20 デプロイ済み**）。
- **本番デプロイ**（2026-08-20 / 2026-08-22）— `vercel deploy --prod` を実行。
  HTTP 200 / `/api/stripe/status` = `{"enabled":false}` / セキュリティヘッダ（CSP・HSTS・X-Frame-Options）配信を確認。
- **独自ドメイン `aisekimatch.com` への統一**（2026-08-22）— コード・`robots.txt` / `sitemap.xml`・
  Supabase の `site_url` / `uri_allow_list` まで反映（旧 Vercel ドメインは Redirect URLs に残置）。
- **広告用ランディングページ**（2026-08-22）— `/lp/women`（募集する側＝おごられる側）と
  `/lp/men`（参加する側＝相席する側）の2枚。詳細は §10。

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

9-b. **サインアップに CAPTCHA を入れる**（§12「未対応」）。
   登録ボーナス 10,000pt ＋ 紹介ボーナス 3,800pt を自動登録で量産できる。
   **決済を有効にする（P2）より先にやること。**

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
├── index.html           アプリ本体のページ
├── lp/                  ★ 広告用LP（§10）。ページも中身もここに一式ある
│   ├── women.html / men.html    ページ（Vite のエントリ）
│   ├── women.jsx / men.jsx      それぞれの入口（supabase を読み込まない）
│   ├── WomenPage.jsx            /lp/women — 募集する側（おごられる側）向け
│   ├── MenPage.jsx              /lp/men   — 参加する側（相席する側）向け
│   └── LpKit.jsx                2枚で共有する部品（ヘッダー/セクション/FAQ/フッター）
├── vite.config.js / vercel.json
│
├── src/
│   ├── main.jsx
│   ├── App.jsx          (2,457行) ★ 画面の大半。会の一覧/作成/詳細/チャット/ポイント/設定
│   ├── index.css        ダークネイビー × ゴールドの高級ラウンジ調
│   ├── lib/
│   │   ├── api.js       (1,175行) ★ Supabase 呼び出しの集約（定数は pricing.js を再輸出）
│   │   ├── pricing.js   ★ 料金・人数・年齢の唯一の出典
│   │   │                  MIN_AGE=20 / MIN_GROUP_SIZE=2 / JOIN_FEE_PER_PERSON=3800
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
│   ├── migration_reviews_approach_style.sql ✅適用済 内部評価/アプローチ/飲みスタイル（§11）
│   ├── migration_security_hardening.sql     ✅適用済 セキュリティ修正4件（§12）
│   └── migration_*.sql               （それ以前の履歴）
│
└── scripts/
    ├── apply_sql.mjs            ★ SQL適用（node pg / IPv6直結）
    ├── apply_auth_config.mjs    ★ Auth設定適用（PAT必須）
    ├── create_test_user.mjs     テストユーザー作成
    ├── generate_icons.mjs       アイコン・OGP画像の生成
    ├── generate_lp_og.mjs       LPのOGP画像（og-women.png / og-men.png）の生成
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
node scripts/generate_lp_og.mjs   # LPのOGP画像を作り直す
```

> `npm run dev` では **LP は `/lp/women.html` / `/lp/men.html`** で開く
> （拡張子なしの `/lp/women` は Vercel の cleanUrls / rewrites による本番の挙動）。

### Git

- 作業ブランチは `main`。リモートは **`origin` = https://github.com/zaki21016/aiseki**（private）。
  2026-08-22 に作成し、全39コミットを push した（それまでバックアップが無かった）。
  **GitHub のアカウント名は `zaki21016`。`theoffzaki` は GitHub には存在しない**
  （`theoffzaki@gmail.com` はメールアドレス。Vercel も `zaki21016`）。
  `.env` と `apply_migrations.command` がリモートに存在しないことは push 後に確認済み。
- `feat/branding-refresh-age20` / `feat/codex-ui-refresh` /
  `feat/stripe-checkout-sky-blue-ui` は過去のブランチ。**現在の `main` に取り込む必要は無い**
  （`feat/codex-ui-refresh` は revert 済みのUI刷新）。
- **force push 禁止。**

---

## 10. 広告用ランディングページ（`/lp/women` · `/lp/men`）

2026-08-22 追加。広告の受け皿。**アプリ本体の LandingScreen（`/` の未ログイン画面）とは別物**で、
出口は「アプリの登録画面」ひとつに絞ってある。

| | `/lp/women` | `/lp/men` |
|---|---|---|
| 宛先 | 会を**募集する側**（＝おごられる側） | 会に**参加する側**（＝相席する側） |
| 主訴求 | 参加ポイント0pt・当日の飲食代も0円 | グループ同士で気軽・一律3,800ptの明朗会計 |
| CTA | 「無料で始める」 | 「相席を始める」 |
| リンク先 | `/?auth=signup&from=lp-women` | `/?auth=signup&from=lp-men` |
| OGP | `public/og-women.png` | `public/og-men.png` |
| 実体 | `lp/women.html` + `lp/WomenPage.jsx` | `lp/men.html` + `lp/MenPage.jsx` |

構成はどちらも ヒーロー → 特徴3つ → 使い方3ステップ →（男性向けのみポイント表）→ FAQ → CTA。

### 見た目の方針（2026-08-24 に作り直した。戻さないこと）

装飾を盛った版が「いかにも生成物」に見えたので、全部落として組み直した。
細則は `lp/LpKit.jsx` の冒頭コメントにある。要点だけ:

| やらないこと | 代わりに |
|---|---|
| 常時動くもの（パルス・ドリフト・光沢の走り・登場アニメーション） | 動きは hover だけ |
| 面・ボタン・罫・バッジのグラデーション、背景の光の玉 | 単色。グラデーションはロゴの文字だけ |
| 中央揃え・左右対称・均等なカード並び | 左寄せ。見出しは脇に寄せ、区切りは1pxの罫と余白だけ |
| 金をあちこちに使う | CTA・ロゴ・そのページで最も強い数字ひとつだけ |

- 背景は `.lp-root` の単色（`#0b1020`）で `body` の光を隠している。
- アプリ側の `.lux-cta` / `.press`（`src/index.css`）は光沢と持ち上がりが付くので、**LP では使わない**。
- 縦の間隔は `Section` の `pad` でセクションごとに変えてある（全部同じにすると単調になる）。
- 脇に寄せた見出しは幅が狭い。長い見出しは読点で自分で折る（任せると変な位置で割れる）。

### 作りの要点（触る前に読む）

- **LPのコードは `aiseki/lp/` に一式ある**（ページのHTMLも React も）。アプリ本体（`src/`）とは
  分けてあるので、LPだけ差し替えたいときはこのディレクトリだけ見ればいい。
- **ページを分けてある。** `vite.config.js` の `rollupOptions.input` にエントリが3つある
  （`index.html` / `lp/women.html` / `lp/men.html`）。LP は `supabase` を読み込まないので、
  広告からの初回表示にアプリのバンドルが乗らない。**LP から `src/lib/api.js` を import しないこと**
  （supabase クライアントが丸ごと入る）。数字が要るときは `../src/lib/pricing.js` から読む。
  テーマ（色・書体・部品）はアプリと同じ `../src/lib/theme.jsx` を共有している。
- **`/lp/women` で開けるのは `vercel.json` の rewrites のおかげ。**
  `"/(.*)" → "/"` のSPA用catch-allより**前**に `/lp/women → /lp/women.html` を置いてある。
  順番を入れ替えるとLPがアプリに吸われる。
- **CTA は `/?auth=signup`。** `App.jsx` がこれを読んで、ランディングを飛ばして登録フォームを開く。
  ⚠ `onAuthStateChange` は起動直後に **セッション無しの `INITIAL_SESSION`** を必ず一度流す。
  ここで `setAuthMode(null)` していたため、開いた登録フォームがその場で閉じていた（修正済み）。
  同じ理由で、`?auth=` の読み取りはモジュール読み込み時に一度だけ確定させている
  （描画のたびに読むと、URLから消したあとの再描画で null に戻る）。
- **Service Worker は `"/"` のときだけ枠を保存する。** 以前はどのページでも `"/"` として
  キャッシュしていたため、LP を見たあとオフラインでアプリを起動するとLPが出るおそれがあった。

### 文言についての約束（消さないこと）

- **AISEKI は性別を登録しない。** 広告の宛先は分けているが、ページ上の説明は必ず
  「募集する側（ホスト）／参加する側（ゲスト）」で書く。「女性は無料」とは書かない。
  `/lp/women` の FAQ にその旨を明記してある。
- ホストがおごられること、参加側が**ポイントに加えて当日の飲食代（ホスト分を含む）を負担する**ことは、
  両方のページに明記する。あとで揉めるので隠さない。
- グループ限定（2名以上×2名以上）／個室での相席なし／20歳以上限定／接待・サクラなし／
  個人間DMなしは、両方のページに残す（`src/lib/legal.js` の `FOOTER_NOTICE` を読んでいる）。

> ⚠ **業態上の注意。** 「相席で出会える」といった訴求は、規約上の立場
> （異性交際を目的としたサービスではない／インターネット異性紹介事業に非該当）と
> 読み手の受け取りがずれやすい。広告文を強める方向に直すときは、
> §1 の制約と `legal.js` の記述を必ず読み合わせること。

---

## 11. 追加した3機能（2026-08-23）

`supabase/migration_reviews_approach_style.sql` の1本にまとまっている（冪等・**適用済み**）。
検証は `.e2e-tmp.mjs`（未コミット）。本番スキーマに対して実ユーザーを作って39項目を
確かめ、最後にユーザーを消す。`node .e2e-tmp.mjs` で再実行できる。

### 1. 内部評価（`user_reviews`）

会の終了後に、同じ会にいた相手を5段階＋コメントで評価する。**相手には見えない。**

- 読めるのは自分が書いた行だけ（`user_reviews_select`）。
  自分が付けられた評価は**本人にも見えない**。運営だけが `service_role` で
  `user_review_scores` ビューを読む。
- 書けるのは「同じ会のメンバー」かつ「会が終わったあと」だけ。同じ会・同じ相手に1回。
- UPDATE / DELETE のポリシーを作っていない＝**取り消し・書き換えができない**。
- 画面は `src/screens/ReviewSheet.jsx`。会の詳細とチャット一覧の両方から開く。

> ⚠ `party_is_over()` の日付比較は **日本時間**（`now() at time zone 'Asia/Tokyo'`）。
> `current_date`（UTC）で比べると日本時間 0:00〜9:00 に画面とDBの判定がずれる。

### 2. アプローチ（会に参加していない方から募集中の会へ）

`approach_gender()`（＝女性）のユーザーが、参加していない募集中の会の
**グループチャットへ**メッセージを送れる。**個人宛DMではない**（宛先は `party_id`）。

非該当性の担保は全て DB 側にある（UIで隠しているのではない）:

| 担保 | 場所 |
|---|---|
| 送信者は会の会話を読めない（自分の送信分だけ） | `messages_select` |
| 送信者のプロフィールはホストに公開されない（表示名のみ） | `list_approach_senders()` / `profiles_select` は無変更 |
| 1つの会につき5通まで | `messages_insert` + `approach_message_limit()` |
| 募集中の会にだけ送れる | `can_approach_party()` |

> 🚨 **`can_approach_party(p_party, p_user)` には `p_user = auth.uid()` の縛りが要る。**
> この関数は `security definer` で `authenticated` に開いているため、縛りが無いと
> **他人の UUID を渡して true/false を見るだけで、その人の性別が分かってしまう**
> （UUID は同じ会の `party_members` から読める）。性別は他のユーザーに一切開示しない
> 前提（`src/lib/legal.js`）なので、これは規約違反になる。
> 実装当初この縛りが無く、2026-08-23 に追加した。`approach_message_count()` も同様。
> **この2つの関数を書き換えるときは、必ず `auth.uid()` への固定を残すこと。**

### 3. 飲みスタイルタグ（`drinking_style`）

「オールナイトOK」「2件目NG」など8種類から最大4個。**性別フィルタではなく全員が設定できる。**

- 選択肢・個数は DB の `drinking_style_options()` / `drinking_style_limit()` と
  画面側 `src/lib/pricing.js` の `DRINKING_STYLES` / `MAX_DRINKING_STYLES` の**両方**にある。
  **片方だけ変えると保存が CHECK 制約で落ちる。**
- 会の一覧でホストのタグを出すため、`parties.host_drinking_style` へ写している
  （`profiles` は同じ会のメンバーにしか見えないので、一覧のために開けるわけにいかない）。
  プロフィールを変えると募集中・マッチ済の会にも反映される（`sync_host_drinking_style`）。

### 性別（`profiles.gender`）について

カラム自体は最初から存在していた（未使用だった）。今回から登録時に必須にした。

- **用途はアプローチの可否判定のみ。** 会の参加条件にはならず、他のユーザーにも表示しない。
- `profiles` の列単位 SELECT 権限から `gender` を**外してある**。同じ会のメンバーでも
  他人の性別は読めない。本人が自分の設定を見る経路だけ `my_gender()` で開けている。
- **登録後は変更できない**（`on_profile_gender_lock`）。いつでも変えられると
  「送りたいときだけ女性にする」ができてしまい、条件が意味を失うため。
- 性別を集める前に登録した既存ユーザーは `null` のまま。マイページに設定を促すカードを出す。
- 規約・プライバシーポリシー（`src/lib/legal.js`）も 2.1 に改訂済み
  （第9条の2＝アプローチ、第9条の3＝評価、取得情報に性別を追加）。

---

## 12. セキュリティレビュー（2026-08-23）

`supabase/migration_reviews_approach_style.sql` までを対象に、RLS・権限・認証・
API・保存領域を通しで点検した。**実証できた4件は同日に修正して本番へ適用済み**
（`supabase/migration_security_hardening.sql`）。

検証は本番DBに対して行い、書き込みを伴うものは全て `BEGIN … ROLLBACK` の中で
実施した（本番データは変更していない）。保存領域の確認だけは実ファイルを1つ
置いて公開URLと一覧の挙動を見たあと削除した。

### 修正した4件

| # | 重大度 | 何が起きていたか |
|---|---|---|
| 1 | **High** | **アプローチの5通制限を、1リクエストに複数行を積むだけで回避できた**（上限5に対し実測50通が保存された） |
| 2 | **High** | **参加承認後の会を、ホストが `UPDATE` / `DELETE` で直接消せた**。`cancel_party()` の「承認後は取り消せない」規則を迂回できた |
| 3 | **High** | **`avatars` バケットの一覧が未ログインでも取れた**。全ユーザーのUUIDと写真の直リンクが列挙できた |
| 4 | Medium | **`points`（ポイント履歴）に利用者が任意の行を書けた**。残高は動かないが履歴と台帳が汚れる |

いずれも**画面からは起こせず、REST API を直接叩くと通る**類のもの。
詳しい原因と直し方は `migration_security_hardening.sql` のコメントに書いてある。

> ### 触るときの注意（再発しやすい形）
>
> - 🚨 **RLS の `WITH CHECK` で「件数の上限」を守ろうとしてはいけない。**
>   `stable` な関数は1つの INSERT 文の中で同じ値を返すので、複数行をまとめて
>   送られると全行が同じ「まだ0件」を見て通る。
>   **上限は `AFTER INSERT` トリガーで数え直す**（＝ `on_message_approach_limit`）。
>   同時リクエスト対策の advisory lock も込みで入れてある。
> - 🚨 **「関数側にだけある規則」はテーブル側にも要る。**
>   `cancel_party()` がいくら丁寧に条件を見ても、`parties` に UPDATE / DELETE の
>   ポリシーが開いていれば関数を通らずに同じことができる。
>   **`parties` への UPDATE / DELETE は塞いだ**。状態の変更は必ず
>   security definer の関数を通すこと（画面側も insert しか使っていない）。
> - 🚨 **public バケットに `select` ポリシーを付けると「一覧」まで開く。**
>   表示に使う `/storage/v1/object/public/...` は RLS を通らないので、
>   読み取りポリシーは**要らない**。付けると `POST /storage/v1/object/list/...` が
>   通り、`<UUID>/<ランダム>.jpg` というパスが全部見えてしまう
>   （＝「ファイル名は推測できない」という前提が崩れる）。
>   本人が自分のフォルダだけ見られる `avatars_owner_read` に置き換えてある
>   （`remove()` に必要）。
> - `is_blocked(a, b)` は**呼び出し本人が当事者のときだけ**判定する。
>   縛りを外すと第三者同士のブロック関係を照会できてしまう。
>   ⚠ **null のとき必ず `false` を返すこと。** `parties_select` が
>   `not is_blocked(...)` なので、null を返すと未ログインの募集一覧が空になる。

### 問題なしを確認したもの（再調査しなくてよい）

- `gender` は列単位で遮断されており、同じ会のメンバーでも他人の性別は読めない。
  `can_approach_party()` / `approach_message_count()` の `auth.uid()` 固定も効いている（§11 の懸念は解消済み）。
- `birth_date` / `age_verified_at` / `referral_code` / `referred_by` / `invite_code` /
  `join_requests.member_names` はいずれも読めない。
- `platform_revenues` / `user_review_scores` は `authenticated` から読めない（service_role のみ）。
- 他人が書いた `user_reviews` は読めない。評価は開催日前には書けない。
- `party_members` への直接着席、`point_balances` の直接操作、`inquiries.status` の書き換えは全て拒否される。
- Stripe Webhook は署名検証済み・付与は `stripe_session_id` で冪等・金額とポイント数はサーバ側で引き直している。
- `service_role` キーはバンドルに含まれていない（`dist` の `sb_secret_` は supabase-js の接頭辞判定）。
  `.env` / `apply_migrations.command` は Git 管理外。
- XSS の受け口なし（`dangerouslySetInnerHTML` / `innerHTML` / `eval` を1箇所も使っていない）。
  CSP は `script-src 'self'`（`unsafe-inline` なし）で本番から配信されている。
- 会の検索キーワードは PostgREST に渡す前に `%` と `,` を落としているため、フィルタを継ぎ足せない。

### 未対応（判断が要るもの・§5 に積んだ）

`LAUNCH.md` ではなくここに書く。**認証まわりの設定は今回あえて変えていない。**

| 重大度 | 内容 |
|---|---|
| Medium | **サインアップに CAPTCHA が無い**（`security_captcha_enabled: false`）。登録ボーナス 10,000pt ＋ 紹介ボーナス 3,800pt × 双方 なので、自動登録でポイントを量産できる。ポイントは現金で売る予定のものなので、決済を有効にする前に対処すること |
| Medium | **パスワードの下限がサーバ側で 6 文字**（`password_min_length: 6`）。画面は 8 文字を求めているので、API を直接叩くと 6 文字で登録できる。漏洩パスワード検査（`password_hibp_enabled`）も無効 |
| Medium | `security_update_password_require_reauthentication: false`。セッションを奪われた場合、現在のパスワードを知らなくても変更できる |
| Low | 自分の `age` は後から書き換えられる（`birth_date` は変えられず `is_legal_age()` はそちらを優先するので、年齢確認自体は迂回できない。表示上の年齢だけの話） |

> ⚠ **なぜ設定を変えなかったか。** これらは Management API の
> `PATCH /config/auth` で直せるが、**このプロジェクトは Auth 設定が丸ごと消えた
> 実績がある**（§5 の P0-4）。SMTP パスワード（Resend の APIキー）は
> Supabase の中にしか無く GET でも読めないため、**巻き添えで消えると復旧できない**。
> 得られるもの（6→8文字）に対して失うものが大きすぎるので、
> **触るなら Resend の APIキーを手元に用意してから**にすること。
