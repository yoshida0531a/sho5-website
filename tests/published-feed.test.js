import assert from 'node:assert/strict';
import test from 'node:test';
import { FEED_API } from '../js/daily-feed.js';
import { loadPublishedFeed } from '../js/published-feed.js';
import { mountPublishedFeed } from '../js/feed-page.js';
import { createDocument, walk } from './dom-mock.js';

const now = new Date('2026-10-23T04:30:00Z');
function routesFor(feed, { today = [], archive = [], yesterday = [], indexStatus = 200, todayStatus = 200 } = {}) {
  const name = feed === 'x' ? 'x' : 'youtube';
  const routes = {
    [`${FEED_API}/notification.json`]: { status: 404, data: { error: 'not_prepared' } },
    [`data/${name}-public.json`]: { data: archive },
    [`${FEED_API}/${name}/index.json`]: { status: indexStatus, data: { version: 1, dates: yesterday.length ? ['2026-10-22'] : [] } },
    [`${FEED_API}/${name}/2026-10-23.json`]: { status: todayStatus, data: { items: today, status: { received: 0, published: 0, rejected: 0, held: 0 } } },
    [`${FEED_API}/${name}/2026-10-22.json`]: { data: { items: yesterday } },
  };
  const calls = [];
  return { calls, routes, fetchImpl: async url => {
    calls.push(url);
    assert.doesNotMatch(url, /x-data\.txt|YouTube-data\.txt|private|incremental/);
    const route = routes[url];
    assert.ok(route, `unexpected URL ${url}`);
    if (route.throw) throw new Error('network');
    return { status: route.status || 200, text: async () => JSON.stringify(route.data) };
  } };
}
const oldX = { tweetUrl: 'https://x.com/fan/status/2110283764300000000', text: '公開済みの本文', userName: 'fan' };
const yesterdayX = { tweetUrl: 'https://x.com/fan/status/2113268828197224477', text: '昨日の新しい本文', userName: 'fan' };
const video = { url: 'https://www.youtube.com/watch?v=abcdefghijk', title: '公開済みの動画タイトル', description: '連携すべき説明文<script>literal</script>', publishedAt: 'October 14, 2026 at 11:00AM' };

function pageDocument(feed) {
  const doc = createDocument();
  const nodes = new Map(['search', 'past-posts-btn', 'feed-message', feed === 'x' ? 'tweet-container' : 'video-container'].map(id => [id, doc.createElement('div')]));
  doc.getElementById = id => nodes.get(id);
  const hidden = new Set();
  nodes.get('past-posts-btn').classList = { add: name => hidden.add(name), remove: name => hidden.delete(name) };
  return { doc, nodes, hidden };
}
function visibleTexts(container) {
  const texts = [];
  for (const item of container.children) {
    if (item.style.display === 'none') continue;
    walk(item, node => { if (node._text) texts.push(node._text); });
  }
  return texts.join('\n');
}

test('zero received today still loads yesterday and the published archive without a click', async () => {
  const mock = routesFor('x', { archive: [oldX], yesterday: [yesterdayX] });
  const result = await loadPublishedFeed(mock.fetchImpl, 'x', now);
  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.items.map(item => item.text), [yesterdayX.text, oldX.text]);
  assert.equal(result.message, '');
  assert.ok(mock.calls.includes('data/x-public.json'));
  assert.ok(mock.calls.includes(`${FEED_API}/x/2026-10-22.json`));
});

test('X first render contains real text; older posts expand and search works without another fetch', async () => {
  const mock = routesFor('x', { archive: [oldX], yesterday: [yesterdayX] });
  const { doc, nodes, hidden } = pageDocument('x');
  await mountPublishedFeed({ document: doc, feed: 'x', fetchImpl: mock.fetchImpl, now });
  const container = nodes.get('tweet-container');
  assert.match(visibleTexts(container), /昨日の新しい本文/);
  assert.doesNotMatch(visibleTexts(container), /公開済みの本文/);
  assert.equal(nodes.get('feed-message').textContent, '');
  assert.equal(hidden.has('hidden'), false);
  nodes.get('past-posts-btn').dispatchEvent({ type: 'click' });
  nodes.get('past-posts-btn').dispatchEvent({ type: 'click' });
  assert.match(visibleTexts(container), /公開済みの本文/);
  const count = mock.calls.length;
  nodes.get('search').value = '公開済み';
  nodes.get('search').dispatchEvent({ type: 'input' });
  assert.match(visibleTexts(container), /公開済みの本文/);
  assert.doesNotMatch(visibleTexts(container), /昨日の新しい本文/);
  assert.equal(mock.calls.length, count);
});

test('YouTube zero-day first render contains title and description, with safe text and links', async () => {
  const mock = routesFor('youtube', { archive: [video] });
  const { doc, nodes, hidden } = pageDocument('youtube');
  await mountPublishedFeed({ document: doc, feed: 'youtube', fetchImpl: mock.fetchImpl, now });
  const text = visibleTexts(nodes.get('video-container'));
  assert.match(text, /公開済みの動画タイトル/);
  assert.match(text, /連携すべき説明文<script>literal<\/script>/);
  assert.doesNotMatch(text, /受信0件|再試行待ち/);
  assert.equal(nodes.get('feed-message').textContent, '');
  assert.equal(hidden.has('hidden'), true);
  nodes.get('search').value = '説明文';
  nodes.get('search').dispatchEvent({ type: 'input' });
  assert.match(visibleTexts(nodes.get('video-container')), /動画タイトル/);
});

test('unavailable R2 API preserves existing public text and reports a partial update', async () => {
  for (const failure of [403, 503]) {
    const mock = routesFor('youtube', { archive: [video], indexStatus: failure, todayStatus: failure });
    const result = await loadPublishedFeed(mock.fetchImpl, 'youtube', now);
    assert.equal(result.kind, 'partial');
    assert.deepEqual(result.items, [video]);
    assert.match(result.message, /公開済み/);
  }
});

test('a corrupt/unreachable static archive can still display validated public API content', async () => {
  const mock = routesFor('x', { yesterday: [yesterdayX] });
  mock.routes['data/x-public.json'].data = {};
  const result = await loadPublishedFeed(mock.fetchImpl, 'x', now);
  assert.equal(result.kind, 'partial');
  assert.deepEqual(result.items, [yesterdayX]);
});

test('missing indexed day does not discard the other public text or claim a complete result', async () => {
  const mock = routesFor('x', { archive: [oldX], yesterday: [yesterdayX] });
  mock.routes[`${FEED_API}/x/2026-10-22.json`].status = 404;
  const result = await loadPublishedFeed(mock.fetchImpl, 'x', now);
  assert.equal(result.kind, 'partial');
  assert.deepEqual(result.items, [oldX]);
});

test('public sources deduplicate by ID, keep current text, and reject path-like date entries', async () => {
  const mock = routesFor('x', { archive: [oldX], today: [{ ...oldX, text: '更新済み本文' }] });
  const result = await loadPublishedFeed(mock.fetchImpl, 'x', now);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].text, '更新済み本文');
  mock.routes[`${FEED_API}/x/index.json`].data.dates = ['../../private'];
  const invalid = await loadPublishedFeed(mock.fetchImpl, 'x', now);
  assert.equal(invalid.kind, 'partial');
  assert.ok(mock.calls.every(url => !url.includes('private')));
});

test('archive content waits for notification release selection before initial rendering', async () => {
  const mock = routesFor('youtube', { archive: [video] });
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const progressive = [];
  const result = loadPublishedFeed(async url => {
    if (url.startsWith(FEED_API)) await gate;
    return mock.fetchImpl(url);
  }, 'youtube', now, { onItems: items => progressive.push(...items) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(progressive, []);
  finish();
  await result;
  assert.deepEqual(progressive, [video]);
});

test('no-match searches show a message and clearing the query restores the body', async () => {
  const mock = routesFor('youtube', { archive: [video] });
  const { doc, nodes } = pageDocument('youtube');
  await mountPublishedFeed({ document: doc, feed: 'youtube', fetchImpl: mock.fetchImpl, now });
  nodes.get('search').value = 'no matching words';
  nodes.get('search').dispatchEvent({ type: 'input' });
  assert.equal(nodes.get('feed-message').textContent, '一致する動画はありません。');
  assert.equal(visibleTexts(nodes.get('video-container')), '');
  nodes.get('search').value = '';
  nodes.get('search').dispatchEvent({ type: 'input' });
  assert.equal(nodes.get('feed-message').textContent, '');
  assert.match(visibleTexts(nodes.get('video-container')), /説明文/);
});

test('a day with no receive still retains every current published archive item and all its text fields', async () => {
  const { readFileSync } = await import('node:fs');
  for (const feed of ['x', 'youtube']) {
    const archive = JSON.parse(readFileSync(new URL(`../data/${feed}-public.json`, import.meta.url), 'utf8'));
    const mock = routesFor(feed, { archive });
    const result = await loadPublishedFeed(mock.fetchImpl, feed, now);
    assert.equal(result.kind, 'ready');
    assert.deepEqual(result.items, archive);
    assert.ok(result.items.length > 100);
    assert.equal(result.message, '');
  }
});

function descendants(node) { const result=[]; walk(node, child=>result.push(child)); return result; }
const releaseId = '12345678-1234-1234-1234-123456789abc';
function withRelease(mock, feed, items, batch = '') {
  mock.routes[`${FEED_API}/notification${batch ? `/${batch}` : ''}.json`] = { data: {
    version:1,id:releaseId,preparedFor:'2026-10-23',cutoff:'2026-10-22T20:30:00Z',from:'2026-10-20T20:30:00Z',items:{x:[],youtube:[],[feed]:items},
  } };
  return mock;
}
test('normal X pages show the recent approved timeline beyond the notification batch',async()=>{
  const later={...yesterdayX,tweetUrl:'https://x.com/fan/status/2113498023288537132',text:'締め切り後'};
  const mock=withRelease(routesFor('x',{archive:[oldX],today:[later],yesterday:[yesterdayX]}),'x',[yesterdayX]);
  const {doc,nodes}=pageDocument('x');
  const result=await mountPublishedFeed({document:doc,feed:'x',fetchImpl:mock.fetchImpl,now});
  const all=descendants(nodes.get('tweet-container')).filter(node=>node.getAttribute('data-text')!==null && node.getAttribute('data-text')!==undefined);
  const visible=all.filter(node=>node.style.display!=='none');
  assert.equal(result.currentIds.length,1);
  assert.equal(visible.length,2);assert.match(visible[0].getAttribute('data-text'),/締め切り後/);
  assert.equal(nodes.get('feed-message').textContent,'');
  nodes.get('past-posts-btn').dispatchEvent({type:'click'});
  nodes.get('past-posts-btn').dispatchEvent({type:'click'});
  assert.equal(all.filter(node=>node.style.display!=='none').length,3);
});

test('normal YouTube pages keep approved history visible when a notification is small',async()=>{
  const newer={...video,url:'https://www.youtube.com/watch?v=zyxwvutsrqp',title:'次回分'};
  const mock=withRelease(routesFor('youtube',{archive:[video],today:[newer]}),'youtube',[video]);
  const {doc,nodes}=pageDocument('youtube');
  await mountPublishedFeed({document:doc,feed:'youtube',fetchImpl:mock.fetchImpl,now});
  const all=descendants(nodes.get('video-container')).filter(node=>node.getAttribute('data-title'));
  assert.equal(all.filter(node=>node.style.display!=='none').length,2);
});

test('a zero-item notification does not blank the normal approved timeline',async()=>{
  const mock=withRelease(routesFor('x',{archive:[oldX]}),'x',[]);
  const {doc,nodes,hidden}=pageDocument('x');
  await mountPublishedFeed({document:doc,feed:'x',fetchImpl:mock.fetchImpl,now});
  assert.equal(nodes.get('feed-message').textContent,'');
  assert.doesNotMatch(nodes.get('feed-message').textContent,/受信|対象外|再試行待ち/);
  assert.match(visibleTexts(nodes.get('tweet-container')), /公開済みの本文/);
  assert.equal(hidden.has('hidden'),true);
});

test('old LINE links select their immutable batch; unavailable batches do not silently use the latest or archive',async()=>{
  const mock=withRelease(routesFor('x',{archive:[oldX],today:[yesterdayX]}),'x',[oldX],releaseId);
  const result=await loadPublishedFeed(mock.fetchImpl,'x',now,{batch:releaseId});
  assert.deepEqual(result.currentIds,[oldX.tweetUrl.split('/').at(-1)]);
  mock.routes[`${FEED_API}/notification/${releaseId}.json`]={status:503};
  const failed=await loadPublishedFeed(mock.fetchImpl,'x',now,{batch:releaseId});
  assert.deepEqual(failed.items,[]);assert.equal(failed.kind,'server');
  const invalid=await loadPublishedFeed(mock.fetchImpl,'x',now,{batch:'../../private'});
  assert.equal(invalid.kind,'corrupt');assert.deepEqual(invalid.requests,[]);
});

test('normal pages preserve approved history and disclose a notification API failure',async()=>{
  for(const feed of ['x','youtube']) for(const status of [403,503,200]) {
    const mock=routesFor(feed,{archive:feed==='x'?[oldX]:[video]});
    mock.routes[`${FEED_API}/notification.json`]={status,data:{unexpected:true}};
    const result=await loadPublishedFeed(mock.fetchImpl,feed,now);
    assert.equal(result.kind,'partial');assert.deepEqual(result.items,feed==='x'?[oldX]:[video]);
    assert.match(result.message,/一部の更新/);
  }
});

test('explicit batch text renders before slow history; history failure cannot hide the batch',async()=>{
  const mock=withRelease(routesFor('x',{archive:[oldX]}),'x',[yesterdayX],releaseId);
  mock.routes[`${FEED_API}/x/index.json`].status=503;
  let finish;const gate=new Promise(resolve=>{finish=resolve;});
  const {doc,nodes}=pageDocument('x');
  const pending=mountPublishedFeed({document:doc,feed:'x',now,batch:releaseId,fetchImpl:async url=>{
    if(!url.includes('/notification'))await gate;
    return mock.fetchImpl(url);
  }});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(visibleTexts(nodes.get('tweet-container')),/昨日の新しい本文/);
  assert.equal(nodes.get('feed-message').textContent,'');
  finish();const result=await pending;
  assert.equal(result.kind,'partial');
  assert.match(visibleTexts(nodes.get('tweet-container')),/昨日の新しい本文/);
});

test('an immutable notification link rejects a different release ID',async()=>{
  const mock=withRelease(routesFor('x'),'x',[oldX],releaseId);
  mock.routes[`${FEED_API}/notification/${releaseId}.json`].data.id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const result=await loadPublishedFeed(mock.fetchImpl,'x',now,{batch:releaseId});
  assert.equal(result.kind,'server');assert.deepEqual(result.items,[]);assert.equal(mock.calls.length,1);
});

test('YouTube wall-clock input and labels consistently use Japan time',async()=>{
  const {parseCustomDate,formatVideoDate}=await import('../js/feed-behavior.js');
  assert.equal(parseCustomDate('October 24, 2026 at 12:05AM').toISOString(),'2026-10-23T15:05:00.000Z');
  assert.equal(formatVideoDate(new Date('2026-10-23T15:05:00Z')),'2026/10/24 00:05');
});

test('explicit batch links keep their exact initial selection after restoring normal timelines', async () => {
  const mock = withRelease(routesFor('x', { archive: [oldX], today: [yesterdayX] }), 'x', [oldX], releaseId);
  const { doc, nodes } = pageDocument('x');
  await mountPublishedFeed({ document: doc, feed: 'x', fetchImpl: mock.fetchImpl, now, batch: releaseId });
  assert.match(visibleTexts(nodes.get('tweet-container')), /公開済みの本文/);
  assert.doesNotMatch(visibleTexts(nodes.get('tweet-container')), /昨日の新しい本文/);
});

test('recent days use JST boundaries independently of the browser timezone', async () => {
  const { filterFeed } = await import('../js/feed-behavior.js');
  const items = [
    { date: new Date('2026-11-01T15:01:00Z') },
    { date: new Date('2026-10-31T15:00:00Z') },
    { date: new Date('2026-10-31T14:59:59Z') },
  ];
  assert.deepEqual(filterFeed(items, { mostRecentDate: items[0].date }).visible, [true, true, false]);
});

test('AI-only normal X feed cannot reintroduce rejected posts from notification or archive',async()=>{
  const approved={...yesterdayX,tweetUrl:'https://x.com/fan/status/2113498023288537132',text:'AI APPROVED'};
  const rejected={...yesterdayX,text:'MUST NOT LEAK'};
  const mock=withRelease(routesFor('x',{archive:[oldX,rejected],today:[approved]}),'x',[rejected]);
  mock.routes[`${FEED_API}/x/index.json`].data.selection={kind:'gemma-x-v1',startAt:'2026-10-20T00:00:00Z'};
  const progressive=[];
  const result=await loadPublishedFeed(mock.fetchImpl,'x',now,{onItems:items=>progressive.push(...items)});
  assert.equal(result.items.length,2);
  assert.ok(result.items.some(x=>x.text==='AI APPROVED'));
  assert.ok(result.items.some(x=>x.text===oldX.text));
  assert.doesNotMatch(JSON.stringify([...progressive,...result.items]),/MUST NOT LEAK/);
  assert.equal(result.currentIds.length,0);
});
test('missing AI selection metadata never falls back to notification/archive copies on normal X',async()=>{
  const mock=withRelease(routesFor('x',{archive:[yesterdayX],indexStatus:503}),'x',[yesterdayX]);
  const progressive=[];
  const result=await loadPublishedFeed(mock.fetchImpl,'x',now,{onItems:items=>progressive.push(...items)});
  assert.deepEqual(result.items,[]);assert.deepEqual(progressive,[]);
});
test('explicit batch retains its selection even with AI index metadata',async()=>{
  const mock=withRelease(routesFor('x',{archive:[oldX]}),'x',[yesterdayX],releaseId);
  mock.routes[`${FEED_API}/x/index.json`].data.selection={kind:'gemma-x-v1',startAt:'2026-10-20T00:00:00Z'};
  const result=await loadPublishedFeed(mock.fetchImpl,'x',now,{batch:releaseId});
  assert.ok(result.items.some(x=>x.tweetUrl===yesterdayX.tweetUrl));
});

// --- Staged (fast-first) loading: normal X page only ---
const stagedToday = { tweetUrl: 'https://x.com/fan/status/2113498023288537132', text: '今日の投稿', userName: 'fan' };
const stagedOlder = { tweetUrl: 'https://x.com/fan/status/2112500000000000000', text: '一昨日の投稿', userName: 'fan' };
function stagedMock({ olderGate } = {}) {
  const routes = {
    [`${FEED_API}/notification.json`]: { status: 404, data: { error: 'not_prepared' } },
    'data/x-public.json': { data: [] },
    [`${FEED_API}/x/index.json`]: { data: { version: 1, dates: ['2026-10-21', '2026-10-22', '2026-10-23'] } },
    [`${FEED_API}/x/2026-10-23.json`]: { data: { items: [stagedToday], status: { received: 0, published: 0, rejected: 0, held: 0 } } },
    [`${FEED_API}/x/2026-10-22.json`]: { data: { items: [yesterdayX] } },
    [`${FEED_API}/x/2026-10-21.json`]: { data: { items: [stagedOlder] } },
  };
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    assert.doesNotMatch(url, /x-data\.txt|YouTube-data\.txt|private|incremental/);
    if (olderGate && url === `${FEED_API}/x/2026-10-21.json`) await olderGate;
    const route = routes[url];
    assert.ok(route, `unexpected URL ${url}`);
    return { status: route.status || 200, text: async () => JSON.stringify(route.data) };
  };
  return { calls, routes, fetchImpl };
}
async function flushUntil(condition) {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(condition(), 'condition was not reached');
}

test('normal X calls onItems with the two most recent days before older day files resolve, then returns the full history', async () => {
  let releaseOlder;
  const olderGate = new Promise(resolve => { releaseOlder = resolve; });
  const mock = stagedMock({ olderGate });
  const stages = [];
  let finished = false;
  const pending = loadPublishedFeed(mock.fetchImpl, 'x', now, { onItems: (items, cycle) => stages.push({ items, cycle }) })
    .then(result => { finished = true; return result; });
  await flushUntil(() => stages.length === 1);
  assert.equal(finished, false);
  assert.deepEqual(stages[0].items.map(item => item.text), [stagedToday.text, yesterdayX.text]);
  // The stage-1 view must not announce the background load; it only flags
  // that loading is in progress so the page can react to a reader request.
  assert.equal(stages[0].cycle.message, '');
  assert.equal(stages[0].cycle.loading, true);
  releaseOlder();
  const result = await pending;
  assert.equal(result.kind, 'ready');
  assert.equal(result.message, '');
  assert.deepEqual(result.items.map(item => item.text), [stagedToday.text, yesterdayX.text, stagedOlder.text]);
  // Stage-1 day files are reused in stage 2, not refetched.
  assert.equal(mock.calls.filter(url => url === `${FEED_API}/x/2026-10-23.json`).length, 1);
  assert.equal(mock.calls.filter(url => url === `${FEED_API}/x/2026-10-22.json`).length, 1);
  assert.ok(result.requests.includes(`${FEED_API}/x/2026-10-21.json`));
});

test('normal X page shows no past-loading message upfront; it appears only after the past-posts button is pressed during loading', async () => {
  let releaseOlder;
  const olderGate = new Promise(resolve => { releaseOlder = resolve; });
  const mock = stagedMock({ olderGate });
  const { doc, nodes, hidden } = pageDocument('x');
  const pending = mountPublishedFeed({ document: doc, feed: 'x', fetchImpl: mock.fetchImpl, now });
  await flushUntil(() => visibleTexts(nodes.get('tweet-container')).includes(stagedToday.text));
  assert.match(visibleTexts(nodes.get('tweet-container')), /昨日の新しい本文/);
  // First paint is clean: no loading note, and the older staged post is not
  // shown yet — but the past-posts button is already available.
  assert.equal(nodes.get('feed-message').textContent, '');
  assert.doesNotMatch(visibleTexts(nodes.get('tweet-container')), /一昨日の投稿/);
  assert.equal(hidden.has('hidden'), false);
  // Only the reader's click reveals the loading note.
  nodes.get('past-posts-btn').dispatchEvent({ type: 'click' });
  assert.equal(nodes.get('feed-message').textContent, '過去の投稿を読み込み中…');
  releaseOlder();
  await pending;
  // Completion clears the note and honours the remembered expansion.
  assert.equal(nodes.get('feed-message').textContent, '');
  assert.match(visibleTexts(nodes.get('tweet-container')), /一昨日の投稿/);
});

test('normal X page never shows the past-loading message when the button is not pressed during loading', async () => {
  let releaseOlder;
  const olderGate = new Promise(resolve => { releaseOlder = resolve; });
  const mock = stagedMock({ olderGate });
  const { doc, nodes, hidden } = pageDocument('x');
  const pending = mountPublishedFeed({ document: doc, feed: 'x', fetchImpl: mock.fetchImpl, now });
  await flushUntil(() => visibleTexts(nodes.get('tweet-container')).includes(stagedToday.text));
  assert.equal(nodes.get('feed-message').textContent, '');
  releaseOlder();
  await pending;
  assert.equal(nodes.get('feed-message').textContent, '');
  // After completion the button follows the normal hasMore rule again:
  // the full history contains an older post, so it stays available.
  assert.equal(hidden.has('hidden'), false);
  assert.doesNotMatch(visibleTexts(nodes.get('tweet-container')), /一昨日の投稿/);
});

test('staged normal X still applies the Gemma legacy filter to archive and release items', async () => {
  const postStart = { ...yesterdayX, text: 'STAGED MUST NOT LEAK' };
  const approved = { ...yesterdayX, tweetUrl: stagedToday.tweetUrl, text: 'STAGED APPROVED' };
  const mock = withRelease(routesFor('x', { archive: [oldX, postStart], today: [approved] }), 'x', [postStart]);
  mock.routes[`${FEED_API}/x/index.json`].data.selection = { kind: 'gemma-x-v1', startAt: '2026-10-20T00:00:00Z' };
  const stages = [];
  const result = await loadPublishedFeed(mock.fetchImpl, 'x', now, { onItems: (items, cycle) => stages.push({ items, cycle }) });
  assert.equal(stages.length, 1);
  assert.deepEqual(stages[0].items.map(item => item.text), ['STAGED APPROVED']);
  assert.equal(stages[0].cycle.message, '');
  assert.equal(stages[0].cycle.loading, true);
  assert.deepEqual(result.items.map(item => item.text), ['STAGED APPROVED', oldX.text]);
  assert.doesNotMatch(JSON.stringify(result.items), /MUST NOT LEAK/);
  assert.equal(result.currentIds.length, 0);
});

test('staged loading leaves YouTube and pinned batch paths on the original single-pass behaviour', async () => {
  const ytMock = routesFor('youtube', { archive: [video] });
  const ytCycles = [];
  const ytResult = await loadPublishedFeed(ytMock.fetchImpl, 'youtube', now, { onItems: (items, cycle) => ytCycles.push(cycle || {}) });
  assert.deepEqual(ytResult.items, [video]);
  assert.ok(ytCycles.every(cycle => cycle.message !== '過去の投稿を読み込み中…'));
  assert.ok(ytCycles.every(cycle => !cycle.loading));

  const batchMock = withRelease(routesFor('x', { archive: [oldX], today: [yesterdayX] }), 'x', [oldX], releaseId);
  const batchCycles = [];
  const batchResult = await loadPublishedFeed(batchMock.fetchImpl, 'x', now, { batch: releaseId, onItems: (items, cycle) => batchCycles.push(cycle || {}) });
  assert.deepEqual(batchResult.currentIds, [oldX.tweetUrl.split('/').at(-1)]);
  assert.ok(batchCycles.every(cycle => cycle.message !== '過去の投稿を読み込み中…'));
  assert.ok(batchCycles.every(cycle => !cycle.loading));
});
