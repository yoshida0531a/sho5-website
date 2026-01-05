# Photo Gallery Worker - Cloudflare R2 + Workers

Flickrの代替として、Cloudflare R2ストレージとWorkersを使用した完全無料の写真ギャラリーシステム。

## 目次

- [特徴](#特徴)
- [画像表示機能](#画像表示機能)
- [セットアップ](#セットアップ)
- [Mac向けクイックスタート](#mac向けクイックスタート)
- [写真リサイズ＆アップロード](#写真リサイズアップロード)
- [テストとデプロイ](#テストとデプロイ)
- [トラブルシューティング](#トラブルシューティング)

## 特徴

- 🆓 完全無料（Cloudflare無料枠内）
- 📱 スマホ最適化（画像圧縮、レスポンシブ表示）
- 📅 撮影日時による自動分類
- 🚀 高速配信
- 💾 R2無料枠: 10GB/月 (約2万枚の写真)
- 🖼️ ライトボックス表示（ピンチズーム、スワイプナビゲーション対応）

## 画像表示機能

### ファイル構成

- **photo-dates.html** - 日付別写真一覧ページ
- **photo.html** - 写真ギャラリーページ（ライトボックス機能付き）

### ライトボックス機能

**基本機能:**
- 画像をクリックすると、スマホ画面に最適化されたモーダルで表示
- スマートフォンの縦画面に合わせて自動リサイズ

**タッチジェスチャー（スマートフォン）:**
- **ピンチイン・ピンチアウト**: 2本指で画像を1倍〜5倍まで拡大・縮小
- **ダブルタップ**: 2倍ズーム ↔ 元のサイズを切り替え
- **スワイプ**: 左右スワイプで前後の画像に移動（ズーム時は無効）
- **パン**: ズーム中に指で画面をドラッグして見たい部分に移動

**キーボード操作（PC）:**
- **←→キー**: 前後の画像に移動
- **Escキー**: ライトボックスを閉じる

**ナビゲーション:**
- 閉じるボタン（×）
- 左右の矢印ボタン
- 画像カウンター（現在の画像番号 / 総画像数）
- 背景クリックで閉じる

**パフォーマンス機能:**
- 遅延読み込み（画面に表示される画像のみ）
- 前後の画像を先読み（高速表示）
- 画像キャッシュ（一度読み込んだ画像を再利用）
- DNS事前接続（CDNへの高速接続）

## セットアップ

### 1. 依存関係のインストール

```bash
cd photo-gallery-worker
npm install
```

### 2. Cloudflare認証

```bash
wrangler login
```

ブラウザが開くので、Cloudflareアカウントで認証します。

### 3. R2バケット作成

```bash
wrangler r2 bucket create sho5-photos
```

### 4. Workerデプロイ

```bash
npm run deploy
```

## Mac向けクイックスタート

### 日常的な使い方

#### ステップ1: 写真をリサイズ

```bash
cd photo-gallery-worker
./resize-photos.sh
```

対話形式で入力：
- **読み込み元フォルダ**: カメラからコピーした写真のフォルダ（例: `~/Pictures/shogo写真データ/original`）
- **出力先フォルダ**: リサイズ後の保存先（例: `~/Pictures/shogo写真データ/resized`）
- Enterキーでデフォルトを使用可能

#### ステップ2: 写真を確認

```bash
open ~/Pictures/shogo写真データ/resized
```

日付ごとにフォルダ分けされています。不要な写真があれば削除します。

#### ステップ3: 手動アップロード

```bash
npm run upload ~/Pictures/shogo写真データ/resized
```

### ワークフロー例

```bash
# 1. カメラから写真をコピー
cp /Volumes/CAMERA/DCIM/*.JPG ~/Pictures/shogo写真データ/original/

# 2. リサイズ
cd photo-gallery-worker
./resize-photos.sh
# Enterキーを2回押すだけ（デフォルト設定の場合）

# 3. 確認
open ~/Pictures/shogo写真データ/resized
# 不要な写真を削除

# 4. アップロード
npm run upload ~/Pictures/shogo写真データ/resized

# 5. 整理（オプション）
mv ~/Pictures/shogo写真データ/original/* ~/Pictures/shogo写真データ/archive/
rm -rf ~/Pictures/shogo写真データ/resized/*
```

### フォルダ構成の推奨

```
~/Pictures/shogo写真データ/
├── original/        # カメラからコピーした元の写真
│   ├── IMG_001.JPG
│   └── ...
├── resized/         # リサイズ済み（日付で整理）
│   ├── 2025-07-09/
│   └── 2025-07-10/
└── archive/         # アップロード済みの元写真（バックアップ）
```

## 写真リサイズ＆アップロード

### 2ステップ方式

写真を効率的に管理するための2ステップワークフロー：

#### ステップ1: 自動リサイズ
特定のフォルダに写真を入れると、自動的にリサイズして日付フォルダに整理します。

#### ステップ2: 手動アップロード
リサイズ済みの写真を確認してから、手動でCloudflare R2にアップロードします。

このアプローチにより、アップロード前に写真を確認・選別できます。

### 使用方法

#### 方法1: シェルスクリプト（推奨・簡単）

```bash
cd photo-gallery-worker

# リサイズ（インタラクティブに設定）
./resize-photos.sh

# アップロード（リサイズ済みフォルダを指定）
npm run upload ~/Pictures/shogo写真データ/resized
```

#### 方法2: npm コマンド

```bash
cd photo-gallery-worker

# リサイズ（環境変数で設定）
SOURCE_FOLDER="~/Pictures/original" OUTPUT_FOLDER="~/Pictures/resized" npm run resize

# アップロード
npm run upload ~/Pictures/resized
```

#### 方法3: 直接指定

```bash
cd photo-gallery-worker

# リサイズ
node scripts/resize-photos.js

# アップロード
node scripts/upload-photos.js "/path/to/resized/photos"
```

### API エンドポイント

- `GET /api/photos` - 写真一覧取得
- `GET /api/photos?date=2025-07-09` - 特定日の写真
- `GET /images/{key}?size=medium` - 画像配信

### サイズオプション

- `thumb` - 300px幅、軽量
- `medium` - 800px幅、スマホ最適
- `large` - 1200px幅
- `original` - オリジナルサイズ

## テストとデプロイ

### ブランチでのテスト（推奨）

HTMLファイルの変更は、まずテストブランチで確認してから本番に適用します：

```bash
# 1. テスト用ブランチを作成
git checkout -b test/photo-gallery-update

# 2. 変更をコミット
git add photo.html photo-dates.html
git commit -m "Update photo gallery"
git push origin test/photo-gallery-update

# 3. ブランチをデプロイしてテスト
# GitHub Pagesの設定で、test/* ブランチを一時的に公開できます

# 4. テストが完了したら本番にマージ
git checkout main
git merge test/photo-gallery-update
git push origin main
```

### ローカルテスト

```bash
# Python の簡易サーバーでローカルテスト
python3 -m http.server 8000

# ブラウザで http://localhost:8000/photo.html にアクセス
```

### GitHub Pagesでのブランチテスト

GitHub Pagesの設定でブランチを選択すると、そのブランチの内容でサイトが公開されます：

1. リポジトリの Settings → Pages
2. Source で `test/photo-gallery-update` ブランチを選択
3. Save をクリック
4. 数分後、テストURLで確認可能
5. テスト完了後、Source を `main` に戻す

### デプロイワークフロー

```bash
# 推奨ワークフロー
1. テストブランチで変更を確認
2. ローカルまたはGitHub Pagesでテスト
3. 問題なければmainブランチにマージ
```

## トラブルシューティング

### リサイズが動作しない場合

1. **macOS以外のOS**:
   - このスクリプトはmacOS専用（sipsコマンド使用）
   - 他のOSではImageMagickなど別のツールが必要

2. **Node.jsがインストールされていない**:
   ```bash
   brew install node
   ```

3. **依存関係がインストールされていない**:
   ```bash
   cd photo-gallery-worker
   npm install
   ```

### 画像表示の問題

1. **ライトボックスが開かない**:
   - JavaScriptコンソールでエラーを確認
   - ブラウザのキャッシュをクリア

2. **ピンチズームが動作しない**:
   - タッチスクリーン対応デバイスで確認
   - ブラウザの設定で「タッチジェスチャー」が有効か確認

3. **スワイプが効かない**:
   - ズームしていないか確認
   - 横方向にスワイプしているか確認

### アップロードの問題

1. **wranglerコマンドが見つからない**:
   ```bash
   cd photo-gallery-worker
   npm install
   ```

2. **Cloudflare認証エラー**:
   ```bash
   wrangler login
   ```

3. **EXIF情報が読めない**:
   - 一部の写真（スクリーンショットなど）にはEXIF情報がありません
   - その場合、ファイルの更新日時が使用されます

## ヒントとコツ

### Finder からドラッグ＆ドロップ

ターミナルでフォルダパスを聞かれた時、Finderからフォルダをドラッグ＆ドロップすると自動的にパスが入力されます。

### エイリアスを作る（上級者向け）

`~/.zshrc` または `~/.bash_profile` に追加：

```bash
alias photo-resize="cd ~/path/to/photo-gallery-worker && ./resize-photos.sh"
alias photo-upload="cd ~/path/to/photo-gallery-worker && npm run upload ~/Pictures/shogo写真データ/resized"
```

反映：
```bash
source ~/.zshrc  # または source ~/.bash_profile
```

これで、どこからでも実行可能：
```bash
photo-resize
photo-upload
```

## 無料枠制限

- **R2ストレージ**: 10GB/月
- **Workers**: 10万リクエスト/日
- **画像1枚**: 約500KB (圧縮後)
- **保存可能枚数**: 約20,000枚

## セキュリティ

### 実施済みのセキュリティ対策

- ✅ コマンドインジェクション対策（spawnSyncを配列引数で使用）
- ✅ ゼロ除算対策（ピンチズーム計算）
- ✅ 適切なエラーハンドリング
- ✅ CodeQL スキャン合格（脆弱性0件）

## サポート

問題が解決しない場合は、以下の情報と共に報告してください：

- macOSのバージョン（Mac使用の場合）
- エラーメッセージ
- 実行したコマンド
- 再現手順
