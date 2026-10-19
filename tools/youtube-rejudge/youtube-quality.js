import { parseFeedStatus } from './feed-status.js';
import { sha256Hex } from './sha256.js';
import { extractYouTubeId } from './safe-url.js';

export const POLICY_VERSION = 1;
export const DEFAULTS = {
  minSubscribers: 1000,
  maxRetries: 2,
  retryBaseMs: 400,
  batchSize: 50,
};

export function contentHash(video) {
  const title = String(video?.title ?? '');
  const description = String(video?.description ?? '');
  return sha256Hex(`${title}\n${description}`);
}

function asCount(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function decideVideo(entry, config = DEFAULTS) {
  const minSubscribers = config.minSubscribers ?? DEFAULTS.minSubscribers;
  if (!entry.videoId) return { decision: 'reject', reasons: ['invalid_url'] };
  if (entry.duplicate) return { decision: 'reject', reasons: ['duplicate'] };
  if (entry.kept) return { decision: 'publish', reasons: ['already_public'] };
  if (entry.cachedDecision === 'publish' || entry.cachedDecision === 'reject') {
    return { decision: entry.cachedDecision, reasons: entry.cachedReasons || ['cached'] };
  }
  if (entry.api === 'ok') {
    const count = entry.channel?.subscriberCount;
    if (entry.channel?.hidden || count == null || Number.isNaN(count)) {
      return { decision: 'reject', reasons: ['subscribers_unavailable'] };
    }
    if (count >= minSubscribers) return { decision: 'publish', reasons: ['subscribers'] };
    return { decision: 'reject', reasons: ['below_subscriber_bar'] };
  }
  if (entry.api === 'absent') return { decision: 'reject', reasons: ['video_unavailable'] };
  return { decision: 'hold', reasons: ['unverified'] };
}

function chunk(ids, size) {
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
      let parsed = false;
      try {
        body = await response.json();
        parsed = true;
      } catch {
        body = null;
      }
      if (response.ok) {
        // A 2xx response that is not a JSON object is not a list of videos or channels.
        if (!parsed || !body || typeof body !== 'object' || Array.isArray(body)) {
          return { ok: false, status: response.status, requests: attempt + 1 };
        }
        return { ok: true, body, requests: attempt + 1 };
      }
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
    part: kind === 'videos' ? 'snippet' : 'statistics',
    id: ids.join(','),
    fields: kind === 'videos'
      ? 'items(id,snippet(channelId))'
      : 'items(id,statistics(subscriberCount,hiddenSubscriberCount))',
    key: apiKey,
  });
  return `https://www.googleapis.com/youtube/v3/${kind}?${params.toString()}`;
}

function finalCached(entry, hash) {
  if (!entry || entry.contentHash !== hash) return null;
  if (entry.decision !== 'publish' && entry.decision !== 'reject') return null;
  return entry;
}

export async function curateYouTube(videos, options = {}) {
  const source = Array.isArray(videos) ? videos : [];
  const config = { ...DEFAULTS, ...options.config };
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (async () => {});
  const apiKey = options.apiKey || '';
  const previous = new Set((options.existingPublic || []).map((video) => video?.url).filter(Boolean));
  const cache = options.cache && typeof options.cache === 'object'
    ? options.cache
    : { channels: {}, videos: {} };
  const previousVideoCache = cache.videos || {};
  const seenUrls = new Set(previous);
  const maxNewLookups = Number.isInteger(options.maxNewLookups) && options.maxNewLookups >= 0
    ? options.maxNewLookups
    : Number.POSITIVE_INFINITY;

  const entries = source.map((video) => ({
    video,
    videoId: extractYouTubeId(video?.url),
    hash: contentHash(video),
    api: 'not_requested',
    channel: null,
    deferred: false,
    duplicate: false,
    kept: false,
  }));

  const stats = {
    total: source.length,
    publish: 0,
    reject: 0,
    hold: 0,
    cacheHits: 0,
    requests: 0,
    apiVerified: 0,
    deferred: 0,
  };
  let apiState = apiKey ? 'ok' : 'unavailable';
  let quota = false;
  const needsVideoLookup = [];

  for (const entry of entries) {
    if (!entry.videoId) continue;
    const url = entry.video?.url;
    if (url && seenUrls.has(url)) {
      entry.kept = previous.has(url);
      entry.duplicate = !entry.kept;
      continue;
    }
    if (url) seenUrls.add(url);
    const cached = finalCached(previousVideoCache[entry.videoId], entry.hash);
    if (cached) {
      entry.cachedDecision = cached.decision;
      entry.cachedReasons = cached.reasons;
      stats.cacheHits += 1;
      continue;
    }
    if (!apiKey || needsVideoLookup.length >= maxNewLookups) {
      if (apiKey) {
        entry.deferred = true;
        stats.deferred += 1;
      }
      continue;
    }
    needsVideoLookup.push(entry);
  }

  async function fetchKind(kind, ids) {
    const items = new Map();
    const failed = new Set();
    const absent = new Set();
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
      if (result?.quota) {
        quota = true;
        group.forEach((id) => failed.add(id));
        continue;
      }
      if (!result?.ok || !Array.isArray(result.body?.items)) {
        group.forEach((id) => failed.add(id));
        continue;
      }
      const found = new Set();
      for (const item of result.body.items) {
        if (item?.id) {
          items.set(item.id, item);
          found.add(item.id);
        }
      }
      group.forEach((id) => {
        if (!found.has(id)) absent.add(id);
      });
      if (sleep) await sleep(options.batchDelayMs || 0);
    }
    return { items, failed, absent };
  }

  if (apiKey && needsVideoLookup.length > 0) {
    const videoResult = await fetchKind('videos', needsVideoLookup.map((entry) => entry.videoId));
    const channelIds = new Set();
    for (const entry of needsVideoLookup) {
      if (videoResult.failed.has(entry.videoId)) {
        entry.api = 'failed';
        continue;
      }
      if (videoResult.absent.has(entry.videoId)) {
        entry.api = 'absent';
        continue;
      }
      const channelId = videoResult.items.get(entry.videoId)?.snippet?.channelId;
      if (!channelId) {
        entry.api = 'absent';
        continue;
      }
      entry.pendingChannelId = channelId;
      channelIds.add(channelId);
    }

    const channelResult = channelIds.size > 0
      ? await fetchKind('channels', [...channelIds])
      : { items: new Map(), failed: new Set(), absent: new Set() };

    for (const entry of needsVideoLookup) {
      if (entry.api === 'failed' || entry.api === 'absent' || !entry.pendingChannelId) continue;
      if (channelResult.failed.has(entry.pendingChannelId)) {
        entry.api = 'failed';
        continue;
      }
      const item = channelResult.items.get(entry.pendingChannelId);
      if (!item) {
        entry.api = 'ok';
        entry.channel = { id: entry.pendingChannelId, subscriberCount: null, hidden: false };
        continue;
      }
      const hidden = item.statistics?.hiddenSubscriberCount === true;
      entry.api = 'ok';
      entry.channel = {
        id: entry.pendingChannelId,
        subscriberCount: hidden ? null : asCount(item.statistics?.subscriberCount),
        hidden,
      };
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
    if (entry.deferred) continue;
    const decision = decideVideo(entry, config);
    if (decision.decision === 'publish') {
      published.push(entry.video);
      stats.publish += 1;
    } else if (decision.decision === 'hold') {
      stats.hold += 1;
    } else {
      stats.reject += 1;
    }
    if (!entry.videoId) continue;
    nextVideoCache[entry.videoId] = {
      contentHash: entry.hash,
      channelId: entry.channel?.id || entry.pendingChannelId || previousVideoCache[entry.videoId]?.channelId || null,
      subscriberCount: entry.channel?.subscriberCount ?? previousVideoCache[entry.videoId]?.subscriberCount ?? null,
      decision: decision.decision,
      reasons: decision.reasons,
      policyVersion: POLICY_VERSION,
    };
  }

  return {
    videos: published,
    cache: { policyVersion: POLICY_VERSION, channels: {}, videos: nextVideoCache },
    stats,
    apiState,
  };
}

function tallyReason(decision, reason) {
  if (decision === 'publish' && reason === 'subscribers') return 'publish';
  if (decision === 'reject' && reason === 'below_subscriber_bar') return 'belowSubscriberBar';
  if (decision === 'reject' && reason === 'subscribers_unavailable') return 'subscribersUnavailable';
  if (decision === 'reject' && reason === 'video_unavailable') return 'videoUnavailable';
  if (decision === 'hold') return 'unverified';
  return 'other';
}

// Judge every supplied video with the live subscriber rule. Existing public
// membership and the judgment cache do not skip the API.
export async function rejudgeYouTubePublic(videos, options = {}) {
  const source = Array.isArray(videos) ? videos : [];
  const ids = source.map((video) => extractYouTubeId(video?.url) || '');
  const urls = source.map((video) => (typeof video?.url === 'string' ? video.url : ''));
  const duplicateIds = ids.filter((id, index) => id && ids.indexOf(id) !== index);
  const duplicateUrls = urls.filter((url, index) => url && urls.indexOf(url) !== index);
  const identityOk = duplicateIds.length === 0 && duplicateUrls.length === 0 && ids.every(Boolean);
  const emptyCounts = {
    input: source.length,
    publish: 0,
    belowSubscriberBar: 0,
    subscribersUnavailable: 0,
    videoUnavailable: 0,
    unverified: 0,
    other: identityOk ? 0 : source.length,
  };
  if (!identityOk) {
    return {
      complete: false,
      counts: emptyCounts,
      decisions: [],
      excluded: [],
      published: null,
      apiState: 'unavailable',
      duplicateIds: [...new Set(duplicateIds)],
      duplicateUrls: [...new Set(duplicateUrls)],
    };
  }

  const result = await curateYouTube(source, {
    ...options,
    existingPublic: [],
    cache: { channels: {}, videos: {} },
    maxNewLookups: Number.POSITIVE_INFINITY,
  });
  const counts = { ...emptyCounts, other: 0 };
  const decisions = source.map((video, index) => {
    const cached = result.cache.videos[ids[index]];
    const decision = cached?.decision || 'hold';
    const reason = cached?.reasons?.[0] || 'unverified';
    counts[tallyReason(decision, reason)] += 1;
    return { index, videoId: ids[index], url: urls[index], decision, reason };
  });
  const decided = counts.publish + counts.belowSubscriberBar
    + counts.subscribersUnavailable + counts.videoUnavailable;
  const complete = decided === source.length && counts.unverified === 0 && counts.other === 0;
  const publishedUrls = result.videos.map((video) => video.url);
  const expectedUrls = decisions.filter((row) => row.decision === 'publish').map((row) => row.url);
  const orderPreserved = publishedUrls.length === expectedUrls.length
    && publishedUrls.every((url, index) => url === expectedUrls[index]);
  return {
    complete: complete && orderPreserved,
    counts,
    decisions,
    excluded: decisions.filter((row) => row.decision === 'reject').map((row) => ({
      url: row.url,
      reason: row.reason,
    })),
    published: complete && orderPreserved ? result.videos : null,
    apiState: result.apiState,
    duplicateIds: [],
    duplicateUrls: [],
  };
}

export function applyYouTubeRejudge(videos, status, plan) {
  if (!plan?.complete || !Array.isArray(plan.published)) return null;
  if (plan.counts?.input !== videos.length) return null;
  const counted = plan.counts.publish + plan.counts.belowSubscriberBar
    + plan.counts.subscribersUnavailable + plan.counts.videoUnavailable
    + plan.counts.unverified + plan.counts.other;
  if (counted !== videos.length || plan.counts.unverified !== 0 || plan.counts.other !== 0) return null;
  const current = parseFeedStatus(status);
  return {
    videos: plan.published,
    status: parseFeedStatus({
      ...current,
      youtube: {
        state: 'published',
        count: plan.published.length,
        historyCount: videos.length,
      },
    }),
  };
}
