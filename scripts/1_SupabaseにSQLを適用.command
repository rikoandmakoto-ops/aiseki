#!/bin/bash
# =====================================================================
#  グループメンバー登録の修正を Supabase に適用する
#
#  このファイルをダブルクリックすると
#   1) マイグレーションSQL（supabase/migration_group_members.sql）を
#      クリップボードにコピーし
#   2) Supabase の SQL Editor をブラウザで開きます。
#
#  あとは SQL Editor に貼り付け（⌘V）→ Run（⌘Enter）を押すだけです。
# =====================================================================

cd "$(dirname "$0")/.." || exit 1

SQL_FILE="supabase/migration_group_members.sql"
PROJECT_REF="tvydtsqirogdxglkoicz"

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
echo ""

sleep 2
open "https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"

echo "ブラウザを開きました。"
read -n 1 -s -r -p "何かキーを押すと、このウィンドウを閉じます..."
