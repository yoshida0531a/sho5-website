import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPublicFeed, messageFor } from '../js/public-feed.js';

function response(status, body) {
  return {
    status,
    async text() {
      return body;
    },
  };
}

function mockFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected ${url}`);
    if (route.throw) throw new Error('network');
    if (route.textThrows) {
      return {
        status: route.status,
        async text() {
          throw new Error('body');
        },
      };
    }
    return response(route.status, route.body);
  };
  return { impl, calls };
}

async function loadYouTube(routes) {
  const fetchImpl = mockFetch(routes);
  const result = await loadPublicFeed(
    fetchImpl.impl,
    'data/youtube-public.json',
    'data/feed-status.json',
    'youtube',
  );
  return { result, calls: fetchImpl.calls };
}

test('distinguishes a missing YouTube file from an empty published file', async () => {
  const notGenerated = await loadYouTube({
    'data/youtube-public.json': { status: 404, body: '' },
    'data/feed-status.json': {
      status: 200,
      body: JSON.stringify({ version: 1, youtube: { state: 'not_generated', count: 0 } }),
    },
  });
  assert.equal(notGenerated.result.kind, 'not_generated');
  assert.equal(notGenerated.result.message, messageFor('youtube', 'not_generated'));
  assert.equal(notGenerated.result.message, '公開用の動画はまだ作られていません。');

  const absentStatus = await loadYouTube({
    'data/youtube-public.json': { status: 404, body: '<html>404</html>' },
    'data/feed-status.json': { status: 404, body: '' },
  });
  assert.equal(absentStatus.result.kind, 'not_generated');

  const missing = await loadYouTube({
    'data/youtube-public.json': { status: 404, body: '' },
    'data/feed-status.json': {
      status: 200,
      body: JSON.stringify({ version: 1, youtube: { state: 'published', count: 3 } }),
    },
  });
  assert.equal(missing.result.kind, 'missing');
  assert.equal(missing.result.message, '公開用の動画ファイルが見つかりませんでした。');

  const empty = await loadYouTube({
    'data/youtube-public.json': { status: 200, body: '[]' },
  });
  assert.equal(empty.result.kind, 'empty');
  assert.equal(empty.result.message, 'いま公開できる動画はありません。');
  assert.deepEqual(empty.calls, ['data/youtube-public.json']);
});

test('distinguishes corrupt JSON, network failures, and server errors', async () => {
  const corrupt = await loadYouTube({
    'data/youtube-public.json': { status: 200, body: '{' },
  });
  assert.equal(corrupt.result.kind, 'corrupt');
  assert.equal(corrupt.result.message, '公開用の動画データが壊れています。');

  const objectBody = await loadYouTube({
    'data/youtube-public.json': { status: 200, body: '{"items":[]}' },
  });
  assert.equal(objectBody.result.kind, 'corrupt');

  const network = await loadYouTube({
    'data/youtube-public.json': { throw: true },
  });
  assert.equal(network.result.kind, 'network');
  assert.equal(network.result.message, '通信できないため、公開用の動画を読み込めませんでした。');
  assert.deepEqual(network.calls, ['data/youtube-public.json']);

  const server = await loadYouTube({
    'data/youtube-public.json': { status: 503, body: 'unavailable' },
  });
  assert.equal(server.result.kind, 'server');
  assert.equal(server.result.message, 'サーバーのエラーのため、公開用の動画を読み込めませんでした。');

  const statusServer = await loadYouTube({
    'data/youtube-public.json': { status: 404, body: '' },
    'data/feed-status.json': { status: 502, body: '' },
  });
  assert.equal(statusServer.result.kind, 'server');

  const statusCorrupt = await loadYouTube({
    'data/youtube-public.json': { status: 404, body: '' },
    'data/feed-status.json': { status: 200, body: '{' },
  });
  assert.equal(statusCorrupt.result.kind, 'corrupt');

  const bodyNetwork = await loadYouTube({
    'data/youtube-public.json': { status: 200, textThrows: true },
  });
  assert.equal(bodyNetwork.result.kind, 'network');
});

test('loads a ready feed without requesting raw data or the status file', async () => {
  const ready = await loadPublicFeed(async (url) => {
    assert.equal(url, 'data/x-public.json');
    return response(200, JSON.stringify([{ text: '谷端がんばれ' }]));
  }, 'data/x-public.json', 'data/feed-status.json', 'x');
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.items.length, 1);
  assert.equal(ready.message, '');
  assert.equal(messageFor('x', 'not_generated'), '公開用の投稿はまだ作られていません。');
  assert.equal(messageFor('x', 'missing'), '公開用の投稿ファイルが見つかりませんでした。');
  assert.equal(messageFor('x', 'corrupt'), '公開用の投稿データが壊れています。');
  assert.equal(messageFor('x', 'network'), '通信できないため、公開用の投稿を読み込めませんでした。');
  assert.equal(messageFor('x', 'server'), 'サーバーのエラーのため、公開用の投稿を読み込めませんでした。');
  assert.equal(messageFor('x', 'empty'), 'いま公開できる投稿はありません。');
});
