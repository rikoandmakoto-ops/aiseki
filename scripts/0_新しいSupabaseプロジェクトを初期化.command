#!/bin/bash
# =====================================================================
#  新しい Supabase プロジェクトに、aiseki のDB一式をまとめて適用する
#
#  このファイルをダブルクリックすると
#   1) 必要なSQL 4本を「正しい順番」で連結してクリップボードにコピーし
#   2) Supabase の SQL Editor をブラウザで開きます。
#
#  あとは SQL Editor に貼り付け（⌘V）→ Run（⌘Enter）を押すだけです。
#
#  ※ 接続先（プロジェクトID）は .env の VITE_SUPABASE_URL から読み取ります。
#     先に .env を新しいプロジェクトの値に書き換えてから実行してください。
# =====================================================================

cd "$(dirname "$0")/.." || exit 1

# 適用順（この順番でないと外部キー・カラム追加が失敗します）
FILES=(
  "supabase/schema.sql"
  "supabase/migration_point_fix.sql"
  "supabase/migration_group_only.sql"
  "supabase/migration_group_members.sql"
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ $f が見つかりません。"
    read -n 1 -s -r -p "何かキーを押すと閉じます..."
    exit 1
  fi
done

# .env から プロジェクトID を取り出す（https://xxxx.supabase.co → xxxx）
PROJECT_REF=""
if [ -f ".env" ]; then
  PROJECT_REF=$(grep -E '^VITE_SUPABASE_URL=' .env | head -1 | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#')
fi

# 連結してコピー
{
  for f in "${FILES[@]}"; do
    echo "-- ══════════════════════════════════════════════════════════"
    echo "-- $f"
    echo "-- ══════════════════════════════════════════════════════════"
    cat "$f"
    echo ""
  done
} | pbcopy

TOTAL=$(cat "${FILES[@]}" | wc -l | tr -d ' ')

echo "✅ セットアップSQLをクリップボードにコピーしました（合計 ${TOTAL} 行 / 4ファイル）。"
echo ""
echo "▶ 次の手順:"
echo "   1. これから開くブラウザの SQL Editor で ⌘V を押して貼り付け"
echo "   2. 右下の Run（または ⌘Enter）を押す"
echo "   3. 「Success」と表示されたら完了です"
echo ""
echo "   ※ 何度実行しても安全な内容です（冪等）。"
echo ""

sleep 2
if [ -n "$PROJECT_REF" ]; then
  open "https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"
  echo "ブラウザを開きました（プロジェクト: ${PROJECT_REF}）。"
else
  open "https://supabase.com/dashboard/projects"
  echo "⚠️  .env から プロジェクトID を読み取れませんでした。"
  echo "   ダッシュボードから対象プロジェクトを選び、SQL Editor を開いてください。"
fi

read -n 1 -s -r -p "何かキーを押すと、このウィンドウを閉じます..."
