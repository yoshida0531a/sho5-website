# Mac向けクイックスタートガイド

このガイドでは、Mac上で写真のリサイズとアップロードを簡単に行う方法を説明します。

## 準備（初回のみ）

### 1. 依存関係のインストール

ターミナルを開いて以下を実行：

```bash
cd photo-gallery-worker
npm install
```

### 2. Cloudflare認証（初回のみ）

```bash
wrangler login
```

ブラウザが開くので、Cloudflareアカウントで認証します。

## 日常的な使い方

### 簡単な方法（推奨）

#### ステップ1: 写真をリサイズ

```bash
cd photo-gallery-worker
./resize-photos.sh
```

対話形式で以下を入力：
- **読み込み元フォルダ**: カメラからコピーした写真のフォルダ
  - 例: `/Users/akira/Pictures/shogo写真データ/original`
  - Enterキーでデフォルトを使用
  
- **出力先フォルダ**: リサイズ後の保存先
  - 例: `/Users/akira/Pictures/shogo写真データ/resized`
  - Enterキーでデフォルトを使用

確認後、自動的にリサイズが開始されます。

#### ステップ2: 写真を確認

リサイズ後、出力フォルダを開いて写真を確認：

```bash
open ~/Pictures/shogo写真データ/resized
```

日付ごとにフォルダ分けされています：
```
resized/
├── 2025-07-09/
│   ├── IMG_001.JPG
│   └── IMG_002.JPG
└── 2025-07-10/
    └── IMG_003.JPG
```

不要な写真があれば削除します。

#### ステップ3: アップロード

確認後、アップロード：

```bash
npm run upload ~/Pictures/shogo写真データ/resized
```

処理が完了すると、各ファイルのアップロード状況が表示されます。

## フォルダ構成の推奨

```
~/Pictures/shogo写真データ/
├── original/        # カメラからコピーした元の写真
│   ├── IMG_001.JPG
│   ├── IMG_002.JPG
│   └── ...
├── resized/         # リサイズ済み（アップロード前に確認）
│   ├── 2025-07-09/
│   └── 2025-07-10/
└── archive/         # アップロード済みの元写真（バックアップ）
```

## ワークフロー例

### 写真を撮影した後

1. **カメラから写真をコピー**
   ```bash
   # カメラのSDカードから original フォルダにコピー
   cp /Volumes/CAMERA/DCIM/*.JPG ~/Pictures/shogo写真データ/original/
   ```

2. **リサイズ**
   ```bash
   cd photo-gallery-worker
   ./resize-photos.sh
   # Enterキーを2回押すだけ（デフォルト設定の場合）
   ```

3. **確認**
   ```bash
   open ~/Pictures/shogo写真データ/resized
   # 不要な写真を削除
   ```

4. **アップロード**
   ```bash
   npm run upload ~/Pictures/shogo写真データ/resized
   ```

5. **整理**
   ```bash
   # 元の写真をアーカイブに移動（オプション）
   mv ~/Pictures/shogo写真データ/original/* ~/Pictures/shogo写真データ/archive/
   
   # リサイズフォルダをクリア（次回のため）
   rm -rf ~/Pictures/shogo写真データ/resized/*
   ```

## コマンド一覧

### よく使うコマンド

```bash
# リサイズ（対話式）
./resize-photos.sh

# アップロード
npm run upload ~/Pictures/shogo写真データ/resized

# フォルダを開く
open ~/Pictures/shogo写真データ/resized
```

### 環境変数で設定する場合

```bash
# リサイズ（環境変数で直接指定）
SOURCE_FOLDER="~/Pictures/original" OUTPUT_FOLDER="~/Pictures/resized" npm run resize

# アップロード
npm run upload ~/Pictures/resized
```

## トラブルシューティング

### Q: "sips: command not found" エラーが出る
A: macOS以外では動作しません。macOSのバージョンを確認してください。

### Q: "wrangler: command not found" エラーが出る
A: 依存関係がインストールされていません：
```bash
cd photo-gallery-worker
npm install
```

### Q: EXIF情報が読めない
A: 一部の写真（スクリーンショットなど）にはEXIF情報がありません。その場合、現在の日付が使用されます。

### Q: アップロードに失敗する
A: Cloudflareの認証を確認：
```bash
wrangler login
```

## ヒント

### Finder からドラッグ＆ドロップで指定

ターミナルでフォルダパスを聞かれた時、Finderからフォルダをドラッグ＆ドロップすると自動的にパスが入力されます。

### エイリアスを作る（上級者向け）

よく使うコマンドをエイリアスに登録：

`~/.zshrc` または `~/.bash_profile` に追加：

```bash
alias photo-resize="cd ~/path/to/photo-gallery-worker && ./resize-photos.sh"
alias photo-upload="cd ~/path/to/photo-gallery-worker && npm run upload ~/Pictures/shogo写真データ/resized"
```

反映：
```bash
source ~/.zshrc  # または source ~/.bash_profile
```

これで、どこからでも以下のコマンドで実行可能：
```bash
photo-resize
photo-upload
```

## サポート

問題が解決しない場合は、以下の情報と共に報告してください：
- macOSのバージョン
- エラーメッセージ
- 実行したコマンド
