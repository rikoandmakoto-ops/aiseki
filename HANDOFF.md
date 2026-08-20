# AISEKI 引き継ぎ書

最終更新: 2026-08-20 / 対象コミット: `4240e9d`（`main`）

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
| 本番URL | https://aiseki-xi.vercel.app （2026-08-20 時点で HTTP 200・稼働中） |
| Vercel プロジェクト名 | `aiseki` |
| Vercel projectId | `prj_eXehBy01ZFf7TYhqGI3d2zyvWu8I` |
| Vercel orgId | `team_r5d4Rpbmwu5q0EryE985968c` |
| 独自ドメイン | **未取得**。`aiseki.app` は DNS が引けない（A も MX も無し） |

> **⚠️ 最新コミットは未デプロイ。**
> 本番が配信している JS には、まだ古い `support@aiseki.app` が入っている
> （`curl https://aiseki-xi.vercel.app/assets/index-*.js` で確認済み）。
> `4240e9d` を反映するには**デプロイが必要**。

---

## 3. 認証情報まとめ

### Supabase（現行プロジェクト）

| 項目 | 値 |
|---|---|
| project ref | `tvydtsqirogdxglkoicz` |
| リージョン | ap-northeast-1 |
| API URL | `https://tvydtsqirogdxglkoicz.supabase.co` |
| anon（publishable）キー | `sb_publishable_2mA7W9xs1RH50b4EKhBKmg_F-mQ-ipX` |
| DB ホスト | `db.tvydtsqirogdxglkoicz.supabase.co:5432` |
| DB ユーザー / DB名 | `postgres` / `postgres` |
| DB パスワード | **このファイルには書かない**（下記参照） |

DB接続文字列の形:

```
postgresql://postgres:<DBパスワード>@db.tvydtsqirogdxglkoicz.supabase.co:5432/postgres
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

`lryjlxsfvzgtdxdjtemy` — 2026-08-18 に現行へ移行した旧 Supabase プロジェクト。**まだ生きている。**
環境変数にこの ref が出てきたら、それは事故（開発環境が旧DBに繋がる）。

### 現在保持していない資格情報

| 種類 | 状況 |
|---|---|
| Supabase Personal Access Token（`sbp_...`） | **未発行。** Auth設定の変更に必須（§6参照） |
| Supabase service_role キー | 手元には無い。`.env` は placeholder。Vercel 側は Sensitive で読み出し不可 |
| Stripe の各キー | すべて placeholder（意図的） |

---

## 4. 現在の状態

### ✅ 完了しているもの

- **アプリの実装** — 会の作成・一覧・絞り込み・参加リクエスト・承認・グループチャット・
  プロフィール（写真6枚 / 趣味 / 職業等）・ブロック・友達招待・通報 / お問い合わせ・退会・
  ランディング・PWA・OGP / SEO / セキュリティヘッダまで一通り実装済み。
- **DBマイグレーション** — 本番（`tvydtsqirogdxglkoicz`）に**適用済み**。
  - `migration_launch.sql`（2026-08-19）— 重複外部キー削除、`inquiries`、`cancel_party()`、
    `delete_account()`、`avatars` バケット
  - `migration_fixed_join_fee.sql`（2026-08-19）— 参加費3,800pt固定、`platform_revenues`
  - `migration_launch2.sql`（2026-08-19）— 登録ボーナス10,000pt、プロフィール項目追加、
    ブロック、紹介コード
- **過去の重大バグ** — 2件とも修正済み（§7）。
- **Vercel 環境変数の整理**（2026-08-20）— Preview に接続情報を追加、Development を
  旧プロジェクトから現行へ入れ替え、未使用の `NEXT_PUBLIC_*` を削除。
- **問い合わせ窓口** — `theoffzaki@gmail.com` に変更（コミット済み・**未デプロイ**）。

### ⛔ 完了していないもの

| 項目 | 現状 |
|---|---|
| **メール確認（Confirm email）** | **OFF のまま**。`mailer_autoconfirm: true` を 2026-08-20 に再確認 |
| **Redirect URLs の登録** | 未設定。パスワード再設定リンクが機能しない |
| 独自SMTP | 未設定。標準SMTPは1時間に数通しか送れない |
| メール本文の日本語化 | 未対応（英語のまま） |
| 最新コミットのデプロイ | 未実施 |
| Production の `SUPABASE_SERVICE_ROLE_KEY` | 旧プロジェクトのものの可能性が高い |
| Stripe決済 | placeholder のまま（意図的。無効でもアプリは動く） |
| 独自ドメイン | 未取得 |
| 実機での動作確認 | 未実施（チェックリストは `LAUNCH.md` §5） |
| 運営体制（通報対応者・営業許可確認・本店所在地） | 未確定 |

---

## 5. 残タスク一覧（優先度順）

### 🔴 P0 — これをやらないと公開できない

1. **Supabase Personal Access Token を発行する**
   ダッシュボード右上 → Account → Access Tokens → Generate new token（`sbp_` で始まる）。
   **人間がダッシュボードでやるしかない**（§6参照）。

2. **Auth設定を適用する** — PAT が取れたら1コマンド。
   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply_auth_config.mjs
   ```
   Redirect URLs → メール確認 の**順番**で流し、反映確認までやる。
   > 順番が逆だと、Site URL が既定値（`http://localhost:3000`）のまま確認メールが飛び、
   > **その間に登録した人全員のリンクが開けなくなる。**

3. **最新コミットをデプロイする**
   問い合わせ窓口の変更が本番に反映されていない。規約に書いた窓口に**メールが届かない状態**。

### 🟠 P1 — 公開直後に困るもの

4. **独自SMTPを設定する**（Resend / SendGrid / SES）
   Project Settings → Authentication → SMTP Settings。
   標準SMTPのままだと登録が集中した時点で確認メールが届かなくなる。

5. **実機で動作確認する** — チェックリストは `LAUNCH.md` §5。

6. **通報が届いたときに誰が見るか決める** — `inquiries` テーブルを Supabase の Table Editor で確認する運用。管理画面は無い。

7. **利用規約の「当社の本店所在地」（第23条）を実在の所在地に合わせる**

8. **提携店舗の飲食店営業許可・深夜酒類提供飲食店営業の届出を確認する**

### 🟡 P2 — 決済を有効にするとき

9. **Production の `SUPABASE_SERVICE_ROLE_KEY` を現行プロジェクトのものへ入れ直す**
   古いままだと Webhook がポイントを付与できない。**決済有効化の前に必ず。**

10. **Stripe の本番キー設定 + Webhook 登録** — 手順は `LAUNCH.md` §4。

### 🟢 P3 — 落ち着いてから

11. メール本文の日本語化
12. 独自ドメイン取得（取ったら `legal.js` の `CONTACT_EMAIL` / `SERVICE_URL`、Supabase の Redirect URLs、`PUBLIC_BASE_URL` を更新）
13. プッシュ通知、運営用管理画面、参加者の途中離脱（すべて未実装）

---

## 6. 既知の制約・ハマりどころ

### ⛔ 触ってはいけないもの

- **BAT営業用のプロジェクト・ファイル** — このリポジトリとは無関係。**絶対に触らない。**
- **他のプロジェクト全般** — 作業範囲は `/Users/ayukiyamazaki/Developer/aiseki` のみ。
- **force push 禁止。**
- **旧Supabaseプロジェクト `lryjlxsfvzgtdxdjtemy`** — まだ生きている。接続先にしない。

### Auth設定は PAT でしか変えられない（2026-08-20 に全経路検証済み・再調査不要）

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

接続先は `.env` の `VITE_SUPABASE_URL` から組み立てる（誤爆防止。実行時に接続先が表示される）。

自分で書く場合のポイント:

- `db.<ref>.supabase.co` は **AAAA しか返さない（IPv6専用）** が、この環境からは通る。
  プーラー（`aws-*-ap-northeast-1.pooler.supabase.com:5432`, user は `postgres.<ref>`）も
  控えとして使えるが、直結で足りている。
- `client.query(巨大なSQL文字列)` は簡易クエリプロトコルなので、
  **複数文・ドル引用符・DOブロックをまとめて1回で実行できる。分割は要らない。**
- `client.on('notice', ...)` を**必ず付ける**。付けないと `raise notice` の適用ログが全部消える。
- `ssl: { rejectUnauthorized: false }`

### Auth設定の適用 — Management API（PAT必須）

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxxx node scripts/apply_auth_config.mjs
```

正しい順番（Redirect URLs → メール確認）で流し、`/auth/v1/settings` で反映確認までやる。
SMTP（2-3）とメール本文（2-4）は **API に項目が無いので手作業**。

### テストユーザーの作成 — 現在は anon キーだけで作れる

`mailer_autoconfirm: true` なので、公開キーで `POST /auth/v1/signup` すると
**その場で確認済みユーザーが作れる**。service_role も DB パスワードも要らない。

```bash
node scripts/create_test_user.mjs
```

- **`options.data` に `birth_date` を必ず入れる。** `handle_new_user()` トリガーがそれを見て
  profiles 行とボーナスポイントを作る。無いと「年齢確認のため生年月日の登録が必要です」で登録ごと失敗する。
- **P0-2 でメール確認を ON にすると、この手順は使えなくなる。** 以降は service_role が要る。
- 作る前に `curl $URL/auth/v1/settings -H "apikey: $KEY"` で `mailer_autoconfirm` を確認するのが確実。

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

- 作業ブランチは `main`。最新は `4240e9d`。
- `feat/branding-refresh-age20` / `feat/codex-ui-refresh` /
  `feat/stripe-checkout-sky-blue-ui` は過去のブランチ。**現在の `main` に取り込む必要は無い**
  （`feat/codex-ui-refresh` は revert 済みのUI刷新）。
- **force push 禁止。**
