# AISEKI ローンチ手順

このファイルは「本番に出すまでに、人の手でやる必要があること」だけをまとめたもの。
コードで完結している部分は書かない。

上から順にやれば公開できる。**1 と 2 は必須**（これをやらないと一部の機能が動かない）。

---

## 1. データベースの更新（必須）— ✅ 2026-08-19 適用済み

`supabase/migration_launch.sql` を Supabase に適用する。

> **本番（`tvydtsqirogdxglkoicz`）には 2026-08-19 に適用済み。**
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

> **本番（`tvydtsqirogdxglkoicz`）には 2026-08-19 に適用済み。**

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

## 2. Supabase の設定（必須）

ダッシュボードでの設定。コードからは変えられない。

### 2-1. メール確認を有効にする ★重要

**Authentication → Providers → Email → "Confirm email" を ON**

現在は `mailer_autoconfirm: true`（＝確認なしで登録完了）になっている。
このままだと、**自分のものではないメールアドレスでも登録できてしまう**。

- 本人に連絡が取れない（規約 第20条で通知手段として登録メールを指定している）
- 他人のメールアドレスで先に登録される（占拠）

開発中は確認なしのほうが楽なので、**公開の直前に切り替える**こと。

### 2-2. リダイレクト先の登録

**Authentication → URL Configuration**

| 項目 | 値 |
|---|---|
| Site URL | `https://aiseki-xi.vercel.app` |
| Redirect URLs | `https://aiseki-xi.vercel.app/**` |

これが無いとパスワード再設定メールのリンクが機能しない
（リンクを開いても再設定画面に入れない）。

### 2-3. 送信元メールの設定（推奨）

Supabase 標準のSMTPは**1時間に数通**しか送れない。
公開後に登録が集中すると「確認メールが届かない」が多発する。

**Project Settings → Authentication → SMTP Settings** で
独自のSMTP（Resend / SendGrid / Amazon SES など）を設定する。

### 2-4. メール本文の日本語化（推奨）

**Authentication → Email Templates**
確認メール・パスワード再設定メールの本文が英語のままなので、日本語にする。

---

## 3. Vercel の環境変数

**Settings → Environment Variables**（Production / Preview の両方）

| 変数名 | 値 | 必須 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://tvydtsqirogdxglkoicz.supabase.co` | ✅ |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー | 決済を使うなら |
| `STRIPE_SECRET_KEY` | `sk_live_...` | 決済を使うなら |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | 決済を使うなら |
| `PUBLIC_BASE_URL` | `https://aiseki-xi.vercel.app` | 決済を使うなら |

`VITE_` が付く変数はブラウザに埋め込まれる。
**`SUPABASE_SERVICE_ROLE_KEY` と `STRIPE_SECRET_KEY` には絶対に `VITE_` を付けないこと。**

---

## 4. 決済（ポイント購入）

現在 Stripe のキーはすべて placeholder。
このままでも**アプリは動く**（購入ボタンを押すと「決済の準備ができていない」と出るだけ）。

決済を有効にするときにやること:

1. Stripe ダッシュボードでキーを取得し、上の環境変数に設定
2. Webhook エンドポイントを登録
   `https://aiseki-xi.vercel.app/api/stripe/webhook`
   受け取るイベント: `checkout.session.completed`
3. 表示された `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定
4. テストモードで1回購入し、ポイントが増えることを確認

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
- [ ] プロフィール写真をアップロードできる
- [ ] お問い合わせを送れる
- [ ] 会を取り消せる（承認前のみ）
- [ ] 退会できる
- [ ] ホーム画面に追加してアプリとして起動できる

### 表示確認

- [ ] iPhone Safari で下部タブがホームバーに隠れない
- [ ] SNSにURLを貼るとOGP画像が出る
      （確認: https://cards-dev.twitter.com/validator, https://developers.facebook.com/tools/debug/）

### 運営体制

- [ ] `support@aiseki.app` が受信できる（規約・プライバシーポリシーに記載している窓口）
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
| ブロック機能 | 未実装 | 通報のみ。運営が個別に対応する |
| 会の日付 | 時刻のみ | 「20:00」のような時刻だけで、日付は持っていない |
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
