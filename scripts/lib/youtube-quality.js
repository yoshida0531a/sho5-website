import { createHash } from 'node:crypto';
import { extractYouTubeId } from '../../js/safe-url.js';
import { parseCustomDate } from '../../js/feed-behavior.js';

export const POLICY_VERSION = 1;
export const DEFAULTS = {
  minSubscribers: 1000,
  minQualityScore: 45,
  rescueScore: 60,
  allowlistScore: 40,
  channelCacheDays: 14,
  maxRetries: 2,
  retryBaseMs: 400,
  batchSize: 50,
};

export const DEFAULT_TRUSTED_CHANNEL_TITLES = [
  '阪神タイガース',
  'Hanshin Tigers',
  'サンテレビ',
  'サンテレビジョン',
  '毎日放送',
  '朝日放送テレビ',
  '関西テレビ',
  '読売テレビ',
  'NHK',
  '日刊スポーツ',
  'スポーツニッポン',
  'スポニチアネックス',
  'スポーツ報知',
];

const CLICKBAIT = [
  ['状況一変', 2],
  ['スター激突', 2],
  ['独占告白', 2],
  ['劇的展開', 2],
  ['衝撃', 1],
  ['驚愕', 1],
  ['歴史的', 1],
  ['土壇場', 1],
  ['判明', 1],
];

const HARD_CLICKBAIT = 3;

export function redactUrl(url) {
  return String(url).replace(/([?&]key=)[^&]+/gi, '$1REDACTED');
}

export function contentHash(video) {
  const title = String(video?.title ?? '');
  const description = String(video?.description ?? '');
  return createHash('sha256').update(`${title}\n${description}`).digest('hex');
}

export function normalizeTitle(title) {
  return String(title ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[^\s#]+/g, '')
    .replace(/[\p{Extended_Pictographic}]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value) => {
    const set = new Map();
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      set.set(gram, (set.get(gram) || 0) + 1);
    }
    return set;
  };
  const left = grams(a);
  const right = grams(b);
  let overlap = 0;
  for (const [gram, count] of left) {
    overlap += Math.min(count, right.get(gram) || 0);
  }
  const total = a.length - 1 + (b.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
}

export function clickbaitWeight(title) {
  const text = String(title ?? '');
  let weight = 0;
  for (const [term, value] of CLICKBAIT) {
    if (text.includes(term)) weight += value;
  }
  return weight;
}

function countHashtags(text) {
  return (String(text).match(/#/g) || []).length;
}

function countEmoji(text) {
  return (String(text).match(/\p{Extended_Pictographic}/gu) || []).length;
}

function plainDescription(description) {
  return String(description ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreVideo(video) {
  const title = String(video?.title ?? '');
  const description = String(video?.description ?? '');
  const reasons = [];
  const bait = clickbaitWeight(title);
  const hashtags = countHashtags(`${title} ${description}`);
  const emoji = countEmoji(title);
  const plain = plainDescription(description);
  let score = 50;
  let hardReject = false;

  if (!title.trim()) {
    return { score: 0, hardReject: true, reasons: ['empty_title'], clickbaitWeight: bait, hashtagCount: hashtags };
  }
  if (normalizeTitle(title).length < 6) {
    hardReject = true;
    reasons.push('thin_title');
  }
  if (bait >= HARD_CLICKBAIT) {
    hardReject = true;
    reasons.push('clickbait_cluster');
  }
  if (bait > 0) {
    score -= Math.min(40, bait * 8);
    reasons.push('clickbait');
  }
  if (/ガチ|すぎる[wｗ]|[wｗ]{2,}/i.test(title)) {
    score -= 12;
    reasons.push('hype');
  }
  if (hashtags >= 10) {
    score -= 30;
    reasons.push('hashtag_stuffing');
  } else if (hashtags >= 6) {
    score -= 18;
    reasons.push('hashtags');
  }
  if (emoji >= 4) {
    score -= 10;
    reasons.push('emoji_spam');
  }
  if (/反応集|【反応】|反応】/.test(title)) {
    score -= 12;
    reasons.push('reaction_format');
  }
  if (/プロスピ|プロ野球スピリッツ|ゲーム実況/.test(title)) {
    score -= 18;
    reasons.push('game_footage');
  }
  if (/まとめ動画|【まとめ】|まとめ】/.test(title)) {
    score -= 8;
    reasons.push('roundup_format');
  }
  if (plain.length < 12 && hashtags >= 5) {
    score -= 16;
    reasons.push('template_description');
  }
  if (plain.length >= 80) {
    score += 10;
    reasons.push('substantive_description');
  }
  if (bait === 0 && /ヒット集|守備|打席|本塁打|タイムリー|好プレー|日本大学|日大|安打/.test(title)) {
    score += 12;
    reasons.push('game_substance');
  }
  if (bait < 2 && /仮契約|契約金|ドラフト|インタビュー|語った|助言/.test(title)) {
    score += 8;
    reasons.push('reporting');
  }
  if (/考察/.test(title) && hashtags < 4 && bait === 0) {
    score += 6;
    reasons.push('analysis');
  } else if (/考察/.test(title) && hashtags >= 6) {
    score -= 10;
    reasons.push('template_analysis');
  }

  score = Math.max(0, Math.min(100, score));
  return { score, hardReject, reasons, clickbaitWeight: bait, hashtagCount: hashtags };
}

function publishedTime(video) {
  const parsed = parseCustomDate(video?.publishedAt);
  if (parsed) return parsed.getTime();
  const fallback = Date.parse(video?.publishedAt);
  return Number.isNaN(fallback) ? 0 : fallback;
}

export function markDuplicates(entries) {
  const groups = new Map();
  entries.forEach((entry, index) => {
    entry.duplicate = false;
    entry.order = index;
    const key = entry.normalized;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.localScore - a.localScore || publishedTime(a.video) - publishedTime(b.video) || a.order - b.order);
    group.slice(1).forEach((entry) => {
      entry.duplicate = true;
    });
  }

  const canonical = [];
  const ranked = entries
    .filter((entry) => !entry.duplicate && !entry.hardReject && entry.normalized.length >= 12)
    .slice()
    .sort((a, b) => b.localScore - a.localScore || a.order - b.order);
  for (const entry of ranked) {
    const near = canonical.find((kept) => titleSimilarity(kept.normalized, entry.normalized) >= 0.92);
    if (near) entry.duplicate = true;
    else canonical.push(entry);
  }
}

function channelAllowed(channel, allowlist) {
  if (!channel) return false;
  const ids = allowlist.channelIds || [];
  const titles = allowlist.channelTitles || DEFAULT_TRUSTED_CHANNEL_TITLES;
  if (channel.id && ids.includes(channel.id)) return true;
  const title = String(channel.title || '').trim();
  return title.length > 0 && titles.includes(title);
}

function videoAllowed(videoId, allowlist) {
  return Boolean(videoId) && (allowlist.videoIds || []).includes(videoId);
}

export function decideVideo(entry, { config, allowlist, previouslyPublished }) {
  const minSubscribers = config.minSubscribers;
  const minQualityScore = config.minQualityScore;
  const rescueScore = config.rescueScore;
  const allowlistScore = config.allowlistScore;
  const allowedVideo = videoAllowed(entry.videoId, allowlist);

  if (!entry.videoId) return { decision: 'reject', reasons: ['invalid_url'] };
  if (entry.hardReject) return { decision: 'reject', reasons: entry.reasons };
  if (entry.duplicate) return { decision: 'reject', reasons: ['duplicate'] };

  let score = entry.localScore;
  const reasons = [...entry.reasons];
  const channel = entry.channel;
  if (channel && channel.videoCount > 3000 && entry.hashtagCount >= 6) {
    score -= 12;
    reasons.push('high_volume_channel');
  }
  if (
    entry.viewCount != null
    && entry.ageDays != null
    && entry.ageDays > 45
    && entry.viewCount < 50
    && entry.clickbaitWeight > 0
  ) {
    score -= 8;
    reasons.push('low_views');
  }

  if (allowedVideo && score >= allowlistScore) {
    return { decision: 'publish', reasons: [...reasons, 'video_allowlist'], score };
  }
  if (score < minQualityScore && !channelAllowed(channel, allowlist)) {
    return { decision: 'reject', reasons: [...reasons, 'low_score'], score };
  }

  if (entry.api === 'ok' && channel) {
    if (channel.hidden || channel.subscriberCount == null || Number.isNaN(channel.subscriberCount)) {
      return { decision: 'hold', reasons: [...reasons, 'subscribers_unknown'], score };
    }
    if (channelAllowed(channel, allowlist) && score >= allowlistScore) {
      return { decision: 'publish', reasons: [...reasons, 'channel_allowlist'], score };
    }
    if (channel.subscriberCount >= minSubscribers && score >= minQualityScore) {
      return { decision: 'publish', reasons: [...reasons, 'subscribers'], score };
    }
    if (channel.subscriberCount < minSubscribers && score >= rescueScore) {
      return { decision: 'publish', reasons: [...reasons, 'quality_rescue'], score };
    }
    return { decision: 'reject', reasons: [...reasons, 'below_subscriber_bar'], score };
  }

  if (previouslyPublished && score >= minQualityScore) {
    return { decision: 'publish', reasons: [...reasons, 'preserved'], score };
  }
  return { decision: 'hold', reasons: [...reasons, 'unverified'], score };
}

export function chunk(ids, size) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function requestJson(url, { fetchImpl, sleep, retries, retryBaseMs }) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (response.ok) return { ok: true, body, requests: attempt + 1 };
      const reason = body?.error?.errors?.[0]?.reason || '';
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        return { ok: false, quota: true, status: response.status, requests: attempt + 1 };
      }
      last = { ok: false, status: response.status, requests: attempt + 1 };
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await sleep(retryBaseMs * (2 ** attempt));
        continue;
      }
      return last;
    } catch (error) {
      last = { ok: false, network: true, error: error?.message || 'network', requests: attempt + 1 };
      if (attempt < retries) {
        await sleep(retryBaseMs * (2 ** attempt));
        continue;
      }
    }
  }
  return last || { ok: false, network: true, requests: retries + 1 };
}

function listUrl(kind, ids, apiKey) {
  const params = new URLSearchParams({
    part: kind === 'videos' ? 'snippet,statistics' : 'snippet,statistics',
    id: ids.join(','),
    fields: kind === 'videos'
      ? 'items(id,snippet(channelId,channelTitle,publishedAt),statistics(viewCount))'
      : 'items(id,snippet(title),statistics(subscriberCount,hiddenSubscriberCount,videoCount,viewCount))',
    key: apiKey,
  });
  return `https://www.googleapis.com/youtube/v3/${kind}?${params.toString()}`;
}

function fresh(entry, now, maxAgeMs) {
  if (!entry?.fetchedAt) return false;
  const time = Date.parse(entry.fetchedAt);
  return Number.isFinite(time) && now - time < maxAgeMs;
}

function usableCount(value) {
  return value == null || (Number.isInteger(value) && value >= 0);
}

function usableChannel(entry, nowMs, maxAgeMs) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (entry.hidden !== true && entry.hidden !== false) return false;
  if (typeof entry.title !== 'string') return false;
  if (!usableCount(entry.subscriberCount) || !usableCount(entry.videoCount)) return false;
  return fresh(entry, nowMs, maxAgeMs);
}

function usableVideoLink(entry, hash) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (entry.contentHash !== hash) return false;
  if (typeof entry.channelId !== 'string' || entry.channelId.length === 0) return false;
  return usableCount(entry.viewCount);
}

function asCount(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function curateYouTube(videos, options = {}) {
  const source = Array.isArray(videos) ? videos : [];
  const config = { ...DEFAULTS, ...options.config };
  const allowlist = {
    channelIds: options.allowlist?.channelIds || [],
    videoIds: options.allowlist?.videoIds || [],
    channelTitles: options.allowlist?.channelTitles || DEFAULT_TRUSTED_CHANNEL_TITLES,
  };
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (async () => {});
  const apiKey = options.apiKey || '';
  const now = options.now instanceof Date ? options.now : new Date();
  const nowMs = now.getTime();
  const maxAgeMs = config.channelCacheDays * 24 * 60 * 60 * 1000;
  const previous = new Set((options.existingPublic || []).map((video) => video?.url).filter(Boolean));
  const cache = options.cache && typeof options.cache === 'object'
    ? options.cache
    : { channels: {}, videos: {} };
  const channelCache = { ...(cache.channels || {}) };
  const previousVideoCache = cache.videos || {};

  const entries = source.map((video) => {
    const local = scoreVideo(video);
    const videoId = extractYouTubeId(video?.url);
    return {
      video,
      videoId,
      hash: contentHash(video),
      normalized: normalizeTitle(video?.title),
      localScore: local.score,
      hardReject: local.hardReject,
      reasons: local.reasons,
      clickbaitWeight: local.clickbaitWeight,
      hashtagCount: local.hashtagCount,
      api: 'not_requested',
      channel: null,
      viewCount: null,
      ageDays: null,
    };
  });
  markDuplicates(entries);

  const stats = {
    total: source.length,
    publish: 0,
    reject: 0,
    hold: 0,
    preserved: 0,
    cacheHits: 0,
    requests: 0,
    units: 0,
    apiVerified: 0,
  };
  let apiState = apiKey ? 'ok' : 'unavailable';
  let quota = false;

  const needsVideoLookup = [];
  for (const entry of entries) {
    if (!entry.videoId || entry.hardReject || entry.duplicate) continue;
    if (videoAllowed(entry.videoId, allowlist) && entry.localScore >= config.allowlistScore) continue;
    const cachedVideo = previousVideoCache[entry.videoId];
    const cachedChannel = usableVideoLink(cachedVideo, entry.hash)
      ? channelCache[cachedVideo.channelId]
      : null;
    if (usableChannel(cachedChannel, nowMs, maxAgeMs)) {
      entry.api = 'ok';
      entry.channel = {
        id: cachedVideo.channelId,
        title: cachedChannel.title,
        subscriberCount: cachedChannel.subscriberCount,
        hidden: cachedChannel.hidden === true,
        videoCount: cachedChannel.videoCount,
      };
      entry.viewCount = cachedVideo.viewCount ?? null;
      stats.cacheHits += 1;
      continue;
    }
    needsVideoLookup.push(entry);
  }

  async function fetchKind(kind, ids) {
    const items = new Map();
    const failed = new Set();
    for (const group of chunk(ids, config.batchSize)) {
      if (quota) {
        group.forEach((id) => failed.add(id));
        continue;
      }
      const result = await requestJson(listUrl(kind, group, apiKey), {
        fetchImpl,
        sleep,
        retries: config.maxRetries,
        retryBaseMs: config.retryBaseMs,
      });
      stats.requests += result?.requests || 1;
      stats.units += result?.requests || 1;
      if (result?.quota) {
        quota = true;
        group.forEach((id) => failed.add(id));
        continue;
      }
      if (!result?.ok) {
        group.forEach((id) => failed.add(id));
        continue;
      }
      const found = new Set();
      for (const item of result.body?.items || []) {
        if (item?.id) {
          items.set(item.id, item);
          found.add(item.id);
        }
      }
      group.forEach((id) => {
        if (!found.has(id)) failed.add(id);
      });
      if (sleep) await sleep(options.batchDelayMs || 0);
    }
    return { items, failed };
  }

  if (!apiKey) {
    apiState = 'unavailable';
  } else if (needsVideoLookup.length > 0) {
    const videoResult = await fetchKind('videos', needsVideoLookup.map((entry) => entry.videoId));
    const channelIds = new Set();
    for (const entry of needsVideoLookup) {
      if (videoResult.failed.has(entry.videoId)) {
        entry.api = 'failed';
        continue;
      }
      const item = videoResult.items.get(entry.videoId);
      if (!item?.snippet?.channelId) {
        entry.api = 'failed';
        continue;
      }
      entry.pendingChannelId = item.snippet.channelId;
      entry.pendingChannelTitle = item.snippet.channelTitle || '';
      entry.viewCount = asCount(item.statistics?.viewCount);
      const published = Date.parse(item.snippet.publishedAt || '') || publishedTime(entry.video);
      if (published) entry.ageDays = (nowMs - published) / (24 * 60 * 60 * 1000);
      const cachedChannel = channelCache[entry.pendingChannelId];
      if (usableChannel(cachedChannel, nowMs, maxAgeMs)) {
        entry.api = 'ok';
        entry.channel = {
          id: entry.pendingChannelId,
          title: cachedChannel.title || entry.pendingChannelTitle,
          subscriberCount: cachedChannel.subscriberCount,
          hidden: cachedChannel.hidden === true,
          videoCount: cachedChannel.videoCount,
        };
        stats.apiVerified += 1;
        stats.cacheHits += 1;
      } else {
        channelIds.add(entry.pendingChannelId);
      }
    }

    const channelResult = channelIds.size > 0
      ? await fetchKind('channels', [...channelIds])
      : { items: new Map(), failed: new Set() };

    for (const entry of needsVideoLookup) {
      if (entry.api === 'ok' || entry.api === 'failed' || !entry.pendingChannelId) continue;
      if (channelResult.failed.has(entry.pendingChannelId)) {
        entry.api = 'failed';
        continue;
      }
      const item = channelResult.items.get(entry.pendingChannelId);
      if (!item) {
        entry.api = 'failed';
        continue;
      }
      const hidden = item.statistics?.hiddenSubscriberCount === true;
      const subscriberCount = hidden ? null : asCount(item.statistics?.subscriberCount);
      const record = {
        title: item.snippet?.title || entry.pendingChannelTitle || '',
        subscriberCount,
        hidden,
        videoCount: asCount(item.statistics?.videoCount),
        fetchedAt: now.toISOString(),
      };
      channelCache[entry.pendingChannelId] = record;
      entry.api = 'ok';
      entry.channel = { id: entry.pendingChannelId, ...record };
      stats.apiVerified += 1;
    }
    const failedLookups = videoResult.failed.size + channelResult.failed.size;
    if (quota && stats.apiVerified > 0) apiState = 'partial';
    else if (quota) apiState = 'quota';
    else if (failedLookups > 0) apiState = stats.apiVerified > 0 ? 'partial' : 'unavailable';
    else apiState = 'ok';
  }

  const nextVideoCache = {};
  const published = [];
  for (const entry of entries) {
    const previouslyPublished = previous.has(entry.video?.url);
    const decision = decideVideo(entry, { config, allowlist, previouslyPublished });
    if (decision.reasons?.includes('preserved')) stats.preserved += 1;
    if (decision.decision === 'publish') {
      published.push(entry.video);
      stats.publish += 1;
    } else if (decision.decision === 'hold') {
      stats.hold += 1;
    } else {
      stats.reject += 1;
    }
    if (entry.videoId) {
      nextVideoCache[entry.videoId] = {
        contentHash: entry.hash,
        channelId: entry.channel?.id || entry.pendingChannelId || previousVideoCache[entry.videoId]?.channelId || null,
        viewCount: entry.viewCount,
        decision: decision.decision,
        reasons: decision.reasons,
        score: decision.score ?? entry.localScore,
        policyVersion: POLICY_VERSION,
      };
    }
  }

  return {
    videos: published,
    cache: { policyVersion: POLICY_VERSION, channels: channelCache, videos: nextVideoCache },
    stats,
    apiState,
  };
}
