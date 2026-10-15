import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  RULESET_FINGERPRINT,
  RULESET_VERSION,
  containsInsult,
  contentHash,
  curateTweets,
  judgeTweet,
  resolveVerdict,
  rulesetMaterial,
} from '../scripts/lib/x-sentiment.js';
import { createHash } from 'node:crypto';

function rejected(text) {
  const result = judgeTweet(text);
  assert.equal(result.verdict, 'reject', JSON.stringify({ text, result }));
  return result;
}

function published(text) {
  const result = judgeTweet(text);
  assert.equal(result.verdict, 'publish', JSON.stringify({ text, result }));
  return result;
}

test('publishes straightforward praise and encouragement', () => {
  published('谷端くん素晴らしいな');
  published('谷端選手がんばれ！応援しています！');
  published('谷端、来年以降レギュラーを掴めるよう頑張って！');
  published('谷端選手！大好きです！頑張ってください！ #ほっと神戸');
  published('谷端くんナイスキャッチ！！👏');
});

test('rejects neutral game information', () => {
  const result = rejected('本日のファーム・広島戦のスタメンです。先発は富田選手です。立石、谷端、糸原');
  assert.equal(result.reasons[0], 'neutral');
});

test('rejects insults, mockery, and attacks', () => {
  rejected('立石、谷端、岡城つかえ！カス藤川！');
  rejected('はいゴミ。谷端のボーンヘッドも悪い');
  rejected('ほんとバカだな、阪神フロントは。谷端も戦力にできない');
  rejected('谷端はゴミだ');
});

test('does not treat バカスカ as an insult', () => {
  assert.equal(containsInsult('谷端がバカスカ打ってて最高'), false);
  published('谷端がバカスカ打ってて最高');
});

test('rejects sarcasm that borrows positive words', () => {
  rejected('谷端って前評価クソ高かったよな');
  rejected('さすが谷端、エラー連発で最高だな');
  rejected('「谷端最高」とか言うけど全然ダメ');
  rejected('谷端って素晴らしい（笑）');
  rejected('期待のルーキー谷端');
});

test('rejects quoted cheers, negated wishes, and したくない', () => {
  assert.equal(rejected('谷端くんの接触シーンで、脳震盪の可能性のある人に「がんばれ」コールは厳禁って周知されたほうがよくないか').reasons[0], 'quoted');
  assert.equal(rejected('谷端を応援したくない').reasons[0], 'negated');
  assert.equal(rejected('谷端に打たなくてほしい').reasons[0], 'neutral');
  published('谷端に活躍してほしい');
  published('谷端がんばれなんか最高');
});

test('handles negation and double negation conservatively', () => {
  assert.equal(rejected('谷端は素晴らしいとは言えない').reasons[0], 'negated');
  assert.equal(rejected('谷端は素晴らしくない').reasons[0], 'negated');
  assert.equal(rejected('谷端の内容は悪くない').reasons[0], 'negated');
  rejected('谷端を応援していない');
  published('谷端を応援していないわけではない。これからも期待してる');
});

test('rejects quoted attacks even when the author adds praise', () => {
  rejected('ある人が「谷端はゴミだ」と言っていた。でも私は応援する');
});

test('rejects empty, short, off-topic, and unclear posts', () => {
  assert.equal(rejected('').reasons[0], 'empty');
  assert.equal(rejected('   ').reasons[0], 'empty');
  rejected('谷端');
  rejected('？？？');
  rejected('谷端…？？？どうしてこんなことに…');
  assert.equal(rejected('谷端プールの水温は31℃です。ご来場お待ちしております。').reasons[0], 'offtopic');
  rejected('RT @someone 谷端最高');
});

test('rejects mixed posts instead of counting one positive word', () => {
  const result = rejected('数字は酷いかもしれんが、谷端くんは素晴らしい。温かく見たい');
  assert.equal(result.reasons[0], 'mixed');
  assert.equal(rejected('現状は厳しいけど、谷端の方が期待できる').reasons[0], 'mixed');
  assert.equal(rejected('谷端は期待してたけど、指標が酷すぎて無理かも').reasons[0], 'mixed');
  assert.equal(rejected('豊田は偉いんだけど谷端の起用は奇行やめろ').reasons[0], 'mixed');
  assert.equal(rejected('打率は笑えないから谷端には奮起して欲しい').reasons[0], 'mixed');
  assert.equal(rejected('谷端に期待している身として応援できないですね').reasons[0], 'mixed');
  rejected('活躍できないから谷端が1番しんどいと思う');
});

test('rejects place names and automated game logs', () => {
  assert.equal(rejected('北谷端公園の盆踊り、お疲れ様でした').reasons[0], 'offtopic');
  assert.equal(rejected('【ファームハイライト】谷端がタイムリー。ナイストライ').reasons[0], 'report');
});

test('does not publish unjudged posts when a model is missing or failing', async () => {
  const ambiguous = '谷端いいね';
  assert.equal(judgeTweet(ambiguous).definitive, false);

  const noModel = await resolveVerdict(ambiguous, { model: null, modelBudget: { remaining: 3 } });
  assert.equal(noModel.verdict, 'reject');
  assert.ok(noModel.reasons.includes('unjudged'));

  let calls = 0;
  const unavailable = await resolveVerdict(ambiguous, {
    model: async () => {
      calls += 1;
      throw new Error('down');
    },
    modelBudget: { remaining: 2 },
  });
  assert.equal(calls, 1);
  assert.equal(unavailable.verdict, 'reject');
  assert.deepEqual(unavailable.reasons, ['model_unavailable']);

  const low = await resolveVerdict(ambiguous, {
    model: async () => ({ verdict: 'positive', confidence: 0.4 }),
    modelBudget: { remaining: 1 },
  });
  assert.equal(low.verdict, 'reject');
});

test('clear rule results do not call the model', async () => {
  let calls = 0;
  const model = async () => {
    calls += 1;
    return { verdict: 'positive', confidence: 1 };
  };
  const praise = await resolveVerdict('谷端選手がんばれ', { model, modelBudget: { remaining: 5 } });
  const insult = await resolveVerdict('谷端はゴミ', { model, modelBudget: { remaining: 5 } });
  assert.equal(praise.verdict, 'publish');
  assert.equal(insult.verdict, 'reject');
  assert.equal(calls, 0);
});

test('reuses a stored judgment for the same post', async () => {
  const tweets = [{
    text: '谷端選手がんばれ！',
    userName: 'fan',
    tweetUrl: 'https://x.com/fan/status/2092719964855869793',
  }];
  let calls = 0;
  const first = await curateTweets(tweets, {
    model: async () => {
      calls += 1;
      throw new Error('should not be called');
    },
    modelBudget: { remaining: 5 },
  });
  assert.equal(first.stats.judged, 1);
  assert.equal(first.stats.publish, 1);

  const second = await curateTweets(tweets, {
    cache: first.cache,
    model: async () => {
      calls += 1;
      throw new Error('should not be called');
    },
    modelBudget: { remaining: 5 },
  });
  assert.equal(second.stats.reused, 1);
  assert.equal(second.stats.judged, 0);
  assert.equal(second.stats.publish, 1);
  assert.equal(calls, 0);
  assert.equal(second.tweets[0].text, tweets[0].text);
  assert.equal(
    createHash('sha256').update(JSON.stringify(rulesetMaterial())).digest('hex').slice(0, 20),
    RULESET_FINGERPRINT,
  );

  const insult = {
    text: '谷端はゴミだ',
    userName: 'a',
    tweetUrl: 'https://x.com/a/status/1',
  };
  const stale = await curateTweets([insult], {
    cache: {
      rulesetVersion: 1,
      items: {
        1: {
          hash: contentHash(insult.text),
          verdict: 'publish',
          rulesetVersion: 1,
          rulesetFingerprint: 'stale-rules',
        },
      },
    },
  });
  assert.equal(stale.stats.reused, 0);
  assert.equal(stale.stats.publish, 0);

  const missingFingerprint = await curateTweets([insult], {
    cache: {
      items: {
        1: {
          hash: contentHash(insult.text),
          verdict: 'publish',
          rulesetVersion: 1,
        },
      },
    },
  });
  assert.equal(missingFingerprint.stats.reused, 0);
  assert.equal(missingFingerprint.stats.publish, 0);

  const previousVersion = await curateTweets([insult], {
    cache: {
      rulesetVersion: RULESET_VERSION - 1,
      rulesetFingerprint: RULESET_FINGERPRINT,
      items: {
        1: {
          hash: contentHash(insult.text),
          verdict: 'publish',
          rulesetVersion: RULESET_VERSION - 1,
          rulesetFingerprint: RULESET_FINGERPRINT,
        },
      },
    },
  });
  assert.equal(RULESET_VERSION, 3);
  assert.equal(previousVersion.stats.reused, 0);
  assert.equal(previousVersion.stats.publish, 0);
  assert.equal(previousVersion.cache.rulesetVersion, RULESET_VERSION);
});

test('corpus keeps insults out and does not publish most posts', () => {
  const tweets = JSON.parse(fs.readFileSync(new URL('../x-data.txt', import.meta.url), 'utf8'));
  let published = 0;
  for (const tweet of tweets) {
    const result = judgeTweet(tweet.text);
    if (result.verdict === 'publish') {
      published += 1;
      assert.equal(containsInsult(tweet.text), false, tweet.text.slice(0, 80));
    }
  }
  assert.ok(published >= 30, `published ${published}`);
  assert.ok(published < tweets.length * 0.35, `published ${published} of ${tweets.length}`);
  const quotedCheer = tweets.find((tweet) => String(tweet.text).includes('「がんばれ」コールは厳禁'));
  assert.equal(judgeTweet(quotedCheer.text).verdict, 'reject');
});
