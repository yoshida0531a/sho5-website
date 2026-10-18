import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RULESET_FINGERPRINT, RULESET_VERSION } from '../scripts/lib/x-sentiment.js';
import {
  HISTORICAL_X_CONTRACT,
  alignHistoricalPosts,
  previewHistoricalX,
  previewOutputAllowed,
  protectedPaths,
  readJsonArray,
  snapshotProtectedFiles,
} from '../scripts/preview-historical-x-filter.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function tweet(id, text, userName = 'user_name') {
  return {
    text,
    userName,
    createdAt: 'October 1, 2026 at 01:00AM',
    tweetUrl: `https://x.com/${userName}/status/${id}`,
  };
}

function historicalIds(count, start = 2090000000000000000n) {
  return Array.from({ length: count }, (_, index) => String(start + BigInt(index)));
}

function restoredSource(publicTweets) {
  const extras = historicalIds(HISTORICAL_X_CONTRACT.expectedNewcomers - 2, 2110500000000000000n);
  const newcomerIds = [
    HISTORICAL_X_CONTRACT.firstNewcomer,
    ...extras,
    HISTORICAL_X_CONTRACT.lastNewcomer,
  ];
  return [
    ...publicTweets,
    ...newcomerIds.map((id, index) => tweet(id, `新着${index} 谷端くん頑張れ`, 'newcomer')),
  ];
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('the preview contract is the current ruleset and the restored history boundary', () => {
  assert.equal(RULESET_VERSION, 7);
  assert.equal(RULESET_FINGERPRINT, '539e348bc6a694ec9f26');
  assert.equal(HISTORICAL_X_CONTRACT.expectedPublic, 2669);
  assert.equal(HISTORICAL_X_CONTRACT.expectedNewcomers, 102);
  const source = fs.readFileSync(new URL('../scripts/preview-historical-x-filter.js', import.meta.url), 'utf8');
  assert.match(source, /cache:\s*\{\s*items:\s*\{\s*\}\s*\}/);
  assert.equal(source.includes('readJsonArray'), true);
  assert.equal(source.includes("readJsonArray(path.join(ROOT, 'data/x-judgments.json')"), false);
  assert.equal(source.includes('writeJsonAtomic'), false);
});

test('a short public file, duplicate ids, and a broken source stop before judging', async () => {
  const short = alignHistoricalPosts([tweet('1', '谷端くん頑張れ')], [tweet('1', '谷端くん頑張れ')]);
  assert.equal(short.ok, false);
  assert.equal(short.reason, 'public-count');

  const ids = historicalIds(2669);
  const publicTweets = ids.map((id, index) => tweet(id, `谷端くん頑張れ ${index}`));
  publicTweets[10] = tweet(ids[0], '谷端くん頑張れ 10');
  const duplicate = alignHistoricalPosts(publicTweets, restoredSource(publicTweets));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'duplicate-public-ids');

  const clean = ids.map((id, index) => tweet(id, `谷端くん頑張れ ${index}`));
  const missing = alignHistoricalPosts(clean, clean.slice(0, -1));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'public-ids-missing-from-source');

  const source = restoredSource(clean);
  const intruder = tweet('2110460000000000000', '途中の新着');
  source.splice(10, 0, intruder);
  const interrupted = alignHistoricalPosts(clean, source);
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.reason, 'newcomer-before-history-complete');

  const broken = readJsonArray(path.join(os.tmpdir(), `sho5-missing-${process.pid}.json`));
  assert.equal(broken.ok, false);
  const invalidPath = path.join(os.tmpdir(), `sho5-invalid-${process.pid}.json`);
  fs.writeFileSync(invalidPath, '{');
  assert.equal(readJsonArray(invalidPath).reason, 'invalid-json');
  fs.writeFileSync(invalidPath, '{"text":"谷端"}');
  assert.equal(readJsonArray(invalidPath).reason, 'json-not-array');
  fs.unlinkSync(invalidPath);
});

test('new posts stay outside the batch and only fresh publish verdicts are kept', async () => {
  const ids = historicalIds(2669);
  const publicTweets = ids.map((id, index) => tweet(id, index === 1 ? '谷端くん頑張れ 0' : `谷端くん頑張れ ${index}`));
  publicTweets[1] = tweet(ids[1], '谷端くん頑張れ 0');
  publicTweets[2] = tweet(ids[2], '谷端は残念');
  const source = restoredSource(publicTweets);
  const first = await previewHistoricalX(publicTweets, source);
  const second = await previewHistoricalX(publicTweets, source);
  assert.equal(first.ok, true, first.reason);
  assert.deepEqual(second, first);
  assert.equal(first.preview.summary.inputCount, 2669);
  assert.equal(first.preview.summary.validIdCount, 2669);
  assert.equal(first.preview.summary.duplicateIdCount, 0);
  assert.equal(first.preview.summary.invalidCount, 0);
  assert.equal(first.preview.summary.newcomerCount, 102);
  assert.equal(first.preview.summary.cacheReused, 0);
  assert.equal(first.preview.summary.modelCalls, 0);
  assert.equal(first.preview.summary.judged, 2669);
  assert.equal(first.preview.summary.rulesetVersion, 7);
  assert.equal(first.preview.summary.rulesetFingerprint, '539e348bc6a694ec9f26');
  assert.equal(first.preview.decisions.length, 2669);
  assert.equal(first.preview.excludedNewcomerIds.includes(HISTORICAL_X_CONTRACT.firstNewcomer), true);
  assert.equal(first.preview.decisions.some((row) => row.statusId === HISTORICAL_X_CONTRACT.firstNewcomer), false);
  assert.equal(first.preview.decisions[0].text, publicTweets[0].text);
  assert.equal(first.preview.decisions[0].url, publicTweets[0].tweetUrl);
  assert.equal(first.preview.decisions[0].order, 1);
  assert.deepEqual(
    first.preview.kept.map((row) => row.order),
    [...first.preview.kept.map((row) => row.order)].sort((left, right) => left - right),
  );
  assert.equal(first.preview.summary.duplicateTextRemoved, 1);
  assert.equal(first.preview.decisions[1].verdict, 'publish');
  assert.equal(first.preview.decisions[1].included, false);
  assert.equal(first.preview.decisions[2].verdict, 'reject');
  assert.equal(
    first.preview.summary.publishCandidates + first.preview.summary.excludeCandidates,
    2669,
  );
  assert.equal(
    first.preview.summary.keptCount + first.preview.summary.duplicateTextRemoved,
    first.preview.summary.publishCandidates,
  );
});

test('the branch source without the restored suffix does not run', () => {
  const ids = historicalIds(2669);
  const publicTweets = ids.map((id, index) => tweet(id, `谷端くん頑張れ ${index}`));
  const result = alignHistoricalPosts(publicTweets, publicTweets);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unexpected-source-count');
  assert.equal(result.detail.sourceCount, 2669);
});

test('preview output cannot target repository data files', () => {
  assert.equal(previewOutputAllowed(path.join(ROOT, 'data/x-public.json')), false);
  assert.equal(previewOutputAllowed(path.join(ROOT, 'x-data.txt')), false);
  assert.equal(previewOutputAllowed('/tmp/sho5-historical-x-filter-preview.json'), true);
});

test('the published history and the restored source stay unchanged through a real preview', async (t) => {
  let restoredText;
  try {
    restoredText = execFileSync('git', ['show', 'cursor/restore-x-data-8bd1:x-data.txt'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    t.skip('restored x-data.txt is not available in this checkout');
    return;
  }
  const before = snapshotProtectedFiles();
  const hashes = Object.fromEntries(protectedPaths().filter((file) => fs.existsSync(file)).map((file) => [file, digest(file)]));
  const published = readJsonArray(path.join(ROOT, 'data/x-public.json'));
  const source = JSON.parse(restoredText);
  assert.equal(published.ok, true);
  const preview = await previewHistoricalX(published.value, source);
  assert.equal(preview.ok, true, preview.reason);
  const after = snapshotProtectedFiles();
  assert.deepEqual(after, before);
  for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(file), hash);
  assert.equal(fs.existsSync(path.join(ROOT, 'data/feed-curation-state.json')), false);

  const summary = preview.preview.summary;
  assert.equal(summary.inputCount, 2669);
  assert.equal(summary.validIdCount, 2669);
  assert.equal(summary.duplicateIdCount, 0);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.publishCandidates, 137);
  assert.equal(summary.excludeCandidates, 2532);
  assert.equal(summary.duplicateTextRemoved, 3);
  assert.equal(summary.keptCount, 134);
  assert.equal(summary.postsWithMultipleReasons, 144);
  assert.equal(summary.reasonCountsMatchInput, false);
  assert.equal(summary.newcomerCount, 102);
  assert.equal(summary.cacheReused, 0);
  assert.equal(summary.modelCalls, 0);
  assert.equal(summary.judged, 2669);
  assert.equal(summary.publishCandidates + summary.excludeCandidates, 2669);
  assert.equal(summary.keptCount + summary.duplicateTextRemoved, summary.publishCandidates);
  assert.equal(preview.preview.decisions.length, 2669);
  assert.equal(preview.preview.excludedNewcomerIds[0], HISTORICAL_X_CONTRACT.firstNewcomer);
  assert.equal(preview.preview.excludedNewcomerIds[101], HISTORICAL_X_CONTRACT.lastNewcomer);
  assert.equal(
    preview.preview.decisions.some((row) => preview.preview.excludedNewcomerIds.includes(row.statusId)),
    false,
  );
  preview.preview.decisions.forEach((row, index) => {
    assert.equal(row.order, index + 1);
    assert.equal(row.statusId, published.value[index].tweetUrl.match(/status\/(\d+)/)[1]);
    assert.equal(row.url, published.value[index].tweetUrl);
    assert.equal(row.text, published.value[index].text);
    assert.equal(row.userName, published.value[index].userName);
    assert.equal(row.createdAt, published.value[index].createdAt);
    assert.equal(row.rulesetVersion, 7);
    assert.equal(row.rulesetFingerprint, '539e348bc6a694ec9f26');
    assert.equal(row.modelUsed, false);
  });
  const keptOrders = preview.preview.kept.map((row) => row.order);
  assert.deepEqual(keptOrders, [...keptOrders].sort((left, right) => left - right));
  const repeated = await previewHistoricalX(published.value, source);
  assert.equal(repeated.preview.baselineHash, preview.preview.baselineHash);
  assert.deepEqual(repeated.preview.summary, preview.preview.summary);
  assert.deepEqual(
    repeated.preview.decisions.map((row) => [row.statusId, row.verdict, row.included, row.reasons]),
    preview.preview.decisions.map((row) => [row.statusId, row.verdict, row.included, row.reasons]),
  );
});
