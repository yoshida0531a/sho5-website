/**
 * YouTube Data Filter Script
 * 
 * このスクリプトはYouTube-data.txtから登録者数が100人未満のチャンネルの動画を削除します。
 * 
 * 使用方法:
 * 1. 環境変数 YOUTUBE_API_KEY を設定するか、直接以下に入力してください
 * 2. node scripts/filter-youtube-by-subscribers.js を実行
 * 
 * 注意: YouTube Data API v3のクォータ制限があります（1日10,000ユニット）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube API Key (環境変数から取得、または直接設定)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'YOUR_YOUTUBE_API_KEY_HERE';
const MIN_SUBSCRIBERS = 100;

// ファイルパス
const DATA_FILE = path.join(__dirname, '..', 'YouTube-data.txt');
const OUTPUT_FILE = path.join(__dirname, '..', 'YouTube-data.txt');
const BACKUP_FILE = path.join(__dirname, '..', 'YouTube-data.txt.backup');

async function getVideoDetails(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return data.items[0].snippet.channelId;
        }
    } catch (error) {
        console.error(`Error fetching video ${videoId}:`, error.message);
    }
    return null;
}

async function getChannelSubscribers(channelId) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return parseInt(data.items[0].statistics.subscriberCount, 10);
        }
    } catch (error) {
        console.error(`Error fetching channel ${channelId}:`, error.message);
    }
    return null;
}

function extractVideoId(url) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
}

async function main() {
    if (YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
        console.error('エラー: YouTube API Keyを設定してください。');
        console.error('環境変数 YOUTUBE_API_KEY を設定するか、スクリプト内のYOUTUBE_API_KEYを編集してください。');
        process.exit(1);
    }

    console.log('YouTube-data.txt を読み込んでいます...');
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const videos = JSON.parse(rawData);

    console.log(`合計 ${videos.length} 件の動画データを読み込みました。`);

    // バックアップを作成
    fs.writeFileSync(BACKUP_FILE, rawData);
    console.log(`バックアップを作成しました: ${BACKUP_FILE}`);

    const channelCache = new Map();
    const filteredVideos = [];
    const removedVideos = [];

    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const videoId = extractVideoId(video.url);
        
        if (!videoId) {
            console.log(`  [${i + 1}/${videos.length}] 無効なURL: ${video.url}`);
            filteredVideos.push(video);
            continue;
        }

        console.log(`  [${i + 1}/${videos.length}] 処理中: ${video.title.substring(0, 50)}...`);

        // チャンネルIDを取得
        const channelId = await getVideoDetails(videoId);
        if (!channelId) {
            console.log(`    -> チャンネルIDを取得できませんでした。保持します。`);
            filteredVideos.push(video);
            continue;
        }

        // キャッシュをチェック
        let subscriberCount = channelCache.get(channelId);
        if (subscriberCount === undefined) {
            subscriberCount = await getChannelSubscribers(channelId);
            channelCache.set(channelId, subscriberCount);
        }

        if (subscriberCount === null) {
            console.log(`    -> 登録者数を取得できませんでした。保持します。`);
            filteredVideos.push(video);
        } else if (subscriberCount >= MIN_SUBSCRIBERS) {
            console.log(`    -> 登録者数: ${subscriberCount} (保持)`);
            filteredVideos.push(video);
        } else {
            console.log(`    -> 登録者数: ${subscriberCount} (削除)`);
            removedVideos.push({ ...video, subscriberCount });
        }

        // APIレート制限を避けるため少し待機
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n=== 結果 ===');
    console.log(`保持: ${filteredVideos.length} 件`);
    console.log(`削除: ${removedVideos.length} 件`);

    if (removedVideos.length > 0) {
        console.log('\n削除された動画:');
        removedVideos.forEach((video, i) => {
            console.log(`  ${i + 1}. [登録者: ${video.subscriberCount}] ${video.title.substring(0, 60)}...`);
        });
    }

    // 結果を保存
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(filteredVideos, null, 2));
    console.log(`\n結果を ${OUTPUT_FILE} に保存しました。`);
}

main().catch(console.error);
