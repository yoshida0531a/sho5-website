# photo-gallery-worker 本番スナップショット

`index.js` は、2025-07-10 に 100% 配信されていた version `5235cf44-c2ab-4b35-8dca-664a22b67951` のバンドルです。編集用のソースは親ディレクトリの `src/index.js` で、このバンドルと同じ 2025-07-10 版です。

2026-06-23 の未デプロイ版は `_archive/2026-06-23-undeployed/` に移しました。本番には使いません。

本番 Binding は R2 `PHOTOS`（`sho5-gallery-photos`）と KV `USAGE_STATS`（`6c2fb2fa2b244ad69e06813c64213972`）です。本番スクリプトは `USAGE_STATS` を参照していません。Secret、Cron、Route、独自ドメインはありません。`workers.dev` は有効です。

このスナップショットを `wrangler deploy` すると本番が入れ替わります。実行する場合は別途確認してください。
