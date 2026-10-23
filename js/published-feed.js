import { ARCHIVE_FETCH_CONCURRENCY, feedPaths, jstDateKey, mapInOrder, mergePublic, readJson } from './daily-feed.js';
import { messageFor } from './public-feed.js';

function errorKind(response) {
  if (response.network) return 'network';
  if (response.failed || response.status === 404) return 'server';
  if (response.corrupt) return 'corrupt';
  return null;
}

// The first view is the published timeline, anchored on its newest available
// post. An empty calendar day must not hide existing text behind a button.
// Only approved public files/API responses are read, never raw/private data.
export async function loadPublishedFeed(fetchImpl, feed, now = new Date(), { onItems } = {}) {
  const paths = feedPaths(feed);
  const today = jstDateKey(now);
  const requests = [paths.archive, paths.index, paths.day(today)];
  const [archive, index, current] = await Promise.all([
    readJson(fetchImpl, paths.archive).then(result => {
      // Preserve the fast static content path even while the live API loads.
      if (!errorKind(result) && Array.isArray(result.data) && result.data.length) onItems?.(result.data);
      return result;
    }),
    readJson(fetchImpl, paths.index),
    readJson(fetchImpl, paths.day(today)),
  ]);
  const groups = [];
  const errors = [];
  function collect(response) {
    const error = errorKind(response) || (!Array.isArray(response.data) ? 'corrupt' : null);
    if (error) errors.push(error);
    else groups.push(response.data);
  }
  // A recent version of a duplicate item takes precedence over the archive.
  collect(current);
  const indexError = errorKind(index);
  if (indexError) errors.push(indexError);
  else if (!Array.isArray(index.data?.dates) || index.data.dates.some(day => typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))) errors.push('corrupt');
  else {
    const dates = [...new Set(index.data.dates)].filter(day => day !== today).sort().reverse();
    const urls = dates.map(day => paths.day(day));
    requests.push(...urls);
    const days = await mapInOrder(urls, ARCHIVE_FETCH_CONCURRENCY, url => readJson(fetchImpl, url));
    days.forEach(collect);
  }
  collect(archive);
  const items = mergePublic(feed, groups);
  if (errors.length) {
    return {
      kind: items.length ? 'partial' : errors[0], items, requests,
      message: items.length ? '一部の更新を読み込めませんでした。取得できた公開済みの内容を表示しています。' : messageFor(feed, errors[0]),
    };
  }
  return { kind: items.length ? 'ready' : 'empty', items, requests, message: items.length ? '' : messageFor(feed, 'empty') };
}
