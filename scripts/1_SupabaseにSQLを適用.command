#!/bin/bash
# =====================================================================
#  最新のマイグレーションを aiseki の Supabase に適用する
#
#  このファイルをダブルクリックすると
#   1) マイグレーションSQL（ローンチ用 → 参加ポイント一律化 の順）を
#      1つにまとめてクリップボードにコピーし
#   2) Supabase の SQL Editor をブラウザで開きます。
#
#  あとは SQL Editor に貼り付け（⌘V）→ Run（⌘Enter）を押すだけです。
# =====================================================================

cd "$(dirname "$0")/.." || exit 1

# 適用する順番どおりに並べる（後ろのものが前のものを上書きする前提）
SQL_FILES=(
  "supabase/migration_launch.sql"
  "supabase/migration_fixed_join_fee.sql"
)
# 接続先は .env から読む（プロジェクトを作り直しても書き換え不要にするため）
PROJECT_REF=""
if [ -f ".env" ]; then
  PROJECT_REF=$(grep -E '^VITE_SUPABASE_URL=' .env | head -1 | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#')
fi

for f in "${SQL_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ $f が見つかりません。"
    echo "   このファイルは aiseki プロジェクトの scripts/ に置いてください。"
    read -n 1 -s -r -p "何かキーを押すと閉じます..."
    exit 1
  fi
done

cat "${SQL_FILES[@]}" | pbcopy

echo "✅ マイグレーションSQLをクリップボードにコピーしました。"
echo "   （${#SQL_FILES[@]} ファイル / $(cat "${SQL_FILES[@]}" | wc -l | tr -d ' ') 行）"
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
