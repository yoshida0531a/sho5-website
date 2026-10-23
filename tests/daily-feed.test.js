import assert from 'node:assert/strict';
import test from 'node:test';
import { ARCHIVE_FETCH_CONCURRENCY, TODAY_EMPTY, filterByQuery, initialRequest, jstDateKey, loadArchiveFeed, loadTodayFeed, once } from '../js/daily-feed.js';

function mockFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    if (String(url).includes('x-data.txt') || String(url).includes('YouTube-data.txt')) {
      throw new Error(`blocked ${url}`);
    }
    const route = routes[url];
    if (!route) throw new Error(`unexpected ${url}`);
    if (route.throw) throw new Error('network');
    return {
      status: route.status,
      async text() {
        return route.body;
      },
    };
  };
  return { impl, calls };
}

test('today uses the Tokyo date and no historical file', () => {
  assert.equal(jstDateKey(new Date('2026-10-19T15:00:00.000Z')), '2026-10-20');
  assert.equal(initialRequest('x', new Date('2026-10-19T15:00:00.000Z')), 'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json');
  assert.equal(initialRequest('youtube', new Date('2026-10-19T14:59:00.000Z')), 'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/youtube/2026-10-19.json');
});

test('the first view loads only today and shows the empty message', async () => {
  const missing = mockFetch({
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json': { status: 200, body: '[]' },
  });
  const now = new Date('2026-10-19T16:00:00.000Z');
  const result = await loadTodayFeed(missing.impl, 'x', now);
  assert.equal(result.kind, 'empty');
  assert.equal(result.message, TODAY_EMPTY.x);
  assert.equal(result.message, '今日の投稿はまだありません');
  assert.deepEqual(result.requests, ['https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json']);
  assert.deepEqual(missing.calls, ['https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json']);

  const empty = mockFetch({
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/youtube/2026-10-20.json': { status: 200, body: '[]' },
  });
  const videos = await loadTodayFeed(empty.impl, 'youtube', now);
  assert.equal(videos.message, '今日の動画はまだありません');
  assert.deepEqual(empty.calls, ['https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/youtube/2026-10-20.json']);
});

test('today renders the daily file and does not fall back to raw data', async () => {
  const posted = mockFetch({
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json': {
      status: 200,
      body: JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/2113000000000000000', text: '谷端がんばれ', userName: 'fan' }]),
    },
  });
  const result = await loadTodayFeed(posted.impl, 'x', new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.kind, 'ready');
  assert.equal(result.items.length, 1);
  assert.deepEqual(posted.calls, ['https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json']);
});

test('past and search load the published archive, not the raw history', async () => {
  const routes = {
    'data/x-public.json': {
      status: 200,
      body: JSON.stringify([
        { tweetUrl: 'https://x.com/fan/status/10', text: '過去の公開', userName: 'old' },
        { tweetUrl: 'https://x.com/fan/status/11', text: '検索対象', userName: 'old' },
      ]),
    },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/index.json': { status: 200, body: JSON.stringify({ version: 1, dates: ['2026-10-19', '2026-10-20'] }) },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-19.json': {
      status: 200,
      body: JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/12', text: '昨日の公開', userName: 'new' }]),
    },
  };
  const past = mockFetch(routes);
  const now = new Date('2026-10-20T01:00:00.000Z');
  const result = await loadArchiveFeed(past.impl, 'x', now);
  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.items.map((item) => item.text), ['過去の公開', '検索対象', '昨日の公開']);
  assert.deepEqual(past.calls, [
    'data/x-public.json',
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/index.json',
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-19.json',
  ]);
  assert.equal(past.calls.some((url) => url.includes('x-data.txt')), false);
  assert.equal(past.calls.includes('https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json'), false);
});

test('overlapping searches share one archive load', async () => {
  let calls = 0;
  const load = once(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return calls;
  });
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(calls, 1);
});

test('search across days keeps archive order and does not load raw files', async () => {
  const routes = {
    'data/x-public.json': {
      status: 200,
      body: JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/10', text: '公開の谷端', userName: 'old' }]),
    },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/index.json': {
      status: 200,
      body: JSON.stringify({ version: 1, dates: ['2026-10-18', '2026-10-19', '2026-10-20'] }),
    },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-18.json': {
      status: 200,
      body: JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/18', text: '十八日の谷端', userName: 'day' }]),
    },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-19.json': {
      status: 200,
      body: JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/19', text: '別の話題', userName: 'day' }]),
    },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json': { status: 200, body: '[]' },
  };
  const past = mockFetch(routes);
  const now = new Date('2026-10-20T01:00:00.000Z');
  const today = await loadTodayFeed(past.impl, 'x', now);
  assert.deepEqual(today.requests, ['https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json']);
  const result = await loadArchiveFeed(past.impl, 'x', now);
  const found = filterByQuery('x', result.items, '谷端');
  assert.deepEqual(found.map((item) => item.text), ['公開の谷端', '十八日の谷端']);
  assert.equal(past.calls.includes('x-data.txt'), false);
  assert.equal(past.calls.includes('https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json'), true);
  assert.equal(past.calls.filter((url) => url === 'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-20.json').length, 1);
});

test('older day files load together without waiting for every file in series', async () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
  let inFlight = 0;
  let maxInFlight = 0;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes('x-data.txt')) throw new Error('blocked');
    if (url === 'data/x-public.json') {
      return { status: 200, async text() { return JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/1', text: '履歴', userName: 'old' }]); } };
    }
    if (url === 'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/index.json') {
      return { status: 200, async text() { return JSON.stringify({ version: 1, dates }); } };
    }
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 30));
    inFlight -= 1;
    const day = url.match(/(\d{4}-\d{2}-\d{2})/)[1];
    return { status: 200, async text() { return JSON.stringify([{ tweetUrl: `https://x.com/fan/status/${day.replaceAll('-', '')}`, text: day, userName: 'day' }]); } };
  };
  const started = performance.now();
  const result = await loadArchiveFeed(fetchImpl, 'x', new Date('2026-10-20T00:00:00.000Z'));
  const elapsed = performance.now() - started;
  assert.deepEqual(result.items.map((item) => item.text), ['履歴', ...dates]);
  assert.ok(maxInFlight > 1 && maxInFlight <= ARCHIVE_FETCH_CONCURRENCY);
  assert.ok(elapsed < dates.length * 30, `elapsed ${elapsed}`);
  assert.equal(calls.includes('x-data.txt'), false);
});

test('a corrupt archive is not replaced with raw posts', async () => {
  const broken = mockFetch({
    'data/youtube-public.json': { status: 200, body: '{not json' },
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/youtube/index.json': { status: 200, body: JSON.stringify({ version: 1, dates: [] }) },
  });
  const result = await loadArchiveFeed(broken.impl, 'youtube', new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.kind, 'corrupt');
  assert.deepEqual(result.items, []);
});


test('a missing API route is an error, not an empty day', async () => {
  const api = mockFetch({
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-23.json': { status: 404, body: '' },
  });
  const result = await loadTodayFeed(api.impl, 'x', new Date('2026-10-23T00:00:00Z'));
  assert.equal(result.kind, 'server');
});

test('processing counters do not replace the content-facing empty message', async () => {
  const api = mockFetch({
    'https://twitter-to-line.chjqnfv62h.workers.dev/public-feeds/x/2026-10-23.json': {
      status: 200, body: JSON.stringify({ items: [], status: { received: 7, published: 0, rejected: 7, held: 0 } }),
    },
  });
  const result = await loadTodayFeed(api.impl, 'x', new Date('2026-10-23T00:00:00Z'));
  assert.equal(result.kind, 'empty');
  assert.equal(result.message, TODAY_EMPTY.x);
  assert.equal(result.processing.received, 7);
  assert.doesNotMatch(result.message, /受信|対象外|再試行/);
});
