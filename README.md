# Shogo Fan Site - 谷端将伍応援サイト

谷端将伍（阪神タイガース2024年ドラフト2位）のファンサイトです。
GitHub Pages と Cloudflare Workers を使って、シンプルにホームページを公開するためのリポジトリです。

## サイト構成

- **トップページ** (`index.html`)
- **写真ギャラリー一覧** (`photo-dates.html`)
- **写真ギャラリー詳細** (`photo.html`)
- **Xポスト** (`x.html`)
- **YouTube動画** (`youtube.html`)
- **Sho5 Meter** (`sho5-meter.html`)
- **試合結果** (`results.html`)

## ライセンス

Copyright © 2023-2025 Akira Yoshida.

## お問い合わせ

- LINE Official: https://lin.ee/TqFSBw3K
- サイトURL: https://sho5.org


## 新着X・YouTubeデータ

本日分と日別索引は Cloudflare Worker `twitter-to-line` の `/public-feeds/` APIから取得します。受信・選別・保存はCloudflare Workers/Queues/R2で実行し、GitHubは新着データの更新先にしません。過去の公開済みアーカイブは既存JSONを読み、「過去を見る」か検索時にだけ読み込みます。

初期表示は日本時間の本日分のみです。公開0件でも、受信・対象外・再試行待ちの件数を表示します。API障害は「投稿なし」と区別します。公開基準は変更していません。

この変更は先に `sho5-script/line-notifier` のR2対応Workerを本番へ反映し、APIが200を返すことを確認してから公開してください。Workerの更新権限不足により、本番への反映は現在保留です。
