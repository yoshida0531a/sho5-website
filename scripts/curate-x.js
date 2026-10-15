import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curateTweets } from './lib/x-sentiment.js';
import { readJson, writeJsonAtomic } from './lib/json-file.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function envPath(name, fallback) {
  return process.env[name] ? path.resolve(process.env[name]) : path.join(ROOT, fallback);
}

export async function main() {
  const sourcePath = envPath('X_SOURCE', 'x-data.txt');
  const publicPath = envPath('X_PUBLIC', 'data/x-public.json');
  const cachePath = envPath('X_CACHE', 'data/x-judgments.json');
  const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
  const budget = Number.parseInt(process.env.X_MODEL_MAX_CALLS || '0', 10);

  let tweets;
  try {
    tweets = readJson(sourcePath);
  } catch {
    console.error('x-data を読めませんでした。公開データは変更していません。');
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(tweets)) {
    console.error('x-data の形式が配列ではありません。公開データは変更していません。');
    process.exitCode = 1;
    return;
  }

  let cache = { items: {} };
  if (fs.existsSync(cachePath)) {
    try {
      cache = readJson(cachePath);
    } catch {
      console.error('判定キャッシュを読めないため中断しました。公開データは変更していません。');
      process.exitCode = 1;
      return;
    }
  }

  const before = fs.readFileSync(sourcePath);
  const result = await curateTweets(tweets, {
    cache,
    modelBudget: { remaining: Number.isNaN(budget) || budget < 0 ? 0 : budget },
  });
  if (!before.equals(fs.readFileSync(sourcePath))) {
    console.error('元データが変化したため、公開データを書き込みません。');
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    dryRun,
    publish: result.stats.publish,
    reject: result.stats.reject,
    reused: result.stats.reused,
    judged: result.stats.judged,
    modelCalls: result.stats.modelCalls,
  }));
  if (dryRun) return;
  writeJsonAtomic(publicPath, result.tweets);
  writeJsonAtomic(cachePath, result.cache);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
