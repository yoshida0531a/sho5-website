import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, curateYouTube } from './lib/youtube-quality.js';
import { loadFeedStatus, saveFeedState } from './lib/feed-status.js';
import { readJson, writeJsonAtomic } from './lib/json-file.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function envPath(name, fallback) {
  return process.env[name] ? path.resolve(process.env[name]) : path.join(ROOT, fallback);
}

function numberEnv(name, fallback) {
  if (process.env[name] == null || process.env[name] === '') return fallback;
  const parsed = Number.parseInt(process.env[name], 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    console.warn(`無効な ${name}="${process.env[name]}" です。${fallback} を使います。`);
    return fallback;
  }
  return parsed;
}

function csv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function main() {
  const sourcePath = envPath('YT_SOURCE', 'YouTube-data.txt');
  const publicPath = envPath('YT_PUBLIC', 'data/youtube-public.json');
  const cachePath = envPath('YT_CACHE', 'data/youtube-quality-cache.json');
  const allowlistPath = envPath('YT_ALLOWLIST', 'data/youtube-allowlist.json');
  const statusPath = envPath('FEED_STATUS', 'data/feed-status.json');
  const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

  let videos;
  try {
    videos = readJson(sourcePath);
  } catch {
    console.error('YouTube-data を読めませんでした。公開データは変更していません。');
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(videos)) {
    console.error('YouTube-data の形式が配列ではありません。公開データは変更していません。');
    process.exitCode = 1;
    return;
  }

  let existingPublic = null;
  if (fs.existsSync(publicPath)) {
    try {
      existingPublic = readJson(publicPath);
      if (!Array.isArray(existingPublic)) throw new Error('format');
    } catch {
      console.error('公開用YouTubeデータを読めないため中断しました。ファイルは変更していません。');
      process.exitCode = 1;
      return;
    }
  }

  let cache = { channels: {}, videos: {} };
  if (fs.existsSync(cachePath)) {
    try {
      cache = readJson(cachePath);
    } catch {
      console.error('YouTubeの品質キャッシュを読めないため中断しました。公開データは変更していません。');
      process.exitCode = 1;
      return;
    }
  }

  let feedStatus;
  try {
    feedStatus = loadFeedStatus(statusPath);
  } catch {
    console.error('公開状態の記録を読めないため中断しました。公開データは変更していません。');
    process.exitCode = 1;
    return;
  }

  let allowlist = { channelIds: [], videoIds: [], channelTitles: null };
  if (fs.existsSync(allowlistPath)) {
    try {
      const loaded = readJson(allowlistPath);
      allowlist = {
        channelIds: Array.isArray(loaded.channelIds) ? loaded.channelIds : [],
        videoIds: Array.isArray(loaded.videoIds) ? loaded.videoIds : [],
        channelTitles: Array.isArray(loaded.channelTitles) ? loaded.channelTitles : null,
      };
    } catch {
      console.error('許可リストを読めないため中断しました。公開データは変更していません。');
      process.exitCode = 1;
      return;
    }
  }
  allowlist.channelIds = [...new Set([...allowlist.channelIds, ...csv('YT_ALLOW_CHANNEL_IDS')])];
  allowlist.videoIds = [...new Set([...allowlist.videoIds, ...csv('YT_ALLOW_VIDEO_IDS')])];

  const before = fs.readFileSync(sourcePath);
  const result = await curateYouTube(videos, {
    apiKey: process.env.YOUTUBE_API_KEY || '',
    existingPublic: existingPublic || [],
    cache,
    allowlist,
    config: {
      minSubscribers: numberEnv('MIN_SUBSCRIBERS', DEFAULTS.minSubscribers),
      minQualityScore: numberEnv('MIN_QUALITY_SCORE', DEFAULTS.minQualityScore),
      rescueScore: numberEnv('RESCUE_SCORE', DEFAULTS.rescueScore),
      allowlistScore: numberEnv('ALLOWLIST_SCORE', DEFAULTS.allowlistScore),
      channelCacheDays: numberEnv('YT_CHANNEL_CACHE_DAYS', DEFAULTS.channelCacheDays),
      maxRetries: numberEnv('YT_API_RETRIES', DEFAULTS.maxRetries),
      retryBaseMs: numberEnv('YT_API_RETRY_BASE_MS', DEFAULTS.retryBaseMs),
      batchSize: DEFAULTS.batchSize,
    },
    batchDelayMs: numberEnv('API_DELAY_MS', 100),
  });
  if (!before.equals(fs.readFileSync(sourcePath))) {
    console.error('元データが変化したため、公開データを書き込みません。');
    process.exitCode = 1;
    return;
  }

  const summary = {
    dryRun,
    apiState: result.apiState,
    publish: result.stats.publish,
    reject: result.stats.reject,
    hold: result.stats.hold,
    preserved: result.stats.preserved,
    cacheHits: result.stats.cacheHits,
    requests: result.stats.requests,
    units: result.stats.units,
  };
  const verified = result.stats.publish > 0
    || result.stats.apiVerified > 0
    || result.stats.cacheHits > 0
    || result.apiState === 'ok'
    || result.apiState === 'partial';
  const canWrite = verified || existingPublic != null;
  console.log(JSON.stringify({ ...summary, write: !dryRun && canWrite }));
  if (!canWrite) {
    console.error('登録者数を確認できないため、公開用YouTubeデータは作成・更新していません。');
    if (!dryRun) saveFeedState(statusPath, feedStatus, 'youtube', 'not_generated', 0);
    return;
  }
  if (dryRun) return;
  writeJsonAtomic(publicPath, result.videos);
  writeJsonAtomic(cachePath, result.cache);
  saveFeedState(statusPath, feedStatus, 'youtube', 'published', result.videos.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
