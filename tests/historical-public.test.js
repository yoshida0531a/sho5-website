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

const YOUTUBE_EXCLUDED_URLS = [
  'https://www.youtube.com/watch?v=2t1HBDziqK4',
  'https://www.youtube.com/watch?v=mWbGKKrU6S0',
  'https://www.youtube.com/watch?v=vTqsu47A39k',
  'https://www.youtube.com/watch?v=BORtYCvp_lQ',
  'https://www.youtube.com/watch?v=hnmbHiELvZw',
  'https://www.youtube.com/watch?v=OnV8tX0klLg',
  'https://www.youtube.com/watch?v=vHfkV2AdTSA',
  'https://www.youtube.com/watch?v=-Q2f2YyuR5Y',
  'https://www.youtube.com/watch?v=qDqGLN5zIAw',
  'https://www.youtube.com/watch?v=UfFZBSHEC0k',
  'https://www.youtube.com/watch?v=flUt0NF-Q5Y',
  'https://www.youtube.com/watch?v=cGAd3cHNZb4',
  'https://www.youtube.com/watch?v=bi3nh61o5MQ',
  'https://www.youtube.com/watch?v=D8KK04BwqBY',
  'https://www.youtube.com/watch?v=-znUW_9q4iU',
  'https://www.youtube.com/watch?v=laGgk9lzoKo',
  'https://www.youtube.com/watch?v=9Dg8KTeuawI',
  'https://www.youtube.com/watch?v=BkOEvqtNod0',
  'https://www.youtube.com/watch?v=yv3wuPv4yDw',
  'https://www.youtube.com/watch?v=cQ4xgpoZ3rI',
  'https://www.youtube.com/watch?v=Ahyc0H8_WC4',
  'https://www.youtube.com/watch?v=SZrA-ZPbb2c',
  'https://www.youtube.com/watch?v=hVWAUZkvPOA',
  'https://www.youtube.com/watch?v=g6sVluthkCI',
  'https://www.youtube.com/watch?v=IxDXlfdkZW4',
  'https://www.youtube.com/watch?v=sKB9nuwRje8',
  'https://www.youtube.com/watch?v=QTkL0-CJwBc',
  'https://www.youtube.com/watch?v=nkTzSVyEui0',
  'https://www.youtube.com/watch?v=yEpKWTBt56o',
  'https://www.youtube.com/watch?v=ffS28lranhc',
  'https://www.youtube.com/watch?v=o82CWS7-3HE',
  'https://www.youtube.com/watch?v=3jvfphrtbRE',
  'https://www.youtube.com/watch?v=9j6TWKkCNEE',
  'https://www.youtube.com/watch?v=uKxId3xaWq4',
  'https://www.youtube.com/watch?v=XLTI-ZL6c7M',
  'https://www.youtube.com/watch?v=yqZZR0rtfGc',
  'https://www.youtube.com/watch?v=p_haKSjTBcY',
  'https://www.youtube.com/watch?v=6esSiEoirfk',
  'https://www.youtube.com/watch?v=oVQfxGc2U04',
  'https://www.youtube.com/watch?v=-DTYBm5Y_MQ',
  'https://www.youtube.com/watch?v=kHPbW_b_9BI',
  'https://www.youtube.com/watch?v=qYIcqiK1I2g',
  'https://www.youtube.com/watch?v=sIWBjt1Z9K0',
  'https://www.youtube.com/watch?v=Hv3bji-bOnI',
  'https://www.youtube.com/watch?v=mBpHTkUgh_g',
  'https://www.youtube.com/watch?v=43uA_CEsYIA',
  'https://www.youtube.com/watch?v=dAuLwe3jo1M',
  'https://www.youtube.com/watch?v=hT5sukGQBDE',
  'https://www.youtube.com/watch?v=zbbV-I-UxBg',
  'https://www.youtube.com/watch?v=jfL6Rtd_6BY',
  'https://www.youtube.com/watch?v=BSa5Qru5AXE',
  'https://www.youtube.com/watch?v=raJxqwI47gg',
  'https://www.youtube.com/watch?v=hDQaoKRBkXo',
  'https://www.youtube.com/watch?v=FOJu-TMA8gA',
  'https://www.youtube.com/watch?v=pbhVGEgW0A0',
  'https://www.youtube.com/watch?v=vGYTXvj9-1w',
  'https://www.youtube.com/watch?v=Zq5xX_48WW8',
  'https://www.youtube.com/watch?v=y-EathiMX0U',
  'https://www.youtube.com/watch?v=fgdGFG2Ma8s',
  'https://www.youtube.com/watch?v=tmcZdlcWtjE',
  'https://www.youtube.com/watch?v=gX22lJNWV68',
  'https://www.youtube.com/watch?v=r1GrwZf4S8A',
  'https://www.youtube.com/watch?v=zz-_7Y4k4jo',
  'https://www.youtube.com/watch?v=q_bFwWwSggw',
  'https://www.youtube.com/watch?v=T40fpS2PAwg',
  'https://www.youtube.com/watch?v=r8gSYXi_aZI',
  'https://www.youtube.com/watch?v=ZN4WC6WvFRY',
  'https://www.youtube.com/watch?v=X7tMydfJ-WM',
  'https://www.youtube.com/watch?v=S1mpJjFf2BU',
  'https://www.youtube.com/watch?v=Ltxgn0L38n4',
  'https://www.youtube.com/watch?v=IXGpR-2fEiA',
  'https://www.youtube.com/watch?v=f-FaUfZrhlM',
  'https://www.youtube.com/watch?v=y_86R4_CUBY',
  'https://www.youtube.com/watch?v=FdBxALOKyCw',
  'https://www.youtube.com/watch?v=TqBoEOdOeR8',
  'https://www.youtube.com/watch?v=MrQPcYT-DP0',
  'https://www.youtube.com/watch?v=_u1Qnf8xu00',
  'https://www.youtube.com/watch?v=Epq92ramN7Y',
  'https://www.youtube.com/watch?v=QgcnD68jmcw',
  'https://www.youtube.com/watch?v=foOFkEWh3Vc',
  'https://www.youtube.com/watch?v=0ZBN9TOEFUw',
  'https://www.youtube.com/watch?v=cVfz8lyxubQ',
  'https://www.youtube.com/watch?v=Z3fyJIx6LIg',
  'https://www.youtube.com/watch?v=jCwEjkpcQhA',
  'https://www.youtube.com/watch?v=BXgJTZBuAm4',
  'https://www.youtube.com/watch?v=FFm1nR8jwLI',
  'https://www.youtube.com/watch?v=_zJkTq9t8U0',
  'https://www.youtube.com/watch?v=uwJHSRfT5c8',
  'https://www.youtube.com/watch?v=UAr2ncBmXHs',
  'https://www.youtube.com/watch?v=_VT35zkfpJ0',
  'https://www.youtube.com/watch?v=-5vCs-uOavY',
  'https://www.youtube.com/watch?v=ESFqXuYM5D0',
  'https://www.youtube.com/watch?v=y3CPl_AqsFA',
  'https://www.youtube.com/watch?v=fRAy3n9-Mws',
  'https://www.youtube.com/watch?v=oBYmoccuqnQ',
  'https://www.youtube.com/watch?v=-rFiI3obW9M',
  'https://www.youtube.com/watch?v=lYXCWkzMtE8',
  'https://www.youtube.com/watch?v=z3yKe-_SVNo',
  'https://www.youtube.com/watch?v=T_0Hk7mRXnM',
  'https://www.youtube.com/watch?v=9KcHLL7J_-0',
  'https://www.youtube.com/watch?v=RyXjEIAh24U',
  'https://www.youtube.com/watch?v=mW-HmY63HNA',
  'https://www.youtube.com/watch?v=7q249EF8w08',
  'https://www.youtube.com/watch?v=jpUGqV_mKm0',
  'https://www.youtube.com/watch?v=vR9NbW6cQ14',
  'https://www.youtube.com/watch?v=PSqDA2eTlZ8',
  'https://www.youtube.com/watch?v=hgyyPRle3D8',
  'https://www.youtube.com/watch?v=uxWhU8Tafko',
  'https://www.youtube.com/watch?v=5XQ3Pd-0c_U',
  'https://www.youtube.com/watch?v=XsYELcGOh9Y',
  'https://www.youtube.com/watch?v=CINjAHRPVNo',
  'https://www.youtube.com/watch?v=JuiAdfOmr3s',
  'https://www.youtube.com/watch?v=mCW_uOS2Ti0',
  'https://www.youtube.com/watch?v=JYBKt1uEJmI',
  'https://www.youtube.com/watch?v=wRci7L-Dd8M',
  'https://www.youtube.com/watch?v=AxHwc4EvUHU',
  'https://www.youtube.com/watch?v=QMiqHo6h4pA',
  'https://www.youtube.com/watch?v=XL7mBHpnOjo',
  'https://www.youtube.com/watch?v=6SaXl1eOAMA',
  'https://www.youtube.com/watch?v=8BoSNJBqMPc',
  'https://www.youtube.com/watch?v=oIrGIeN9b2M',
  'https://www.youtube.com/watch?v=vZAVJ4uPjbg',
  'https://www.youtube.com/watch?v=6LaqxF-QFcw',
  'https://www.youtube.com/watch?v=weBEtHh73ig',
  'https://www.youtube.com/watch?v=RDh0WIOMrYM',
  'https://www.youtube.com/watch?v=giION5PMvDQ',
  'https://www.youtube.com/watch?v=DMa3l8L8p0E',
  'https://www.youtube.com/watch?v=QOt1IMQz16I',
  'https://www.youtube.com/watch?v=jKLDS83i1vE',
  'https://www.youtube.com/watch?v=VDWvtXvw26M',
  'https://www.youtube.com/watch?v=XSvuJAy7EuE',
  'https://www.youtube.com/watch?v=XlllAmvYb-U',
  'https://www.youtube.com/watch?v=W48NmG0xmS4',
  'https://www.youtube.com/watch?v=_0umw90XPzg',
  'https://www.youtube.com/watch?v=kpd_xZ27xsA',
  'https://www.youtube.com/watch?v=TqUlEc6Er60',
  'https://www.youtube.com/watch?v=xfAREiBEtlE',
  'https://www.youtube.com/watch?v=2XwUXcP2ZVk',
  'https://www.youtube.com/watch?v=wFknymGQgZc',
  'https://www.youtube.com/watch?v=jFYa1qt3CM8',
  'https://www.youtube.com/watch?v=xTPQKiB4-yU',
  'https://www.youtube.com/watch?v=lU2pR9KOO2g',
  'https://www.youtube.com/watch?v=NZ56IKikItI',
  'https://www.youtube.com/watch?v=nuvwwJBlIN4',
  'https://www.youtube.com/watch?v=amSNlZU-G8E',
  'https://www.youtube.com/watch?v=kAp2kIbIFLY',
  'https://www.youtube.com/watch?v=ez4begpndNY',
  'https://www.youtube.com/watch?v=zo-hcQAo06M',
  'https://www.youtube.com/watch?v=vR8DwnbmcgU',
  'https://www.youtube.com/watch?v=gZUSc4n2Yz8',
  'https://www.youtube.com/watch?v=v_oj2DUeZGI',
  'https://www.youtube.com/watch?v=XDkODpT0kd8',
  'https://www.youtube.com/watch?v=M5FPcvJSDJo',
  'https://www.youtube.com/watch?v=TiocuiHGxL8',
  'https://www.youtube.com/watch?v=M4_Su2B27Nw',
  'https://www.youtube.com/watch?v=EbjRrAgYiMM',
  'https://www.youtube.com/watch?v=3KODCRpmUqw',
  'https://www.youtube.com/watch?v=wyl5nq0SM8E',
  'https://www.youtube.com/watch?v=QlhBsEzXVgc',
  'https://www.youtube.com/watch?v=pDt-Jrzf4q4',
  'https://www.youtube.com/watch?v=EREFkzJNoDY',
  'https://www.youtube.com/watch?v=MN7glNln29k',
  'https://www.youtube.com/watch?v=Q7Uj5m6wAzE',
  'https://www.youtube.com/watch?v=IT0pTMWtiwM',
  'https://www.youtube.com/watch?v=9PM9rZCURtk',
  'https://www.youtube.com/watch?v=eVycuCEk6T0',
  'https://www.youtube.com/watch?v=k0H3_7lPfSA',
  'https://www.youtube.com/watch?v=4n6i0VLh-yg',
  'https://www.youtube.com/watch?v=j-K6di9l6NY',
  'https://www.youtube.com/watch?v=Wn9vutkwZS0',
  'https://www.youtube.com/watch?v=UBxO4jBPElw',
  'https://www.youtube.com/watch?v=Im_vUBbmAes',
  'https://www.youtube.com/watch?v=8k5GKHjho_A',
  'https://www.youtube.com/watch?v=A07jtbkoKg4',
  'https://www.youtube.com/watch?v=eIYTDU6UTVc',
  'https://www.youtube.com/watch?v=awYKOFEcUxw',
  'https://www.youtube.com/watch?v=5g5PJKqsQBk',
  'https://www.youtube.com/watch?v=7jcusPG2eAA',
  'https://www.youtube.com/watch?v=mIo6mYAyasI',
  'https://www.youtube.com/watch?v=0ktM3UNfGuk',
];

function statusId(url) {
  const match = String(url || '').match(/status\/(\d+)/);
  return match ? match[1] : '';
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
}

test('the filtered public posts keep the original front and source order', () => {
  const tweets = readJson('../x-data.txt');
  const videos = readJson('../YouTube-data.txt');
  const xPublic = readJson('../data/x-public.json');
  const ytPublic = readJson('../data/youtube-public.json');
  const status = readJson('../data/feed-status.json');

  const publicIds = xPublic.map((tweet) => statusId(tweet.tweetUrl));
  assert.equal(publicIds.length, 134);
  assert.equal(new Set(publicIds).size, publicIds.length);
  assert.deepEqual(publicIds.slice(0, ORIGINAL_PUBLIC_IDS.length), ORIGINAL_PUBLIC_IDS);
  assert.equal(xPublic[0].text, '一死二三塁！頑張れ谷端くん！！');
  assert.equal(xPublic[0].tweetUrl, 'https://x.com/sio_seseri/status/2093267243073429916');

  const publicSet = new Set(publicIds);
  const originalSet = new Set(ORIGINAL_PUBLIC_IDS);
  const byId = new Map();
  const sourceIds = [];
  for (const tweet of tweets) {
    const id = statusId(tweet.tweetUrl);
    if (!id || byId.has(id)) continue;
    byId.set(id, tweet);
    sourceIds.push(id);
  }
  for (const tweet of xPublic) {
    const id = statusId(tweet.tweetUrl);
    const source = byId.get(id);
    assert.ok(source, id);
    assert.equal(tweet.tweetUrl, source.tweetUrl);
    assert.equal(tweet.text, source.text);
    assert.equal(tweet.userName, source.userName);
    assert.equal(tweet.createdAt, source.createdAt);
    assert.deepEqual(Object.keys(tweet).sort(), ['createdAt', 'text', 'tweetUrl', 'userName']);
  }

  const historicalRest = sourceIds.filter((id) => publicSet.has(id) && !originalSet.has(id));
  assert.deepEqual(publicIds.slice(ORIGINAL_PUBLIC_IDS.length), historicalRest);
  assert.equal(sourceIds.filter((id) => publicSet.has(id)).length, publicIds.length);

  const rejected = tweets.find((tweet) => String(tweet.text).includes('全く期待外れ'));
  assert.equal(judgeTweet(rejected.text).verdict, 'reject');
  assert.equal(publicIds.includes(statusId(rejected.tweetUrl)), false);

  assert.equal(videos.length > 472, true);
  assert.equal(new Set(videos.map((video) => video.url)).size, videos.length);
  assert.equal(YOUTUBE_EXCLUDED_URLS.length, 180);
  assert.equal(new Set(YOUTUBE_EXCLUDED_URLS).size, YOUTUBE_EXCLUDED_URLS.length);
  const historyVideos = videos.slice(0, 472);
  const excluded = new Set(YOUTUBE_EXCLUDED_URLS);
  const sourceUrls = new Set(historyVideos.map((video) => video.url));
  for (const url of excluded) assert.equal(sourceUrls.has(url), true, url);
  const kept = historyVideos.filter((video) => !excluded.has(video.url));
  assert.equal(kept.length, historyVideos.length - YOUTUBE_EXCLUDED_URLS.length);
  assert.equal(kept.length, 292);
  assert.equal(ytPublic.length, 292);
  assert.deepEqual(ytPublic, kept);
  assert.equal(new Set(ytPublic.map((video) => video.url)).size, ytPublic.length);
  assert.equal(ytPublic.some((video) => excluded.has(video.url)), false);
  assert.equal(ytPublic[0].title, videos[0].title);
  assert.equal(ytPublic[0].url, videos[0].url);
  assert.equal(status.version, 1);
  assert.equal(status.x.state, 'published');
  assert.equal(status.x.count, 134);
  assert.equal(status.x.count, xPublic.length);
  assert.equal(status.x.historyCount, 2669);
  assert.equal(sourceIds.slice(0, status.x.historyCount).filter((id) => publicSet.has(id)).length, publicIds.length);
  assert.equal(status.youtube.state, 'published');
  assert.equal(status.youtube.count, 292);
  assert.equal(status.youtube.count, ytPublic.length);
  assert.equal(status.youtube.historyCount, 472);
  assert.equal(ytPublic.some((video) => video.url === videos[472].url), false);
});
