import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const text = fs.readFileSync(new URL('../x-data.txt', import.meta.url), 'utf8');
const tweets = JSON.parse(text);

function statusId(tweet) {
  const match = typeof tweet?.tweetUrl === 'string' ? tweet.tweetUrl.match(/status\/(\d+)/) : null;
  return match ? match[1] : '';
}

function digest(rows) {
  const tuples = rows.map((row) => [statusId(row), row.tweetUrl, row.text, row.userName, row.createdAt]);
  return crypto.createHash('sha256').update(JSON.stringify(tuples)).digest('hex');
}

test('restored x-data keeps the earlier 2669 posts and appends the later 102', () => {
  assert.equal(Array.isArray(tweets), true);
  assert.equal(tweets.length, 2771);
  const ids = tweets.map(statusId);
  assert.equal(ids.every((value) => value.length > 0), true);
  assert.equal(new Set(ids).size, 2771);
  assert.equal(digest(tweets.slice(0, 2669)), '3714ffaa250d9a9df63be3ac3053778375a6785468765ffd38e07994ea7d7ea5');
  assert.equal(digest(tweets.slice(2669)), 'd687341f9a3b945074a6fd12a4fcd5d7f56c14cb09d62310248c9a8e9693a214');
  assert.equal(ids[0], '2092719964855869793');
  assert.equal(tweets[0].userName, 'jn1xni');
  assert.equal(tweets[0].tweetUrl, 'https://x.com/jn1xni/status/2092719964855869793');
  assert.equal(tweets[1661].createdAt, 'September 26, 2026');
  assert.equal(ids[2668], '2110406830472249837');
  assert.equal(tweets[2668].userName, 'RuiTigers06');
  assert.equal(ids[2669], '2110476083053392199');
  assert.equal(tweets[2669].userName, 'akanoko52');
  assert.equal(tweets[2669].createdAt, 'October 15, 2026 at 06:01AM');
  assert.equal(ids[2770], '2110803646816629187');
  assert.equal(tweets[2770].userName, '9bdNu');
  assert.equal(BigInt(ids[2669]) > BigInt(ids[2668]), true);
  for (let index = 1; index < ids.length; index += 1) {
    assert.equal(BigInt(ids[index]) > BigInt(ids[index - 1]), true);
  }
  const seen = new Set(tweets.slice(0, 2669).map((row) => row.tweetUrl));
  const extra = tweets.slice(2669).filter((row) => row.tweetUrl && !seen.has(row.tweetUrl));
  assert.deepEqual([...tweets.slice(0, 2669), ...extra], tweets);
  assert.equal(JSON.stringify(tweets, null, 2), text);
});
