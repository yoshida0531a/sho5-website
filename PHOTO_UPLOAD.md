# 写真アップロード方法

## 手順

### 1. リサイズ
```bash
cd photo-gallery-worker
./resize-photos.sh
```
Enterキーを2回押すだけ（デフォルト設定の場合）

または、scriptsディレクトリから:
```bash
cd scripts
./resize-photo-gallery.sh
```

### 2. 確認
```bash
open ~/Pictures/shogo写真データ/resized
```
不要な写真があれば削除

### 3. アップロード
```bash
npm run upload ~/Pictures/shogo写真データ/resized
```

完了！

## ワンライナー（上級者向け）
```bash
cd photo-gallery-worker && ./resize-photos.sh && npm run upload ~/Pictures/shogo写真データ/resized
```

---

## トップページ画像の最適化

トップページの3枚の画像（top_pc1.JPG, top_pc2.JPG, top_pc3.JPG）を最適化する場合:

```bash
cd scripts
./optimize-top-images.sh
```

詳細: [scripts/README.md](scripts/README.md)

---

詳細: [photo-gallery-worker/UPLOAD_GUIDE.md](photo-gallery-worker/UPLOAD_GUIDE.md)
