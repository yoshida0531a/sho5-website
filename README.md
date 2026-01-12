# Shogo Fun Site - 谷端将伍公式サイト

谷端将伍の公式サイトのソースコード。阪神タイガース2024年ドラフト2位指名。

## サイト概要

このサイトは谷端将伍選手の公式サイトで、以下のコンテンツを提供しています：
- Xポスト
- YouTube動画
- 写真ギャラリー
- スケジュール情報

## バッチスクリプト / Batch Scripts

画像最適化やメンテナンス用のバッチスクリプトは `scripts/` ディレクトリにまとめられています。

### トップページ画像最適化

トップページの3枚の画像を最適化して、ページの読み込み速度を改善します。

```bash
cd scripts
./optimize-top-images.sh
```

詳細: [scripts/README.md](scripts/README.md)

### フォトギャラリー画像の最適化

フォトギャラリー用の写真をリサイズして最適化します。

```bash
cd scripts
./resize-photo-gallery.sh
```

または、従来の方法:

```bash
cd photo-gallery-worker
./resize-photos.sh
```

詳細: [PHOTO_UPLOAD.md](PHOTO_UPLOAD.md)

## 画像の解像度について

### トップページの画像（top_pc1.JPG, top_pc2.JPG, top_pc3.JPG）

- **元の解像度**: 5184x3456 pixels
- **元のファイルサイズ**: 2.3MB～5.0MB
- **最適化後の解像度**: 2000x1333 pixels
- **最適化後のサイズ**: 250KB～410KB
- **削減率**: 約86%～94%（平均90.7%）

Web表示では2000px幅で十分高画質であり、ページの読み込み速度が大幅に改善されます。

### フォトギャラリーの画像

- **推奨解像度**: 2400px（最大辺）
- EXIFデータから撮影日時を取得して日付ごとに整理

## ディレクトリ構造

```
.
├── assets/
│   ├── css/          # スタイルシート
│   ├── images/       # 画像ファイル
│   │   └── backup_originals/  # 最適化前の元画像（gitignore）
│   └── js/           # JavaScriptファイル
├── photo-gallery-worker/  # フォトギャラリーWorkerとアップロードツール
├── scripts/          # バッチスクリプト集
│   ├── README.md     # スクリプトの詳細ドキュメント
│   ├── optimize-top-images.sh     # トップページ画像最適化
│   ├── optimize-top-images.js     # 画像最適化ロジック
│   └── resize-photo-gallery.sh    # フォトギャラリー画像リサイズ（シンボリックリンク）
├── index.html        # トップページ
├── photo.html        # フォトギャラリー
├── x.html            # Xポストページ
├── youtube.html      # YouTube動画ページ
└── PHOTO_UPLOAD.md   # 写真アップロード手順

```

## 開発

### 必要な環境

- Node.js（バッチスクリプト用）
- macOS または Linux
  - macOS: 標準の `sips` コマンドを使用
  - Linux: ImageMagickが必要（`sudo apt-get install imagemagick`）

### バッチスクリプトの実行

すべてのバッチスクリプトは `scripts/` ディレクトリにまとめられています。

```bash
# トップページ画像の最適化
cd scripts
./optimize-top-images.sh

# フォトギャラリー画像のリサイズ
cd scripts
./resize-photo-gallery.sh
```

詳細なドキュメント: [scripts/README.md](scripts/README.md)

## ライセンス

Copyright © 2023-2025 Akira Yoshida.

## お問い合わせ

- LINE Official: https://lin.ee/TqFSBw3K
- サイトURL: https://sho5.org
