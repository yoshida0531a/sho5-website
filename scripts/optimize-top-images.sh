#!/bin/bash

# トップページ画像最適化ツール
# このスクリプトはトップページの5枚の画像（top_pc1.JPG～top_pc5.JPG）を
# 最適化して、ウェブページの読み込み速度を改善します

echo "🖼️  トップページ画像最適化ツール"
echo "=============================="
echo ""

# カレントディレクトリをスクリプトのディレクトリに設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "📁 リポジトリルート: $REPO_ROOT"
echo ""

# 画像のパス
IMAGE_DIR="assets/images"
BACKUP_DIR="assets/images/backup_originals"

# 画像の情報を表示
echo "📊 現在の画像情報:"
echo "=============================="
for img in top_pc1.JPG top_pc2.JPG top_pc3.JPG top_pc4.JPG top_pc5.JPG; do
    if [ -f "$IMAGE_DIR/$img" ]; then
        size=$(du -h "$IMAGE_DIR/$img" | cut -f1)
        echo "  $img: $size"
    fi
done
echo "=============================="
echo ""

# 確認
echo "⚠️  この操作は元の画像をバックアップして最適化します"
echo "続行しますか？ (y/n)"
read -r CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "キャンセルしました"
    exit 0
fi

echo ""
echo "🚀 最適化を開始します..."
echo ""

# バックアップディレクトリを作成
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    echo "📁 バックアップディレクトリを作成しました"
fi

# Node.jsスクリプトを実行
node "$SCRIPT_DIR/optimize-top-images.js"

echo ""
echo "✅ 処理が完了しました！"
echo ""
echo "📁 バックアップ: $BACKUP_DIR"
echo "📁 最適化済み画像: $IMAGE_DIR"
echo ""
