# Photo Gallery Worker - Cloudflare R2 + Workers

Flickrの代替として、Cloudflare R2ストレージとWorkersを使用した完全無料の写真ギャラリーシステム。

## 特徴

- 🆓 完全無料（Cloudflare無料枠内）
- 📱 スマホ最適化（画像圧縮、レスポンシブ表示）
- 📅 撮影日時による自動分類
- 🚀 高速配信
- 💾 R2無料枠: 10GB/月 (約2万枚の写真)
- 🖼️ ライトボックス表示（ピンチズーム、スワイプナビゲーション対応）

## 新機能

### 画像表示の改善（flickr-r2.html）

- **ライトボックス表示**: 画像をクリックすると、スマホ画面に最適化されたモーダルで表示
- **ピンチイン・ピンチアウト**: 2本指で画像を拡大・縮小可能（最大5倍）
- **スワイプナビゲーション**: 左右にスワイプして前後の画像に移動
- **ダブルタップズーム**: ダブルタップで2倍ズーム/元に戻す
- **画像プリロード**: 前後の画像を先読みして高速表示
- **キーボード操作**: ←→キーで画像移動、Escで閉じる

### 写真リサイズ＆アップロード（2ステップ方式）

写真を効率的に管理するための2ステップワークフロー：

#### ステップ1: 自動リサイズ
特定のフォルダに写真を入れると、自動的にリサイズして日付フォルダに整理します。

#### ステップ2: 手動アップロード
リサイズ済みの写真を確認してから、手動でCloudflare R2にアップロードします。

このアプローチにより、アップロード前に写真を確認・選別できます。

## セットアップ手順

### 1. 依存関係のインストール

```bash
cd photo-gallery-worker
npm install
```

### 2. Cloudflare認証

```bash
wrangler login
```

### 3. R2バケット作成

```bash
wrangler r2 bucket create sho5-photos
```

### 4. Workerデプロイ

```bash
npm run deploy
```

## 使用方法

### Mac向け：写真のリサイズとアップロード

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

### ワークフロー

1. **写真をリサイズ**
   ```bash
   ./resize-photos.sh
   ```
   - 元の写真フォルダを指定
   - 出力先フォルダを指定
   - 自動的に日付フォルダに整理される

2. **リサイズ結果を確認**
   - 出力フォルダ内の写真を確認
   - 不要な写真を削除

3. **手動でアップロード**
   ```bash
   npm run upload ~/Pictures/shogo写真データ/resized
   ```

### フォルダ構造例

```
~/Pictures/shogo写真データ/
├── original/              # 元の写真（カメラから）
│   ├── IMG_001.JPG
│   ├── IMG_002.JPG
│   └── ...
└── resized/              # リサイズ済み（日付で整理）
    ├── 2025-07-09/
    │   ├── IMG_001.JPG
    │   └── IMG_002.JPG
    └── 2025-07-10/
        └── IMG_003.JPG
```

## API エンドポイント

- `GET /api/photos` - 写真一覧取得
- `GET /api/photos?date=2025-07-09` - 特定日の写真
- `GET /images/{key}?size=medium` - 画像配信

### サイズオプション

- `thumb` - 300px幅、軽量
- `medium` - 800px幅、スマホ最適
- `large` - 1200px幅
- `original` - オリジナルサイズ

## テストサイトでの確認

HTMLファイルの変更は、まずテストサイトで確認してから本番に適用することを推奨します：

### オプション1: 別リポジトリでテスト（現在の方式）
- テストサイト: https://github.com/yoshida0531a/sho5-test-site
- 本番サイト: https://github.com/yoshida0531a/sho5-website

### オプション2: ブランチでテスト
```bash
# テスト用ブランチを作成
git checkout -b test/lightbox-feature

# テストが完了したらマージ
git checkout main
git merge test/lightbox-feature
```

### 推奨ワークフロー
1. `flickr-r2.html` をテストサイトにコピー
2. テストサイトで動作確認
3. 問題なければ本番サイトの `flickr.html` に反映

## 無料枠制限

- **R2ストレージ**: 10GB/月
- **Workers**: 10万リクエスト/日
- **画像1枚**: 約500KB (圧縮後)
- **保存可能枚数**: 約20,000枚

## ディレクトリ構造

```
YYYY-MM-DD/
├── IMG_4567.JPG
├── IMG_4568.JPG
└── ...
```

写真は撮影日時により自動的に日付フォルダに分類されます。

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