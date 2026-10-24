import { messageFor } from './public-feed.js';

export const TODAY_EMPTY = {
  x: '今日の投稿はまだありません',
  youtube: '今日の動画はまだありません',
};

const BLOCKED = ['x-data.txt', 'YouTube-data.txt', 'x-unjudged', 'incremental-feed.json', 'incremental-state'];

export const ARCHIVE_FETCH_CONCURRENCY = 4;
export const FEED_API = 'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds';

export function jstDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function feedPaths(feed) {
  const key = ['youtube','bluesky'].includes(feed) ? feed : 'x';
  return {
    archive: key === 'bluesky' ? null : key === 'youtube' ? 'data/youtube-public.json' : 'data/x-public.json',
    index: `${FEED_API}/${key}/index.json`,
    day: (dateKey) => `${FEED_API}/${key}/${dateKey}.json`,
  };
}

export function once(task) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(task).catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}

export function initialRequest(feed, now = new Date()) {
  return feedPaths(feed).day(jstDateKey(now));
}

export function itemId(feed, item) {
  if (feed === 'bluesky') return /^https:\/\/bsky\.app\/profile\/did:[^/]+\/post\/[A-Za-z0-9]+$/.test(item?.postUrl || '') ? item.postUrl : '';
  if (feed === 'youtube') {
    const match = String(item?.url || '').match(/[?&]v=([A-Za-z0-9_-]{11})/);
    return match ? match[1] : '';
  }
  const match = String(item?.tweetUrl || '').match(/status\/(\d+)/);
  return match ? match[1] : '';
}

function assertPublic(url) {
  if (BLOCKED.some((part) => String(url).includes(part))) {
    throw new Error(`public page refused ${url}`);
  }
}

export async function readJson(fetchImpl, url) {
  assertPublic(url);
  let response;
  try {
    response = await fetchImpl(url, {signal:AbortSignal.timeout(8000)});
  } catch {
    return { status: 0, data: null, network: true };
  }
  if (response.status === 404) return { status: 404, data: null };
  if (response.status >= 500 || response.status === 408 || response.status === 429 || response.status < 200 || response.status >= 300) {
    return { status: response.status, data: null, failed: true };
  }
  let text = '';
  try {
    text = await response.text();
  } catch {
    return { status: 0, data: null, network: true };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.items)) {
      return { status: response.status, data: parsed.items, processing: parsed.status };
    }
    return { status: response.status, data: parsed };
  } catch {
    return { status: response.status, data: null, corrupt: true };
  }
}

export async function loadTodayFeed(fetchImpl, feed, now = new Date()) {
  const url = initialRequest(feed, now);
  const response = await readJson(fetchImpl, url);
  if (response.network) return { kind: 'network', items: [], message: messageFor(feed, 'network'), requests: [url] };
  if (response.status === 404) return { kind: 'server', items: [], message: messageFor(feed, 'server'), requests: [url] };
  if (response.failed) return { kind: 'server', items: [], message: messageFor(feed, 'server'), requests: [url] };
  const processing = response.processing;
  if (response.status === 404 || (Array.isArray(response.data) && response.data.length === 0)) {
    return { kind: 'empty', items: [], message: TODAY_EMPTY[feed] || TODAY_EMPTY.x, processing, requests: [url] };
  }
  if (response.corrupt || !Array.isArray(response.data)) {
    return { kind: 'corrupt', items: [], message: messageFor(feed, 'corrupt'), requests: [url] };
  }
  return { kind: 'ready', items: response.data, message: '', processing, requests: [url] };
}

export function filterByQuery(feed, items, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const haystack = feed === 'youtube'
      ? `${item?.title || ''} ${item?.description || ''}`
      : `${item?.userName || ''} ${item?.text || ''}`;
    return haystack.toLowerCase().includes(needle);
  });
}

export async function mapInOrder(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function mergePublic(feed, groups) {
  const seen = new Set();
  const items = [];
  for (const group of groups) {
    for (const item of group || []) {
      const id = itemId(feed, item);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      items.push(item);
    }
  }
  return items;
}

export async function loadArchiveFeed(fetchImpl, feed, now = new Date()) {
  const paths = feedPaths(feed);
  const today = jstDateKey(now);
  const requests = [paths.archive, paths.index];
  const archiveResult = await readJson(fetchImpl, paths.archive);
  const indexResult = await readJson(fetchImpl, paths.index);
  if (indexResult.network || archiveResult.network) {
    return { kind: 'network', items: [], message: messageFor(feed, 'network'), requests };
  }
  if (indexResult.failed || archiveResult.failed) {
    return { kind: 'server', items: [], message: messageFor(feed, 'server'), requests };
  }
  if (indexResult.corrupt || (indexResult.data && !Array.isArray(indexResult.data?.dates) && indexResult.status !== 404)) {
    return { kind: 'corrupt', items: [], message: messageFor(feed, 'corrupt'), requests };
  }
  if (archiveResult.corrupt || (archiveResult.status !== 404 && !Array.isArray(archiveResult.data))) {
    return { kind: 'corrupt', items: [], message: messageFor(feed, 'corrupt'), requests };
  }
  const dates = (indexResult.data?.dates || []).filter((date) => date !== today);
  const groups = [Array.isArray(archiveResult.data) ? archiveResult.data : []];
  const dayUrls = dates.map((date) => paths.day(date));
  requests.push(...dayUrls);
  const days = await mapInOrder(dayUrls, ARCHIVE_FETCH_CONCURRENCY, (url) => readJson(fetchImpl, url));
  for (const day of days) {
    if (day.failed || day.network) {
      return { kind: day.network ? 'network' : 'server', items: [], message: messageFor(feed, day.network ? 'network' : 'server'), requests };
    }
    if (day.corrupt || (day.status !== 404 && !Array.isArray(day.data))) {
      return { kind: 'corrupt', items: [], message: messageFor(feed, 'corrupt'), requests };
    }
    if (Array.isArray(day.data)) groups.push(day.data);
  }
  return { kind: 'ready', items: mergePublic(feed, groups), message: '', requests };
}
