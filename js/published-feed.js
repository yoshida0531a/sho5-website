import { ARCHIVE_FETCH_CONCURRENCY, feedPaths, jstDateKey, mapInOrder, mergePublic, readJson, itemId } from './daily-feed.js?v=20261102-timeline';
import { messageFor } from './public-feed.js';

function errorKind(response) {
  if (response.network) return 'network';
  if (response.failed || response.status === 404) return 'server';
  if (response.corrupt) return 'corrupt';
  return null;
}

// Normal pages show the approved timeline. Only an explicit batch link pins
// the initial view to a notification; LINE availability must not hide history.
// Only approved public files/API responses are read, never raw/private data.
export async function loadPublishedFeed(fetchImpl, feed, now = new Date(), { onItems, batch } = {}) {
  if (batch && !/^[a-f0-9-]{36}$/.test(batch)) return {kind:'corrupt',items:[],requests:[],message:'通知リンクが正しくありません。'};
  const paths = feedPaths(feed);
  const normalX = feed === 'x' && !batch;
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
  // Pinned links fail closed. Normal pages can still use approved public files
  // during a notification API outage, with a visible partial-result message.
  if (!release && !batch && feed === 'bluesky' && releaseResponse.status === 404) {
    // Only the independently selected public migration snapshot is allowed.
    // Never query live Bluesky or use the old unselected public snapshot.
    const archiveUrl = 'data/bluesky-selected-bootstrap.json';
    const archive = await readJson(fetchImpl, archiveUrl);
    if (!errorKind(archive) && archive.data?.version === 1 && archive.data.selection === 'notification-cycle-v1'
      && Array.isArray(archive.data.posts) && archive.data.posts.every(item => itemId(feed, item))) {
      const items = mergePublic(feed, [archive.data.posts]);
      return {kind:items.length?'ready':'empty',items,requests:[releaseUrl,archiveUrl],message:''};
    }
    return {kind:'server',items:[],requests:[releaseUrl,archiveUrl],message:messageFor(feed,'server')};
  }
  if (!release && batch) return {kind:'server',items:[],requests:[releaseUrl],message:'公開済みの投稿を確認できませんでした。時間をおいて再読み込みしてください。'};
  if (release && !normalX) onItems?.(release.items[feed],{release,currentIds:release.items[feed].map(item=>itemId(feed,item))});
  const requests = [releaseUrl, paths.archive, paths.index, paths.day(today)].filter(Boolean);
  const [archive, index, current] = await Promise.all([
    (paths.archive ? readJson(fetchImpl, paths.archive) : Promise.resolve({status:200,data:[]})).then(result => {
      // Preserve the fast static content path even while the live API loads.
      if (!normalX && !batch && !release && !errorKind(result) && Array.isArray(result.data) && result.data.length) onItems?.(result.data);
      return result;
    }),
    readJson(fetchImpl, paths.index),
    readJson(fetchImpl, paths.day(today)),
  ]);
  const groups = [];
  const errors = [];
  // On the normal X page, notification/archive copies after AI activation are
  // not publication authority. Wait for the index before rendering those copies.
  function legacyItems(items) {
    if (!normalX) return items;
    if (errorKind(index) || !Array.isArray(index.data?.dates)) return [];
    const selection = index.data.selection;
    if (!selection) return items;
    const start = Date.parse(selection.startAt);
    if (selection.kind !== 'gemma-x-v1' || !Number.isFinite(start)) { errors.push('corrupt'); return []; }
    return items.filter(item => {
      try { return Number((BigInt(itemId('x',item)) >> 22n) + 1288834974657n) < start; }
      catch { return false; }
    });
  }
  if (!release && releaseResponse.status !== 404) errors.push(errorKind(releaseResponse) || 'corrupt');
  function collect(response) {
    const error = errorKind(response) || (!Array.isArray(response.data) ? 'corrupt' : null);
    if (error) errors.push(error);
    else groups.push(response.data);
  }
  // A recent version of a duplicate item takes precedence over the archive.
  if (release) groups.push(legacyItems(release.items[feed]));
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
  collect(Array.isArray(archive.data) ? {...archive,data:legacyItems(archive.data)} : archive);
  const items = mergePublic(feed, groups);
  const cycle = release ? {
    release,
    currentIds: legacyItems(release.items[feed]).map(item => itemId(feed, item)),
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
