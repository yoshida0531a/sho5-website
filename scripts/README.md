# バッチスクリプト集 / Batch Scripts Collection

このディレクトリには、sho5-websiteの画像最適化やメンテナンス用のバッチスクリプトが集められています。

## スクリプト一覧

### 1. トップページ画像最適化 (optimize-top-images.sh)

トップページの3枚の画像（top_pc1.JPG, top_pc2.JPG, top_pc3.JPG）を最適化して、ウェブページの読み込み速度を改善します。

**対象画像:**
- assets/images/top_pc1.JPG (5184x3456px → 2000px幅に最適化)
- assets/images/top_pc2.JPG (5184x3456px → 2000px幅に最適化)
- assets/images/top_pc3.JPG (5184x3456px → 2000px幅に最適化)

**使い方:**
```bash
cd scripts
./optimize-top-images.sh
```

または、リポジトリルートから:
```bash
./scripts/optimize-top-images.sh
```

**動作:**
1. 元の画像を `assets/images/backup_originals/` にバックアップ
2. 画像を幅2000pxに縮小（アスペクト比維持）
3. JPEG品質を85%に設定（高品質を維持しつつファイルサイズを削減）
4. 元のファイルを最適化版に置き換え

**必要な環境:**
- macOS: 標準の `sips` コマンドを使用
- Linux: ImageMagickの `convert` コマンドが必要

### 2. フォトギャラリー画像リサイズ (resize-photo-gallery.sh)

フォトギャラリー用の写真を最適化します。このスクリプトは `photo-gallery-worker/resize-photos.sh` へのシンボリックリンクです。

**使い方:**
```bash
cd scripts
./resize-photo-gallery.sh
```

詳細は [photo-gallery-worker/UPLOAD_GUIDE.md](../photo-gallery-worker/UPLOAD_GUIDE.md) を参照してください。

**動作:**
1. 元の写真を読み込み（デフォルト: `~/Pictures/shogo写真データ/original`）
2. 最大2400pxにリサイズ
3. 撮影日時で日付ごとのフォルダに整理
4. リサイズ済み画像を出力（デフォルト: `~/Pictures/shogo写真データ/resized`）

**必要な環境:**
- macOS専用（sipsコマンドを使用）
- Node.js環境が必要

## トラブルシューティング

### macOSで実行権限エラーが出る場合

```bash
chmod +x scripts/*.sh
```

### Linuxでconvertコマンドがない場合

Ubuntu/Debian:
```bash
sudo apt-get install imagemagick
```

CentOS/RHEL:
```bash
sudo yum install ImageMagick
```

## 画像の解像度について

### トップページの画像
- **現在の解像度**: 5184x3456 pixels
- **現在のファイルサイズ**: 2.3MB～5.0MB
- **推奨解像度**: 2000x1333 pixels（2000px幅）
- **最適化後のサイズ**: 約300KB～800KB（約80%削減）

Web表示では2000px幅で十分高画質であり、ページの読み込み速度が大幅に改善されます。

### フォトギャラリーの画像
- **推奨解像度**: 2400px（最大辺）
- EXIFデータから撮影日時を取得して日付ごとに整理

## 注意事項

- すべてのスクリプトは元の画像をバックアップしてから処理を行います
- バックアップは `assets/images/backup_originals/` または指定された場所に保存されます
- 処理中に失敗した場合は、バックアップから復元できます

## 開発者向け情報

### ディレクトリ構造
```
scripts/
├── README.md                    # このファイル
├── optimize-top-images.sh       # トップページ画像最適化シェルスクリプト
├── optimize-top-images.js       # トップページ画像最適化Node.jsスクリプト
└── resize-photo-gallery.sh      # photo-gallery-worker/resize-photos.shへのシンボリックリンク
```

### 新しいスクリプトを追加する場合

1. このディレクトリに新しいスクリプトを追加
2. 実行権限を付与: `chmod +x scripts/your-script.sh`
3. このREADME.mdに使用方法を追加
4. 必要に応じてPHOTO_UPLOAD.mdやメインREADMEも更新
