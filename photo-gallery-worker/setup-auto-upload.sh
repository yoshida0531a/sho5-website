#!/bin/bash

# Photo Gallery Auto-Upload Setup Script
# このスクリプトは自動アップロード機能を簡単にセットアップします

echo "📸 Photo Gallery Auto-Upload セットアップ"
echo "========================================="
echo ""

# カレントディレクトリをphoto-gallery-workerに設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 依存関係の確認
echo "🔍 依存関係を確認中..."

# Node.jsの確認
if ! command -v node &> /dev/null; then
    echo "❌ Node.jsがインストールされていません"
    echo "   https://nodejs.org/ からインストールしてください"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# wranglerの確認
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  wranglerがインストールされていません"
    echo "   インストール中..."
    npm install -g wrangler
fi
echo "✅ Wrangler: $(wrangler --version)"

# sipsの確認（macOSのみ）
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v sips &> /dev/null; then
        echo "❌ sipsコマンドが見つかりません（macOS標準）"
        exit 1
    fi
    echo "✅ sips: 利用可能"
else
    echo "⚠️  macOS以外のOSを検出しました"
    echo "   ImageMagickなどの画像処理ツールが必要です"
fi

echo ""

# npm依存関係のインストール
echo "📦 依存関係をインストール中..."
npm install

echo ""

# 監視フォルダの設定
echo "📁 監視フォルダの設定"
echo "-------------------"

# デフォルトパスの表示
DEFAULT_WATCH_FOLDER="/Users/akira/Pictures/shogo写真データ/auto-upload"
echo "デフォルト: $DEFAULT_WATCH_FOLDER"
echo ""
echo "監視フォルダのパスを入力してください"
echo "（Enterキーでデフォルトを使用）:"
read -r WATCH_FOLDER

if [ -z "$WATCH_FOLDER" ]; then
    WATCH_FOLDER="$DEFAULT_WATCH_FOLDER"
fi

# フォルダの作成
echo ""
echo "📁 監視フォルダを作成中: $WATCH_FOLDER"
mkdir -p "$WATCH_FOLDER"
mkdir -p "$WATCH_FOLDER/processed"

# .envファイルの作成
echo ""
echo "⚙️  設定ファイルを作成中..."
cat > .env << EOF
# Auto-Upload Configuration
WATCH_FOLDER=$WATCH_FOLDER
BUCKET_NAME=sho5-gallery-photos
MAX_DIMENSION=2400
MAX_SIZE_MB=2
SUPPORTED_FORMATS=.jpg,.jpeg,.png,.JPG,.JPEG,.PNG
PROCESS_DELAY=2000
EOF

echo "✅ 設定ファイルを作成しました: .env"

echo ""
echo "========================================="
echo "✅ セットアップ完了！"
echo ""
echo "🚀 使い方:"
echo "   1. 自動アップロードを開始:"
echo "      npm run auto-upload"
echo ""
echo "   2. 監視フォルダに写真をコピー:"
echo "      $WATCH_FOLDER"
echo ""
echo "   3. 自動的にリサイズ→アップロード→処理済みフォルダに移動"
echo ""
echo "💡 ヒント:"
echo "   - 処理済みファイルは '$WATCH_FOLDER/processed' に移動します"
echo "   - Ctrl+C で停止できます"
echo "   - 設定変更は .env ファイルを編集してください"
echo ""
