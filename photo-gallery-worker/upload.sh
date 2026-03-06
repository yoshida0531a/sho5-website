#!/bin/bash
# =============================================================================
# upload.sh - Cloudflare R2 写真アップロード用シェルスクリプト
# =============================================================================
#
# 使い方:
#   bash upload.sh [フォルダパス]
#   ./upload.sh [フォルダパス]
#
# 例:
#   # 対話形式で実行（フォルダパス・並列数をプロンプトで入力）
#   ./upload.sh
#
#   # フォルダパスを引数で指定
#   ./upload.sh /Users/akira/Pictures/sho5org/original
#
# 機能:
#   - node_modules が存在しない場合は npm install を自動実行
#   - Cloudflare へのログイン状態を確認し、未ログインなら案内を表示
#   - ソースフォルダ・並列数を引数またはプロンプトで指定可能
#   - 途中再開機能付き (upload-progress.json で進捗を管理)
#
# 前提条件:
#   - Node.js がインストールされていること
#   - npx wrangler login で Cloudflare に認証済みであること
#   - このスクリプトに実行権限が付与されていること: chmod +x upload.sh
# =============================================================================

set -euo pipefail

# スクリプトのディレクトリ（photo-gallery-worker/）に移動
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 作業ディレクトリ: $SCRIPT_DIR"

# node_modules が存在しない場合は npm install を実行
if [ ! -d "node_modules" ]; then
  echo "📦 node_modules が見つかりません。npm install を実行します..."
  if ! npm install; then
    echo "❌ npm install に失敗しました。"
    exit 1
  fi
fi

# Cloudflare ログイン状態を確認
echo "🔐 Cloudflare ログイン状態を確認中..."
if ! npx wrangler whoami > /dev/null 2>&1; then
  echo ""
  echo "⚠️  Cloudflare にログインしていません。ログインを開始します..."
  npx wrangler login
  # ログイン後に再確認
  if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "❌ ログインに失敗しました。再度お試しください。"
    exit 1
  fi
fi
echo "✅ Cloudflare ログイン済み"

# ソースフォルダを引数または対話的に入力
DEFAULT_FOLDER="$HOME/Pictures/sho5org/original"
if [ -n "${1:-}" ]; then
  FOLDER_PATH="$1"
else
  echo ""
  echo "📂 アップロード元フォルダを入力してください"
  echo "   デフォルト: $DEFAULT_FOLDER"
  read -p "   フォルダパス [Enter でデフォルト]: " FOLDER_PATH
  FOLDER_PATH="${FOLDER_PATH:-$DEFAULT_FOLDER}"
fi
echo "📂 フォルダ: $FOLDER_PATH"

# 並列数を入力
DEFAULT_CONCURRENCY=5
echo ""
echo "⚡ 並列アップロード数を入力してください（1〜10）"
echo "   デフォルト: $DEFAULT_CONCURRENCY"
read -p "   並列数 [Enter でデフォルト]: " CONCURRENCY
CONCURRENCY="${CONCURRENCY:-$DEFAULT_CONCURRENCY}"

# 入力値を検証（数字かつ 1〜10 の範囲）
if ! [[ "$CONCURRENCY" =~ ^[0-9]+$ ]] || [ "$CONCURRENCY" -lt 1 ] || [ "$CONCURRENCY" -gt 10 ]; then
  echo "⚠️  無効な並列数です。デフォルト値($DEFAULT_CONCURRENCY)を使用します。"
  CONCURRENCY=$DEFAULT_CONCURRENCY
fi

echo ""
echo "🚀 アップロードを開始します..."
echo "   フォルダ : $FOLDER_PATH"
echo "   並列数   : $CONCURRENCY"
echo ""

node scripts/upload-photos.js "$FOLDER_PATH" --concurrency "$CONCURRENCY"
