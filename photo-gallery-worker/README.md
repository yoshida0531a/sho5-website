# Photo Gallery Worker - Cloudflare R2 + Workers

Flickrの代替として、Cloudflare R2ストレージとWorkersを使用した完全無料の写真ギャラリーシステム。

## 特徴

- 🆓 完全無料（Cloudflare無料枠内）
- 📱 スマホ最適化（画像圧縮）
- 📅 撮影日時による自動分類
- 🚀 高速配信
- 💾 R2無料枠: 10GB/月 (約2万枚の写真)

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

### 5. 写真アップロード

```bash
# shogo写真データフォルダをアップロード
npm run upload "/Users/akira/Pictures/shogo写真データ"

# 個別フォルダをアップロード
node scripts/upload-photos.js "/path/to/photos"
```

## 使用方法

### API エンドポイント

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