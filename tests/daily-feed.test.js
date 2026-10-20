import assert from 'node:assert/strict';
import test from 'node:test';
import { TODAY_EMPTY, initialRequest, jstDateKey, loadArchiveFeed, loadTodayFeed, once } from '../js/daily-feed.js';

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
  assert.equal(initialRequest('x', new Date('2026-10-19T15:00:00.000Z')), 'data/x-daily/2026-10-20.json');
  assert.equal(initialRequest('youtube', new Date('2026-10-19T14:59:00.000Z')), 'data/youtube-daily/2026-10-19.json');
});

test('the first view loads only today and shows the empty message', async () => {
  const missing = mockFetch({
    'data/x-daily/2026-10-20.json': { status: 404, body: '' },
  });
  const now = new Date('2026-10-19T16:00:00.000Z');
  const result = await loadTodayFeed(missing.impl, 'x', now);
  assert.equal(result.kind, 'empty');
  assert.equal(result.message, TODAY_EMPTY.x);
  assert.equal(result.message, '今日の投稿はまだありません');
  assert.deepEqual(result.requests, ['data/x-daily/2026-10-20.json']);
  assert.deepEqual(missing.calls, ['data/x-daily/2026-10-20.json']);

  const empty = mockFetch({
    'data/youtube-daily/2026-10-20.json': { status: 200, body: '[]' },
  });
  const videos = await loadTodayFeed(empty.impl, 'youtube', now);
  assert.equal(videos.message, '今日の動画はまだありません');
  assert.deepEqual(empty.calls, ['data/youtube-daily/2026-10-20.json']);
});

test('today renders the daily file and does not fall back to raw data', async () => {
  const posted = mockFetch({
    'data/x-daily/2026-10-20.json': {
      status: 200,
      body: JSON.stringify([{ tweetUrl: 'https://x.com/fan/status/2113000000000000000', text: '谷端がんばれ', userName: 'fan' }]),
    },
  });
  const result = await loadTodayFeed(posted.impl, 'x', new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.kind, 'ready');
  assert.equal(result.items.length, 1);
  assert.deepEqual(posted.calls, ['data/x-daily/2026-10-20.json']);
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
    'data/x-daily/index.json': { status: 200, body: JSON.stringify({ version: 1, dates: ['2026-10-19', '2026-10-20'] }) },
    'data/x-daily/2026-10-19.json': {
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
    'data/x-daily/index.json',
    'data/x-daily/2026-10-19.json',
  ]);
  assert.equal(past.calls.some((url) => url.includes('x-data.txt')), false);
  assert.equal(past.calls.includes('data/x-daily/2026-10-20.json'), false);
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

test('a corrupt archive is not replaced with raw posts', async () => {
  const broken = mockFetch({
    'data/youtube-public.json': { status: 200, body: '{not json' },
    'data/youtube-daily/index.json': { status: 200, body: JSON.stringify({ version: 1, dates: [] }) },
  });
  const result = await loadArchiveFeed(broken.impl, 'youtube', new Date('2026-10-20T00:00:00.000Z'));
  assert.equal(result.kind, 'corrupt');
  assert.deepEqual(result.items, []);
});
