# AISEKI 引き継ぎ書

最終更新: 2026-08-29（**新しい決済・マッチングフロー**を実装し、**本番へデプロイ済み** §18。ホストはグループを作ってから卓を立てる・完全無料。ゲストは1名から参加可で料金は常に7,600pt。写真はマッチまで薄モザイク。招待リンクからの簡易登録も本番で通し確認済み）

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
| **会を立てる側は必ず2名以上**。1対1は不可 | DBのCHECK制約 + BEFORE INSERTトリガー（§18）<br>⚠ 2026-08-28 に**参加する側は1名でも可**に変更した。ホスト側が常に2名以上なので1対1にはならない |
| 個人間DMを実装しない。チャットは会単位のグループチャットのみ | スキーマにDMテーブルが無い（会に参加していない方が送る「アプローチ」も宛先は会。§11） |
| 氏名・写真・年齢は、同じ会に参加承認されたメンバーにのみ公開 | `profiles` / `party_members` / `messages` のRLS |
| 性別を**会の参加条件に使わない**・他のユーザーに**表示しない** | `profiles` の列単位 SELECT 権限から `gender` を除外。募集条件に性別のカラムが無い。※2026-08-23 から登録時に性別を取得しているが、用途はアプローチの可否判定のみ（§11） |
| 20歳以上限定（飲酒を伴うため） | `src/lib/api.js` の `MIN_AGE = 20` + 登録時の生年月日必須 |
| 評価に基づくランクを**性別で分けない**・他のユーザーに**表示しない** | `rank_tiers()` に性別の条件が無い。`profiles` の列単位 SELECT 権限から `rank_tier` / `review_average` / `review_count` を除外。`my_rank()` は `auth.uid()` 固定（§13） |

> DM機能・性別フィルタ・**ホスト側の1名開催**・プロフィールの一覧公開・
> **性別ごとの格付け（カースト）**などの要望が来たら、
> **実装前に規制に触れる旨を指摘すること。**
>
> ⚠ 「ゲスト側の1名参加」は 2026-08-28 に**依頼を受けて実装済み**（§18）。
> 相手のホストグループが必ず2名以上なので、席が1対1になることはない。
> **ホスト側の下限（2名）を1に下げると、この前提が壊れる。絶対に下げないこと。**

### 技術スタック

| 層 | 使っているもの |
|---|---|
| フロント | React 18 + Vite 6（**Next.js ではない**。`VITE_` プレフィックスの環境変数を使う） |
| アイコン | lucide-react |
| バックエンド | Supabase（PostgreSQL + Auth + Storage + Realtime） |
| サーバー関数 | Vercel Functions（`api/` 配下。Stripe決済のみ） |
| 決済 | Stripe（**2026-08-26 に live モードで有効化済み**。§15） |
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
> `https://aisekimatch.com/lp/host` · `/lp/guest` が 200、canonical・OGP・`/og-host.png`（image/png）・
> ※ 旧URL `/lp/women` · `/lp/men` は 301 リダイレクトで新URLへ転送。
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
| Stripe の各キー | ✅ **live キーを設定済み**（2026-08-26）。`sk_live_` / `pk_live_` / `whsec_` の3種が `.env` と Vercel Production に入っている（§15） |

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
  - `migration_caste_rank.sql`（2026-08-24）— ランク・店舗カタログ・会の予算帯（§13）
  - `seed_shops_sample.sql`（2026-08-24）— **サンプル店舗11軒**（`【サンプル】` 付き。実店舗ではない）
  - `migration_mutual_rank.sql`（2026-08-25）— ランク相互公開（`rank_tier` の列SELECT権限を `authenticated` に開放、`min_guest_tier` 追加）（§13-b）
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
- **広告用ランディングページ**（2026-08-22）— `/lp/host`（募集する側＝おごられる側）と
  `/lp/guest`（参加する側＝相席する側）の2枚。詳細は §10。
  ※ 2026-08-25 に `/lp/women` → `/lp/host`、`/lp/men` → `/lp/guest` にリネーム。旧URLは301リダイレクト。

### ⛔ 完了していないもの

| 項目 | 現状 |
|---|---|
| ~~メール確認（Confirm email）~~ | ✅ 2026-08-20 に ON（`mailer_autoconfirm: false`） |
| ~~Redirect URLs の登録~~ | ✅ 2026-08-20 に登録済み |
| ~~独自SMTP~~ | ✅ **2026-08-22 完了。** Resend SMTP をフルセットで投入し GET で実値確認。**実アドレスへの配信も `delivered` を実測**。送信元 `noreply@aisekimatch.com` / 差出人名 `相席マッチ`（`LAUNCH.md` §2-3） |
| ~~メール本文の日本語化~~ | ✅ **2026-08-22 完了。** Management API で件名・本文を日本語化（`scripts/apply_email_templates.mjs`）。GET で保存値を照合し、実アドレスへの signup が 200 を返すことまで確認 |
| ~~最新コミットのデプロイ~~ | ✅ 2026-08-20 実施済み |
| ~~Production の `SUPABASE_SERVICE_ROLE_KEY`~~ | ✅ **2026-08-22 に入れ替え。** ⚠️ ここには「2026-08-20 に入れ替え済み」と書いてあったが**誤りだった**。`vercel env ls production` の作成日が 13日前（＝現行プロジェクトが存在する前）で、実際には旧プロジェクトのキーが残っていた。`.env` の `sb_secret_...` に差し替えて再デプロイ済み |
| ~~Stripe決済~~ | ✅ **2026-08-26 に live モードで有効化。** キー3種 + Webhook 登録 + デプロイまで完了し、`/api/stripe/status` が `{"enabled":true,"cardEnabled":true}` を返すことと、署名付きイベントが 200 で通ることを確認済み（§15）。⛔ **実課金でのテストは未実施** |
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

9-b. ~~**カード登録に CAPTCHA を入れる**~~ ✅ **2026-08-26 完了（§16）。**
   登録ボーナス 5,000pt はカード登録後に付くので、その入口
   （`/api/stripe/setup-intent`）に Cloudflare Turnstile を入れた。
   ✅ **2026-08-28 に本番キーへ差し替え済み。ここから先は実際にボットを弾く**（§16）。
   ⚠ **サインアップそのものの CAPTCHA（`security_captcha_enabled`）は入れていない。**
   Supabase の Auth 設定を触る必要があり、設定が丸ごと消えた実績があるため
   （§12 の囲み）。紹介ボーナス 3,800pt はサインアップだけで付くので、
   **アカウントの量産自体はまだ止まっていない**（§16「残っているもの」）。

9-c. ~~**同じカードで 5,000pt を何度も取れないようにする**~~ ✅ **2026-08-26 完了（§17）。**
   CAPTCHA は「自動化」を止めるだけで、手作業でアカウントを作り直せば
   同じカードで何度でも受け取れた。**カード1枚につき1アカウント**にした。

### 🟡 P2 — 決済を有効にするとき

10. ~~**Production の `SUPABASE_SERVICE_ROLE_KEY` を現行プロジェクトのものへ入れ直す**~~
   ✅ **2026-08-22 完了。** 実際に旧プロジェクトのキーが残っていた（§4 参照）。
   `.env` の値へ入れ替え、環境変数を反映させるために `vercel deploy --prod` も実行済み。
   → **環境変数を変えたら再デプロイするまで実行時には反映されない。**

11. ~~**Stripe の本番キー設定 + Webhook 登録**~~ ✅ **2026-08-26 完了**（`LAUNCH.md` §4 / §15）。
   **残り: live で1回購入してポイントが増えることの確認（実課金が発生する）。**

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

- **Stripe は live モードで有効**（2026-08-26〜）。`/api/stripe/status` は `{"enabled":true,...}`。
  **本物の課金が発生する。** 動作確認で購入ボタンを押すときは、それを承知の上で押すこと。
  - `enabled` の判定に `STRIPE_WEBHOOK_SECRET` は**入っていない**（`api/stripe/status.js` の
    コメント参照。署名シークレットは Webhook を登録して初めて手に入るので、必須にすると
    堂々巡りになる）。**`enabled:true` は「ポイントが付く」の保証ではない。**
    付与経路は Webhook なので、シークレットが欠けると**支払いだけ通ってポイントが付かない**。
  - 有効/無効を切り替えたいときは `STRIPE_SECRET_KEY` を消す/戻す
    （消せば購入画面が自動で「準備中」に戻る）。
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
│   ├── host.html / guest.html   ページ（Vite のエントリ）
│   ├── host.jsx / guest.jsx     それぞれの入口（supabase を読み込まない）
│   ├── HostPage.jsx             /lp/host  — 募集する側（おごられる側）向け
│   ├── GuestPage.jsx            /lp/guest — 参加する側（相席する側）向け
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
│   │   │                  MIN_AGE=20 / JOIN_FEE_PER_PERSON=3800 / SOLO_FEE=7600
│   │   │                  MIN_HOST_GROUP_SIZE=2 / MIN_GUEST_GROUP_SIZE=1
│   │   │                  GUEST_SLOT_SIZE=2 / PAY_MODES（各自払い・まとめ払い）
│   │   │                  SIGNUP_BONUS=5000 / REFERRAL_BONUS=3800
│   │   │                  RANK_TIERS / RANK_MIN_REVIEWS（DB の rank_tiers() と一致必須）
│   │   ├── legal.js     ★ 規約・プライバシーポリシーの単一の出典
│   │   │                  CONTACT_EMAIL / SERVICE_URL / LEGAL_VERSION
│   │   ├── packs.js     ★ ポイントプランの単価（唯一の出典）
│   │   ├── captcha.js   ★ Turnstile の読み込み・描画（§16）
│   │   ├── supabase.js  クライアント生成
│   │   ├── theme.jsx / toast.jsx / pwa.js
│   │   └── screens/     Auth / Landing / ProfileEdit / Terms / Safety /
│   │                    Support / Referral / Notifications / MemberSheet /
│   │                    ResetPassword / InstallCard
│
├── api/                 Vercel Functions（決済のみ）
│   ├── _lib.js
│   ├── _captcha.js      ★ CAPTCHA（Turnstile）の検証（§16）
│   └── stripe/          checkout.js / status.js / webhook.js
│
├── supabase/
│   ├── schema.sql                    ベーススキーマ（テーブル/RLS/関数）
│   ├── migration_launch.sql          ✅適用済 外部キー修正/inquiries/退会/avatars
│   ├── migration_fixed_join_fee.sql  ✅適用済 参加費3800固定/platform_revenues
│   ├── migration_launch2.sql         ✅適用済 登録ボーナス/プロフィール拡張/ブロック/紹介
│   ├── migration_reviews_approach_style.sql ✅適用済 内部評価/アプローチ/飲みスタイル（§11）
│   ├── migration_security_hardening.sql     ✅適用済 セキュリティ修正4件（§12）
│   ├── migration_caste_rank.sql             ✅適用済 ランク/店舗カタログ/予算帯（§13）
│   ├── seed_shops_sample.sql                ✅適用済 サンプル店舗11軒（実店舗ではない）
│   ├── migration_mutual_rank.sql            ✅適用済 ランク相互公開/min_guest_tier（§13-b）
│   ├── migration_new_flow.sql               ✅適用済 新しい決済・マッチングフロー（§18）
│   └── migration_*.sql               （それ以前の履歴）
│
└── scripts/
    ├── apply_sql.mjs            ★ SQL適用（node pg / IPv6直結）
    ├── apply_auth_config.mjs    ★ Auth設定適用（PAT必須）
    ├── create_test_user.mjs     テストユーザー作成
    ├── verify_captcha.mjs       ★ CAPTCHA が効いているかの確認（§16）
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

> `npm run dev` では **LP は `/lp/host.html` / `/lp/guest.html`** で開く
> （拡張子なしの `/lp/host` は Vercel の cleanUrls / rewrites による本番の挙動）。

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

## 10. 広告用ランディングページ（`/lp/host` · `/lp/guest`）

2026-08-22 追加。広告の受け皿。**アプリ本体の LandingScreen（`/` の未ログイン画面）とは別物**で、
出口は「アプリの登録画面」ひとつに絞ってある。

| | `/lp/host` | `/lp/guest` |
|---|---|---|
| 宛先 | 会を**募集する側**（＝おごられる側） | 会に**参加する側**（＝相席する側） |
| 主訴求 | 参加ポイント0pt・当日の飲食代も0円 | グループ同士で気軽・一律3,800ptの明朗会計 |
| CTA | 「無料で始める」 | 「相席を始める」 |
| リンク先 | `/?auth=signup&from=lp-host` | `/?auth=signup&from=lp-guest` |
| OGP | `public/og-host.png` | `public/og-guest.png` |
| 実体 | `lp/host.html` + `lp/HostPage.jsx` | `lp/guest.html` + `lp/GuestPage.jsx` |
| 旧URL | `/lp/women`（301→`/lp/host`） | `/lp/men`（301→`/lp/guest`） |

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

**強く見せたいときは、光らせず「大きさの段差」でやる**（2026-08-24 のファーストビュー強化）。
ヒーローの見出しだけ 52px まで許してある（他の見出しは最大29px）。CTA も
`size="xl"` のときだけ地を `primaryLight` にして、ページで最も明るい面にしている。
影・発光・グラデーションは足していない。

- ⚠ `HeroTitle` の `size` は**ページごとに渡す**。2段組みの左カラムは幅 ≒ 592px しかなく、
  上限は最長行の文字数で決まる（10文字→52px / 12文字→46px）。共通の1つに固定すると
  必ずどちらかで「気軽／に。」のように割れる。見出しの文言を変えたら実測し直すこと。
- ヒーロー下の `HeroFacts` は「右のカードに出ていないこと」を置く。
  女性向けで 0pt / 0円 を並べると、隣の伝票と同じことを2回言うことになる。
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
- **`/lp/host` で開けるのは `vercel.json` の rewrites のおかげ。**
  `"/(.*)" → "/"` のSPA用catch-allより**前**に `/lp/host → /lp/host.html` を置いてある。
  順番を入れ替えるとLPがアプリに吸われる。
  旧URL `/lp/women` · `/lp/men` は 301 リダイレクトで新URLへ転送（2026-08-25 追加）。
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
  `/lp/host` の FAQ にその旨を明記してある。
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
| Medium | **サインアップに CAPTCHA が無い**（`security_captcha_enabled: false`）。→ 🟡 **一部対処（2026-08-26 / §16）。** 登録ボーナス 5,000pt はカード登録の入口に CAPTCHA を入れて塞いだ。**サインアップ自体は素通しのままなので、紹介ボーナス 3,800pt × 双方 は依然として自動登録で取れる**（Supabase の Auth 設定を触る必要があるため見送り。下の囲みと同じ理由） |
| Medium | **パスワードの下限がサーバ側で 6 文字**（`password_min_length: 6`）。画面は 8 文字を求めているので、API を直接叩くと 6 文字で登録できる。漏洩パスワード検査（`password_hibp_enabled`）も無効 |
| Medium | `security_update_password_require_reauthentication: false`。セッションを奪われた場合、現在のパスワードを知らなくても変更できる |
| Low | 自分の `age` は後から書き換えられる（`birth_date` は変えられず `is_legal_age()` はそちらを優先するので、年齢確認自体は迂回できない。表示上の年齢だけの話） |

> ⚠ **なぜ設定を変えなかったか。** これらは Management API の
> `PATCH /config/auth` で直せるが、**このプロジェクトは Auth 設定が丸ごと消えた
> 実績がある**（§5 の P0-4）。SMTP パスワード（Resend の APIキー）は
> Supabase の中にしか無く GET でも読めないため、**巻き添えで消えると復旧できない**。
> 得られるもの（6→8文字）に対して失うものが大きすぎるので、
> **触るなら Resend の APIキーを手元に用意してから**にすること。

---

## 13. ランクと店舗カタログ（2026-08-24）

`supabase/migration_caste_rank.sql` の1本にまとまっている（冪等・**適用済み**）。
検証は `.e2e-rank.mjs`（未コミット）。本番スキーマに対して実ユーザーを作って
**37項目すべて成功**。最後にユーザー・店舗を消す。`node .e2e-rank.mjs` で再実行できる。

### 何をする機能か

会の終了後に受け取った評価（`user_reviews`）の**平均星数**でランクが決まり、
ランクが高いほど**予算の高いお店で会を主催できる**。

| ランク | 平均 | 選べるお店（1人あたり） |
|---|---|---|
| ブロンズ | 〜2.0未満 | 〜3,000円 |
| シルバー | 2.0〜 | 〜5,000円 |
| ゴールド | 3.0〜 | 〜8,000円 |
| プラチナ | 4.0〜 | 上限なし |

評価が **3件（`rank_min_reviews()`）** 集まるまでは、平均に関わらずブロンズ。

### 🚨 依頼された仕様から1点だけ変えてある（戻す前に必ず読む）

依頼は「**女性ユーザーだけ**をレビューで格付けする」だった。
**性別で分ける部分は実装していない。規則は全ユーザー共通にしてある。**

理由（`migration_caste_rank.sql` の冒頭にも同じことを書いてある）:

- 本サービスの非該当性の中核は「**性別を会の条件に使わない**」で、
  `profiles.gender` は列単位で SELECT を落としてある（§11）。
- ランクを女性だけに持たせると、
  **「ランクを持っているか」自体が性別の開示**になり、さらに
  **主催できる会の予算帯が性別で変わる＝性別が会の条件になる**。
  §1 の表の担保が DB レベルで壊れる。
- 男性にランクが無いと、男性が主催する会がどの予算帯も選べず機能が破綻する。

本サービスは「おごられる側＝主催する側」なので、
**規則を共通にしても「高評価の人ほど良いお店に行ける」という狙いはそのまま成立する。**
性別という条件を1つも足さずに同じ結果が出ている。

> ⚠ それでも「女性だけ」にしたくなったら、先に `src/lib/legal.js` 第3条・
> 第9条の4 と §1 の表を読み合わせること。UI で隠しても意味がない。

### 評価の見え方（ここも壊さない）

- **個別の評価は今までどおり誰にも見えない。** `user_reviews` の RLS は無変更。
  点数・コメント・誰が付けたかは、本人にも相手にも出さない。
- 本人が見られるのは**自分の平均点・件数・ランクだけ**（`my_rank()`）。
- 🚨 **`profiles` の列単位 SELECT 権限に `rank_tier` / `review_average` /
  `review_count` を足してはいけない。** 足した瞬間に他人の平均点が読めるようになり、
  利用規約 第9条の3（個別の評価はランキング等で公開しない）に反する。
- 🚨 **`my_rank()` は引数を取らない（`auth.uid()` 固定）。**
  `p_user` を受ける形にすると、同じ会の `party_members` から読める UUID を
  渡すだけで他人の評価が引ける。`can_approach_party()` で一度開けた穴と同じ形。
- `user_rank_tier(uuid)` / `refresh_user_rank(uuid)` は **`authenticated` から revoke 済み**
  （トリガー専用）。e2e で「呼べないこと」まで確認している。

### 店舗カタログ（`shops`）

- 列: `name / area / address / genre / avg_budget / description / image_url / is_active`
- **読むのは誰でも可（店舗の公開情報）。書けるのは `service_role` だけ**（ポリシー無し）。
  ランクの制限は「読めるか」ではなく「**その店で会を作れるか**」で効かせている。
  読める範囲を絞ると、参加者側から会のお店が見えなくなる。
- 会の作成時、`shop_id` を指定すると **店名・エリア・予算をカタログの値でサーバが上書き**する
  （クライアントの金額は使わない）。`avg_budget` は INSERT 権限にも入れていない。
- カタログを使わないときは**予算帯だけ**を選ぶ（`budget_tier`）。金額は持たせない。

**サンプルデータを入れてある。** `supabase/seed_shops_sample.sql`（11軒 / 適用済み）。
店名はすべて `【サンプル】` で始まり、画面にもそのまま出る。**実在の提携店舗ではない。**
実店舗が決まったら消すこと:

```sql
delete from public.shops where name like '【サンプル】%';
```

### 触るときの注意

- 🚨 **`parties` に列を足したら、INSERT 権限（列単位）にも必ず足す。**
  `migration_security_hardening.sql` が「会を作るときに必要な列」だけに絞っているため、
  権限の無い列を1つでも積むと insert 全体が
  `42501 permission denied for table parties` で落ちる。
  **これが原因で 2026-08-23 から会の作成が丸ごと壊れていた**（下記）。
- `enforce_group_party()` は `schema.sql` →
  `migration_reviews_approach_style.sql` → `migration_caste_rank.sql` と
  **3回上書きしている**。書き換えるときは、いちばん新しいものに手を入れること
  （古いファイルを直しても効かない）。
- 予算帯・段階・必要件数は **DB（`rank_tiers()` / `rank_min_reviews()`）と
  `src/lib/pricing.js`（`RANK_TIERS` / `RANK_MIN_REVIEWS`）の両方**にある。
  片方だけ変えると、画面に出ている予算帯が保存時に弾かれる。
- ランクは会の作成後に下がることもあるが、**成立済みの会はそのまま残す**
  （`parties.budget_tier` は作成時に確定）。

### 画面

| 場所 | 何 |
|---|---|
| `src/screens/RankCard.jsx` | マイページのランク表示（現在のランク・平均・次まで） |
| `src/screens/ShopsScreen.jsx` | 選べるお店の一覧。作成画面には `embedded` で埋め込む |
| `src/App.jsx` CreateScreen | 予算帯の選択（鍵つき）＋掲載店の選択 |
| `src/App.jsx` PartyCard / FeaturedCard / DetailScreen | 会の予算帯を表示（**個人のランクではない**） |
| `src/screens/ReviewSheet.jsx` | 評価の投稿。「平均点はランクに反映される」旨を追記 |

### 規約

`src/lib/legal.js` を **2.3** に改訂（第9条の4 を新設・ランク区分の他メンバーへの表示を明記。第9条の3・プライバシーポリシーも修正）。

---

## 13-b. ランク相互公開（2026-08-25）

`supabase/migration_mutual_rank.sql` の1本にまとまっている（冪等・**適用済み**）。

### 何が変わったか

§13 のランクシステムは「本人のみ確認可能」だったが、会への参加条件として使えるように変更:

| 変更 | 内容 |
|---|---|
| `rank_tier` 列SELECT権限 | `authenticated` に開放。同じ会のメンバーに限り他人のランク区分が見える |
| `min_guest_tier` | 会の作成時にホストが設定可能。ランク不足の参加申込を `enforce_group_join()` が弾く |
| `legal.js` | 2.3 に改訂。第9条の4 にランク区分の他メンバーへの表示を明記 |

⚠️ **§13 の元の方針（「足してはいけない」）から方向転換した。** 平均点・件数は引き続き本人のみ。
ランクの**区分名（ブロンズ/シルバー等）だけ**が同じ会のメンバーに見える。

既定値は安全側（`min_guest_tier` = `bronze` ＝条件なし）。UI は既存の `RankCard.jsx` 等で動作。

---

## 14. 会の作成が壊れていた（2026-08-24 修正）

**2026-08-23 の `migration_security_hardening.sql` 以降、誰も会を作れなくなっていた。**
`src/lib/api.js` の `createParty()` が `status` / `room_type` / `point_request` /
`treat_type` / `max_members` / `current_members` を送っていたが、
同マイグレーションが `parties` の INSERT 権限をそれ以外の列だけに絞ったため、
insert 全体が `42501 permission denied for table parties` で落ちていた。

画面には「会の作成に失敗しました: permission denied for table parties」と出るだけで、
**§12 のレビューでは insert しか使っていないことを確認しただけで、
実際に会を作ってはいなかった**ため見逃していた。

修正は `createParty()` 側。上記6列は DB の既定値と `enforce_group_party()` が
確定させるので、**クライアントからは送らない**（セキュリティ強化の意図どおり）。

> **教訓: 権限を絞ったら、その経路を実際に1回通すこと。**
> RLS ポリシーだけを見ても、列単位の GRANT 不足は見つからない。

---

## 15. Stripe決済を live モードで有効化した（2026-08-26）

**それまで意図的に placeholder のままだった Stripe を、本番（live）モードで有効にした。**
`/api/stripe/status` は `{"enabled":true,"cardEnabled":true,"publishableKey":"pk_live_..."}` を返す。
購入画面の「準備中」は消え、金額のボタンが出ている。

> 🚨 **live モード＝本物の課金が発生する。** テストモードではない。
> 動作確認で購入ボタンを押すと実際に決済される。

### 入れたもの

| どこ | 何 |
|---|---|
| Vercel Production | `STRIPE_SECRET_KEY`（`sk_live_...`）· `VITE_STRIPE_PUBLISHABLE_KEY`（`pk_live_...`）· `PUBLIC_BASE_URL` |
| Vercel Production | `STRIPE_WEBHOOK_SECRET`（`whsec_...`）← 今回追加 |
| Stripe | Webhook エンドポイント `we_1U8XyzGIVjir6FEViYguczWc` |
| ローカル `.env` | `STRIPE_WEBHOOK_SECRET` を placeholder から実値へ（`.env` は gitignore 済み） |

Webhook: `https://aisekimatch.com/api/stripe/webhook` / status `enabled` / livemode `true`。

### 受け取るイベントは3種類（1つでも欠けると穴が開く）

`api/stripe/webhook.js` が処理するのはこの3つ。**`LAUNCH.md` の旧記述は
`checkout.session.completed` だけを挙げていたが、それでは足りない。**

| イベント | 無いとどうなるか |
|---|---|
| `checkout.session.completed` | 通常の購入分のポイントが付かない |
| `checkout.session.async_payment_succeeded` | **コンビニ決済など後から確定する支払いのポイントが永久に付かない** |
| `setup_intent.succeeded` | **カード登録ボーナス 5,000pt が付かない**（これが正規の付与経路） |

### 疎通の確認方法（`enabled:true` を見るだけでは不十分）

🚨 **`/api/stripe/status` の `enabled` に `STRIPE_WEBHOOK_SECRET` は入っていない**
（`api/stripe/status.js` のコメント参照。署名シークレットは Webhook を登録して初めて
手に入るので、必須にすると堂々巡りになるため意図的にそうしてある）。
つまり **`enabled:true` は「ポイントが付く」の保証にならない。**
シークレットが欠けたままだと、**支払いだけ通ってポイントが付かない**という
いちばん困る壊れ方をする。だから Webhook 側を直接叩いて確かめること。

| 叩き方 | 期待 | ずれたときの意味 |
|---|---|---|
| 署名なしで `POST` | `400 {"error":"invalid signature"}` | **`503 {"error":"not configured"}` なら `STRIPE_WEBHOOK_SECRET` が未設定か未反映** |
| `GET` | `405` | — |
| 正しい署名の `ping` イベント | `200 {"received":true,"ignored":"ping"}` | 400 なら Vercel 側と Stripe 側でシークレットが食い違っている |

3つ目が通れば、**Vercel に入れた値と Stripe のエンドポイントの値が一致している**証拠になる。
`ping` は `webhook.js` が処理しないイベントなので、**ポイントは1ptも動かない**（安全に何度でも打てる）。

```bash
node -e '
const s=new (require("stripe"))("sk_live_x");   # 署名生成にキーは使われない
const secret="whsec_...";
const payload=JSON.stringify({id:"evt_probe",object:"event",type:"ping",data:{object:{}}});
const header=s.webhooks.generateTestHeaderString({payload,secret});
require("child_process").execSync(`curl -s -w "\n%{http_code}" -X POST \
  https://aisekimatch.com/api/stripe/webhook -H "content-type: application/json" \
  -H "stripe-signature: ${header}" --data-binary @-`,{input:payload,stdio:["pipe",1,2]});'
```

> ⚠️ **署名を手で作るなら `whsec_` の接頭辞まで含めて HMAC の鍵にする。**
> 「`whsec_` を剥がして鍵にする」と書いてある解説があるが、stripe-node は
> **渡された文字列をそのまま鍵にする**。剥がすと必ず `invalid signature` になる。
> 実際に一度これで詰まった。**素直に `generateTestHeaderString()` を使えばよい。**

### `secret` は作成レスポンスでしか返ってこない

`POST /v1/webhook_endpoints` のレスポンスの `"secret"` を控え忘れたら、
**あとから API で取り出す方法は無い**（`GET` しても返らない）。エンドポイントを作り直すこと。
登録手順の curl は `LAUNCH.md` §4 にそのまま貼ってある。

### `--prebuilt` の埋め戻しが復活した

🚨 **今回追加した Vercel 環境変数は Sensitive 扱いで、`vercel pull` が空文字で書き出す。**
§2 に「`VITE_SUPABASE_*` は Sensitive ではなくなったので埋め戻しは要らない」と書いてあるが、
**`VITE_STRIPE_PUBLISHABLE_KEY` には当てはまらない**（`len=2` ＝空で落ちてくる）。

```bash
vercel pull --environment=production --yes
awk -F= '/^VITE_/{v=$0; sub(/^[^=]*=/,"",v); print $1" len="length(v)}' .vercel/.env.production.local
# ↑ VITE_STRIPE_PUBLISHABLE_KEY が len=2 なら .env の実値で埋め戻してから build する
vercel build --prod
grep -rl 'melfyxfvhyknqhruytms' .vercel/output/static/assets/   # ★ヒット必須
grep -rl 'sk_live\|whsec_' .vercel/output/static/               # ★0件必須（秘密鍵の漏れ）
vercel deploy --prebuilt --prod --yes
```

`sk_live` / `whsec_` の grep は今回から足した。**`VITE_` を付け間違えた秘密鍵は
バンドルに焼き込まれて公開されるので、出す前に必ず見る。**

埋め戻しを忘れても**画面は壊れない**。`src/lib/api.js` の `loadStripe()` が
`/api/stripe/status` の `publishableKey` を先に見て、`import.meta.env` は最後の予備だから。
それでも予備が空のままなのは事故のもとなので埋める。

### まだやっていないこと

- ⛔ **live で1回購入してポイントが増えることの確認**（実課金が発生する）
- ⛔ **カードを登録して 5,000pt のボーナスが付くことの確認**
- ⛔ 購入画面の表示が「準備中」から金額のボタンに変わっていることの実機確認

> ✅ **カード登録の CAPTCHA は 2026-08-26 に入れた**（§16）。
> ただし本番キーへの差し替えと、サインアップ側の CAPTCHA は残っている。

---

## 16. カード登録に CAPTCHA を入れた（2026-08-26）

登録ボーナス 5,000pt をカード登録で自動的に量産されないよう、
**Cloudflare Turnstile** を入れた（無料・プライバシー重視・Cloudflare の顧客でなくても使える）。

### どこで効かせているか（ここが要点）

ボーナスの付与経路は**2つ**ある。片方だけ塞いでも意味が無い。

| 付与経路 | 前提 |
|---|---|
| `POST /api/stripe/confirm-card`（画面から） | SetupIntent が succeeded であること |
| `setup_intent.succeeded` の Webhook（Stripe から） | 同上 |

どちらも **SetupIntent が要る**。そして SetupIntent を作れるのは
`POST /api/stripe/setup-intent` **だけ**（Stripe のシークレットキーが要るため）。
だから:

1. **`/api/stripe/setup-intent` でトークンを検証する**（`api/_captcha.js`）。
   ここが唯一の入口なので、通らなければカード登録自体が始まらない。
2. 検証を通った SetupIntent の `metadata` に印（`captcha_verified_at`）を押す。
3. **付与する2経路は、その印が無ければポイントを付けない。**
   → 画面から2回トークンを取らずに、付与の直前で確かめられる。

> 🚨 **`CardRegisterSheet.jsx` の順番を変えないこと。**
> 「CAPTCHA → SetupIntent → カード入力欄を描く」の順。
> 以前のように最初に SetupIntent を作る作りへ戻すと、CAPTCHA が素通しになる。
> 利用者から見ると、ふだんは操作が要らない（「確認しています…」が一瞬出るだけ）。

> 🚨 **`TURNSTILE_SECRET_KEY` が未設定なら 503 でカード登録を止める（fail-closed）。**
> 「未設定なら素通し」にすると、環境変数が消えた瞬間に穴が開いたことに誰も気づけない。
> Vercel の環境変数を消すときは、カード登録が止まることを承知の上で消すこと。

### 入れたもの

| どこ | 何 |
|---|---|
| `api/_captcha.js`（新規） | siteverify への問い合わせ・印の定義・エラーの切り分け |
| `api/stripe/setup-intent.js` | トークンを検証してから SetupIntent を作る／印を押す |
| `api/stripe/confirm-card.js` · `webhook.js` | 印が無ければ付与しない |
| `api/stripe/status.js` | `captchaSiteKey` を配る（`cardEnabled` の条件にも追加） |
| `src/lib/captcha.js`（新規） | Turnstile の読み込みと explicit 描画 |
| `src/screens/CardRegisterSheet.jsx` | ウィジェット表示・トークン取得後にカード入力欄 |
| `vercel.json` | CSP に `https://challenges.cloudflare.com`（`script-src` / `frame-src`） |
| Vercel 環境変数（Production / Preview / Development） | `TURNSTILE_SECRET_KEY` · `VITE_TURNSTILE_SITE_KEY` |

サイトキーは `/api/stripe/status` からも配っている。
`VITE_` の値は `--prebuilt` デプロイで空になることがあるため（§15 と同じ理由）。

### ✅ 本番キーに差し替え済み（2026-08-28）

Cloudflare Turnstile の**本番キー**を Production / Preview / Development の3環境と
ローカル `.env` に入れ、再デプロイ（`dpl_HmjBD4fSo23aHLXwCtcphRoq438p`）まで済ませた。
サイトキーは公開前提の値なのでここに残す。**シークレットは書かない**（Vercel と `.env` にだけ置く）。

| | 値 |
|---|---|
| サイトキー | `0x4AAAAAAEcwin4lgkcIlCIy` |
| シークレット | Vercel の環境変数（3環境）と `.env` のみ。35文字 |

> 🚨 **差し替え前のキーはテスト用キーではなく、「無効な本番キー」だった。**
> この節はずっと「テスト用キー `1x00000000000000000000AA`（常に成功する）が入っている」と
> 書いていたが、2026-08-28 に実物を見たら入っていたのは
> **`0x4AAAAABEcwin4lgkcIlCIy`**（正しい値と1文字違い。`…AAA…` が `…AAB…`）で、
> シークレットも Cloudflare が `invalid-input-secret` で拒否する値だった。
>
> つまり**「常に成功する」のではなく「常に失敗する」状態**だった。
> `_captcha.js` は `invalid-input-secret` を `ConfigError`（503）に落とす fail-closed なので、
> **ボーナスは量産できない代わりに、正規の利用者もカード登録できなかった**。
>
> **`/api/stripe/status` の `cardEnabled` は `true` を返し続けていた。**
> あれはシークレットが**存在するか**しか見ておらず、**有効かどうかは見ていない**。
> ここだけを見て「動いている」と判断しないこと。鍵の健全性は
> `node scripts/verify_captcha.mjs` で見る。

差し替え手順（次に鍵を替えるときもこれ）:

1. https://dash.cloudflare.com → Turnstile → Add Site
   （ドメイン `aisekimatch.com`。**Cloudflare で DNS を管理していなくても使える**。
   本サービスの DNS は xdomain のまま）。Widget Mode は **Managed** でよい。
2. Vercel の3環境へ入れ直す。**`--force` で上書きできるので `rm` は要らない**:

```bash
for e in production preview development; do
  vercel env add VITE_TURNSTILE_SITE_KEY "$e" "" --value '<サイトキー>'   --force --yes
  vercel env add TURNSTILE_SECRET_KEY    "$e" "" --value '<シークレット>' --force --yes
done
```

> ⚠ **`preview` だけは第3引数（Git ブランチ）を省略すると通らない。**
> CLI 53.1.1 は `git_branch_required` を返し、`--value` を付けても
> 「省略すれば全ブランチ」と案内してくるのに省略だと止まる。
> **空文字 `""` を第3引数に渡すと全 Preview ブランチへ入る**（2026-08-28 に確認）。
> 過去にここで詰まって `POST /v10/projects/{id}/env` を直接叩いた記録があるが、API は要らない。

> ⚠ `vercel env ls` の日付は**作成日**で、上書きしても古いまま。
> 「2d ago のままだから失敗した」と読み違えないこと。成否は
> `Overrode Environment Variable ... to Project aiseki` の行で判断する。

3. ローカルの `.env` も直す。
4. **再デプロイするまで反映されない**（§5 の 10 と同じ）。関数が読むのは
   デプロイ時点の環境変数。
5. 確認（下記）。**本番の実値は `/api/stripe/status` の `captchaSiteKey` で見える。**
   `VITE_` は Sensitive で `vercel pull` が空を返すため、バンドルを見ても
   埋め戻した `.env` の値しか分からない。Vercel 側に入った値の確認はこの API で行う。

### 確認のしかた

```bash
node scripts/verify_captcha.mjs                     # Cloudflare への疎通と鍵の種別
node scripts/verify_captcha.mjs --base https://aisekimatch.com \
  --email <テストユーザー> --password <パスワード>   # 実際のエンドポイント

curl -s https://aisekimatch.com/api/stripe/status    # 本番に入っているサイトキーの実値
```

2026-08-28 の差し替え直後は、1つ目が
`error-codes=invalid-input-response` →「本番用シークレットが、でたらめなトークンを
正しく拒否した」で通り、3つ目が `"captchaSiteKey": "0x4AAAAAAEcwin4lgkcIlCIy"` を返した。
**`invalid-input-secret` が出たらシークレットが違う**（差し替え前はこれだった）。

2つ目は **CAPTCHA トークン無しの `POST /api/stripe/setup-intent` が 400 で断られること**
を確かめる（＝ボーナスの入口が塞がっていること）。
テストユーザーは `scripts/create_test_user.mjs` で作る（§8）。

### 残っているもの

- ~~**本番キーへの差し替え**~~ ✅ 2026-08-28 完了（上記）。
- ⛔ **サインアップ自体の CAPTCHA は未対応。**
  紹介ボーナス 3,800pt（双方）はカード登録なしで付くので、
  **アカウントの量産で取れる**。Supabase の `security_captcha_enabled` を
  ON にすれば塞がるが、Auth 設定が丸ごと消えた実績があるため見送っている（§12 の囲み）。
  **触るなら Resend の APIキーを手元に用意してから。**
- 実機（スマートフォン）でウィジェットが出ることの確認。

---

## 17. 同じカードで 5,000pt を取り直せないようにした（2026-08-26）

§16 の CAPTCHA は「**自動化**された登録」を止めるものであって、
**手作業でアカウントを作り直せば、同じカードで何度でも 5,000pt を受け取れた。**
（登録の時点では請求が発生しないので、コストゼロで繰り返せる。）

**カード1枚につき1アカウント**にした。

### 何を使って同じカードだと判定しているか

Stripe の PaymentMethod が持つ **`card.fingerprint`**。
カード番号ごとに一意な文字列（例 `Xt5EWLLDS7FJjR1c`）で、

- **Customer が違っても、登録し直しても、同じカード番号なら同じ値になる**
- カード番号を復元できる値ではない（＝こちらのDBに保存してよい）

> ⚠ 判定に使えるのは fingerprint だけ。下4桁＋有効期限では別カードとぶつかる。

### どこで効かせているか

付与経路は §16 と同じ2つ。**判定は片方ではなく、DB 関数の中で1回だけ行う。**

| 経路 | 変えたこと |
|---|---|
| `POST /api/stripe/confirm-card` | SetupIntent を `expand: ["payment_method"]` で引く |
| `setup_intent.succeeded` の Webhook | `payment_method` は ID の文字列なので `paymentMethods.retrieve()` する |

どちらも `api/_card.js` の `grantCardBonus()` を呼ぶだけ。
その中で fingerprint を取り、`grant_card_bonus(p_user, p_fingerprint)` に渡す。

**「持ち主の確定」と「付与」は DB の1トランザクションでやる**のが要点。
`card_fingerprints` に先に insert できた側だけが持ち主になる（fingerprint が主キー）。
2アカウントから同時に登録されても、後発は先発の commit を待ってから弾かれる。
アプリ側で「先に select して、無ければ insert」とやると、この競合で両方通る。

### 入れたもの

| どこ | 何 |
|---|---|
| `supabase/migration_card_fingerprint.sql`（新規） | `card_fingerprints` テーブル・`grant_card_bonus` の差し替え |
| `api/_card.js`（新規） | fingerprint の取得と付与。2経路の共通処理 |
| `api/stripe/confirm-card.js` | 重複なら **409 + `duplicateCard: true`** |
| `api/stripe/webhook.js` | 重複なら 200 `{skipped:"duplicate"}`（再送されても結果は変わらないため） |
| `src/lib/api.js` | 409 の `duplicateCard` をエラーに載せる |
| `src/screens/CardRegisterSheet.jsx` | 専用の案内を出す（赤いエラーにはしない） |

### 拒否するのは**ボーナスだけ**（ここを間違えないこと）

重複だと分かる時点で、カードは既に Stripe 側に登録できている（`confirmCardSetup` は成功している）。
だから画面には「登録に失敗しました」ではなく「**ボーナスをお付けできませんでした**」と出す。

そして **`profiles.card_registered` は false のままにする。**
→ 別の未使用カードで登録し直せば、ボーナスは受け取れる。
（ここで true にすると、他人が使ったカードを一度触っただけで
　ボーナスを永久に失う。家族でカードを共有している人が該当してしまう。）

### `card_fingerprints`

```sql
fingerprint text primary key            -- カードごとに一意
user_id     uuid references auth.users(id) on delete set null
created_at  timestamptz not null default now()
```

- **RLS 有効・ポリシー0件**。加えて anon / authenticated から `revoke all`。
  読めると「このカードは使用済みか」を総当たりで調べられるし、
  書けると他人のカードを先に登録してボーナスを封じられる。
  `/api` は service_role なので RLS を迂回して読み書きできる。
- **`on delete set null`**（cascade にしない）。cascade だと
  **退会 → 再登録で同じカードのボーナスをもう一度受け取れてしまう。**
  持ち主が null の行は「別人のもの」として扱う（＝カードは使用済みのまま）。

### 🚨 `grant_card_bonus` の引数が変わった（1つ → 2つ）

```
public.grant_card_bonus(p_user uuid)              ← 落とした
public.grant_card_bonus(p_user uuid, p_fingerprint text)  ← これだけ
```

**旧シグネチャは残していない。** 残して2つにすると、PostgREST が
どちらを呼ぶか決められず **PGRST201（曖昧な関数）** になる。

そのため **migration を当てたら、間を空けずにデプロイすること。**
古い `api/` が動いているあいだは、引数が合わずカード登録ボーナスが失敗する
（`confirm-card` は 500、Webhook は Stripe が再送するのでデプロイ後に自然に回復する）。

### fingerprint が取れなかったら付与しない（fail-closed）

`payment_method_types` は `["card"]` に限っているので通常は起きないが、
取れないものを通すとそこが抜け道になる。DB 関数側でも
`p_fingerprint` が空なら例外にしてある（アプリ側の判定だけに頼らない）。

### 適用と確認

```bash
AISEKI_DB_PASSWORD=... node scripts/apply_sql.mjs supabase/migration_card_fingerprint.sql
```

適用時に検算（RLS が有効か・アプリから読めないか・旧シグネチャが残っていないか）が走る。
実際の挙動は本番DBに対して**トランザクションを張って ROLLBACK** して確かめた:

| 試したこと | 結果 |
|---|---|
| A が登録 | `granted:true, points:5000` |
| **B が同じカードを登録** | **`granted:false, duplicate:true, points:0`** |
| A が再送（Webhook の二重着信） | `granted:false`（増えない） |
| B が別のカードで登録 | `granted:true, points:5000` |
| fingerprint が空 | 例外 `カードの識別子が渡されていません` |
| anon / authenticated から select・実行 | どちらも `permission denied` |

適用時点で `card_registered=true` のユーザーは **0人**、`card_fingerprints` も 0 行だった。

### 残っているもの

- ⛔ **この migration より前に登録されたカードは記録が無い**（Stripe から遡って
  埋めていない）。上のとおり該当は0人なので、いまは実害が無い。
- ⛔ **実際にカードを2アカウントで登録して弾かれることの実機確認**（live なので
  カード登録自体に請求は発生しないが、本物のカードが要る）。
- ⛔ 紹介ボーナス 3,800pt は**カード登録なしで付く**ので、
  アカウントの量産にはまだ有効（§16「残っているもの」と同じ話）。

---

## 18. 新しい決済・マッチングフロー（2026-08-28）

`supabase/migration_new_flow.sql` の1本にまとまっている（冪等・**適用済み**）。
検証は `.e2e-newflow.mjs`（未コミット）。本番スキーマに対して
**54項目すべて成功**。migration の適用ごと `BEGIN … ROLLBACK` の中でやるので、
本番データは1行も変わらない。`node .e2e-newflow.mjs` で再実行できる。

`npm test`（`scripts/test_join_fee.mjs`）も新料金に合わせて更新済み（19項目）。

### 何が変わったか

| | 旧 | 新 |
|---|---|---|
| ホストの登録 | 全員共通（カード登録でボーナス） | **プロフィール＋年齢確認のみ。カード不要・ボーナスなし・完全無料** |
| ホストの人数指定 | 画面で「ホスト側n名」を入力 | **先に作ったグループの実体から決まる**（申告値は使わない） |
| 募集するゲスト枠 | ホストが2〜6名で選ぶ | **常に2名分に固定**（`guest_slot_size()`） |
| ゲストの参加人数 | 2名以上 | **1名から可**（ただし課金は常に2名分） |
| 参加料金 | 3,800pt × 人数 | **合計7,600pt 固定**（1人参加でも同額 ＝ `SOLO_FEE`） |
| 支払い方法 | 代表者がまとめて払う | **各自払い（3,800ptずつ）／まとめ払い（7,600pt）** |
| 決済のタイミング | 承認時 | **承認時（変更なし）**。リクエスト送信では1ptも動かない |
| 写真 | 承認まで非公開 | **マッチ前は「ぼかした別画像」だけを配信**（§18-b） |
| 返金 | 無し | `refund_join_payment()`（**service_role 専用・UIには出さない**） |

### ホスト側の流れ

1. 登録（プロフィール＋年齢確認）。カード登録の導線は通らない。
2. マイページ →「一緒に行く友達（グループ）」でグループを作る。
3. 友達ごとに招待リンク（`/?invite=<8桁>`）を発行して送る。
4. 友達は**簡易登録**（名前＋生年月日＋メール＋パスワード）で参加する。
   写真は登録後にマイページから設定してもらう。
5. **あなたを含めて2名以上そろうと**卓を立てられる。
6. 参加リクエストを承認 → マッチ成立 → その時点で決済。

### ゲスト側の流れ

1. フル登録（プロフィール＋年齢確認＋カード登録 → 5,000pt）。
2. 卓を探す（ホストの写真は薄モザイク）。
3. 参加申請（既定2名）:
   - 相方「招待して呼ぶ」… ニックネームを入れる → まとめ払いのみ
   - 相方「既存の会員」… **会員コード**（＝紹介コード）で指定 → 各自払いも選べる
   - 下部の小さな導線から「1人で参加する（7,600pt）」
4. リクエスト送信（**この時点では決済しない**）。
5. ホストが承認 → マッチ成立 → **決済**。
6. モザイクが外れ、グループチャットが開く。

### 🚨 触るときの注意

- 🚨 **ホスト側の下限（2名）は絶対に下げない。** ゲストが1名で参加できるのは、
  相手が必ず2名以上のグループだからで、ここを1にすると1対1が成立してしまう
  （§1 の担保が根本から壊れる）。`min_host_group_size()` は 2 のまま。
- 🚨 **`joinFeeFor()` は「請求額」で、`feeText()` は「単価 × n」。**
  意味が違う。`api.joinFeeFor(1)` は 3,800 ではなく **7,600** を返す
  （課金は最低2名分のため）。実装中に `feeText()` がこれを呼んでいて、
  画面全体の「1名あたり」表示が 7,600pt になる不具合を出した。
  **金額を出すときは、どちらの意味かを必ず確かめること。**
- 🚨 **`create_group_seats()` の引数が5つ → 6つに増えた**（`p_partner` を追加）。
  旧シグネチャは `drop function` してある。2つ残すと PGRST201（曖昧な関数）になる
  （§17 の `grant_card_bonus` と同じ形）。
- 🚨 **`parties` に `group_id` を足したので、列単位の INSERT 権限にも入れてある。**
  §14 の再発防止として、migration の最後に「権限があるか」の検算を入れた。
- **課金人数（`billable_size`）はサーバが決める。** クライアントからは送らない
  （列単位の INSERT 権限に入れていない）。枠の判定も課金人数で行うので、
  1名で参加しても2名分の枠を押さえる。
- **成立した会は `matched` のまま。** 1名参加だと席は1つしか増えないため、
  席数だけで見ると「募集中」に見えてしまう。`accept_join_request()` が
  課金人数の合計で判定して `matched` にし、`sync_party_member_count()` は
  いちど `matched` になった会を `recruiting` へ戻さない。
- **各自払いは、相方が既存会員のときだけ。** 招待（簡易登録）の相方は
  自分の残高を持たないため、DB 側（`enforce_group_join`）でも弾いている。
  承認時にどちらかの残高が足りなければ、承認そのものが失敗する。

### 簡易登録（`profiles.account_type = 'simple'`）

招待リンクから来た人だけが作れる。集めるのは名前・生年月日・写真だけで、
性別は聞かない（アプローチ機能を使えないため）。**年齢確認は通常登録と同じ**。

- **卓を立てられない・参加を申し込めない**（`enforce_group_party` /
  `enforce_group_join` が弾く）。招待されたグループのメンバーとして会に入るだけ。
- 相方に指定することもできない（`find_partner_by_code` が弾く）。
- メール確認が有効なので、**登録した直後にはセッションが無い**。
  招待コードは `localStorage`（`aiseki:pendingInvite`）に控え、
  確認メールから戻ってログインした時点で `App.jsx` が引き受ける。

### 18-b. 薄モザイク（マッチ前の写真）

**画面の CSS でぼかしているのではない。** 素の画像を配ってしまえば
開発者ツールで外せるので、**アップロードの時点で別ファイルを作って保存する。**

- `src/lib/api.js` の `makeBlurredImage()` が、いったん幅64pxまで縮めてから
  ぼかして描き直す。**縮小を挟むので、ぼかしを解いて元に戻すことはできない。**
- 保存先は `profiles.avatar_blur_url` / `photos_blur`（素の写真と同じ並び）。
- マッチ前の閲覧経路は **`party_host_preview()` だけ**。この関数は
  `is_party_member()` が真のときだけ素のURLを返す。
- 会の一覧用に `parties.host_avatar_blur_url` へ非正規化してある
  （`profiles` は同じ会のメンバーにしか見えないため。飲みスタイルと同じ理由）。
- 🚨 **`party_host_preview()` に `gender` / `review_average` / `review_count` /
  `rank_tier` を足してはいけない。** 足した瞬間に「マッチ前の他人」へ
  性別や評価が開示され、§1 の担保が壊れる。

### 18-c. 返金（通報対応）

`refund_join_payment(p_request_id, p_reason)`。**画面には出さない**（仕様どおり）。

- **`service_role` 専用**（`anon` / `authenticated` から revoke 済み。適用時に検算あり）。
- 承認済みのリクエストについて、支払った人ごとに残高へ戻し、
  `platform_revenues` の該当行を消して収益からも打ち消す。
- リクエストは `status = 'refunded'` になる。各自払いなら2人に戻る。

```sql
-- 運営が Supabase の SQL Editor から実行する
select public.refund_join_payment('<join_request_id>', '通報対応');
```

### 入れたもの

| どこ | 何 |
|---|---|
| `supabase/migration_new_flow.sql`（新規） | 下記すべての DB 側 |
| `groups` / `group_members`（新規テーブル） | ホスト側グループ。招待コードは列単位で遮断 |
| `profiles` | `account_type` / `signup_intent` / `avatar_blur_url` / `photos_blur` |
| `parties` | `group_id` / `host_avatar_blur_url` |
| `join_requests` | `pay_mode` / `partner_id` / `billable_size` |
| `src/lib/pricing.js` | `SOLO_FEE` ほか人数・支払い方法の定数 |
| `src/lib/api.js` | グループ／簡易登録／モザイク／相方／見積りの関数 |
| `src/screens/GroupScreen.jsx`（新規） | グループの作成・招待リンク |
| `src/screens/InviteSignupScreen.jsx`（新規） | 招待リンクからの簡易登録 |
| `src/App.jsx` | 作成画面（グループ選択）・詳細画面（相方／支払い方法／1人参加／モザイク） |
| `src/screens/ProfileEditScreen.jsx` | ぼかし画像の生成と保存 |
| `src/screens/AuthScreen.jsx` | `signupIntent`（LPからの導線を記録） |
| `lp/GuestPage.jsx` · `LandingScreen` · `SafetyScreen` | 「2名以上のグループ単位」の記述を実態に合わせて修正 |

### 18-d. 本番反映と通し確認（2026-08-29 完了）

- ✅ **本番デプロイ済み**（最新は 2026-08-29 の `dpl_B6Pyz54Aa6r9eCajASWZ3Bi1q9hR` /
  `aisekimatch.com` に alias 済み。配信バンドルは `assets/main-DXtLRR7T.js`。
  §19 の「ひとつ上のランク帯」まで入っている）。
  新フロー単体の初回デプロイは `dpl_2hEh9XXDRF4Fi9Q6DHiRoxjhBKPR`。
  出す前の grep は §15 のとおり全て確認した（現行 ref あり / 旧 ref 0件 /
  `sk_live`・`whsec_` 0件。`sb_secret_` の1件は supabase-js の接頭辞判定で、鍵ではない）。

  ⚠ **`vercel pull` の埋め戻しは今回も必要だった。**
  `VITE_STRIPE_PUBLISHABLE_KEY` と `VITE_TURNSTILE_SITE_KEY` が `len=2`（空）で
  落ちてくる。build の前に `.env` の実値で書き戻すこと（§15 / §16）。

- ✅ **簡易登録の通し確認済み**（本番 `aisekimatch.com` に対して実施）。
  招待リンク → 簡易登録（実アドレス `theoffzaki+simple1@gmail.com`）→
  確認リンク → ログイン → **グループの枠が自動で引き受けられる**ところまで通した。
  `localStorage` の `aiseki:pendingInvite` が引き受け後に消えることも確認済み。
  ホスト側からは2人とも「登録済み」で見え、その状態で卓を立てられることも確認した。

  ⚠ **受信箱そのものは確認していない**（こちらから開けないため）。
  確認できたのは「Supabase が確認メールを送った（`confirmation_sent_at` が入り、
  Auth のログに `user_confirmation_requested` があって SMTP のエラーが1件も無い）」
  ところまで。リンク自体は Admin API で同じものを作り直して踏み、
  `/auth/v1/verify` が 303 で `aisekimatch.com` へ戻すことを実測した。
  **実際に届いた画面を見たい場合は、受信箱の目視だけが残っている。**

- ✅ **簡易登録の制限は本番でも効いている**（実アカウントで確認）:
  卓の作成・参加の申し込み・グループの作成のいずれも拒否される。

- ⛔ **実機（スマートフォン）での確認は未実施。**

### 既存の写真のぼかし（後追い生成）

`scripts/backfill_blur_photos.mjs` を用意した。

```bash
node scripts/backfill_blur_photos.mjs           # 確認のみ
node scripts/backfill_blur_photos.mjs --apply   # 実際に作って保存する
```

- **適用時点で対象は0件**（既存の9名は誰も写真を登録していない）。
- ぼかし方は `src/lib/api.js` の `makeBlurredImage()` と揃えてある。
  **片方だけ変えないこと**（画面から上げた写真と後追いの写真でぼかしの強さが変わる）。
- 実写真1枚で通し確認済み。**細部の 99.8% が失われ、写り込んだ文字が判読不能になる**
  ことを実測した。`profiles` を更新すると
  `parties.host_avatar_blur_url` まで同期されることも確認済み。
- ⚠ `uploadAvatarPair()` は**ぼかしの生成に失敗しても登録自体は通す**作りなので、
  ぼかしの欠けた行は今後も生まれうる。ときどきこのスクリプトを流すこと。

---

## 19. ひとつ上のランク帯の会（2026-08-29）

ホームの募集一覧の下に、**自分のランクのひとつ上の帯**を常設した。
実装は `src/lib/nextTier.js` と `src/App.jsx` の `NextTierSection` / `LockedTierCard`。
DB の変更は無い（`migration_new_flow.sql` までで足りている）。

### 何のための枠か

ランクは会の終了後に受け取る評価で上がるが、ブロンズの人には
**上の帯で何が起きているのかがまったく見えず**、ランクを上げる意味が伝わらない。
そこで「いまは申し込めない帯」をあえて見せる。

- 実在の募集（`min_guest_tier` がひとつ上のもの）を**優先して並べる**
- 足りない枠は「例」と明示した**見本**で埋める（既定3枠）
- 中身は見せない。写真もホスト名も出さず、鍵・エリア・予算帯・飲みスタイルだけ
- プラチナには出さない（ひとつ上が無い）。絞り込み中も出さない
- ランクが上がると、その帯は消えて次の帯に切り替わる

### 🚨 見本を「実在の募集」として出さないこと

依頼は「実態のないダミー募集をランダム表示して盛り上がってる感を演出する」だったが、
**そのままでは実装していない。見本であることを明示する形に変えてある。**
戻したくなったときのために理由を残す（`src/lib/nextTier.js` の冒頭にも同じことを書いた）:

1. **このアプリ自身の掲示と正面から矛盾する。** `src/lib/legal.js` の
   `FOOTER_NOTICE`（全画面のフッターに出る）に
   「接待行為・個室での相席・**サクラは一切ありません**」があり、
   利用規約 第9条にも「報酬または利益の供与を受けて客の相手をする者を一切置きません。
   ユーザーの相手方となるのは、常に一般のご利用者です」と書いてある。
   実在しない募集を本物として並べると、**同じ画面の下端でこの掲示が嘘になる。**
2. **有料サービスなので景品表示法5条（有利誤認）に触れうる。**
   賑わって見えるかどうかは 7,600pt を払うかどうかの判断に直接効く。
3. **実務的に破綻する。** ブロンズの人がシルバーに上がった瞬間、
   見えていた会が1件も無いことに気づく。空だった方がまだマシな壊れ方をする。

なお、この扱いは**このリポジトリの既存の作法に揃えたもの**でもある。
`supabase/seed_shops_sample.sql` は実店舗が決まる前の店舗データを
**【サンプル】と画面に出したまま**投入していて、「実在の提携店舗ではない」と明記してある。

> ⚠ **方針を変えて「本物として出す」なら、先に `FOOTER_NOTICE` から
> 「サクラは一切ありません」を外し、利用規約 第9条を書き換えること。**
> 掲示を残したまま出すのがいちばん危ない。

### 触るときの注意

- 🚨 **`isSample` を落としたり、「例」のバッジ／説明文を消したりしないこと。**
  それをした時点で上の3点すべてに抵触する。
- 見本の `id` は `sample:` で始まる文字列。実在の会の UUID とは衝突しない
  （取り違えて `api.getParty()` に渡しても UUID ではないので落ちる）。
- 見本には**人の写真と実在の店名を入れない**（`host_avatar_blur_url` / `location` は null）。
- 種は「人 × ランク帯 × 日付」。描画のたびに並びが変わると壊れて見えるため、
  同じ日は同じ見本が出る。
- 🚨 **ランクは一覧と一緒に引き直すこと。** ランクが上がるのは
  「相席した会の終了後に相手が評価を書いた時点」なので、ホームを開いたまま上がりうる。
  取得がマウント時の1回きりだと、**到達済みの帯が出続ける**（見本が消えない）。
  いまは `load()` の中と、アプリへ復帰したとき（`visibilitychange`）の両方で引き直している。
- 帯が切り替わったら、前の帯の実在の会をいったん捨てる。残すと取り直しが返るまで
  「前の帯の会 × 新しい帯の見本」が混ざる。

### モーダルは portal で出すこと（今回踏んだ罠）

画面の外枠 `.screen-enter` は `animation: ... both` が効いていて、
**アニメーションが終わったあとも computed transform が `matrix(1,0,0,1,0,0)`（単位行列）のまま残る。**
単位行列でも `position: fixed` の**包含ブロック**になるため、その中に直接置いた
`inset: 0` のモーダルは「画面」ではなく「スクロール領域全体」に広がり、
中央寄せの中身がずっと下（画面外）に描かれる。実際にそれで一度出なかった。
**`createPortal(..., document.body)` で出すこと。**

> ⚠ `src/screens/MemberSheet.jsx` も `position: absolute; inset: 0` の
> ボトムシートで、同じ原因の影響を受けている可能性がある（未確認・未修正）。

### 検証

- 不変条件を全ランクで確認（26項目）… ひとつ上がちょうど1段であること、
  自分の帯・到達済みの帯が出ないこと、出る帯は必ず申し込めないこと、
  ランクが上がると前の帯の見本が1件も残らないこと、
  実在の募集が見本より必ず前に出ること、実在の募集が足りていれば見本が0件になること。
- 本番（`aisekimatch.com`）で実アカウントを作って確認。ブロンズでシルバー帯が3件（全て見本・
  「例」バッジあり）、押すと「これは会の『例』です」。
  シルバーに上げると実在の「確認用・ゴールド以上」が先頭（バッジなし）＋見本2件。
  **リロードせずに**昇格させてもシルバーの見本が消えてゴールドへ切り替わり、
  プラチナでは枠ごと消えることを確認した。確認用のアカウントは削除済み。

---

## 20. 参加申請の3つの導線と「招待割」（2026-08-29）

`supabase/migration_invite_discount.sql` の1本にまとまっている（冪等・**適用済み**）。
検証は `.e2e-invite.mjs`（未コミット）。migration の適用ごと `BEGIN … ROLLBACK` の中で
**51項目すべて成功**。`npm test`（19項目）と `.e2e-newflow.mjs`（54項目）も通したまま。

### 画面（会の詳細 → 参加申請）

```
[ 既存の会員と参加 ]  [ 招待して呼ぶ ]     ← 左が既定
──────────────────────────────────────
既存の会員と参加 … 相方の会員コードを入れて「確認」
                   → 各自払い（3,800ptずつ）／まとめ払い（7,600pt）
招待して呼ぶ     … 申し込むと招待リンクが発行される
                   参加費 7,600pt − 招待割 3,800pt ＝ お支払い 3,800pt
──────────────────────────────────────
  相方は登録しない / 1人で参加申請をする   ← 下部に小さく
      ├ 相方の名前を入れる（アカウントなし）… 7,600pt
      └ 1人で参加申請を出す                … 7,600pt
```

### 招待割（`invite_discount()` = 3,800pt）

| | |
|---|---|
| 何か | **割引**。参加費から 3,800pt を引く（お支払い 3,800pt） |
| ポイントの付与 | **一切しない。** 招待した側にも、された側にも 1pt も配らない |
| 相方の負担 | 0pt（残高を持たないので払えない） |
| 使えるのは | **簡易登録（`account_type='simple'`）で新しく入った方だけ** |

> 🚨 **「招待した人に○○pt進呈」にしてはいけない。**
> アカウントを作っては招待する形でポイントだけ抜ける（§16 CAPTCHA /
> §17 カード1枚1アカウント と同じ形）。割引なら、実際に卓へ申し込んで
> **承認されたときにしか効かず**、持ち出せる残高も生まれない。
>
> 🚨 **既存の会員は招待リンクを引き受けられない**（`claim_join_invite` が弾く）。
> ここを緩めると、会員同士で招待し合って毎回 3,800pt で済ませられる。
> リンクを踏んだ既存会員には「会員コードを伝えてください」と案内が出る。

### 招待リンクの流れ

1. ゲストが「招待して呼ぶ」で申し込む（`pay_mode='invite'`）。
   → `enforce_group_join` が `join_requests.invite_code` を発行する。
2. 画面に `https://aisekimatch.com/?invite=XXXXXXXX` が出る。**承認を待たずに送れる。**
3. 相方が開く → 簡易登録（メール・パスワード → 名前・生年月日・**写真は任意**）。
4. 確認メールから戻ってログイン → `claim_invite()` が枠を引き受ける。
5. ホストが承認 → 3,800pt をお預かり → 実体つきの席ができる。

- **承認までに登録が間に合わなくてもリンクは死なない。**
  `accept_join_request()` が、引き受けられていない招待コードを
  会の席（`party_members.invite_code`）へ**移し替える**。
  送ってあるリンクはそのまま `claim_seat` の経路で通る。
- **見送られた申し込みのリンクは無効になる**（`on_join_request_dead_invite`）。

> 🚨 **`?invite=CODE` のコードの置き場は3か所ある。**
> `group_members`（ホストのグループ）/ `join_requests`（参加申請の招待）/
> `party_members`（承認後の席）。振り分けは DB の
> **`invite_preview()` / `claim_invite()`** が1本で行う。
> 画面から個別の RPC（`group_invite_preview` / `claim_group_invite` / `claim_seat`）を
> 直接呼ばないこと。`gen_invite_code()` は3か所すべてと突き合わせてコードを作る。

### 追いかけメール（簡易登録の方の正規会員化）

Vercel の日次 Cron（`vercel.json` の `crons` / **UTC 2:00 ＝ 日本時間 11:00**）が
`/api/cron/followup` を叩く。登録から1日後・7日後の2通。

- 宛先は `followup_candidates()`（**service_role 専用**。メールアドレスを返すため）。
  簡易登録・カード未登録・メール確認済みの人だけ。**カードを登録した時点で止まる。**
- 送る前に `record_followup_email()` で記録を取り、取れたときだけ送る
  （`followup_emails` の一意制約が二重送信を止める）。**順番を逆にしないこと。**
- 文面は「カードを登録すると 5,000pt が付いて、自分でも申し込める」。

> ⛔ **`RESEND_API_KEY` を Vercel に入れるまで、この Cron は 503 を返して何も送らない。**
> Supabase 側の SMTP には Resend のキーが入っているが、
> Management API の `smtp_pass` は**実値を返さない**（ハッシュ済みの64文字が返る）ので
> こちらからは取り出せない。**Resend のダッシュボードでキーを作り直して入れること**:
>
> ```bash
> printf '%s' 're_xxxxx' | vercel env add RESEND_API_KEY production --force
> vercel deploy --prebuilt --prod --yes   # 環境変数は再デプロイまで効かない
> ```
>
> ✅ `CRON_SECRET` は 2026-08-29 に発行して Production と `.env` に入れてある
> （Vercel が Cron 実行時に `Authorization: Bearer` で送る。手で叩くときも同じ）。

### 触るときの注意

- 🚨 **請求額の出典は `join_charge_of(size, mode)` ひとつ。**
  画面（`pricing.js` の `myJoinCharge` / `joinChargeBreakdown`）と
  `accept_join_request()` と `join_charge_preview()` が同じ式を通る。
  片方だけ直すと「画面に出ていた額」と「実際に引かれた額」がずれる。
- 🚨 **列単位で grant する前に、テーブル全体の権限を落とすこと。**
  Supabase の既定で public スキーマの全テーブルに ALL が付いているため、
  `grant insert (列...)` を並べても、表全体の INSERT が残っていれば意味が無い
  （`invite_code` を自分で指定して insert できた）。
  この migration で `revoke select, insert on join_requests` を先に入れた。
- 🚨 **新しく作った関数は anon から revoke する。**
  同じく既定で「public スキーマの全関数」に EXECUTE が付く。
  `grant execute ... to authenticated` を書いても anon は塞がらない。
- **`platform_revenues.group_size` は「何名分を受け取ったか」。**
  各自払い・招待割のときは1（金額と辻褄を合わせる）。返金はこの列ではなく
  `points` の合計で戻すので、`refund_join_payment()` はそのまま使える。
- **簡易登録の写真は端末に控えてから上げる。** メール確認が済むまで
  セッションが無く、`avatars` のポリシー（自分のフォルダ）を満たせない。
  `localStorage` の `aiseki:pendingInvitePhoto` に縮小した data URL を置き、
  ログインした時点で `App.jsx` が上げる。
- **お名前の欄は1つだけ**（ニックネーム）。AISEKI は本名を集めない。

### 本番反映（2026-08-29）

- ✅ **デプロイ済み**（`dpl_2YXJBgNPoAf8YQtehXLPsNke64nE` / `aisekimatch.com` に alias 済み。
  配信バンドルは `assets/main-a3ZVM5vy.js`）。出す前の grep は §15 のとおり全て確認した
  （現行 ref あり / 旧 ref 0件 / `sk_live`・`whsec_`・`CRON_SECRET` 0件）。
  ⚠ `vercel pull` の埋め戻しは今回も必要だった（`VITE_STRIPE_PUBLISHABLE_KEY` /
  `VITE_TURNSTILE_SITE_KEY` が `len=2`）。
- ✅ Cron は Vercel に登録済み（`/api/cron/followup` / `0 2 * * *` / enabled）。
  認証なしで叩くと **401**、`CRON_SECRET` 付きだと
  **`{"error":"RESEND_API_KEY が設定されていません。"}`** を返す（＝キー待ちで空撃ちしない）。
- ✅ `/api/stripe/status` は `{"enabled":true,"cardEnabled":true}` のまま。
- ✅ 画面の通し確認はローカルで実施（本番スキーマに接続）。
  4つの導線すべてと、申し込み → 招待リンク発行 → `?invite=` の簡易登録画面まで確認した。
  確認に使ったアカウントと参加申請は削除済み（`auth.users` 9件・`join_requests` 0件に戻したことを確認）。
- ⛔ **実機（スマートフォン）での確認は未実施。**

### 20-b. 招待割が効くのは「相方が登録を完了した時点」（2026-08-29 修正）

`supabase/migration_invite_discount_on_signup.sql`（冪等・**適用済み**）。
`.e2e-invite.mjs` は **58項目すべて成功**。

| 状態 | 参加費 | 招待割 | お支払い |
|---|---|---|---|
| 招待リンクを発行しただけ | 7,600pt | —（案内のみ） | **7,600pt** |
| 相方が簡易登録を完了 | 7,600pt | -3,800pt | **3,800pt** |

リンクを出しただけで割り引くと、**誰も呼ばずに「招待して呼ぶ」を選ぶだけで半額**に
できてしまう（承認時、相方の席は名前だけの未登録席になる）。実際に人が増えたときだけ割り引く。

- 判定は `join_requests.invited_user_id is not null` ひとつ。
  決済は承認の瞬間なので、**そこで見た状態がそのまま料金**になる。
  → 承認前に登録が間に合えば 3,800pt、間に合わなければ 7,600pt。
  あとから登録されても**遡っての返金はしない**（返金は `refund_join_payment` だけ）。
- 画面は、申し込む前は「招待割（相方のご登録後） -3,800pt」を**灰色で予告**し、
  お支払いは 7,600pt のまま出す。発行後の招待リンクのカードに「いまのお支払い」を出し、
  相方が登録すると 3,800pt に変わる。

> 🚨 **料金の関数は引数を増やさないこと。**
> いちど `join_charge_of(int, text)` を `(int, text, boolean)` に増やしたら、
> 前の migration（`migration_invite_discount.sql`）を流し直した瞬間に
> **同名2つ**になり `function ... is not unique` で全部落ちた。
> いまは名前で分けてある:
>
> | 関数 | 何を返すか |
> |---|---|
> | `join_charge_of(size, mode)` | **申し込む時点**の請求額。招待は割引なし（7,600pt） |
> | `join_charge_claimed(size, mode, claimed)` | **決済時点**の請求額。招待は claimed のときだけ 3,800pt |
> | `join_charge_preview(size, mode)` | 表示用。`discount`＝0 と `discount_when_claimed`＝3,800 を返す |
> | `my_join_invite(party)` | 自分の招待リンク。`charge` は**いまの**請求額 |
> | `list_incoming_request_charges()` | ホストの受信箱用。金額と「相方が登録済みか」だけ（素性は返さない） |
>
> `accept_join_request()` は **`join_charge_claimed()` を通すこと**。
> `join_charge_of()` を使うと割引が一生効かない。
>
> ⚠ **migration は必ずこの順で流すこと**（`migration_invite_discount.sql` →
> `migration_invite_discount_on_signup.sql`）。前者だけを流し直すと
> 「発行しただけで割引」の古い規則に戻る。`.e2e-newflow.mjs` / `.e2e-invite.mjs` は
> どちらも3本を通しで当てている。

**本番反映（2026-08-29）**: `dpl_3QC4RK2sdkiXdThqCgydHiXvsBiE` /
配信バンドル `assets/main-BLY_9gdz.js`。出す前の grep は §15 のとおり全て確認
（現行 ref あり / 旧 ref・`sk_live`・`whsec_`・`CRON_SECRET` 0件）。
`/api/stripe/status` は `{"enabled":true,"cardEnabled":true}` のまま。
画面の通し確認（本番スキーマに接続）で、申し込み前 7,600pt →
招待された人の登録完了後 3,800pt に変わることを実際に見た。確認用のデータは削除済み。
