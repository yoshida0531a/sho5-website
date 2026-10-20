import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const SOURCE_COMMIT = '37b3f1115fb5db1b53d86ecba71e12cb41863f57';
const TRUNCATED_COMMIT = '686da6c7c9faa65108653ed437bd39dfba959e19';

const text = fs.readFileSync(new URL('../x-data.txt', import.meta.url), 'utf8');
const tweets = JSON.parse(text);

function statusId(tweet) {
  const match = typeof tweet?.tweetUrl === 'string' ? tweet.tweetUrl.match(/status\/(\d+)/) : null;
  return match ? match[1] : '';
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function readCommitFile(rev) {
  return JSON.parse(git(['show', `${rev}:x-data.txt`]));
}

function assertSamePosts(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < expected.length; index += 1) {
    const row = actual[index];
    const source = expected[index];
    assert.equal(statusId(row), statusId(source), `${label}[${index}] id`);
    assert.equal(row.tweetUrl, source.tweetUrl, `${label}[${index}] url`);
    assert.equal(row.text, source.text, `${label}[${index}] text`);
    assert.equal(row.userName, source.userName, `${label}[${index}] userName`);
    assert.equal(row.createdAt, source.createdAt, `${label}[${index}] createdAt`);
    assert.deepEqual(row, source, `${label}[${index}]`);
  }
}

function assertUniqueAscending(rows, label) {
  const ids = rows.map(statusId);
  assert.equal(ids.every((value) => value.length > 0), true, `${label} ids`);
  assert.equal(new Set(ids).size, ids.length, `${label} unique`);
  for (let index = 1; index < ids.length; index += 1) {
    assert.equal(BigInt(ids[index]) > BigInt(ids[index - 1]), true, `${label} order ${index}`);
  }
  return ids;
}

test('restored x-data keeps the source history and the surviving posts after it', () => {
  const source = readCommitFile(SOURCE_COMMIT);
  const truncated = readCommitFile(TRUNCATED_COMMIT);
  const sourceIds = new Set(source.map(statusId));
  assert.equal(truncated.some((row) => sourceIds.has(statusId(row))), false);

  assertSamePosts(tweets.slice(0, source.length), source, 'source history');
  assertSamePosts(
    tweets.slice(source.length, source.length + truncated.length),
    truncated,
    'posts kept after the truncation',
  );
  assert.equal(tweets.length >= source.length + truncated.length, true);

  const historyIds = new Set([...source, ...truncated].map(statusId));
  for (const row of tweets.slice(source.length + truncated.length)) {
    assert.equal(historyIds.has(statusId(row)), false);
  }
  assertUniqueAscending(tweets, 'restored file');
  assert.equal(JSON.stringify(tweets, null, 2), text);
});

test('merging origin/main keeps every current post once and in id order', () => {
  const source = readCommitFile(SOURCE_COMMIT);
  const truncated = readCommitFile(TRUNCATED_COMMIT);
  const mainTweets = readCommitFile('origin/main');
  const sourceIds = new Set(source.map(statusId));
  const truncatedIds = new Set(truncated.map(statusId));
  const branchIds = new Set(tweets.map(statusId));
  const mainAlreadyRestored = mainTweets.length >= source.length
    && mainTweets.slice(0, source.length).every((row, index) => statusId(row) === statusId(source[index]));
  if (mainAlreadyRestored) {
    assertSamePosts(tweets, mainTweets, 'branch matches restored main');
    assertSamePosts(tweets.slice(0, source.length), source, 'restored history');
    assertSamePosts(
      tweets.slice(source.length, source.length + truncated.length),
      truncated,
      'posts kept after the truncation',
    );
    assertUniqueAscending(tweets, 'restored main');
    return;
  }

  assert.equal(mainTweets.every((row) => !sourceIds.has(statusId(row))), true);
  assert.equal(truncated.every((row) => !sourceIds.has(statusId(row))), true);
  for (const row of truncated) {
    assert.equal(mainTweets.some((mainRow) => statusId(mainRow) === statusId(row)), true);
  }

  const mergeOutput = git(['merge-tree', '--write-tree', 'origin/main', 'HEAD']);
  const tree = mergeOutput.split('\n')[0].trim();
  assert.match(tree, /^[0-9a-f]{40}$/);
  const merged = JSON.parse(git(['show', `${tree}:x-data.txt`]));

  assertSamePosts(merged.slice(0, source.length), source, 'merged source history');
  assertSamePosts(
    merged.slice(source.length, source.length + truncated.length),
    truncated,
    'merged posts kept after the truncation',
  );
  assertSamePosts(merged.slice(0, tweets.length), tweets, 'merged restore file');

  const mainOnly = mainTweets.filter((row) => !branchIds.has(statusId(row)));
  assertSamePosts(merged.slice(tweets.length), mainOnly, 'posts added on main after the restore');
  assert.equal(merged.length, tweets.length + mainOnly.length);

  const mergedById = new Map(merged.map((row) => [statusId(row), row]));
  assert.equal(mergedById.size, merged.length);
  for (const row of mainTweets) {
    assert.deepEqual(mergedById.get(statusId(row)), row);
  }
  const mainIdSet = new Set(mainTweets.map(statusId));
  assert.equal(merged.filter((row) => mainIdSet.has(statusId(row))).length, mainTweets.length);
  assertUniqueAscending(merged, 'merged file');

  for (const row of mainTweets) {
    if (branchIds.has(statusId(row))) {
      assert.deepEqual(
        tweets.find((branchRow) => statusId(branchRow) === statusId(row)),
        row,
      );
    }
  }
  assert.equal(truncatedIds.size, truncated.length);
});
