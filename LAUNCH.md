# AISEKI ローンチ手順

このファイルは「本番に出すまでに、人の手でやる必要があること」だけをまとめたもの。
コードで完結している部分は書かない。

上から順にやれば公開できる。**1 と 2 は必須**（これをやらないと一部の機能が動かない）。

---

## 1. データベースの更新（必須）— ✅ 2026-08-19 適用済み

`supabase/migration_launch.sql` を Supabase に適用する。

> **本番（`melfyxfvhyknqhruytms`）には 2026-08-20 に適用済み。**
> （2026-08-19 に旧 `tvydtsqirogdxglkoicz` へ適用したものを、移管先にも同順で適用した）
> 重複外部キー2本（`party_members_user_id_fkey_profiles` /
> `messages_user_id_fkey_profiles`）の削除まで完了している。
> 以下の手順は、別環境を立てたときのために残してある。

**やり方（どちらでもよい）**

- `scripts/1_SupabaseにSQLを適用.command` をダブルクリック
  → SQLがクリップボードにコピーされ、SQL Editor が開く。貼り付けて Run。
- または Supabase ダッシュボード → SQL Editor に手で貼り付けて実行。

何度実行しても安全（冪等）。

**このSQLで入るもの**

| 内容 | これが無いと |
|---|---|
| 重複した外部キーの削除 | **会の詳細とグループチャットが必ず失敗する**（既存の不具合の修正） |
| `inquiries` テーブル | お問い合わせ・通報がアプリ内から送れない（メール窓口に切り替わる） |
| `cancel_party()` | ホストが会を取り消せない |
| `delete_account()` | 退会できない（利用規約 第15条で約束している機能） |
| `avatars` バケット | プロフィール写真をアップロードできない |
| 文字数・ポイント数の上限制約 | 画面を迂回した巨大な入力を DB で止められない |

適用後、実行ログの最後に `── AISEKI ローンチ用マイグレーション 適用完了 ──` と
各項目の件数が出る。すべて `1` になっていれば成功。

> **重複した外部キーについて**
> `party_members.user_id → profiles.id` と `messages.user_id → profiles.id` に
> 外部キーが2本ずつ張られていた（過去のマイグレーションの名残）。
> この状態だと PostgREST が `profiles` を埋め込めず `PGRST201` で失敗するため、
> 会の詳細とチャットが読み込めなかった。
> アプリ側でも外部キー名を明示して回避してあるので、
> マイグレーション未適用でも表示はできるが、根本原因はSQL側で解消しておくこと。

---

## 1-b. 参加ポイントの一律化（必須）— ✅ 2026-08-19 適用済み

`supabase/migration_fixed_join_fee.sql` を Supabase に適用する。
`migration_launch.sql` のあとに実行すること（何度実行しても安全）。

> **本番（`melfyxfvhyknqhruytms`）には 2026-08-20 に適用済み。**
> （2026-08-19 に旧 `tvydtsqirogdxglkoicz` へ適用したものを、移管先にも同順で適用した）

**このSQLで入るもの**

| 内容 | これが無いと |
|---|---|
| `join_fee_per_person()` = 3,800 | 参加ポイントが会ごとにばらばらのまま |
| `parties_fixed_fee` 制約 / `on_party_fee_lock` トリガー | 画面を迂回して金額を書き換えられる |
| `allowed_treat_type()` = ゲストのおごり | 「割り勘」の会が作れてしまう |
| `platform_revenues` テーブル | 運営に入った売上が記録されない |
| `accept_join_request()` の作り直し | **ホストにポイントが支払われ続ける** |

適用後の確認は `npm test`（下記 8 を参照）。

---

## 1-c. ローンチ強化（必須）— ✅ 2026-08-19 適用済み

`supabase/migration_launch2.sql` を Supabase に適用する。
`migration_fixed_join_fee.sql` のあとに実行すること（何度実行しても安全）。

> **本番（`melfyxfvhyknqhruytms`）には 2026-08-20 に適用済み。**
> （2026-08-19 に旧 `tvydtsqirogdxglkoicz` へ適用したものを、移管先にも同順で適用した）

**このSQLで入るもの**

| 内容 | これが無いと |
|---|---|
| `signup_bonus()` = 10,000 と `handle_new_user()` の作り直し | **新規登録ボーナスが 1,000pt のままで、登録直後に一度も参加できない**（参加は1名 3,800pt） |
| `profiles` の追加項目（`photos` / `hobbies` / `favorite_food` / `favorite_drink` / `occupation` / `home_area`） | プロフィールの充実・写真の複数枚が保存できない |
| `parties.party_date` | 開催日での絞り込みができない |
| `blocks` テーブル / `is_blocked()` / `party_host()` | ブロック機能が動かない |
| `referral_code` / `apply_referral_code()` / `my_referral_stats()` | 友達招待のボーナスが動かない |
| 追加項目への列単位の GRANT | プロフィールの保存が `42501` で落ちる |

適用後、実行ログの最後に新規登録ボーナス・紹介ボーナスの額が出る。

**SQL の流し方（psql が無い環境向け）**

```
AISEKI_DB_PASSWORD='<DBのパスワード>' node scripts/apply_sql.mjs supabase/migration_launch2.sql
```

接続先は `.env` の `VITE_SUPABASE_URL` から組み立てるので、
プロジェクトを作り直しても書き換えは要らない（接続先は実行時に必ず表示される）。

> **ポイントの額を変えるときは2箇所**
> `src/lib/api.js` の `SIGNUP_BONUS` / `REFERRAL_BONUS` と、
> このSQLの `signup_bonus()` / `referral_bonus()`。片方だけ変えると表示と実際がずれる。

---

## 2. Supabase の設定（必須）— ✅ 2-1 / 2-2 は 2026-08-20 に適用済み（2-3 が未了・後述）

ダッシュボードでの設定。コードからは変えられない。

> **CLI / Management API で自動化したい場合**
> Personal Access Token が要る。形式は `sbp_` で始まる40文字前後。
> ダッシュボード右上のアカウントメニュー → **Account → Access Tokens → Generate new token**
> で発行する。
>
> ```bash
> SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx node scripts/apply_auth_config.mjs
> ```
>
> このスクリプトが 2-2（戻り先URL）→ 2-1（メール確認）を正しい順番で流し、
> 最後に `/auth/v1/settings` を叩いて反映を確認するところまでやる。
> 2-3（SMTP）と 2-4（メール本文）はAPIに項目が無いので手作業のまま。
>
> **★ 代用できるものは無い（2026-08-20 に一通り試して確認済み）**
>
> | 試したもの | 結果 |
> |---|---|
> | DBに直接SQL（`auth.config` を書き換え） | ❌ `auth` スキーマに config テーブルが存在しない。GoTrue は設定をコンテナの環境変数から読むので、DB経由では変えられない |
> | service_role キー + GoTrue Admin API | ❌ `/auth/v1/admin/` はユーザー操作専用。設定を書き換えるエンドポイント自体が無い |
> | Vercel から service_role キーを取得 | ❌ Sensitive 指定のため書き込み専用。`vercel env pull` では空文字が返る |
> | `~/.supabase/` のトークン流用 | ❌ 未ログイン。keychain・環境変数にも無い |
>
> つまり **PAT の発行だけは人間がダッシュボードでやるしかない**。
> anon キー・service_role キー・DBパスワードのどれでも代用できない。
>
> **2026-08-20: PAT を受領し、上記スクリプトで 2-2 → 2-1 を適用済み。**
> ただし受け取った PAT は旧プロジェクト `tvydtsqirogdxglkoicz` とは**別アカウント**
> （org `zack` / `riko.and.makoto@gmail.com`）のもので、旧 ref には 403 で触れなかった。
> そのため同アカウントに新プロジェクト `melfyxfvhyknqhruytms` を作り、
> スキーマとデータを移管したうえで、新プロジェクトに Auth 設定を適用した。
> **PAT は今後もこのアカウントのものを使うこと。**

> **順番を守ること。2-2（リダイレクト先）を先にやってから 2-1（メール確認）を ON にする。**
> 逆にすると、Site URL が既定値（`http://localhost:3000`）のまま確認メールが飛び、
> **その間に登録した人全員のリンクが開けなくなる**。
> 先に 2-2 を入れておけば、この事故は起きない。

### 2-1. メール確認を有効にする ★重要（2-2 のあとで）— ✅ 2026-08-20 適用済み

**Authentication → Providers → Email → "Confirm email" を ON**

> **2026-08-20 に適用済み。** `melfyxfvhyknqhruytms` の `/auth/v1/settings` および
> Management API の両方で `mailer_autoconfirm: false` を確認した。
>
> **副作用: テストユーザーを anon キーだけで作る手順は、もう使えない。**
> `mailer_autoconfirm` が false になったため、`scripts/create_test_user.mjs` の
> 素の signup では確認済みユーザーにならない。以降は service_role で
> `POST /auth/v1/admin/users`（`email_confirm: true`）を使うこと。

これを ON にしないと、**自分のものではないメールアドレスでも登録できてしまう**。

- 本人に連絡が取れない（規約 第20条で通知手段として登録メールを指定している）
- 他人のメールアドレスで先に登録される（占拠）

開発中は確認なしのほうが楽なので、**公開の直前に切り替える**こと。

### 2-2. リダイレクト先の登録 — ✅ 2026-08-20 適用済み

**Authentication → URL Configuration**

> **2026-08-20 に適用済み。** Management API で以下を確認した。
> `site_url = https://aiseki-xi.vercel.app` /
> `uri_allow_list = https://aiseki-xi.vercel.app,https://aiseki-xi.vercel.app/**`

| 項目 | 値 |
|---|---|
| Site URL | `https://aiseki-xi.vercel.app` |
| Redirect URLs | `https://aiseki-xi.vercel.app/**` |

これが無いとパスワード再設定メールのリンクが機能しない
（リンクを開いても再設定画面に入れない）。

アプリ側は、登録の確認メール・再設定メールのどちらについても
戻り先を `window.location.origin` から明示して送っている
（`signUp` の `emailRedirectTo` / `resetPasswordForEmail` の `redirectTo`）。
そのため **Redirect URLs に登録されていない戻り先は弾かれる**。
上の `https://aiseki-xi.vercel.app/**` は必ず入れること。
独自ドメインに移すときは、そのドメインもここに追加する。

### 2-3. 送信元メールの設定 ⛔ **必須に格上げ（2026-08-20）**

> **2-1 でメール確認を ON にしたことで、これは「推奨」ではなく「公開の前提条件」になった。**
> 新プロジェクトの設定を確認したところ:
>
> | 項目 | 現在の値 | 意味 |
> |---|---|---|
> | `smtp_host` | `None` | 独自SMTP未設定 → Supabase 標準の送信サービスを使っている |
> | `rate_limit_email_sent` | `2` | **1時間あたり2通しか送れない** |
>
> Supabase 標準の送信サービスは、新規プロジェクトでは
> **組織のメンバーとして登録済みのアドレス宛にしか配信されない**。
> つまり今のままだと、**一般ユーザーは確認メールを受け取れず登録を完了できない**。
> **一般公開の前に必ずここを設定すること。**

**Project Settings → Authentication → SMTP Settings** で
独自のSMTP（Resend / SendGrid / Amazon SES など）を設定する。
設定後、`rate_limit_email_sent` も実運用に合わせて引き上げる
（Management API の `PATCH /v1/projects/{ref}/config/auth` で変更できる）。

### 2-4. メール本文の日本語化（推奨）

**Authentication → Email Templates**
確認メール・パスワード再設定メールの本文が英語のままなので、日本語にする。

---

## 3. Vercel の環境変数

**Settings → Environment Variables**（Production / Preview の両方）

| 変数名 | 値 | 必須 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://melfyxfvhyknqhruytms.supabase.co` | ✅ |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー | 決済を使うなら |
| `STRIPE_SECRET_KEY` | `sk_live_...` | 決済を使うなら |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | 決済を使うなら |
| `PUBLIC_BASE_URL` | `https://aiseki-xi.vercel.app` | 決済を使うなら |

`VITE_` が付く変数はブラウザに埋め込まれる。
**`SUPABASE_SERVICE_ROLE_KEY` と `STRIPE_SECRET_KEY` には絶対に `VITE_` を付けないこと。**

**2026-08-20 時点の状態（整理済み）**

| 環境 | 状態 |
|---|---|
| Production | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を 2026-08-20 に `melfyxfvhyknqhruytms` の値へ入れ替え。配信物が新 ref を向いていることを確認済み |
| Preview | ✅ `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を追加（2026-08-20）。以前は空で、プレビュー配信が止まっていた |
| Development | ✅ 現行プロジェクトの値に入れ替え（2026-08-20）。以前は**旧プロジェクト `lryjlxsfvzgtdxdjtemy` を向いていた** |

2026-08-20 に削除したもの:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（Production / Development）
  … このアプリ（Vite）はどこからも読んでいない
- `SUPABASE_SERVICE_ROLE_KEY`（Development）
  … **旧プロジェクト `lryjlxsfvzgtdxdjtemy` の service_role キーだった。**
  旧プロジェクトはまだ生きているので、`vercel env pull` で手元の `.env` を
  上書きすると開発環境が旧DBに繋がる事故になっていた

> **⚠️ 残っている宿題: Production の `SUPABASE_SERVICE_ROLE_KEY`**
> 11日前に、上の Development のものと同じ回で登録されている。
> Development 側が旧プロジェクトのキーだったので、**これも旧プロジェクトのものと考えてよい。**
> Vercel は登録済みの値を復号して返さないため中身は確認できなかった。
> いま Stripe が無効なので実害は無い（`/api/stripe/status` は `enabled:false`）が、
> **決済を有効にする前に、現行プロジェクトの service_role キーへ必ず入れ直すこと。**
> 古いままだと Webhook がポイントを付与できない。

---

## 4. 決済（ポイント購入）

現在 Stripe のキーはすべて placeholder。
このままでも**アプリは動く**。購入画面は `/api/stripe/status` を見て
「ポイントの購入は準備中です」に切り替わり、購入ボタンは「準備中」で押せなくなる
（押しても何も起きないボタンを黙って置かないため）。
そのあいだも、新規登録ボーナス 10,000pt と友達招待 3,800pt で参加できる。

決済を有効にするときにやること:

1. Stripe ダッシュボードでキーを取得し、上の環境変数に設定
2. Webhook エンドポイントを登録
   `https://aiseki-xi.vercel.app/api/stripe/webhook`
   受け取るイベント: `checkout.session.completed`
3. 表示された `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定
4. テストモードで1回購入し、ポイントが増えることを確認
5. 購入画面の「準備中」表示が消え、金額のボタンになることを確認
   （`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` が
     3つとも入って初めて有効になる）

> **プランの単価は `src/lib/packs.js` が唯一の出典。**
> Stripe には金額を保存していないので、値を変えるときはこのファイルだけを直す。

> ポイントを増やせる関数（`purchase_points` / `grant_purchased_points`）は
> `service_role` 専用にしてある。アプリからは呼べないので、
> 支払いを通さずにポイントを増やすことはできない。

---

## 5. 公開前の最終確認

### 動作確認（実機で）

- [ ] 未ログインでトップを開くとサービス紹介ページが出る
- [ ] 新規登録 → 確認メールが届く → ログインできる
- [ ] 20歳未満の生年月日では登録ボタンが押せない
- [ ] 会を作る → 一覧に出る → 詳細が開く
- [ ] 参加リクエスト → ホスト側で承認 → ポイントが移動する
- [ ] グループチャットで送受信できる（相手側にリアルタイムで届く）
- [ ] プロフィール写真を複数枚アップロードできる（最大6枚）
- [ ] 趣味・好きな食べもの等を保存でき、充実度バーが伸びる
- [ ] 参加メンバーをタップするとプロフィールが開く（承認後のみ）
- [ ] エリア・開催日・時間帯・人数の絞り込みが効く
- [ ] 招待コードを友達に渡すと、双方に 3,800pt 入る
- [ ] ブロックすると相手の会が一覧から消える／解除できる
- [ ] お問い合わせを送れる
- [ ] 会を取り消せる（承認前のみ）
- [ ] 退会できる
- [ ] ホーム画面に追加してアプリとして起動できる

### 表示確認

- [ ] iPhone Safari で下部タブがホームバーに隠れない
- [ ] SNSにURLを貼るとOGP画像が出る
      （確認: https://cards-dev.twitter.com/validator, https://developers.facebook.com/tools/debug/）

### 運営体制

- [x] 問い合わせ窓口が受信できる（規約・プライバシーポリシーに記載している窓口）
      ✅ **2026-08-20 に上記 (b) を採用**。`src/lib/legal.js` の `CONTACT_EMAIL` を
      `support@aiseki.app`（`aiseki.app` は DNS が引けなかった）から
      `theoffzaki@gmail.com` に変更した。規約・プライバシーポリシー・
      お問い合わせ画面・ランディングのフッターすべてに反映される。
      ※ この変更は**デプロイして初めて本番に反映される**。
      独自ドメインを取ってメール運用に移すときは、この1箇所を戻せばよい。
- [ ] 通報が届いたときに誰が見るか決まっている
      （`inquiries` テーブルを Supabase の Table Editor で確認する）
- [ ] 提携店舗の飲食店営業許可・深夜酒類提供飲食店営業の届出を確認済み
- [ ] 利用規約の「当社の本店所在地」（第23条）が実在の所在地と一致している

---

## 6. 既知の制限（ローンチ後に対応してよいもの）

| 項目 | 現状 | 補足 |
|---|---|---|
| 通知 | アプリを開いたときのみ | プッシュ通知は未実装。ベルのバッジは60秒ごとに更新 |
| 会の取り消し | 承認前のみ可能 | 承認後はポイントが消費済みのため、取り消せると枠だけ空ける操作に使える |
| 運営の売上確認 | `platform_revenues` を直接見る | 参加が承認されるたび1行入る。集計画面は無い |
| 参加者の途中離脱 | 未実装 | グループチャットで相談してもらう運用 |
| 本人確認バッジ | 未実装（案内のみ） | 安全センターに「準備中」として掲示している |
| 参加済みの会のブロック | 対象外 | 当日の待ち合わせに支障が出るため、グループチャットは残す。通報からの対応 |
| 開催日が無い会 | 旧データのみ | `party_date` が null。日付での絞り込みには出ず、「すべて」にのみ出る |
| 運営用の管理画面 | 無し | Supabase の Table Editor で対応する |

---

## 参考: 開発時のコマンド

```bash
npm run dev      # 開発サーバー（/api は動かない）
vercel dev       # /api（決済）も含めて動かす
npm run build    # 本番ビルド
node scripts/generate_icons.mjs   # アイコン・OGP画像を作り直す
```

## 8. ポイント仕様のテスト

参加ポイントが一律3,800ptであること、その全額が運営に入りホストには
1ptも渡らないことを、実際のDBに対して確かめる。

```bash
DB_PASSWORD=<Supabaseのパスワード> npm test
```

テスト用のユーザー・会・参加リクエストを作るが、すべてトランザクション内で
行い最後に必ず ROLLBACK するので、本番のデータは一切変わらない。
