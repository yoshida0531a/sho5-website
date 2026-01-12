#!/bin/bash

# トップページ画像生成ツール
# このスクリプトはソース画像から5枚のPC向けとモバイル向けトップページ画像を生成します

echo "🖼️  トップページ画像生成ツール"
echo "=============================="
echo ""

# カレントディレクトリをスクリプトのディレクトリに設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "📁 リポジトリルート: $REPO_ROOT"
echo ""

# ソース画像ディレクトリ
SOURCE_DIR="assets/images/top_sources"

# ソースディレクトリの確認
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ ソースディレクトリが見つかりません: $SOURCE_DIR"
    echo ""
    echo "💡 ソース画像を配置する手順:"
    echo "   1. ディレクトリを作成:"
    echo "      mkdir -p $SOURCE_DIR"
    echo "   2. 5枚以上の画像を配置 (例: source1.jpg, source2.jpg, ...)"
    echo "   3. このスクリプトを再実行"
    echo ""
    exit 1
fi

# ソース画像の確認
IMAGE_COUNT=$(find "$SOURCE_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | wc -l | tr -d ' ')

if [ "$IMAGE_COUNT" -lt 5 ]; then
    echo "❌ ソース画像が不足しています: ${IMAGE_COUNT}枚 (最低5枚必要)"
    echo ""
    echo "💡 5枚以上の画像を以下のディレクトリに配置してください:"
    echo "   $SOURCE_DIR"
    echo ""
    exit 1
fi

echo "📊 ソース画像情報:"
echo "=============================="
echo "見つかったソース画像: ${IMAGE_COUNT}枚"
echo ""
find "$SOURCE_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | head -5 | while read -r img; do
    size=$(du -h "$img" | cut -f1)
    basename=$(basename "$img")
    echo "  $basename: $size"
done
if [ "$IMAGE_COUNT" -gt 5 ]; then
    echo "  ... (最初の5枚のみ使用)"
fi
echo "=============================="
echo ""

# 確認
echo "⚠️  この操作は5枚のPC向けとモバイル向け画像を生成します"
echo "既存のtop_pc*.JPGとtop_mobile*.JPGファイルは上書きされます"
echo "続行しますか？ (y/n)"
read -r CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "キャンセルしました"
    exit 0
fi

echo ""
echo "🚀 画像生成を開始します..."
echo ""

# Node.jsスクリプトを実行
node "$SCRIPT_DIR/create-top-images.js"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ 処理が完了しました！"
    echo ""
    echo "📁 生成された画像:"
    echo "   PC向け: assets/images/top_pc*.JPG"
    echo "   モバイル向け: assets/images/top_mobile*.JPG"
    echo ""
    echo "📝 次のステップ:"
    echo "   1. 生成された画像を確認"
    echo "   2. 必要に応じて最適化スクリプトを実行:"
    echo "      npm run optimize-top-images"
    echo ""
else
    echo ""
    echo "❌ エラーが発生しました（終了コード: $EXIT_CODE）"
    echo ""
    exit $EXIT_CODE
fi
