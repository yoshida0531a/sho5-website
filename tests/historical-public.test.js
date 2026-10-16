import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { judgeTweet } from '../scripts/lib/x-sentiment.js';

const ORIGINAL_PUBLIC_IDS = [
  '2093267243073429916', '2093267749485322686', '2093287880827588787', '2093288186034438412',
  '2093295820586291475', '2093622532150817268', '2093635498921382276', '2093647963809788409',
  '2093656633876574434', '2093667415456633053', '2093674561577619660', '2093995327871402260',
  '2094045083884724644', '2094108627493888333', '2094731588907258309', '2094735185510383743',
  '2094768392054198304', '2094801131302273533', '2095092970353803396', '2095093122430841128',
  '2096169589776498759', '2096173623438717309', '2098628555047653418', '2099883355873693846',
  '2100526618133532783', '2100528665960632613', '2100534869453582749', '2100560263909122406',
  '2100571995414946080', '2100703465643356326', '2101532987301281867', '2101853507859181896',
  '2102268391079948647', '2102371946092712104', '2102680405820506608', '2102680424623567000',
  '2102681207859474924', '2102711828862447830', '2103427151374725191', '2103485003556675997',
  '2103503244505055451', '2104689130441719820', '2107642441394524356', '2107767399168782449',
  '2108036861281354042', '2108038523253371152', '2108059793617567935', '2109490389501833303',
  '2109493728641798373', '2109508116685770856', '2109865067881930755',
];

function statusId(url) {
  const match = String(url || '').match(/status\/(\d+)/);
  return match ? match[1] : '';
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
}

test('previously displayed posts and videos stay in the public files', () => {
  const tweets = readJson('../x-data.txt');
  const videos = readJson('../YouTube-data.txt');
  const xPublic = readJson('../data/x-public.json');
  const ytPublic = readJson('../data/youtube-public.json');
  const status = readJson('../data/feed-status.json');

  const publicIds = xPublic.map((tweet) => statusId(tweet.tweetUrl));
  assert.equal(new Set(publicIds).size, publicIds.length);
  assert.deepEqual(publicIds.slice(0, ORIGINAL_PUBLIC_IDS.length), ORIGINAL_PUBLIC_IDS);
  assert.equal(xPublic[0].text, '一死二三塁！頑張れ谷端くん！！');
  assert.equal(xPublic[0].tweetUrl, 'https://x.com/sio_seseri/status/2093267243073429916');

  const prefix = new Set(ORIGINAL_PUBLIC_IDS);
  const rest = [];
  const seen = new Set();
  const displayed = [];
  for (const tweet of tweets) {
    const id = statusId(tweet.tweetUrl);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    displayed.push(id);
    if (!prefix.has(id)) rest.push(id);
  }
  assert.deepEqual(publicIds.slice(ORIGINAL_PUBLIC_IDS.length), rest);
  assert.equal(publicIds.length, displayed.length);
  for (const id of displayed) assert.ok(publicIds.includes(id), id);

  const rejected = tweets.find((tweet) => String(tweet.text).includes('全く期待外れ'));
  assert.equal(judgeTweet(rejected.text).verdict, 'reject');
  assert.ok(publicIds.includes(statusId(rejected.tweetUrl)));

  assert.deepEqual(ytPublic.map((video) => video.url), videos.map((video) => video.url));
  assert.equal(ytPublic[0].title, videos[0].title);
  assert.equal(ytPublic[0].url, videos[0].url);
  assert.equal(status.version, 1);
  assert.equal(status.x.state, 'published');
  assert.equal(status.x.count, xPublic.length);
  assert.equal(status.youtube.state, 'published');
  assert.equal(status.youtube.count, ytPublic.length);
});
