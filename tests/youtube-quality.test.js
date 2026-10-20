import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main as curateYouTubeCli } from '../scripts/curate-youtube.js';
import { main as curateXCli } from '../scripts/curate-x.js';
import {
  clickbaitWeight,
  contentHash,
  curateYouTube,
  redactUrl,
  scoreVideo,
  titleSimilarity,
} from '../scripts/lib/youtube-quality.js';

const ALLOW_NONE = { channelIds: [], videoIds: [], channelTitles: [] };
const CONFIG = {
  minSubscribers: 1000,
  minQualityScore: 45,
  rescueScore: 60,
  allowlistScore: 40,
  channelCacheDays: 14,
  maxRetries: 2,
  retryBaseMs: 0,
  batchSize: 50,
};

function video(id, title, extra = {}) {
  return {
    title,
    channel: '',
    url: `https://www.youtube.com/watch?v=${id}`,
    publishedAt: extra.publishedAt || 'November 7, 2025 at 12:21AM',
    description: extra.description || '試合の様子です。',
    keyword: '谷端 阪神',
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function apiFetch({ videos = [], channels = [], fail = false, quotaOnCall = 0 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    if (fail) throw new Error('network down');
    if (quotaOnCall && calls.length >= quotaOnCall) {
      return jsonResponse({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403);
    }
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('key')?.includes('secret-key'), true);
    const ids = parsed.searchParams.get('id').split(',');
    if (parsed.pathname.endsWith('/videos')) {
      assert.match(parsed.searchParams.get('part'), /snippet,statistics/);
      assert.match(parsed.searchParams.get('fields'), /viewCount/);
      return jsonResponse({
        items: ids.map((id) => videos.find((item) => item.id === id)).filter(Boolean),
      });
    }
    return jsonResponse({
      items: ids.map((id) => channels.find((item) => item.id === id)).filter(Boolean),
    });
  };
  return { impl, calls };
}

function channel(id, title, subscribers, extra = {}) {
  return {
    id,
    snippet: { title },
    statistics: {
      hiddenSubscriberCount: false,
      subscriberCount: String(subscribers),
      videoCount: '12',
      ...extra,
    },
  };
}

test('subscriber count alone cannot publish a low-quality video', async () => {
  const title = '衝撃速報！谷端、歴史的スター激突で劇的展開判明';
  assert.ok(clickbaitWeight(title) >= 3);
  const source = [video('aaaaaaaaaaa', title)];
  const api = apiFetch({
    videos: [{ id: 'aaaaaaaaaaa', snippet: { channelId: 'UC1', channelTitle: 'mill', publishedAt: '2026-01-01T00:00:00Z' }, statistics: { viewCount: '1000000' } }],
    channels: [channel('UC1', 'mill', 500000)],
  });
  const result = await curateYouTube(source, {
    apiKey: 'secret-key',
    fetchImpl: api.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    sleep: async () => {},
  });
  assert.equal(result.videos.length, 0);
  assert.equal(api.calls.length, 0);
  assert.equal(result.stats.reject, 1);
});

test('keeps a careful highlight from a small channel and an official calm video', async () => {
  const highlight = video('bbbbbbbbbbb', '谷端将伍（阪神タイガース）ヒット集、守備機会');
  const official = video('ccccccccccc', '阪神　ドラフト２位谷端が仮契約　契約金７０００万円');
  const ordinary = video('ddddddddddd', '阪神 谷端のドラフト仮契約インタビューを見る');
  assert.ok(scoreVideo(highlight).score >= 60);
  assert.ok(scoreVideo(ordinary).score < 60);
  assert.equal(scoreVideo(ordinary).hardReject, false);

  const api = apiFetch({
    videos: [
      { id: 'bbbbbbbbbbb', snippet: { channelId: 'UCsmall', channelTitle: '大学野球部', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '400' } },
      { id: 'ccccccccccc', snippet: { channelId: 'UCoff', channelTitle: '阪神タイガース', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '10' } },
      { id: 'ddddddddddd', snippet: { channelId: 'UCsmall', channelTitle: '大学野球部', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '10' } },
    ],
    channels: [
      channel('UCsmall', '大学野球部', 80),
      channel('UCoff', '阪神タイガース', 12),
    ],
  });
  const result = await curateYouTube([highlight, official, ordinary], {
    apiKey: 'secret-key',
    fetchImpl: api.impl,
    allowlist: { channelIds: [], videoIds: [], channelTitles: ['阪神タイガース'] },
    config: CONFIG,
    sleep: async () => {},
  });
  assert.deepEqual(result.videos.map((item) => item.url), [highlight.url, official.url]);
  assert.equal(api.calls.filter((url) => url.includes('/channels')).length, 1);
});

test('rejects duplicate and template-like videos', async () => {
  const keeper = video('eeeeeeeeeee', '阪神ドラフト２位谷端が仮契約　契約金７０００万円');
  const copy = video('fffffffffff', '阪神ドラフト２位谷端が仮契約　契約金７０００万円');
  const reaction = video('ggggggggggg', '【阪神】谷端をいじるw　阪神ファンの反応集');
  assert.equal(titleSimilarity('阪神ドラフト谷端', '阪神ドラフト谷端'), 1);
  const api = apiFetch({
    videos: [{
      id: 'eeeeeeeeeee',
      snippet: { channelId: 'UCbig', channelTitle: 'news', publishedAt: '2026-08-01T00:00:00Z' },
      statistics: { viewCount: '1000' },
    }],
    channels: [channel('UCbig', 'news', 20000)],
  });
  const result = await curateYouTube([keeper, copy, reaction], {
    apiKey: 'secret-key',
    fetchImpl: api.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    sleep: async () => {},
  });
  assert.deepEqual(result.videos.map((item) => item.url), [keeper.url]);
  assert.equal(api.calls.filter((url) => url.includes('/videos')).length, 1);
});

test('an analysis title is not rejected just because it contains 考察', () => {
  const analysis = scoreVideo({ title: '谷端将伍の打撃を考察する', description: 'フォームと選球を具体的に見ています。' });
  const stuffed = scoreVideo({
    title: '徹底考察 #阪神 #谷端 #立石 #岡城 #ドラフト #キャンプ #補強 #新外国人',
    description: '#阪神 #谷端 #立石 #岡城 #ドラフト',
  });
  assert.equal(analysis.hardReject, false);
  assert.ok(analysis.score >= 45);
  assert.ok(stuffed.score < 45);
});

test('batches lookups, caches them, and preserves verified videos when the API fails', async () => {
  const videos = Array.from({ length: 51 }, (_, index) => video(
    `v${String(index).padStart(10, '0')}`,
    `谷端安打${String(index).padStart(4, '0')}`,
  ));
  assert.equal(videos[0].url.includes('v0000000000'), true);
  const channels = [channel('UCbatch', '独立チャンネル', 5000, { videoCount: '20' })];
  const videoItems = videos.map((item) => ({
    id: item.url.slice(-11),
    snippet: { channelId: 'UCbatch', channelTitle: '独立チャンネル', publishedAt: '2026-09-01T00:00:00Z' },
    statistics: { viewCount: '100' },
  }));
  const firstApi = apiFetch({ videos: videoItems, channels });
  const first = await curateYouTube(videos, {
    apiKey: 'secret-key',
    fetchImpl: firstApi.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    sleep: async () => {},
    now: new Date('2026-10-01T00:00:00Z'),
  });
  assert.equal(first.stats.publish, 51);
  assert.equal(firstApi.calls.filter((url) => url.includes('/videos')).length, 2);
  assert.equal(firstApi.calls.filter((url) => url.includes('/channels')).length, 1);
  assert.equal(new URL(firstApi.calls[0]).searchParams.get('id').split(',').length, 50);

  const secondApi = apiFetch({ fail: true });
  const second = await curateYouTube(videos, {
    apiKey: 'secret-key',
    fetchImpl: secondApi.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    cache: first.cache,
    sleep: async () => {},
    now: new Date('2026-10-02T00:00:00Z'),
  });
  assert.equal(secondApi.calls.length, 0);
  assert.equal(second.stats.cacheHits, 51);
  assert.equal(second.stats.publish, 51);

  const fresh = video('hhhhhhhhhhh', '阪神 谷端のドラフト仮契約インタビューを見る');
  const kept = videos[0];
  const bait = video('iiiiiiiiiii', '衝撃速報！谷端、歴史的スター激突で劇的展開判明');
  const failed = apiFetch({ fail: true });
  const preserved = await curateYouTube([kept, fresh, bait], {
    apiKey: 'secret-key',
    fetchImpl: failed.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    existingPublic: [kept, bait],
    sleep: async () => {},
  });
  assert.deepEqual(preserved.videos.map((item) => item.url), [kept.url]);
  assert.equal(preserved.stats.hold, 1);
  assert.equal(preserved.apiState, 'unavailable');
  assert.equal(JSON.stringify(preserved.cache).includes('secret-key'), false);
  assert.equal(redactUrl('https://example.test?key=secret-key&id=1'), 'https://example.test?key=REDACTED&id=1');
});

test('hidden or missing subscriber counts stay unpublished', async () => {
  const source = [video('jjjjjjjjjjj', '阪神 谷端のドラフト仮契約インタビューを見る')];
  const api = apiFetch({
    videos: [{
      id: 'jjjjjjjjjjj',
      snippet: { channelId: 'UChid', channelTitle: 'hidden', publishedAt: '2026-09-01T00:00:00Z' },
      statistics: { viewCount: '10' },
    }],
    channels: [{
      id: 'UChid',
      snippet: { title: 'hidden' },
      statistics: { hiddenSubscriberCount: true, videoCount: '3' },
    }],
  });
  const result = await curateYouTube(source, {
    apiKey: 'secret-key',
    fetchImpl: api.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    sleep: async () => {},
  });
  assert.equal(result.videos.length, 0);
  assert.equal(result.stats.hold, 1);
});

test('retries a failed request and stops on quota without dropping the verified batch', async () => {
  let attempts = 0;
  const fetchImpl = async (url) => {
    attempts += 1;
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/videos') && attempts === 1) return jsonResponse({}, 503);
    if (parsed.pathname.endsWith('/videos')) {
      return jsonResponse({
        items: [{
          id: 'kkkkkkkkkkk',
          snippet: { channelId: 'UCtry', channelTitle: 'try', publishedAt: '2026-09-01T00:00:00Z' },
          statistics: { viewCount: '100' },
        }],
      });
    }
    return jsonResponse({ items: [channel('UCtry', 'try', 5000)] });
  };
  const retried = await curateYouTube([video('kkkkkkkkkkk', '阪神 谷端のドラフト仮契約インタビューを見る')], {
    apiKey: 'secret-key',
    fetchImpl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    sleep: async () => {},
  });
  assert.equal(retried.stats.publish, 1);
  assert.ok(attempts >= 3);

  const many = Array.from({ length: 51 }, (_, index) => video(
    `q${String(index).padStart(10, '0')}`.slice(0, 11),
    `谷端安打${String(index).padStart(4, '0')}`,
  ));
  const quotaApi = apiFetch({
    videos: many.slice(0, 50).map((item) => ({
      id: item.url.slice(-11),
      snippet: { channelId: 'UCq', channelTitle: 'q', publishedAt: '2026-09-01T00:00:00Z' },
      statistics: { viewCount: '10' },
    })),
    channels: [channel('UCq', 'q', 4000)],
    quotaOnCall: 2,
  });
  const quota = await curateYouTube(many, {
    apiKey: 'secret-key',
    fetchImpl: quotaApi.impl,
    allowlist: ALLOW_NONE,
    config: CONFIG,
    existingPublic: many.slice(0, 50),
    sleep: async () => {},
  });
  assert.equal(quota.apiState, 'quota');
  assert.equal(quota.stats.publish, 50);
  assert.equal(quota.stats.hold, 1);
  assert.ok(quota.videos.every((item) => item.url !== many[50].url));
  assert.equal(quota.stats.units < 20, true);
});

async function withEnv(values, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  const exitCode = process.exitCode;
  process.exitCode = 0;
  try {
    return await fn();
  } finally {
    process.exitCode = exitCode;
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('dry run and invalid input do not change source or public files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sho5-curate-'));
  const source = path.join(dir, 'x-data.txt');
  const published = path.join(dir, 'x-public.json');
  const cache = path.join(dir, 'x-cache.json');
  const original = JSON.stringify([{
    text: '谷端選手がんばれ！',
    userName: 'fan',
    tweetUrl: 'https://x.com/fan/status/2092719964855869793',
  }], null, 2);
  fs.writeFileSync(source, original);
  fs.writeFileSync(published, '[{"text":"keep"}]\n');

  await withEnv({
    X_SOURCE: source,
    X_PUBLIC: published,
    X_CACHE: cache,
    DRY_RUN: 'true',
  }, () => curateXCli());
  assert.equal(fs.readFileSync(source, 'utf8'), original);
  assert.equal(fs.readFileSync(published, 'utf8'), '[{"text":"keep"}]\n');
  assert.equal(fs.existsSync(cache), false);

  const broken = path.join(dir, 'broken.txt');
  const absent = path.join(dir, 'absent-public.json');
  fs.writeFileSync(broken, '{');
  await withEnv({
    X_SOURCE: broken,
    X_PUBLIC: absent,
    X_CACHE: path.join(dir, 'absent-cache.json'),
    DRY_RUN: 'false',
  }, () => curateXCli());
  assert.equal(fs.existsSync(absent), false);

  const ytSource = path.join(dir, 'YouTube-data.txt');
  const ytPublic = path.join(dir, 'youtube-public.json');
  const ytCache = path.join(dir, 'yt-cache.json');
  const rawVideos = [video('mmmmmmmmmmm', '阪神 谷端のドラフト仮契約インタビューを見る')];
  fs.writeFileSync(ytSource, JSON.stringify(rawVideos, null, 2));
  fs.writeFileSync(ytPublic, JSON.stringify(rawVideos, null, 2));
  const before = fs.readFileSync(ytPublic);
  await withEnv({
    YT_SOURCE: ytSource,
    YT_PUBLIC: ytPublic,
    YT_CACHE: ytCache,
    YT_ALLOWLIST: path.join(dir, 'missing-allowlist.json'),
    YOUTUBE_API_KEY: '',
    DRY_RUN: 'true',
    MIN_SUBSCRIBERS: '1000',
  }, () => curateYouTubeCli());
  assert.equal(fs.readFileSync(ytSource, 'utf8'), JSON.stringify(rawVideos, null, 2));
  assert.deepEqual(fs.readFileSync(ytPublic), before);
  assert.equal(fs.existsSync(ytCache), false);
});

test('a stale or malformed channel cache cannot publish an unverified video', async () => {
  const source = [video('nnnnnnnnnnn', '谷端将伍のファーム試合')];
  const hash = contentHash(source[0]);
  const now = '2026-10-01T00:00:00.000Z';
  const channelRecord = {
    title: 'fan',
    subscriberCount: 10,
    hidden: false,
    videoCount: 3,
    fetchedAt: now,
  };
  const staleDecision = await curateYouTube(source, {
    apiKey: 'secret-key',
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
    allowlist: ALLOW_NONE,
    config: CONFIG,
    cache: {
      policyVersion: 999,
      channels: { UCstale: channelRecord },
      videos: {
        nnnnnnnnnnn: {
          contentHash: hash,
          channelId: 'UCstale',
          viewCount: 20,
          decision: 'publish',
          policyVersion: 1,
        },
      },
    },
    sleep: async () => {},
    now: new Date(now),
  });
  assert.equal(staleDecision.stats.cacheHits, 1);
  assert.equal(staleDecision.stats.publish, 0);

  const calls = [];
  const mismatched = await curateYouTube(source, {
    apiKey: 'secret-key',
    fetchImpl: async (url) => {
      calls.push(url);
      throw new Error('down');
    },
    allowlist: ALLOW_NONE,
    config: CONFIG,
    cache: {
      channels: { UCfake: { ...channelRecord, subscriberCount: 100000 } },
      videos: {
        nnnnnnnnnnn: {
          contentHash: 'not-the-current-video',
          channelId: 'UCfake',
          viewCount: 20,
          decision: 'publish',
        },
      },
    },
    sleep: async () => {},
    now: new Date(now),
  });
  assert.equal(mismatched.stats.publish, 0);
  assert.equal(mismatched.stats.hold, 1);
  assert.ok(calls.length > 0);

  const malformedCalls = [];
  const malformed = await curateYouTube(source, {
    apiKey: 'secret-key',
    fetchImpl: async (url) => {
      malformedCalls.push(url);
      throw new Error('down');
    },
    allowlist: ALLOW_NONE,
    config: CONFIG,
    cache: {
      channels: { UCbad: { ...channelRecord, subscriberCount: '100000' } },
      videos: {
        nnnnnnnnnnn: {
          contentHash: hash,
          channelId: 'UCbad',
          viewCount: 20,
          decision: 'publish',
        },
      },
    },
    sleep: async () => {},
    now: new Date(now),
  });
  assert.equal(malformed.stats.cacheHits, 0);
  assert.equal(malformed.stats.publish, 0);
  assert.ok(malformedCalls.length > 0);
});

test('manual curation cannot replace published history, even when dry run is off', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sho5-status-'));
  const statusPath = path.join(dir, 'feed-status.json');
  const xSource = path.join(dir, 'x-data.txt');
  const xPublic = path.join(dir, 'x-public.json');
  const xCache = path.join(dir, 'x-cache.json');
  const kept = {
    text: '谷端選手がんばれ！',
    userName: 'fan',
    tweetUrl: 'https://x.com/fan/status/2092719964855869793',
  };
  const rejected = {
    text: '谷端がんばれけど',
    userName: 'fan',
    tweetUrl: 'https://x.com/fan/status/2092719964855869794',
  };
  const tweets = [kept, rejected];
  const publicHistory = `${JSON.stringify([rejected, kept], null, 2)}\n`;
  fs.writeFileSync(xSource, JSON.stringify(tweets));
  fs.writeFileSync(xPublic, publicHistory);
  const runX = () => withEnv({
    X_SOURCE: xSource,
    X_PUBLIC: xPublic,
    X_CACHE: xCache,
    FEED_STATUS: statusPath,
    DRY_RUN: 'false',
  }, () => curateXCli());
  await runX();
  await runX();
  assert.equal(fs.readFileSync(xPublic, 'utf8'), publicHistory);
  assert.equal(fs.readFileSync(xSource, 'utf8'), JSON.stringify(tweets));
  assert.equal(fs.existsSync(statusPath), false);
  assert.equal(fs.existsSync(xCache), false);
  const xBytes = fs.readFileSync(xPublic);

  const ytSource = path.join(dir, 'YouTube-data.txt');
  const ytPublic = path.join(dir, 'youtube-public.json');
  const ytCache = path.join(dir, 'yt-cache.json');
  const keptVideo = video('ppppppppppp', '阪神 谷端のドラフト仮契約インタビューを見る');
  const addedVideo = video('qqqqqqqqqqq', '谷端の新しい打席');
  const raw = JSON.stringify([keptVideo, addedVideo]);
  const videoHistory = `${JSON.stringify([keptVideo], null, 2)}\n`;
  fs.writeFileSync(ytSource, raw);
  fs.writeFileSync(ytPublic, videoHistory);
  const runYouTube = (dryRun) => withEnv({
    YT_SOURCE: ytSource,
    YT_PUBLIC: ytPublic,
    YT_CACHE: ytCache,
    YT_ALLOWLIST: path.join(dir, 'allow.json'),
    FEED_STATUS: statusPath,
    YOUTUBE_API_KEY: '',
    DRY_RUN: dryRun,
  }, () => curateYouTubeCli());
  await runYouTube('true');
  await runYouTube('false');
  await runYouTube('false');
  assert.equal(fs.readFileSync(ytPublic, 'utf8'), videoHistory);
  assert.equal(fs.existsSync(ytCache), false);
  assert.equal(fs.readFileSync(ytSource, 'utf8'), raw);
  assert.deepEqual(fs.readFileSync(xPublic), xBytes);
  assert.equal(fs.existsSync(statusPath), false);

  const brokenCache = path.join(dir, 'broken-cache.json');
  fs.writeFileSync(brokenCache, '{');
  fs.writeFileSync(ytPublic, '[]');
  fs.writeFileSync(statusPath, '{"version":1}\n');
  const beforeStatus = fs.readFileSync(statusPath);
  await withEnv({
    YT_SOURCE: ytSource,
    YT_PUBLIC: ytPublic,
    YT_CACHE: brokenCache,
    YT_ALLOWLIST: path.join(dir, 'allow.json'),
    FEED_STATUS: statusPath,
    YOUTUBE_API_KEY: 'secret-key',
    DRY_RUN: 'false',
  }, () => curateYouTubeCli());
  assert.equal(fs.readFileSync(ytPublic, 'utf8'), '[]');
  assert.equal(fs.readFileSync(brokenCache, 'utf8'), '{');
  assert.deepEqual(fs.readFileSync(statusPath), beforeStatus);

  const brokenStatus = path.join(dir, 'broken-status.json');
  fs.writeFileSync(brokenStatus, '{');
  const untouched = path.join(dir, 'untouched-public.json');
  fs.writeFileSync(untouched, '[{"text":"keep"}]');
  await withEnv({
    X_SOURCE: xSource,
    X_PUBLIC: untouched,
    X_CACHE: path.join(dir, 'fresh-x-cache.json'),
    FEED_STATUS: brokenStatus,
    DRY_RUN: 'false',
  }, () => curateXCli());
  assert.equal(fs.readFileSync(untouched, 'utf8'), '[{"text":"keep"}]');
  assert.equal(fs.readFileSync(brokenStatus, 'utf8'), '{');
  assert.equal(fs.readFileSync(xSource, 'utf8'), JSON.stringify(tweets));
});
