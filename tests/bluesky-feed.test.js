import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { safeBlueskyUrl } from '../js/safe-url.js';
import { renderBlueskyPost } from '../js/feed-render.js';
import { mountBlueskyFeed } from '../js/bluesky-feed.js';
import { loadPublishedFeed } from '../js/published-feed.js';
import { FEED_API } from '../js/daily-feed.js';
import { createDocument, walk } from './dom-mock.js';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const post = (id, text = '谷端ナイス', date = '2026-10-22T11:00:00Z') => ({
  text, handle: 'fan.bsky.social', displayName: '応援する人',
  createdAt: date, postUrl: `https://bsky.app/profile/${did}/post/${id}`,
});
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


const releaseId='12345678-1234-1234-1234-123456789abc';
const now=new Date('2026-10-25T00:00:00Z');
function routes({fail=false,batch=null}={}) {
 const calls=[];
 const release={version:1,id:releaseId,cutoff:'2026-10-24T20:30:00Z',preparedFor:'2026-10-25',items:{x:[],youtube:[],bluesky:[post('current')]}};
 return {calls,fetchImpl:async url=>{
  calls.push(url);assert.ok(url.startsWith(FEED_API));assert.doesNotMatch(url,/api\.bsky\.app|bluesky-public\.json/);
  if(url.includes('/notification'))return new Response(JSON.stringify(release),{status:fail?503:200});
  if(url.endsWith('/index.json'))return new Response('{"version":1,"dates":["2026-10-22"]}');
  if(url.includes('/2026-10-22.json'))return new Response(JSON.stringify({items:[post('current'),post('older','前の公開分')]}));
  return new Response('{"items":[]}');
 }};
}
function pageDocument() {
 const document=createDocument();const nodes=new Map(['search','past-posts-btn','feed-message','post-container'].map(id=>[id,document.createElement('div')]));
 document.getElementById=id=>nodes.get(id);return {document,nodes};
}
const texts=node=>{const out=[];for(const child of node.children)if(child.style.display!=='none')walk(child,n=>out.push(n.textContent));return out.join('\n');};
test('Bluesky reads only the selected release and public daily history, with the same batch IDs as LINE',async()=>{
 const mock=routes();const result=await loadPublishedFeed(mock.fetchImpl,'bluesky',now,{batch:releaseId});
 assert.deepEqual(result.currentIds,[post('current').postUrl]);assert.ok(mock.calls.includes(`${FEED_API}/notification/${releaseId}.json`));
 assert.equal(result.items.length,2);
});
test('initial Bluesky view shows only this release; search and past button can show previous selected posts',async()=>{
 const mock=routes();const {document,nodes}=pageDocument();
 await mountBlueskyFeed({document,fetchImpl:mock.fetchImpl,now});
 assert.match(texts(nodes.get('post-container')),/谷端ナイス/);assert.doesNotMatch(texts(nodes.get('post-container')),/前の公開分/);
 nodes.get('past-posts-btn').dispatchEvent({type:'click'});assert.match(texts(nodes.get('post-container')),/前の公開分/);
 assert.equal(nodes.get('feed-message').textContent,'');
 nodes.get('search').value='前の公開分';nodes.get('search').dispatchEvent({type:'input'});assert.doesNotMatch(texts(nodes.get('post-container')),/谷端ナイス/);
});
test('unavailable selection never falls back to unscreened live Bluesky or the old unselected snapshot',async()=>{
 const mock=routes({fail:true});const result=await loadPublishedFeed(mock.fetchImpl,'bluesky',now);
 assert.equal(result.kind,'server');assert.deepEqual(result.items,[]);assert.equal(mock.calls.length,1);
});
test('only an explicit unprepared first cycle can use the selected public migration snapshot',async()=>{
 const calls=[];
 const fetchImpl=async url=>{
  calls.push(url);assert.doesNotMatch(url,/api\.bsky\.app|\/bluesky-public\.json/);
  if(url.endsWith('/notification.json'))return new Response('{"error":"not_prepared"}',{status:404});
  assert.equal(url,'data/bluesky-selected-bootstrap.json');
  return new Response(JSON.stringify({version:1,selection:'notification-cycle-v1',posts:[post('selected')]}));
 };
 const result=await loadPublishedFeed(fetchImpl,'bluesky',now);
 assert.equal(result.kind,'ready');assert.equal(result.items.length,1);assert.equal(result.message,'');
 assert.equal(calls.length,2);
 calls.length=0;
 const fixed=await loadPublishedFeed(async url=>{calls.push(url);return new Response('{"error":"not_prepared"}',{status:404});},'bluesky',now,{batch:releaseId});
 assert.equal(fixed.kind,'server');assert.deepEqual(fixed.items,[]);assert.equal(calls.length,1);
});
test('the migration snapshot contains only canonical, selected posts and cannot skip the content policy',async()=>{
 const {resolveVerdict,normalizeTweet,RULESET_FINGERPRINT}=await import('../scripts/lib/x-sentiment.js');
 const data=JSON.parse(fs.readFileSync(new URL('../data/bluesky-selected-bootstrap.json',import.meta.url),'utf8'));
 assert.equal(data.version,1);assert.equal(data.selection,'notification-cycle-v1');assert.ok(data.posts.length);assert.equal(data.rulesetFingerprint,RULESET_FINGERPRINT);
 for(const item of data.posts) {
  assert.match(item.postUrl,/^https:\/\/bsky\.app\/profile\/did:[^/]+\/post\/[A-Za-z0-9]+$/);
  assert.equal((await resolveVerdict(item.text,{model:null})).verdict,'publish');
  assert.doesNotMatch(normalizeTweet(item.text),/下手すぎ|ヘタすぎ/);
 }
 assert.equal(new Set(data.posts.map(item=>item.postUrl)).size,data.posts.length);
});
test('pages keep safe rendering and connect Bluesky to the common publication reader',()=>{
 const html=fs.readFileSync(new URL('../bsky.html',import.meta.url),'utf8');const source=fs.readFileSync(new URL('../js/bluesky-feed.js',import.meta.url),'utf8');
 assert.match(html,/mountBlueskyFeed/);assert.match(source,/mountPublishedFeed/);assert.doesNotMatch(source,/searchPosts|fetch\(|innerHTML|bsky-data/);
});
