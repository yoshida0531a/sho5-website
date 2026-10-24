import { ARCHIVE_FETCH_CONCURRENCY, feedPaths, jstDateKey, mapInOrder, mergePublic, readJson, itemId } from './daily-feed.js?v=20261025-feed';
import { messageFor } from './public-feed.js';

function errorKind(response) {
  if (response.network) return 'network';
  if (response.failed || response.status === 404) return 'server';
  if (response.corrupt) return 'corrupt';
  return null;
}

// A prepared notification release defines the initial view. During migration,
// the existing published timeline remains available until the first release.
// Only approved public files/API responses are read, never raw/private data.
export async function loadPublishedFeed(fetchImpl, feed, now = new Date(), { onItems, batch } = {}) {
  if (batch && !/^[a-f0-9-]{36}$/.test(batch)) return {kind:'corrupt',items:[],requests:[],message:'通知リンクが正しくありません。'};
  const paths = feedPaths(feed);
  const today = jstDateKey(now);
  const releaseUrl = `${paths.index.replace(/\/(x|youtube|bluesky)\/index\.json$/, '')}/notification${batch && /^[a-f0-9-]{36}$/.test(batch) ? `/${batch}` : ''}.json`;
  const releaseResponse = await readJson(fetchImpl, releaseUrl);
  const release = !errorKind(releaseResponse) && releaseResponse.data?.version === 1
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(releaseResponse.data.id || '')
    && (!batch || releaseResponse.data.id === batch)
    && Array.isArray(releaseResponse.data?.items?.[feed])
    && Number.isFinite(Date.parse(releaseResponse.data.cutoff))
    && releaseResponse.data.items[feed].every(item => itemId(feed,item))
    && new Set(releaseResponse.data.items[feed].map(item => itemId(feed,item))).size === releaseResponse.data.items[feed].length
    ? releaseResponse.data : null;
  // A missing initial head is the only migration fallback. An outage or
  // corrupt release must not silently show a different set than LINE.
  if (!release && (batch || feed === 'bluesky' || releaseResponse.status !== 404)) return {kind:'server',items:[],requests:[releaseUrl],message:'公開済みの投稿を確認できませんでした。時間をおいて再読み込みしてください。'};
  if (release) onItems?.(release.items[feed],{release,currentIds:release.items[feed].map(item=>itemId(feed,item))});
  const requests = [releaseUrl, paths.archive, paths.index, paths.day(today)].filter(Boolean);
  const [archive, index, current] = await Promise.all([
    (paths.archive ? readJson(fetchImpl, paths.archive) : Promise.resolve({status:200,data:[]})).then(result => {
      // Preserve the fast static content path even while the live API loads.
      if (!batch && !release && !errorKind(result) && Array.isArray(result.data) && result.data.length) onItems?.(result.data);
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
  if (release) groups.push(release.items[feed]);
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
  const cycle = release ? {
    release,
    currentIds: release.items[feed].map(item => itemId(feed, item)),
  } : {};
  if (batch && !release) return {kind:'server',items:[],requests,message:'通知の公開分を取得できませんでした。時間をおいて再読み込みしてください。'};
  if (errors.length) {
    return {
      ...cycle, kind: items.length ? 'partial' : errors[0], items, requests,
      message: items.length ? '一部の更新を読み込めませんでした。取得できた公開済みの内容を表示しています。' : messageFor(feed, errors[0]),
    };
  }
  return { ...cycle, kind: items.length ? 'ready' : 'empty', items, requests, message: items.length ? '' : messageFor(feed, 'empty') };
}
