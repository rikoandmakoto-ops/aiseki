#!/bin/bash
# =====================================================================
#  最新のマイグレーション（20歳以上限定＋個室相席の禁止）を
#  aiseki の Supabase に適用する
#
#  このファイルをダブルクリックすると
#   1) マイグレーションSQL（supabase/migration_age20_open_space.sql）を
#      クリップボードにコピーし
#   2) Supabase の SQL Editor をブラウザで開きます。
#
#  あとは SQL Editor に貼り付け（⌘V）→ Run（⌘Enter）を押すだけです。
# =====================================================================

cd "$(dirname "$0")/.." || exit 1

SQL_FILE="supabase/migration_age20_open_space.sql"
# 接続先は .env から読む（プロジェクトを作り直しても書き換え不要にするため）
PROJECT_REF=""
if [ -f ".env" ]; then
  PROJECT_REF=$(grep -E '^VITE_SUPABASE_URL=' .env | head -1 | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#')
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "❌ $SQL_FILE が見つかりません。"
  echo "   このファイルは aiseki プロジェクトの scripts/ に置いてください。"
  read -n 1 -s -r -p "何かキーを押すと閉じます..."
  exit 1
fi

pbcopy < "$SQL_FILE"

echo "✅ マイグレーションSQLをクリップボードにコピーしました。"
echo "   （$(wc -l < "$SQL_FILE" | tr -d ' ') 行）"
echo ""
echo "▶ 次の手順:"
echo "   1. これから開くブラウザの SQL Editor で ⌘V を押して貼り付け"
echo "   2. 右下の Run（または ⌘Enter）を押す"
echo "   3. 「Success」と表示されたら完了です"
echo ""
echo "   ※ 何度実行しても安全な内容です（冪等）。"
echo "   ※ 適用先が aiseki のプロジェクトであることを必ず確認してください。"
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
