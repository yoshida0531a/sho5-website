import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { judgeTweet } from '../scripts/lib/x-sentiment.js';

const tweets = JSON.parse(fs.readFileSync(new URL('../x-data.txt', import.meta.url), 'utf8'));

function realTweets(fragment) {
  const found = tweets.filter((tweet) => String(tweet.text).includes(fragment));
  assert.ok(found.length >= 1, `x-data.txt に実投稿がありません: ${fragment}`);
  return found;
}

function rejectsAll(fragment) {
  for (const tweet of realTweets(fragment)) {
    const result = judgeTweet(tweet.text);
    assert.equal(
      result.verdict,
      'reject',
      JSON.stringify({ fragment, reasons: result.reasons, text: String(tweet.text).slice(0, 120) }),
    );
  }
}

test('実投稿: 谷端への期待と他選手への否定が混ざる投稿を除外する', () => {
  rejectsAll('全く期待外れ');
  rejectsAll('守れない選手を動かしてどうすんねん');
  rejectsAll('無限三振見せられるなら');
  rejectsAll('余り期待できそうにない');
});

test('実投稿: 応援と球団・コーチへの批判が混ざる投稿を除外する', () => {
  rejectsAll('首脳陣が足を引っ張ってます');
  rejectsAll('将来性のないポジションで遊ばせ');
  rejectsAll('指導と起用がめちゃくちゃ');
  rejectsAll('コーチだけの問題じゃない');
  rejectsAll('代打が手薄すぎる');
});

test('実投稿: 複数選手の評価で谷端が主旨とは限らない投稿を除外する', () => {
  rejectsAll('来年活躍して欲しい選手');
  rejectsAll('谷端もともかく町田は素晴らしい');
  rejectsAll('山田・百崎・立石・井坪・谷端・西純');
  rejectsAll('立石も頑張れ');
});

test('実投稿: 成績の列挙と試合速報を除外する', () => {
  rejectsAll('谷端3打数3安打1打点1四球');
  rejectsAll('将伍ナイス！サヨナラいったれ');
  rejectsAll('打率 .414');
  rejectsAll('【一問一答】');
});

test('実投稿: 称賛の直後に批判が残る投稿を除外する', () => {
  for (const tweet of realTweets('壊れた信号機しかけてた')) {
    assert.equal(judgeTweet(tweet.text).reasons[0], 'mixed');
  }
  rejectsAll('送球ちょっと怖いけどようやっとる');
  rejectsAll('打撃ぶっ壊れた');
});

test('実投稿: 正の語があっても谷端本人への応援が主旨でない投稿を除外する', () => {
  rejectsAll('頑張ってくれよ小幡');
  rejectsAll('鈍足の低打率単打マン');
  rejectsAll('写真の編集頑張ってる');
  rejectsAll('長打率3割未満');
  rejectsAll('かなり酷かったからなあ');
  rejectsAll('門別が捉えられてたのがヤだね');
  rejectsAll('上で結果出ないやけど');
  rejectsAll('北谷端公園盆踊り');
  rejectsAll('谷端実さん');
});

test('実投稿: 谷端本人への応援はそのまま公開する', () => {
  for (const fragment of [
    '阪神・谷端選手がんばれ！応援タオル買いました',
    '谷端くんナイスキャッチ',
    '谷端くん素晴らしいな',
    'がんばれ谷端',
  ]) {
    const found = realTweets(fragment);
    assert.ok(
      found.some((tweet) => judgeTweet(tweet.text).verdict === 'publish'),
      fragment,
    );
  }
});
