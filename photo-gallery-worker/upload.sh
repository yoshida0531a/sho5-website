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
#   - 環境変数 CLOUDFLARE_API_TOKEN に Cloudflare API Token が設定されていること
#     例: export CLOUDFLARE_API_TOKEN="your_token_here"  (~/.zshrc 等に記載)
#     APIトークン発行: https://dash.cloudflare.com/profile/api-tokens
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

# Cloudflare 認証確認（API Token 方式）
echo "🔐 Cloudflare 認証を確認中..."
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo ""
  echo "❌ 環境変数 CLOUDFLARE_API_TOKEN が設定されていません。"
  echo "   ~/.zshrc または ~/.bashrc に以下を追加してください："
  echo "   export CLOUDFLARE_API_TOKEN=\"あなたのAPIトークン\""
  echo ""
  echo "   APIトークンは Cloudflare Dashboard で発行できます："
  echo "   https://dash.cloudflare.com/profile/api-tokens"
  exit 1
fi

# wrangler は CLOUDFLARE_API_TOKEN を自動認識するので whoami で確認
if ! npx wrangler whoami > /dev/null 2>&1; then
  echo "❌ Cloudflare 認証に失敗しました。APIトークンが正しいか確認してください。"
  exit 1
fi
echo "✅ Cloudflare 認証済み"

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
