# Shogo Fun Site - 谷端将伍公式サイト

谷端将伍の公式サイトのソースコード（阪神タイガース2024年ドラフト2位）

## サイト構成

- **トップページ** (`index.html`) - メインページ
- **写真ギャラリー** (`photo.html`) - ライトボックス機能付き画像ギャラリー
- **Xポスト** (`x.html`) - X（旧Twitter）投稿表示
- **YouTube動画** (`youtube.html`) - 動画コンテンツ

## トップページ画像の更新手順

### クイックスタート
```bash
# 1. ソースディレクトリを作成
mkdir -p assets/images/top_sources

# 2. 5枚の写真をコピー（パスは適宜変更）
cp /path/to/your/photos/* assets/images/top_sources/

# 3. 画像生成
npm run create-top-images

# 4. （オプション）最適化
npm run optimize-top-images

# 5. コミット
git add assets/images/top_pc*.JPG assets/images/top_mobile*.JPG
git commit -m "トップページ画像を更新"
git push
```

### 詳細手順

#### ステップ1: 画像をコピー

**コマンドライン:**
```bash
# ソースディレクトリを作成（存在しない場合）
mkdir -p assets/images/top_sources

# 5枚の写真を配置（パスは適宜変更してください）
cp /path/to/your/photos/* assets/images/top_sources/
```

**Finderで直接コピー:**
1. 写真のフォルダを開く
2. 5枚の写真を選択してコピー（⌘+C）
3. このリポジトリの `assets/images/top_sources/` フォルダを開く
4. ペースト（⌘+V）

**注意**: `top_sources/` ディレクトリは `.gitignore` に含まれているため、元画像はコミットされません。

#### ステップ2: 画像生成
```bash
cd scripts
./create-top-images.sh

# または npm コマンドで実行
npm run create-top-images
```

**自動処理内容:**
- ソースディレクトリから最初の5枚を選択
- PC向け画像（2000px幅）: `top_pc1.JPG` ～ `top_pc5.JPG`
- モバイル向け画像（1200px幅）: `top_mobile1.JPG` ～ `top_mobile5.JPG`
- すべての画像を `assets/images/` に配置

#### ステップ3: 結果を確認
```bash
# 生成された画像を確認
ls -lh assets/images/top_pc*.JPG
ls -lh assets/images/top_mobile*.JPG

# ブラウザで確認
python3 -m http.server 8000
# http://localhost:8000 を開く
```

#### ステップ4: （オプション）最適化
```bash
cd scripts
./optimize-top-images.sh

# または npm コマンドで実行
npm run optimize-top-images
```
- ファイルサイズを約90%削減
- 元画像を `assets/images/backup_originals/` にバックアップ

### トラブルシューティング

**エラー: "ソースディレクトリが見つかりません"**
- `assets/images/top_sources/` ディレクトリが存在するか確認
- このディレクトリに画像がコピーされているか確認

**エラー: "ソース画像が不足しています"**
- 最低5枚の画像（JPG/PNG形式）が必要
- `ls assets/images/top_sources/` で画像を確認

**画像の並び順を変更したい場合:**
- 画像は名前順に処理されるため、ファイル名を変更して順序を調整
```bash
cd assets/images/top_sources
mv photo1.jpg 01_photo1.jpg
mv photo2.jpg 02_photo2.jpg
```

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

4. **YouTube登録者数フィルター** (`scripts/filter-youtube-by-subscribers.js`)
   - YouTube-data.txtから登録者数が少ないチャンネルの動画を削除
   - 詳細は下記「YouTube登録者数フィルター」セクション参照

## YouTube登録者数フィルター

YouTube-data.txtから、チャンネル登録者数が指定人数未満の動画エントリを自動削除するスクリプトです。

### 機能
- YouTube Data API v3を使用してチャンネル登録者数を取得
- 登録者数が閾値未満の動画を自動削除
- 処理前に自動バックアップ（`YouTube-data.txt.backup`）
- チャンネルキャッシュでAPI呼び出しを最小化
- 複数のYouTube URL形式に対応（watch, youtu.be, embed）

### ローカル実行

```bash
# 基本実行（100人未満を削除）
YOUTUBE_API_KEY=your_api_key npm run filter-youtube

# 最小登録者数を指定（例: 500人未満を削除）
YOUTUBE_API_KEY=your_api_key MIN_SUBSCRIBERS=500 npm run filter-youtube

# 直接実行
YOUTUBE_API_KEY=your_api_key node scripts/filter-youtube-by-subscribers.js
```

### GitHub Webから実行（推奨）

GitHub Actions ワークフローを使用して、Webブラウザから手動実行できます。

#### 初回セットアップ
1. **YouTube API Keyを取得**
   - [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
   - YouTube Data API v3 を有効化
   - APIキーを作成

2. **GitHub Secretsに登録**
   - リポジトリの **Settings > Secrets and variables > Actions** に移動
   - **New repository secret** をクリック
   - Name: `YOUTUBE_API_KEY`
   - Secret: 取得したAPIキー

#### 実行手順
1. リポジトリの **Actions** タブに移動
2. 左メニューから **Filter YouTube by Subscribers** を選択
3. **Run workflow** ボタンをクリック
4. オプションを設定:
   - `min_subscribers`: 最小登録者数（デフォルト: 100）
   - `dry_run`: チェックするとプレビューのみ（変更なし）
5. **Run workflow** で実行開始

#### 実行結果
- 成功すると自動的にYouTube-data.txtが更新されコミットされます
- ドライランモードでは変更はコミットされず、削除対象のプレビューのみ表示されます
- ワークフローのログで詳細な処理結果を確認できます

### 注意事項
- YouTube Data API v3には1日10,000ユニットのクォータ制限があります
- 動画1件につき約2ユニット消費（動画情報取得 + チャンネル情報取得）
- チャンネルキャッシュにより、同じチャンネルの動画は1回のみAPI呼び出し

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
