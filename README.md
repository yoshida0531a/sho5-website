# Shogo Fun Site - 谷端将伍公式サイト

谷端将伍の公式サイトのソースコード（阪神タイガース2024年ドラフト2位）

## サイト構成

- **トップページ** (`index.html`) - メインページ
- **写真ギャラリー** (`photo.html`) - ライトボックス機能付き画像ギャラリー
- **Xポスト** (`x.html`) - X（旧Twitter）投稿表示
- **YouTube動画** (`youtube.html`) - 動画コンテンツ

## トップページ画像の更新手順（クイックスタート）

### ステップ1: 画像をコピー
```bash
# ソースディレクトリを作成（存在しない場合）
mkdir -p assets/images/top_sources

# 5枚の写真を配置
cp /Users/akira/Pictures/shogo写真データ/top/* assets/images/top_sources/
```

### ステップ2: 画像生成
```bash
# シェルスクリプトで実行
cd scripts
./create-top-images.sh

# または npm コマンドで実行
npm run create-top-images
```
- PC向け（2000px）とモバイル向け（1200px）の画像を自動生成
- `top_pc1.JPG`～`top_pc5.JPG` と `top_mobile1.JPG`～`top_mobile5.JPG` が生成される

### ステップ3: （オプション）最適化
```bash
# シェルスクリプトで実行
cd scripts
./optimize-top-images.sh

# または npm コマンドで実行
npm run optimize-top-images
```

詳細は [トップページ画像アップロード手順.md](./トップページ画像アップロード手順.md) を参照

---

## フォトギャラリー画像アップロード手順（クイックスタート）

### ステップ1: リサイズ
```bash
cd photo-gallery-worker
./resize-photos.sh
```
- Enterキー2回でデフォルト設定使用
- 元写真: `~/Pictures/shogo写真データ/original`
- 出力先: `~/Pictures/shogo写真データ/resized`

### ステップ2: 確認
```bash
open ~/Pictures/shogo写真データ/resized
```
- 日付ごとにフォルダ分け
- 不要な写真を削除

### ステップ3: アップロード
```bash
npm run upload ~/Pictures/shogo写真データ/resized
```

### ワンライナー
```bash
cd photo-gallery-worker && ./resize-photos.sh && npm run upload ~/Pictures/shogo写真データ/resized
```

## 画像最適化

### トップページ画像生成
```bash
cd scripts
./create-top-images.sh
```
- **機能**: ソース画像から5枚のPC向けとモバイル向け画像を生成
- **入力**: `assets/images/top_sources/` に5枚以上の画像を配置
- **出力**: `top_pc1.JPG`～`top_pc5.JPG`（PC向け）、`top_mobile1.JPG`～`top_mobile5.JPG`（モバイル向け）
- **PC向け**: 2000px幅に自動リサイズ
- **モバイル向け**: 1200px幅に自動リサイズ
- **対応形式**: JPG、PNG

### トップページ画像最適化
```bash
cd scripts
./optimize-top-images.sh
```
- **対象**: `top_pc1.JPG`～`top_pc5.JPG`
- **元の解像度**: 5184x3456px (2.3MB～5.0MB)
- **最適化後**: 2000x1333px (250KB～410KB)
- **削減率**: 約86%～94%（平均90.7%）
- **バックアップ**: `assets/images/backup_originals/`（自動）

### フォトギャラリー画像
- **推奨解像度**: 2400px（最大辺）
- **自動整理**: EXIFデータから撮影日時取得→日付フォルダ分け

## フォトギャラリー機能

### ライトボックス機能
- **基本**: 画像クリックでモーダル表示（スマホ最適化）
- **ピンチズーム**: 2本指で1倍～5倍拡大縮小
- **ダブルタップ**: 2倍ズーム⇔元サイズ切替
- **スワイプ**: 左右で前後の画像移動（ズーム時無効）
- **パン**: ズーム中にドラッグで移動
- **キーボード**: ←→で移動、Escで閉じる
- **最適化**: 遅延読み込み、先読み、キャッシュ

### APIエンドポイント
- `GET /api/photos` - 写真一覧
- `GET /api/photos?date=2025-07-09` - 特定日の写真
- `GET /images/{key}?size={thumb|medium|large|original}` - 画像配信

### サイズオプション
- `thumb`: 300px（軽量）
- `medium`: 800px（スマホ最適）
- `large`: 1200px
- `original`: 元サイズ

## Cloudflare R2 セットアップ

### 初期設定
```bash
cd photo-gallery-worker
npm install
wrangler login          # ブラウザで認証
wrangler r2 bucket create sho5-photos
npm run deploy
```

### 無料枠制限
- **R2ストレージ**: 10GB/月（約20,000枚、1枚500KB）
- **Workers**: 10万リクエスト/日

## バッチスクリプト集

### 利用可能なスクリプト
1. **トップページ画像生成** (`scripts/create-top-images.sh`)
   - ソース画像から5枚のPC・モバイル向け画像を生成
   - macOS（sips）/ Linux（ImageMagick）対応

2. **トップページ画像最適化** (`scripts/optimize-top-images.sh`)
   - 5枚の画像を2000px幅に最適化
   - macOS（sips）/ Linux（ImageMagick）対応
   
3. **フォトギャラリー画像リサイズ** (`photo-gallery-worker/resize-photos.sh`)
   - 2400pxにリサイズ＋日付整理
   - macOS専用（sips使用）

## ディレクトリ構造

```
.
├── assets/
│   ├── css/                    # スタイルシート
│   ├── images/                 # 画像
│   │   └── backup_originals/   # 最適化前バックアップ（gitignore）
│   └── js/                     # JavaScript
├── photo-gallery-worker/       # フォトギャラリーWorker
│   ├── scripts/
│   │   ├── utils/             # 共通ユーティリティ（EXIF処理、画像処理）
│   │   ├── resize-photos.js   # リサイズスクリプト
│   │   └── upload-photos.js   # アップロードスクリプト
│   ├── resize-photos.sh       # リサイズシェルスクリプト
│   └── src/                   # Cloudflare Workerソース
├── scripts/                    # バッチスクリプト集
│   ├── optimize-top-images.js
│   └── optimize-top-images.sh
├── index.html                  # トップページ
├── photo.html                  # フォトギャラリー
├── x.html                      # Xポスト
└── youtube.html                # YouTube動画
```

## 開発環境

### 必須
- Node.js
- macOS（sips）または Linux（ImageMagick: `sudo apt-get install imagemagick`）

### テスト
```bash
# ローカルサーバー
python3 -m http.server 8000

# ブランチテスト
git checkout -b test/feature-name
git push origin test/feature-name
# GitHub Pages設定でブランチ選択→テスト→mainにマージ
```

## トラブルシューティング

### 認証エラー
```bash
wrangler login
```

### wranglerコマンドが見つからない
```bash
cd photo-gallery-worker && npm install
```

### EXIFデータが読めない
- スクリーンショット等はEXIF情報なし→ファイル更新日時を使用

### ライトボックスが動作しない
- JavaScriptコンソール確認
- ブラウザキャッシュクリア
- タッチスクリーン対応デバイスで確認

## セキュリティ

- ✅ コマンドインジェクション対策（spawnSync配列引数）
- ✅ ゼロ除算対策（ピンチズーム）
- ✅ CodeQLスキャン合格（脆弱性0件）

## 推奨フォルダ構成

```
~/Pictures/shogo写真データ/
├── original/     # カメラから取り込んだ元写真
├── resized/      # リサイズ済み（日付整理）
└── archive/      # アップロード済み元写真（バックアップ）
```

## ライセンス

Copyright © 2023-2025 Akira Yoshida.

## お問い合わせ

- LINE Official: https://lin.ee/TqFSBw3K
- サイトURL: https://sho5.org
