#!/bin/bash

# 写真リサイズツール（Mac専用）
# このスクリプトは写真をリサイズして、日付フォルダに整理します
# アップロードは手動で行います

echo "📸 写真リサイズツール for Mac"
echo "=============================="
echo ""

# カレントディレクトリをphoto-gallery-workerに設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# デフォルトのフォルダパス
DEFAULT_SOURCE="$HOME/Pictures/shogo写真データ/original"
DEFAULT_OUTPUT="$HOME/Pictures/shogo写真データ/resized"

echo "📁 フォルダ設定"
echo ""
echo "写真の読み込み元フォルダを入力してください"
echo "（Enterキーでデフォルト: $DEFAULT_SOURCE）:"
read -r SOURCE_FOLDER

if [ -z "$SOURCE_FOLDER" ]; then
    SOURCE_FOLDER="$DEFAULT_SOURCE"
fi

echo ""
echo "リサイズ後の出力先フォルダを入力してください"
echo "（Enterキーでデフォルト: $DEFAULT_OUTPUT）:"
read -r OUTPUT_FOLDER

if [ -z "$OUTPUT_FOLDER" ]; then
    OUTPUT_FOLDER="$DEFAULT_OUTPUT"
fi

echo ""
echo "=============================="
echo "📁 読み込み: $SOURCE_FOLDER"
echo "📁 出力先: $OUTPUT_FOLDER"
echo "=============================="
echo ""

# 確認
echo "この設定でリサイズを開始しますか？ (y/n)"
read -r CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "キャンセルしました"
    exit 0
fi

echo ""
echo "🚀 リサイズを開始します..."
echo ""

# スクリプト実行
SOURCE_FOLDER="$SOURCE_FOLDER" OUTPUT_FOLDER="$OUTPUT_FOLDER" node scripts/resize-photos.js

echo ""
echo "✅ 処理が完了しました！"
echo ""
