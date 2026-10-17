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
  normalizeTweet,
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
  assert.equal(RULESET_VERSION, 6);
  assert.equal(previousVersion.stats.reused, 0);
  assert.equal(previousVersion.stats.publish, 0);
  assert.equal(previousVersion.cache.rulesetVersion, RULESET_VERSION);
});

test('dangling contrasts and stop-directives apply to similar wording', () => {
  assert.equal(judgeTweet('谷端がんばれけど').reasons[0], 'incomplete');
  assert.equal(judgeTweet('谷端に活躍してほしいだけど').reasons[0], 'incomplete');
  assert.equal(judgeTweet('谷端くん頑張ってるから、その比較はやめましょう').reasons[0], 'mixed');
  assert.equal(judgeTweet('谷端最高。もうやめて').reasons[0], 'mixed');
  assert.equal(judgeTweet('谷端がんばれ。これからだね').verdict, 'publish');
  assert.equal(judgeTweet('谷端期待してるけど来年が楽しみ').verdict, 'publish');
});

test('does not reuse a version 5 judgment for a safety wish', async () => {
  const text = '谷端無事であって欲しいけど';
  const result = await curateTweets([{
    text,
    userName: 'fan',
    tweetUrl: 'https://x.com/fan/status/42',
  }], {
    cache: {
      rulesetVersion: 5,
      rulesetFingerprint: 'bc2ce9be9124276c7afb',
      items: {
        42: {
          hash: contentHash(text),
          verdict: 'reject',
          reasons: ['incomplete'],
          rulesetVersion: 5,
          rulesetFingerprint: 'bc2ce9be9124276c7afb',
        },
      },
    },
  });
  assert.equal(result.stats.reused, 0);
  assert.equal(result.stats.judged, 1);
  assert.equal(result.stats.publish, 1);
  assert.equal(result.cache.rulesetVersion, RULESET_VERSION);
  assert.equal(result.cache.items[42].verdict, 'publish');
});

test('positive results and shared cheers publish, and explicit negatives stay out', () => {
  const again = (text) => judgeTweet(text);
  for (const text of [
    '谷端さんマルチ！！！！✨',
    '岡城谷端ガルシアが猛打賞。みんな頑張れ',
    '谷端無事であって欲しいけど',
    '谷端が無事であって欲しいけど',
  ]) {
    const first = again(text);
    assert.equal(first.verdict, 'publish', JSON.stringify({ text, first }));
    assert.deepEqual(again(text), first);
  }
  assert.equal(judgeTweet('谷端いいねいいね！！！取り返してけ〜').reasons[0], 'not_focused');
  assert.equal(
    judgeTweet('立石くんも谷端くんも全然諦めてない。確かに数字は酷いかもしれんが、まだ1年目。俺は少なくとも温かく、長い目で見たい。').reasons[0],
    'negative',
  );
  assert.equal(judgeTweet('数字は酷いかもしれんが、谷端くんは素晴らしい。温かく見たい').reasons[0], 'mixed');
  assert.equal(judgeTweet('本日のファーム・広島戦のスタメンです。先発は富田選手です。立石、谷端、糸原').reasons[0], 'neutral');
  assert.equal(judgeTweet('谷端　左安　打点1　三振1').reasons[0], 'neutral');
  assert.equal(judgeTweet('谷端マルチ').reasons[0], 'neutral');
  assert.equal(judgeTweet('谷端マルチヒット！！！！').verdict, 'publish');
  assert.equal(judgeTweet('谷端猛打賞！！').verdict, 'publish');
  assert.equal(judgeTweet('コンビニのマルチコピー機で印刷した谷端将伍の写真✨').reasons[0], 'uncertain');
  assert.equal(
    judgeTweet('【猛虎日報｜日曜版ファーム号】 今週のファームは6試合4勝2分で負けなし💪 立石は.375で上向き 谷端は連続猛打賞 8/23〜8/29試合結果').reasons[0],
    'report',
  );
  assert.equal(judgeTweet('谷端もあげて欲しい').reasons[0], 'not_focused');
  assert.equal(judgeTweet('谷端に活躍してほしい').verdict, 'publish');
  assert.equal(
    judgeTweet('谷端くんの接触シーンで、脳震盪の可能性のある人に「がんばれ」コールは厳禁って周知されたほうがよくないか').reasons[0],
    'quoted',
  );
  assert.equal(RULESET_FINGERPRINT, '7ad2e7d824c54efb198d');
});

test('keeps one public copy when the normalized text is identical', async () => {
  const tweets = JSON.parse(fs.readFileSync(new URL('../x-data.txt', import.meta.url), 'utf8'));
  const key = normalizeTweet('メガシンカして帰ってこいよ！谷端がんばれ！');
  const same = tweets.filter((tweet) => normalizeTweet(tweet.text) === key);
  const related = tweets.filter((tweet) => String(tweet.text).includes('メガシンカして帰ってこいよ'));
  assert.equal(same.length, 2);
  assert.equal(related.length, 3);

  const duplicates = await curateTweets(same);
  assert.equal(duplicates.stats.publish, 1);
  assert.equal(duplicates.stats.duplicates, 1);
  assert.equal(duplicates.tweets.length, 1);
  assert.ok(Object.values(duplicates.cache.items).every((item) => item.verdict === 'publish'));

  const withVariant = await curateTweets(related);
  assert.equal(withVariant.stats.publish, 2);
  assert.equal(withVariant.stats.duplicates, 1);
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
