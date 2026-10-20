import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractXStatusId } from '../js/safe-url.js';
import {
  RULESET_FINGERPRINT,
  RULESET_VERSION,
  curateTweets,
} from './lib/x-sentiment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const HISTORICAL_X_CONTRACT = {
  expectedPublic: 2669,
  expectedNewcomers: 102,
  firstNewcomer: '2110476083053392199',
  lastNewcomer: '2110803646816629187',
};

const REASONS = {
  'public-not-array': '公開履歴が配列ではありません。',
  'source-not-array': 'x-data.txt が配列ではありません。',
  'public-count': '公開履歴が2,669件ではありません。',
  'invalid-public-rows': '公開履歴にID、URL、本文、ユーザー名、日時のいずれかが欠けた投稿があります。',
  'duplicate-public-ids': '公開履歴に重複した投稿IDがあります。',
  'invalid-source-rows': 'x-data.txt に投稿IDを読めない行があります。',
  'duplicate-source-ids': 'x-data.txt に重複した投稿IDがあります。',
  'public-ids-missing-from-source': '公開履歴の投稿IDが復旧済みの x-data.txt にありません。',
  'newcomer-before-history-complete': '未公開の投稿IDが、公開履歴のIDより前にあります。',
  'public-id-after-newcomers': '公開履歴の投稿IDが、新着の後ろにあります。',
  'unexpected-source-count': 'x-data.txt の件数が、公開履歴と新着102件の合計と一致しません。',
  'unexpected-newcomer-count': '公開履歴に含まれない投稿が102件ではありません。',
  'newcomer-boundary-mismatch': '新着102件の先頭または末尾の投稿IDが復旧データと一致しません。',
  'newcomer-in-input': '新着102件が再判定の入力に含まれています。',
  'judgment-mismatch': '公開候補の抽出が現行の選別処理と一致しません。',
  'accounting-mismatch': '集計が入力件数と一致しません。',
  'invalid-json': 'JSONを読めません。',
  'json-not-array': 'JSONの形式が配列ではありません。',
  'unreadable-json': 'ファイルを読めません。',
  'output-inside-repo': 'プレビューの出力先がリポジトリ内です。',
  'protected-file-changed': '処理の前後で保護対象ファイルが変化しました。',
};

export function previewFailureMessage(reason) {
  return REASONS[reason] || 'プレビューを停止しました。';
}

function fail(reason, detail = {}) {
  return { ok: false, reason, detail };
}

function statusId(tweet) {
  if (!tweet || typeof tweet !== 'object') return '';
  return extractXStatusId(tweet.tweetUrl) || '';
}

function validPublicRow(tweet) {
  return Boolean(statusId(tweet))
    && typeof tweet.text === 'string'
    && typeof tweet.userName === 'string'
    && typeof tweet.createdAt === 'string';
}

function hashBaseline(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function alignHistoricalPosts(publicTweets, sourceTweets, contract = HISTORICAL_X_CONTRACT) {
  if (!Array.isArray(publicTweets)) return fail('public-not-array');
  if (!Array.isArray(sourceTweets)) return fail('source-not-array');
  if (publicTweets.length !== contract.expectedPublic) {
    return fail('public-count', { inputCount: publicTweets.length, expected: contract.expectedPublic });
  }

  const invalidIndexes = [];
  const publicIds = [];
  const seen = new Set();
  let duplicateIdCount = 0;
  for (let index = 0; index < publicTweets.length; index += 1) {
    const tweet = publicTweets[index];
    if (!validPublicRow(tweet)) {
      invalidIndexes.push(index);
      continue;
    }
    const id = statusId(tweet);
    if (seen.has(id)) duplicateIdCount += 1;
    seen.add(id);
    publicIds.push(id);
  }
  if (invalidIndexes.length > 0) {
    return fail('invalid-public-rows', {
      invalidCount: invalidIndexes.length,
      indexes: invalidIndexes.slice(0, 20),
    });
  }
  if (duplicateIdCount > 0 || seen.size !== contract.expectedPublic) {
    return fail('duplicate-public-ids', { duplicateIdCount, validIdCount: seen.size });
  }

  const sourceIds = [];
  const sourceSeen = new Set();
  const invalidSourceIndexes = [];
  let duplicateSourceIds = 0;
  for (let index = 0; index < sourceTweets.length; index += 1) {
    const id = statusId(sourceTweets[index]);
    if (!id) {
      invalidSourceIndexes.push(index);
      continue;
    }
    if (sourceSeen.has(id)) {
      duplicateSourceIds += 1;
      continue;
    }
    sourceSeen.add(id);
    sourceIds.push(id);
  }
  if (invalidSourceIndexes.length > 0) {
    return fail('invalid-source-rows', {
      invalidCount: invalidSourceIndexes.length,
      indexes: invalidSourceIndexes.slice(0, 20),
    });
  }
  if (duplicateSourceIds > 0) {
    return fail('duplicate-source-ids', { duplicateIdCount: duplicateSourceIds });
  }

  const newcomers = [];
  const seenPublic = new Set();
  let historyComplete = false;
  for (const id of sourceIds) {
    if (seen.has(id)) {
      if (historyComplete) return fail('public-id-after-newcomers', { statusId: id });
      seenPublic.add(id);
      continue;
    }
    if (!historyComplete) {
      if (seenPublic.size !== seen.size) {
        return fail('newcomer-before-history-complete', {
          statusId: id,
          seenPublic: seenPublic.size,
          expectedPublic: seen.size,
        });
      }
      historyComplete = true;
    }
    newcomers.push(id);
  }
  if (seenPublic.size !== seen.size) {
    return fail('public-ids-missing-from-source', { missing: seen.size - seenPublic.size });
  }
  if (newcomers.some((id) => seen.has(id))) return fail('newcomer-in-input');
  if (sourceIds.length !== contract.expectedPublic + contract.expectedNewcomers) {
    return fail('unexpected-source-count', {
      sourceCount: sourceIds.length,
      expected: contract.expectedPublic + contract.expectedNewcomers,
    });
  }
  if (newcomers.length !== contract.expectedNewcomers) {
    return fail('unexpected-newcomer-count', { newcomerCount: newcomers.length });
  }
  const lastNewcomer = newcomers[newcomers.length - 1];
  if (newcomers[0] !== contract.firstNewcomer || lastNewcomer !== contract.lastNewcomer) {
    return fail('newcomer-boundary-mismatch', { first: newcomers[0], last: lastNewcomer });
  }

  return {
    ok: true,
    publicIds,
    newcomers,
    sourceCount: sourceTweets.length,
    uniqueSourceCount: sourceIds.length,
  };
}

function addCount(target, key) {
  target[key] = (target[key] || 0) + 1;
}

export async function previewHistoricalX(publicTweets, sourceTweets, contract = HISTORICAL_X_CONTRACT) {
  const aligned = alignHistoricalPosts(publicTweets, sourceTweets, contract);
  if (!aligned.ok) return aligned;

  const curated = await curateTweets(publicTweets, {
    cache: { items: {} },
    model: null,
    modelBudget: { remaining: 0 },
  });
  const inputIds = new Set(aligned.publicIds);
  if (aligned.newcomers.some((id) => inputIds.has(id))) return fail('newcomer-in-input');

  const decisions = [];
  const reasonCounts = {};
  const primaryReasonCounts = {};
  const excludeReasonCounts = {};
  const publishReasonCounts = {};
  let postsWithMultipleReasons = 0;
  for (let index = 0; index < publicTweets.length; index += 1) {
    const tweet = publicTweets[index];
    const id = aligned.publicIds[index];
    const judged = curated.cache.items[id];
    if (!judged) return fail('judgment-mismatch', { statusId: id });
    const reasons = Array.isArray(judged.reasons) ? judged.reasons : [];
    if (reasons.length > 1) postsWithMultipleReasons += 1;
    for (const reason of reasons) addCount(reasonCounts, reason);
    addCount(primaryReasonCounts, reasons.join('+') || 'none');
    const bucket = judged.verdict === 'publish' ? publishReasonCounts : excludeReasonCounts;
    for (const reason of reasons) addCount(bucket, reason);
    decisions.push({
      order: index + 1,
      statusId: id,
      url: tweet.tweetUrl,
      text: tweet.text,
      userName: tweet.userName,
      createdAt: tweet.createdAt,
      verdict: judged.verdict === 'publish' ? 'publish' : 'reject',
      included: false,
      reasons,
      confidence: judged.confidence,
      modelUsed: judged.modelUsed === true,
      rulesetVersion: judged.rulesetVersion,
      rulesetFingerprint: judged.rulesetFingerprint,
      contentHash: judged.hash,
    });
  }

  const kept = [];
  const seenText = new Set();
  let duplicateTextRemoved = 0;
  for (const decision of decisions) {
    if (decision.verdict !== 'publish') continue;
    if (seenText.has(decision.contentHash)) {
      duplicateTextRemoved += 1;
      decision.removedAsDuplicateText = true;
      continue;
    }
    seenText.add(decision.contentHash);
    decision.included = true;
    decision.removedAsDuplicateText = false;
    kept.push(decision);
  }
  for (const decision of decisions) {
    if (decision.removedAsDuplicateText === undefined) decision.removedAsDuplicateText = false;
  }

  const curatedUrls = curated.tweets.map((tweet) => tweet.tweetUrl);
  const keptUrls = kept.map((decision) => decision.url);
  if (
    curated.stats.reused !== 0
    || curated.stats.modelCalls !== 0
    || curated.stats.judged !== publicTweets.length
    || curated.stats.duplicates !== duplicateTextRemoved
    || JSON.stringify(curatedUrls) !== JSON.stringify(keptUrls)
  ) {
    return fail('judgment-mismatch', {
      reused: curated.stats.reused,
      modelCalls: curated.stats.modelCalls,
      judged: curated.stats.judged,
      duplicates: curated.stats.duplicates,
      duplicateTextRemoved,
    });
  }

  const publishCandidates = decisions.filter((decision) => decision.verdict === 'publish').length;
  const excludeCandidates = decisions.filter((decision) => decision.verdict === 'reject').length;
  const reasonCountSum = Object.values(reasonCounts).reduce((sum, count) => sum + count, 0);
  const primarySum = Object.values(primaryReasonCounts).reduce((sum, count) => sum + count, 0);
  const summary = {
    inputCount: publicTweets.length,
    validIdCount: aligned.publicIds.length,
    duplicateIdCount: 0,
    invalidCount: 0,
    publishCandidates,
    excludeCandidates,
    duplicateTextRemoved,
    keptCount: kept.length,
    publishCandidateRate: publishCandidates / publicTweets.length,
    excludeRate: excludeCandidates / publicTweets.length,
    keptRate: kept.length / publicTweets.length,
    reasonCounts,
    primaryReasonCounts,
    excludeReasonCounts,
    publishReasonCounts,
    postsWithMultipleReasons,
    reasonCountSum,
    reasonCountsMatchInput: reasonCountSum === publicTweets.length,
    reasonCountsNote: reasonCountSum === publicTweets.length
      ? '各投稿の理由は一つです。理由別件数の合計は入力件数と一致します。'
      : '一つの投稿に複数の理由が付くため、理由別件数の合計は入力件数と一致しません。主理由の合計は入力件数と一致します。',
    rulesetVersion: RULESET_VERSION,
    rulesetFingerprint: RULESET_FINGERPRINT,
    modelCalls: curated.stats.modelCalls,
    cacheReused: curated.stats.reused,
    judged: curated.stats.judged,
    sourceCount: aligned.sourceCount,
    newcomerCount: aligned.newcomers.length,
    newcomersExcluded: true,
  };
  if (
    summary.validIdCount !== summary.inputCount
    || publishCandidates + excludeCandidates !== summary.inputCount
    || summary.keptCount + duplicateTextRemoved !== publishCandidates
    || primarySum !== summary.inputCount
    || summary.judged !== summary.inputCount
  ) {
    return fail('accounting-mismatch', summary);
  }

  const baseline = decisions.map((decision) => [
    decision.statusId,
    decision.url,
    decision.text,
    decision.userName,
    decision.createdAt,
    decision.order,
  ]);
  return {
    ok: true,
    preview: {
      kind: 'historical-x-filter-preview',
      writesPublicJson: false,
      rulesetVersion: RULESET_VERSION,
      rulesetFingerprint: RULESET_FINGERPRINT,
      baselineHash: hashBaseline(baseline),
      summary,
      excludedNewcomerIds: aligned.newcomers,
      kept: kept.map((decision) => ({
        order: decision.order,
        statusId: decision.statusId,
        url: decision.url,
        text: decision.text,
        userName: decision.userName,
        createdAt: decision.createdAt,
      })),
      decisions,
    },
  };
}

export function readJsonArray(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return fail('unreadable-json', { file: path.basename(file) });
  }
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return fail('json-not-array', { file: path.basename(file) });
    return { ok: true, value };
  } catch {
    return fail('invalid-json', { file: path.basename(file) });
  }
}

export function previewOutputAllowed(outputPath) {
  const root = fs.realpathSync(ROOT);
  const resolved = path.resolve(outputPath);
  const parent = path.dirname(resolved);
  const realParent = fs.existsSync(parent) ? fs.realpathSync(parent) : path.resolve(parent);
  const realTarget = path.join(realParent, path.basename(resolved));
  const relative = path.relative(root, realTarget);
  return relative.startsWith('..') || path.isAbsolute(relative);
}

function fileDigest(file) {
  if (!fs.existsSync(file)) return { exists: false, sha256: null };
  return {
    exists: true,
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
}

export function protectedPaths() {
  return [
    path.join(ROOT, 'x-data.txt'),
    path.join(ROOT, 'data/x-public.json'),
    path.join(ROOT, 'data/x-judgments.json'),
    path.join(ROOT, 'data/feed-status.json'),
    path.join(ROOT, 'data/feed-curation-state.json'),
  ];
}

export function snapshotProtectedFiles() {
  return Object.fromEntries(protectedPaths().map((file) => [path.relative(ROOT, file), fileDigest(file)]));
}

export async function main() {
  const publicPath = process.env.X_PUBLIC
    ? path.resolve(process.env.X_PUBLIC)
    : path.join(ROOT, 'data/x-public.json');
  const sourcePath = process.env.X_SOURCE
    ? path.resolve(process.env.X_SOURCE)
    : path.join(ROOT, 'x-data.txt');
  const outputPath = process.env.PREVIEW_OUTPUT
    ? path.resolve(process.env.PREVIEW_OUTPUT)
    : '/tmp/sho5-historical-x-filter-preview.json';
  if (!previewOutputAllowed(outputPath)) {
    console.error(previewFailureMessage('output-inside-repo'));
    process.exitCode = 1;
    return;
  }

  const before = snapshotProtectedFiles();
  const published = readJsonArray(publicPath);
  const source = readJsonArray(sourcePath);
  if (!published.ok || !source.ok) {
    const failure = published.ok ? source : published;
    console.error(previewFailureMessage(failure.reason));
    console.error(JSON.stringify(failure.detail));
    process.exitCode = 1;
    return;
  }
  const result = await previewHistoricalX(published.value, source.value);
  const after = snapshotProtectedFiles();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    console.error(previewFailureMessage('protected-file-changed'));
    process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    console.error(previewFailureMessage(result.reason));
    console.error(JSON.stringify(result.detail));
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(result.preview, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, ...result.preview.summary }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
