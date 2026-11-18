import { ARCHIVE_FETCH_CONCURRENCY, feedPaths, jstDateKey, mapInOrder, mergePublic, readJson, itemId } from './daily-feed.js?v=20261102-timeline';
import { messageFor } from './public-feed.js';

function errorKind(response) {
  if (response.network) return 'network';
  if (response.failed || response.status === 404) return 'server';
  if (response.corrupt) return 'corrupt';
  return null;
}

// Staged loading for the normal X page only. Stage 1 fetches the index and
// the two most recent day files and renders them immediately (the default
// view only ever shows the newest day plus the previous day). Stage 2 then
// loads everything the original full load loaded — notification/release,
// archive and every remaining day file, reusing the stage-1 responses — and
// returns the same result shape, so the caller replaces the early view with
// the complete one. If the index cannot be read or is invalid, stage 1 is
// skipped and stage 2 reproduces the original error semantics exactly.
async function loadNormalXFeed(fetchImpl, { paths, today, release, releaseResponse, releaseUrl, onItems }) {
  const feed = 'x';
  const errors = [];
  if (!release && releaseResponse.status !== 404) errors.push(errorKind(releaseResponse) || 'corrupt');

  // Stage 1: index + the most recent day files only.
  const index = await readJson(fetchImpl, paths.index);
  const indexError = errorKind(index);
  const datesValid = !indexError && Array.isArray(index.data?.dates)
    && index.data.dates.every(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day));
  const sortedDates = datesValid ? [...new Set(index.data.dates)].sort().reverse() : [];
  const dayResponses = new Map();
  if (datesValid) {
    const recentDates = sortedDates.slice(0, 2);
    if (!recentDates.includes(today)) recentDates.push(today);
    recentDates.sort().reverse();
    const fetched = await Promise.all(recentDates.map(day => readJson(fetchImpl, paths.day(day))));
    recentDates.forEach((day, i) => dayResponses.set(day, fetched[i]));
    const stagedResponses = recentDates.map(day => dayResponses.get(day));
    const staged = mergePublic(feed, stagedResponses
      .filter(response => Array.isArray(response.data))
      .map(response => response.data));
    if (staged.length) {
      // The stage-1 view carries no message: the caller only reveals a
      // past-loading note if the reader asks for older posts while the
      // background load is still running (signalled by the loading flag).
      onItems?.(staged, { message: '', loading: true });
    } else if (stagedResponses.every(response => !errorKind(response) && Array.isArray(response.data))) {
      // A genuine zero: every stage-1 fetch succeeded and the recent days
      // simply hold no posts. Say so right away instead of leaving the
      // generic loading text up; stage 2 still replaces this view with the
      // full history (and its final message) when it completes. A failed
      // fetch is NOT 'no posts', so error responses stay silent here and
      // stage 2 reproduces the original error semantics.
      onItems?.([], { message: '直近の投稿はありませんでした。', loading: true });
    }
  }

  // Stage 2: the full load, reusing every response stage 1 already fetched.
  const requests = [releaseUrl, paths.archive, paths.index, paths.day(today)].filter(Boolean);
  const [archive, current] = await Promise.all([
    paths.archive ? readJson(fetchImpl, paths.archive) : Promise.resolve({ status: 200, data: [] }),
    dayResponses.has(today) ? dayResponses.get(today) : readJson(fetchImpl, paths.day(today)),
  ]);
  const groups = [];
  // On the normal X page, notification/archive copies after AI activation are
  // not publication authority. The Gemma selection in the index decides which
  // of those copies may be shown (only posts older than selection.startAt).
  function legacyItems(items) {
    if (indexError || !Array.isArray(index.data?.dates)) return [];
    const selection = index.data.selection;
    if (!selection) return items;
    const start = Date.parse(selection.startAt);
    if (selection.kind !== 'gemma-x-v1' || !Number.isFinite(start)) { errors.push('corrupt'); return []; }
    return items.filter(item => {
      try { return Number((BigInt(itemId('x', item)) >> 22n) + 1288834974657n) < start; }
      catch { return false; }
    });
  }
  function collect(response) {
    const error = errorKind(response) || (!Array.isArray(response.data) ? 'corrupt' : null);
    if (error) errors.push(error);
    else groups.push(response.data);
  }
  // A recent version of a duplicate item takes precedence over the archive.
  if (release) groups.push(legacyItems(release.items[feed]));
  collect(current);
  if (indexError) errors.push(indexError);
  else if (!datesValid) errors.push('corrupt');
  else {
    const dates = sortedDates.filter(day => day !== today);
    requests.push(...dates.map(day => paths.day(day)));
    const days = await mapInOrder(dates, ARCHIVE_FETCH_CONCURRENCY, async day =>
      dayResponses.has(day) ? dayResponses.get(day) : readJson(fetchImpl, paths.day(day)));
    days.forEach(collect);
  }
  collect(Array.isArray(archive.data) ? { ...archive, data: legacyItems(archive.data) } : archive);
  const items = mergePublic(feed, groups);
  const cycle = release ? {
    release,
    currentIds: legacyItems(release.items[feed]).map(item => itemId(feed, item)),
  } : {};
  if (errors.length) {
    return {
      ...cycle, kind: items.length ? 'partial' : errors[0], items, requests,
      message: items.length ? '一部の更新を読み込めませんでした。取得できた公開済みの内容を表示しています。' : messageFor(feed, errors[0]),
    };
  }
  return { ...cycle, kind: items.length ? 'ready' : 'empty', items, requests, message: items.length ? '' : messageFor(feed, 'empty') };
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
  // The normal X page renders in two stages: recent posts first, the rest in
  // the background. Every other feed and pinned batch links keep the original
  // single-pass load below, unchanged.
  if (normalX) return loadNormalXFeed(fetchImpl, { paths, today, release, releaseResponse, releaseUrl, onItems });
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
