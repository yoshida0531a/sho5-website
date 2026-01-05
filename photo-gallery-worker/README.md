# Photo Gallery Worker - Cloudflare R2 + Workers

Flickrの代替として、Cloudflare R2ストレージとWorkersを使用した完全無料の写真ギャラリーシステム。

## 特徴

- 🆓 完全無料（Cloudflare無料枠内）
- 📱 スマホ最適化（画像圧縮、レスポンシブ表示）
- 📅 撮影日時による自動分類
- 🚀 高速配信
- 💾 R2無料枠: 10GB/月 (約2万枚の写真)
- 🖼️ ライトボックス表示（ピンチズーム、スワイプナビゲーション対応）
- 🔄 自動アップロード機能

## 新機能

### 画像表示の改善（flickr-r2.html）

- **ライトボックス表示**: 画像をクリックすると、スマホ画面に最適化されたモーダルで表示
- **ピンチイン・ピンチアウト**: 2本指で画像を拡大・縮小可能（最大5倍）
- **スワイプナビゲーション**: 左右にスワイプして前後の画像に移動
- **ダブルタップズーム**: ダブルタップで2倍ズーム/元に戻す
- **画像プリロード**: 前後の画像を先読みして高速表示
- **キーボード操作**: ←→キーで画像移動、Escで閉じる

### 自動アップロード機能

特定のフォルダに写真を入れると、自動的にリサイズしてCloudflare R2にアップロードします。

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

### 手動アップロード（従来の方法）

```bash
# shogo写真データフォルダをアップロード
npm run upload "/Users/akira/Pictures/shogo写真データ"

# 個別フォルダをアップロード
node scripts/upload-photos.js "/path/to/photos"
```

### 自動アップロード（新機能）

```bash
# デフォルトの監視フォルダで起動
npm run auto-upload

# カスタムフォルダを指定
WATCH_FOLDER="/path/to/your/folder" npm run auto-upload
```

**使い方:**
1. スクリプトを起動
2. 監視フォルダに写真をコピー（デフォルト: `/Users/akira/Pictures/shogo写真データ/auto-upload`）
3. 自動的にリサイズ→アップロード→処理済みフォルダに移動

**機能:**
- ファイル追加を自動検出
- 画像を最大2400pxにリサイズ
- EXIF情報から撮影日時を取得して自動分類
- Cloudflare R2に自動アップロード
- 処理済みファイルは `processed` フォルダに移動
- 対応フォーマット: JPG, JPEG, PNG

## API エンドポイント

- `GET /api/photos` - 写真一覧取得
- `GET /api/photos?date=2025-07-09` - 特定日の写真
- `GET /images/{key}?size=medium` - 画像配信

### サイズオプション

- `thumb` - 300px幅、軽量
- `medium` - 800px幅、スマホ最適
- `large` - 1200px幅
- `original` - オリジナルサイズ

## HTMLファイル更新

既存のflickr.htmlを以下で置き換え：

1. `flickr-r2.html` をテスト
2. 動作確認後 `flickr.html` に上書き
3. `flickr-dates.html` も同様に更新

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

### 自動アップロードが動作しない場合

1. **sipsコマンドが見つからない（macOS以外）**:
   - ImageMagickなど他の画像処理ツールをインストール
   - `scripts/auto-upload.js`のresizeImage関数を修正

2. **wranglerコマンドが見つからない**:
   ```bash
   npm install -g wrangler
   ```

3. **EXIF読み取りエラー**:
   - exiftoolが正しくインストールされているか確認
   - 一部のファイルはEXIF情報がない場合があります（ファイル日時を使用）

### 画像表示の問題

1. **ライトボックスが開かない**:
   - JavaScriptコンソールでエラーを確認
   - ブラウザのキャッシュをクリア

2. **ピンチズームが動作しない**:
   - タッチスクリーン対応デバイスで確認
   - ブラウザの設定で「タッチジェスチャー」が有効か確認