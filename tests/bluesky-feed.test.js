import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { safeBlueskyUrl } from '../js/safe-url.js';
import { renderBlueskyPost } from '../js/feed-render.js';
import { BLUESKY_SEARCH_URL, BLUESKY_SNAPSHOT_URL, loadBlueskyFeed, mountBlueskyFeed, postsFromBlueskySearch } from '../js/bluesky-feed.js';
import { createDocument, walk } from './dom-mock.js';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const post = (id, text = '谷端ナイス', date = '2026-10-22T11:00:00Z') => ({
  text, handle: 'fan.bsky.social', displayName: '応援する人',
  createdAt: date, postUrl: `https://bsky.app/profile/${did}/post/${id}`,
});
const api = posts => ({ posts: posts.map(p => ({
  uri: `at://${did}/app.bsky.feed.post/${p.postUrl.split('/').at(-1)}`,
  author: { handle: p.handle, displayName: p.displayName },
  record: { text: p.text, createdAt: p.createdAt },
})) });
const snapshot = posts => ({ version: 1, fetchedAt: '2026-10-24T00:00:00Z', posts });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const mockFetch = (live, saved = snapshot([])) => async url => response(url === BLUESKY_SEARCH_URL ? live : saved);

test('only canonical Bluesky post links are clickable', () => {
  assert.equal(safeBlueskyUrl('https://bsky.app/profile/fan.bsky.social/post/abc?x=1#link'), 'https://bsky.app/profile/fan.bsky.social/post/abc');
  assert.equal(safeBlueskyUrl(post('abc').postUrl), post('abc').postUrl);
  for (const url of ['javascript:alert(1)', 'data:text/html,abc', '//bsky.app/profile/fan.bsky.social/post/abc', 'http://bsky.app/profile/fan.bsky.social/post/abc', 'https://bsky.app.evil.test/profile/fan.bsky.social/post/abc', 'https://bsky.app@evil.test/profile/fan.bsky.social/post/abc', 'https://user:pass@bsky.app/profile/fan.bsky.social/post/abc', 'https://bsky.app:444/profile/fan.bsky.social/post/abc', 'https://bsky.app/profile/%22onclick=1/post/abc', 'https://bsky.app/profile/fan..social/post/abc', 'https://bsky.app/profile/fan.bsky.social/post/abc/extra']) {
    assert.equal(safeBlueskyUrl(url), null, url);
  }
});

test('untrusted names and text stay literal; unsafe links never become anchors', () => {
  const doc = createDocument();
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  for (const postUrl of ['javascript:alert(1)', post('abc').postUrl]) {
    const root = renderBlueskyPost(doc, { ...post('abc'), text: payload, displayName: payload, handle: payload, postUrl });
    const texts = [], links = [];
    walk(root, node => {
      texts.push(node.textContent);
      assert.ok(!['IMG', 'SCRIPT', 'IFRAME'].includes(node.tagName));
      assert.ok(Object.keys(node.attrs).every(key => !/^on/i.test(key)));
      if (node.tagName === 'A') links.push(node);
    });
    assert.ok(texts.includes(payload));
    assert.equal(links.length, postUrl.startsWith('https:') ? 2 : 0);
    links.forEach(link => {
      assert.equal(link.attrs.href, post('abc').postUrl);
      assert.equal(link.attrs.rel, 'noopener noreferrer');
    });
  }
});

test('search data uses stable record URLs, removes duplicates and sorts newest first', () => {
  const older = post('old', '前の投稿', '2026-10-21T00:00:00Z');
  const newer = post('new');
  const data = api([older, newer, newer]);
  data.posts.push({ record: { text: '<script>', createdAt: 'invalid' } });
  const result = postsFromBlueskySearch(data);
  assert.deepEqual(result.map(p => p.postUrl), [newer.postUrl, older.postUrl]);
  assert.throws(() => postsFromBlueskySearch({ posts: {} }));
  assert.throws(() => postsFromBlueskySearch({ posts: [{ record: {} }] }));
});

test('live reads use only the fixed public API and contain no credentials', async () => {
  const calls = [];
  const result = await loadBlueskyFeed(async (url, options) => {
    calls.push(url);
    assert.equal(options.headers, undefined);
    assert.ok(options.signal);
    return response(url === BLUESKY_SEARCH_URL ? api([post('new')]) : snapshot([]));
  });
  assert.equal(result.source, 'live');
  assert.deepEqual(new Set(calls), new Set([BLUESKY_SEARCH_URL, BLUESKY_SNAPSHOT_URL]));
  assert.equal(new URL(BLUESKY_SEARCH_URL).searchParams.get('q'), '"谷端"');
});

test('live API failure, rate limit and corrupt response preserve the saved public posts', async () => {
  for (const failure of ['network', 403, 429, 503, 'json', 'shape']) {
    const result = await loadBlueskyFeed(async url => {
      if (url === BLUESKY_SNAPSHOT_URL) return response(snapshot([post('saved')]));
      if (failure === 'network') throw new TypeError('network');
      if (failure === 'json') return new Response('{');
      if (failure === 'shape') return response({ posts: {} });
      return response({}, failure);
    });
    assert.equal(result.source, 'snapshot', String(failure));
    assert.equal(result.posts[0].postUrl, post('saved').postUrl);
    assert.match(result.message, /保存済み/);
  }
});

test('a late saved snapshot cannot overwrite a completed live result', async () => {
  let resolveSnapshot;
  const saved = new Promise(resolve => { resolveSnapshot = resolve; });
  const displayed = [];
  const result = await loadBlueskyFeed(async url => url === BLUESKY_SNAPSHOT_URL ? saved : response(api([post('live')])), { onPosts: posts => displayed.push(posts) });
  resolveSnapshot(response(snapshot([post('old')])));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(result.posts[0].postUrl, post('live').postUrl);
  assert.equal(displayed.length, 0);
});

test('empty and unavailable feeds have distinct states', async () => {
  const empty = await loadBlueskyFeed(mockFetch(api([])));
  assert.equal(empty.source, 'live');
  assert.match(empty.message, /まだありません/);
  const unavailable = await loadBlueskyFeed(async () => { throw new Error('offline'); });
  assert.equal(unavailable.source, 'error');
  assert.match(unavailable.message, /読み込めません/);
});

function pageDocument() {
  const doc = createDocument();
  const nodes = new Map(['search', 'post-container', 'more-posts-btn', 'feed-message', 'retry-feed-btn'].map(id => [id, doc.createElement('div')]));
  doc.getElementById = id => nodes.get(id);
  const hidden = new Set();
  for (const id of ['more-posts-btn', 'retry-feed-btn']) nodes.get(id).classList = { add: () => hidden.add(id), remove: () => hidden.delete(id) };
  return { doc, nodes, hidden };
}
function textOf(node) {
  const texts = [];
  walk(node, node => texts.push(node.textContent));
  return texts.join('\n');
}

test('the page shows text immediately, expands history, searches names and uses JST boundaries', async () => {
  const current = post('new', '今日の本文', '2026-10-22T16:00:00Z'); // Oct 23 JST
  const yesterday = post('yesterday', '前日の本文', '2026-10-21T16:00:00Z'); // Oct 22 JST
  const old = { ...post('old', '古い本文', '2026-10-20T14:59:00Z'), displayName: '昔の応援者' }; // Oct 20 JST
  const { doc, nodes, hidden } = pageDocument();
  await mountBlueskyFeed({ document: doc, fetchImpl: mockFetch(api([old, current, yesterday])) });
  const container = nodes.get('post-container');
  assert.equal(container.children.length, 2);
  assert.match(textOf(container), /今日の本文/);
  assert.match(textOf(container), /前日の本文/);
  assert.doesNotMatch(textOf(container), /古い本文/);
  assert.ok(!hidden.has('more-posts-btn'));
  nodes.get('more-posts-btn').dispatchEvent({ type: 'click' });
  assert.match(textOf(container), /古い本文/);
  nodes.get('search').value = '昔の応援者';
  nodes.get('search').dispatchEvent({ type: 'input' });
  assert.equal(container.children.length, 1);
  assert.match(textOf(container), /古い本文/);
  assert.ok(hidden.has('more-posts-btn'));
  nodes.get('search').value = '存在しない文字列';
  nodes.get('search').dispatchEvent({ type: 'input' });
  assert.match(nodes.get('feed-message').textContent, /一致する投稿/);
});

test('pages link to the integration and contain no HTML-insertion code or old seed-data loader', () => {
  const page = fs.readFileSync(new URL('../bsky.html', import.meta.url), 'utf8');
  const home = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(home, /href="bsky\.html">Bluesky/);
  assert.match(page, /mountBlueskyFeed\(\{ document \}\)/);
  assert.doesNotMatch(page, /innerHTML|bsky-data\.txt/);
  const loader = fs.readFileSync(new URL('../js/bluesky-feed.js', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('../js/feed-render.js', import.meta.url), 'utf8');
  assert.match(loader, /feed-render\.js\?v=20261024-bluesky/);
  assert.match(loader, /safe-url\.js\?v=20261024-bluesky/);
  assert.match(renderer, /safe-url\.js\?v=20261024-bluesky/);
  const saved = JSON.parse(fs.readFileSync(new URL('../data/bluesky-public.json', import.meta.url), 'utf8'));
  assert.equal(saved.version, 1);
  assert.ok(saved.posts.length);
  assert.ok(saved.posts.every(p => safeBlueskyUrl(p.postUrl)));
});
