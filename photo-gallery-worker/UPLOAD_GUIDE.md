# 写真アップロードガイド（簡単版）

## クイックスタート

### ステップ1: 写真をリサイズ

```bash
cd photo-gallery-worker
./resize-photos.sh
```

- **読み込み元**: カメラからコピーした写真フォルダを入力（Enterでデフォルト）
- **出力先**: リサイズ後の保存先を入力（Enterでデフォルト）

### ステップ2: 写真を確認

リサイズされた写真を確認し、不要な写真があれば削除します。

```bash
open ~/Pictures/shogo写真データ/resized
```

### ステップ3: Cloudflareにアップロード

```bash
npm run upload ~/Pictures/shogo写真データ/resized
```

これだけです！

## コマンドリファレンス

| コマンド | 説明 |
|---------|------|
| `./resize-photos.sh` | 写真をリサイズして日付フォルダに整理 |
| `npm run upload <フォルダ>` | 指定フォルダをCloudflare R2にアップロード |

## 注意事項

1. **初回のみ必要**: Cloudflare認証が必要な場合は `wrangler login` を実行
2. **Macのみ対応**: リサイズスクリプトはmacOS専用（sipsコマンド使用）
3. **ネットワーク**: アップロード時はインターネット接続が必要

## トラブルシューティング

### wranglerコマンドが見つからない

```bash
npm install
```

### 認証エラー

```bash
wrangler login
```

ブラウザが開くので、Cloudflareアカウントでログインしてください。

## 詳細情報

詳しい説明は [README.md](README.md) を参照してください。
