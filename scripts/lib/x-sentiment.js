import { createHash } from 'node:crypto';
import { extractXStatusId } from '../../js/safe-url.js';

export const RULESET_VERSION = 5;
const LOGIC_ID = 'unfinished-5';
const PUBLISH_SCORE = 2;

const EXCEPTION_PHRASES = ['バカスカ', 'バカ正直', 'バカ売れ', 'バカ丁寧', 'カラス', 'カスミ'];

const HARD_INSULTS = [
  'クソ', 'くそ', '糞', 'ゴミ', 'ごみ', 'カス', 'ざまあ', 'ざまぁ', '消えろ', '消えてくれ', '消えてほしい',
  '無能', '雑魚', 'ざこ', 'キモい', 'きしょい', 'うぜえ', 'うざい', 'うざっ', '害悪',
  'アホ', 'バカ', '馬鹿', '死ね', 'くたばれ', '使えねえ', 'ボーンヘッド', 'ヘッタクソ', '飼い殺し',
  '終わってる', '終わってんな', 'しょぼい', 'しょぼい', '殺す気', '殺せ',
];

const SOFT_NEGATIVES = [
  '酷い', 'ひどい', '残念', '失望', '最悪', '萎え', '微妙', 'ダメ', '駄目',
  '使えない', '使えな', '物足りな', '情けない', '見れたものじゃない', 'ふがいない',
  '終わってる', '終わってんな', 'しょぼ', '不安', '心配', 'つらい', '辛い',
  '厳しい', '酷す', 'やめろ', '奇行', '笑えない', '壊滅', '痛かった', '痛恨',
  '無理かも', '無理だ', '無理や', '無理そう', '応援できな', 'しんどい', 'よくない',
  '失敗', '期待外れ', '体たらく', '足を引っ張', '塩漬け', '解体', '不良債権',
  '死んで', '伸びてな', 'ものになってな', '低打率', '鈍足', '叩か', '批判',
  'いらん', '不要', '戦力外', '崖っぷち', '意味がない', '意味ない', 'ブチギレ',
  'お下がり', '将来性のない', '遊ばせ', '振るってな', '振るわな', '悪い', '不調',
  '成長してなさ', '首脳陣', '期待してたのに', '長打率3割未満',
  '無限三振', 'どうすんねん', '守れない', '酷かっ', 'まずい', '結果出な',
  'ヤだ', '嫌だ', '手薄', 'せんかったら', '期待できそうにない', 'コーチ',
  '壊れた', '怖い', '危ない', '悪送球', '落球', 'ファンブル', '走塁死',
  'やめましょう', 'やめよう', 'やめて',
];

// Strong cheers are whole-utterance evidence. A single weak label is not enough.
const POSITIVE_PATTERNS = [
  [/がんばれ|ガンバレ|頑張れ/, 2],
  [/がんばって|頑張って|ガンバって|頑張ろう|がんばろう|頑張った|がんばった|頑張ってください|がんばってください/, 2],
  [/応援して|応援しよ|応援した|応援です/, 2],
  [/最高/, 2],
  [/素晴らしい|素晴らしすぎ|すばらしい/, 2],
  [/ナイス/, 2],
  [/おめでとう/, 2],
  [/大好き|だいすき/, 2],
  [/よくやった|良くやった|お疲れ様|お疲れさま|おつかれ/, 2],
  [/ヒーロー/, 2],
  [/神プレー|神守備|神走塁|神バッティング/, 2],
  [/期待して|期待でき|期待大|期待しか/, 2],
  [/楽しみにして|楽しみだ|楽しみです|楽しみ！|楽しみ!|楽しみだね|楽しみだな|楽しみ/, 2],
  [/すごい活躍|すごくいい|すごく良い|めちゃくちゃうまい|めちゃくちゃ上手/, 2],
  [/輝い/, 2],
  [/誇らしい|清々しい/, 2],
  [/えらい|偉い/, 2],
  [/いいぞ|良いぞ|いいね|良いね/, 1],
  [/嬉しい|うれしい/, 1],
  [/成長/, 1],
  [/好調|復調/, 1],
  [/ようやっと|よう打っ/, 1],
  [/活躍/, 1],
  [/すごい/, 1],
  [/上手い|うまい/, 1],
  [/さすが/, 1],
];

const POSITIVE_EMOJI = /[\u{1F389}\u{1F38A}\u{1F44F}\u{1F44D}\u{1F4AA}\u{2764}\u{2665}\u{1F525}\u{2728}\u{26BE}\u{1F60D}\u{1F970}\u{1F496}]/u;
const NEGATIVE_EMOJI = /[\u{1F4A9}\u{1F621}\u{1F92E}\u{1F44E}]/u;

export function normalizeTweet(raw) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[A-Za-z0-9_]+/g, ' ')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contentHash(text) {
  return createHash('sha256').update(normalizeTweet(text)).digest('hex');
}

export function rulesetMaterial() {
  return {
    version: RULESET_VERSION,
    logic: LOGIC_ID,
    publishScore: PUBLISH_SCORE,
    exceptions: EXCEPTION_PHRASES,
    insults: HARD_INSULTS,
    negatives: SOFT_NEGATIVES,
    positives: POSITIVE_PATTERNS.map(([pattern, weight]) => [pattern.source, pattern.flags, weight]),
  };
}

export const RULESET_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify(rulesetMaterial()))
  .digest('hex')
  .slice(0, 20);

function maskExceptions(text) {
  let masked = text;
  for (const phrase of EXCEPTION_PHRASES) {
    masked = masked.split(phrase).join('　'.repeat(phrase.length));
  }
  return masked;
}

export function containsInsult(raw) {
  const text = maskExceptions(normalizeTweet(raw));
  if (NEGATIVE_EMOJI.test(text)) return true;
  return HARD_INSULTS.some((word) => word && text.includes(word));
}

function relevance(text) {
  if (!text.includes('谷端') && !text.includes('将伍')) return 'missing';
  const place = /谷端昭夫|谷端実|谷端プール|谷端駅|谷端公園|北谷端|谷端川|谷端親交会|盆踊り|イラストレーター|ボンカタ|水温|茶道具|茶室|テニスの森|市ヶ谷/;
  const baseball = /阪神|タイガース|プロ野球|ドラフト|ファーム|二軍|２軍|一軍|１軍|スタメン|安打|ヒット|守備|打席|猛打賞|日本大|日大/;
  if (place.test(text) && !baseball.test(text)) return 'offtopic';
  if (!text.includes('谷端') && !baseball.test(text)) return 'missing';
  return 'ok';
}

function isGameReport(text) {
  if (/【ファームハイライト】|【ファーム】|【スコア詳細】|一問一答|実況速報|Yahooニュース|デイリースポーツ|公式モバイル/.test(text)) {
    return true;
  }
  if (/打線は/.test(text) && /安打|得点|打点|盗塁/.test(text)) return true;
  if (/(?:\d+打数\d+安打|打率\s*[.．]|出塁率|OPS|IsoP)/.test(text)) return true;
  const innings = text.match(/\d+回/g) || [];
  if (innings.length >= 2) return true;
  if (/試合終了/.test(text) && /安打|三振|得点|打点/.test(text)) return true;
  const statWords = ['安打', '打点', '打率', '四球', '三振', '盗塁', '本塁打', '打数', '犠飛', '犠打', '併殺'];
  const statHits = statWords.filter((word) => text.includes(word)).length;
  if (statHits >= 3) return true;
  if (statHits >= 2 && text.length > 140) return true;
  return false;
}

const OTHER_PLAYERS = [
  '立石', '岡城', '百崎', '百﨑', '山田', '嶋村', '前川', '高寺', '髙寺', '小幡',
  '中野', '近本', '佐藤', '大山', '森下', '木浪', '糸原', '福島', '門別', '下村',
  '今朝丸', 'ガルシア', '井坪', '豊田', '島田', '佐野', '町田', '小野寺', '濱田',
  '川崎', '川﨑', '元山', '西純', '岩貞', '石井', '坂本', '栄枝', '熊谷', '圭音',
  '照英', '右京', '神宮', '中川', '小島', '宮下', '渡部', '前嶋', 'ディベイニー',
  '石黒', '伊藤', '百ちゃん', '誠志郎', '大竹',
];

const VOCATIVE = /がんばれ|ガンバレ|頑張れ|がんばって|頑張って|ナイス|最高|素晴らしい|すばらしい|大好き|だいすき|応援して|偉い|えらい|ようやっと|よくやった|お疲れ様|お疲れさま|おつかれ/;

function evaluativeNames(text) {
  const found = [];
  for (const name of ['谷端', '将伍', ...OTHER_PLAYERS]) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(name, from);
      if (index < 0) break;
      const end = index + name.length;
      const after = text.slice(end, end + 10);
      const comparison = /^(?:さん|選手|君|くん|氏)?(?:みたい|のよう|型)/.test(after);
      if (!comparison) {
        found.push({
          name,
          index,
          end,
          self: name === '谷端' || name === '将伍',
        });
      }
      from = end;
    }
  }
  return found;
}

function sentenceBounds(text, index) {
  const period = text.lastIndexOf('。', index - 1);
  const newline = text.lastIndexOf('\n', index - 1);
  const start = Math.max(period, newline);
  let end = text.length;
  for (const mark of ['。', '\n']) {
    const at = text.indexOf(mark, index);
    if (at >= 0 && at < end) end = at;
  }
  return [start < 0 ? 0 : start + 1, end];
}

function nameDistance(name, at) {
  if (at < name.index) return name.index - at;
  if (at >= name.end) return at - name.end;
  return 0;
}

function rosterWish(text, wishAt) {
  const before = text.slice(Math.max(0, wishAt - 12), wishAt);
  return /(?:試し|使っ|出し|上げ|固定にし|起用し|回し|代打にし)$/.test(before);
}

function wishAtIsValid(text, wishAt) {
  const around = text.slice(Math.max(0, wishAt - 12), wishAt + 4);
  if (/消え|負けて|辞め|やめ|黙|殺|壊|捕って|取って/.test(around)) return false;
  const before = text.slice(Math.max(0, wishAt - 2), wishAt);
  if (/(?:なく|ない)$/.test(before)) return false;
  const after = text.slice(wishAt + 4, wishAt + 22);
  if (suffixPolarity(after) === 'negated') return false;
  if (rosterWish(text, wishAt)) return false;
  return true;
}

function cheerPositions(text) {
  const positions = [];
  for (const [pattern, weight] of POSITIVE_PATTERNS) {
    if (weight < PUBLISH_SCORE) continue;
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 18);
      if (/^スピーチ|^インタビュー/.test(after)) {
        if (match.index === regex.lastIndex) regex.lastIndex += 1;
        continue;
      }
      if (suffixPolarity(after) !== 'negated') positions.push(match.index);
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  const wish = /て(?:ほしい|欲しい)/g;
  let match;
  while ((match = wish.exec(text)) !== null) {
    if (wishAtIsValid(text, match.index)) positions.push(match.index);
    if (match.index === wish.lastIndex) wish.lastIndex += 1;
  }
  return positions;
}

function cheerBindsToSelf(selves, at) {
  return selves.some((name) => {
    if (at >= name.end && at <= name.end + 24) return true;
    return name.index >= at && name.index <= at + 16;
  });
}

function playContextBefore(text, other, self) {
  if (other.end > self.index) return false;
  const gap = text.slice(other.end, self.index);
  return /[！!]/.test(gap) && /安打|ヒット|本塁打|ホームラン|タイムリー|ツーベース|スリーベース|三振|ゴロ|フライ|エラー|盗塁|四球|死球|併殺/.test(gap);
}

function strayCheer(names, sentenceStart, sentenceEnd, positions) {
  const selves = names.filter((name) => name.self);
  if (!names.some((name) => !name.self)) return false;
  return positions.some((at) => {
    if (at >= sentenceStart && at < sentenceEnd) return false;
    if (selves.length === 0) return true;
    const dist = Math.min(...selves.map((name) => nameDistance(name, at)));
    return dist > 16;
  });
}

function attachedCheer(text) {
  if (/写真の編集|開封/.test(text)) return false;
  if (/谷端[^。\n]{0,8}ともかく|ともかく[^。\n]{0,8}谷端/.test(text)) return false;
  const names = evaluativeNames(text);
  const positions = cheerPositions(text);
  for (const at of positions) {
    const [sentenceStart, sentenceEnd] = sentenceBounds(text, at);
    const local = names.filter((name) => name.index >= sentenceStart && name.index < sentenceEnd);
    const selves = local.filter((name) => name.self);
    const others = local.filter((name) => !name.self);
    if (!cheerBindsToSelf(selves, at)) continue;
    if (/^て(?:ほしい|欲しい)/.test(text.slice(at, at + 4))
      && !selves.some((name) => name.end <= at && at <= name.end + 24)) {
      continue;
    }
    if (others.length > 0) {
      const self = selves.reduce((best, name) => (
        nameDistance(name, at) < nameDistance(best, at) ? name : best
      ));
      if (others.length !== 1 || !playContextBefore(text, others[0], self)) continue;
      if (nameDistance(self, at) > 8) continue;
      if (!VOCATIVE.test(text.slice(Math.max(0, at - 4), at + 8))) continue;
    }
    if (strayCheer(names, sentenceStart, sentenceEnd, positions)) continue;
    return true;
  }
  return false;
}

function suffixPolarity(after) {
  if (/^(?:い?ないわけではない|い?ないわけじゃない|くはない|くもない|なくはない|なくもない)/.test(after)) {
    return 'weak';
  }
  if (/^(?:じゃないか|じゃない？|じゃない\?|じゃん)/.test(after)) return 'rhetorical';
  if (/^(?:そうにない|そうもない|るのに|たのに)/.test(after)) return 'negated';
  if (/^(?:くない|なくなった|なくなって|なくて|できな|とは言えない|とはいえない|じゃない|ではない)/.test(after)) {
    return 'negated';
  }
  if (/^(?:い?ない|いません|ません|ぬ|ず)/.test(after)) return 'negated';
  return 'plain';
}

function isSarcasm(text) {
  if (/（笑）|\(笑\)|（棒）|\(棒\)|棒読み/.test(text) && /最高|すごい|素晴らしい|上手|うまい|ナイス|がんばれ|頑張|応援|大好き/.test(text)) {
    return true;
  }
  if (/(?:クソ|くそ|ゴミ|ごみ|カス).{0,8}(?:高い|すごい|上手|うまい|最高|評価)/.test(text)) return true;
  if (/(?:高い|すごい|上手|うまい|最高|評価).{0,8}(?:クソ|くそ|ゴミ|ごみ)/.test(text)) return true;
  if (/(?:さすが|流石).{0,18}(?:エラー|ダメ|駄目|終わ|打てな|ミス|凡退|ポンコツ|無理)/.test(text)) return true;
  if (/(?:最高|すごい|素晴らしい|上手い|うまい|ナイス).{0,12}(?:とか|って言|っていって).{0,20}(?:ダメ|駄目|微妙|嘘|違う|ない|無理|下手)/.test(text)) return true;
  if (/(?:最高|すごい|素晴らしい).{0,6}(?:ね|な).{0,8}(?:無理|嘘|ないわ|ないな|ダメ|駄目)/.test(text)) return true;
  return false;
}

function collectPatternScore(text, patterns) {
  let score = 0;
  let negated = false;
  let weak = false;
  for (const [pattern, weight] of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 18);
      const polarity = suffixPolarity(after);
      if (polarity === 'negated') negated = true;
      else if (polarity === 'weak') weak = true;
      else score += weight;
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  return { score, negated, weak };
}

function softNegativeScore(text) {
  let score = 0;
  for (const word of SOFT_NEGATIVES) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(word, from);
      if (index < 0) break;
      const after = text.slice(index + word.length, index + word.length + 18);
      if ((word === '怖い' || word === '危ない') && /^(?:くらい|ぐらい|ほど)/.test(after)) {
        from = index + word.length;
        continue;
      }
      const polarity = suffixPolarity(after);
      if (polarity === 'plain') score += 1;
      from = index + word.length;
    }
  }
  if (/草|ワロタ|わろた/.test(text)) score += 0;
  return score;
}

function wishScore(text) {
  const match = text.match(/て(?:ほしい|欲しい)/);
  if (!match) return 0;
  if (/消え|負けて|辞め|やめ|黙|殺|壊/.test(text)) return 0;
  const before = text.slice(Math.max(0, match.index - 2), match.index);
  if (/(?:なく|ない)$/.test(before)) return 0;
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 18);
  if (suffixPolarity(after) === 'negated') return 0;
  return 2;
}

const CONTRAST = /^[\s　！!？?。…・]*?(?:だけど|だけれど|けれども|しかし|だが|でも|なのに)/;
const UNDERMINING = /壊|信号|(?<!デル)ミス|危ない|怖い|粗い|雑|あかん|悪送球|落球|ファンブル|走塁死|走塁ミス|ボーク|凡退|引っかけ|オーバーラン/;

function unfinishedSupport(text) {
  const dangling = /^(?:だけど|だけれど|けれども|けれど|けど|しかし|だが|でも|なのに)[\s　！!？?。…〜~ー♪（）()]*$/;
  const marks = [];
  for (const [pattern, weight] of POSITIVE_PATTERNS) {
    if (weight < PUBLISH_SCORE) continue;
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      marks.push(match.index + match[0].length);
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  const wish = /て(?:ほしい|欲しい)/g;
  let match;
  while ((match = wish.exec(text)) !== null) {
    marks.push(match.index + match[0].length);
    if (match.index === wish.lastIndex) wish.lastIndex += 1;
  }
  return marks.some((end) => dangling.test(text.slice(end)));
}

function underminedCheer(text) {
  const strong = POSITIVE_PATTERNS.filter(([, weight]) => weight >= PUBLISH_SCORE);
  for (const [pattern] of strong) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const afterStart = match.index + match[0].length;
      const polarity = suffixPolarity(text.slice(afterStart, afterStart + 18));
      const contrast = text.slice(afterStart, afterStart + 12).match(CONTRAST);
      if (polarity !== 'negated' && contrast) {
        const tail = text.slice(afterStart + contrast[0].length).split(/[。\n]/)[0];
        const redeemed = collectPatternScore(tail, strong).score >= PUBLISH_SCORE || wishScore(tail) >= PUBLISH_SCORE;
        const critic = softNegativeScore(tail) > 0 || UNDERMINING.test(tail);
        if (!redeemed && critic && !/相手のエラー/.test(tail)) return true;
      }
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  return false;
}

function quotedPositiveIsRejected(text) {
  const quotes = text.match(/[「『][^」』]{0,80}[」』]/g) || [];
  const cheer = /がんばれ|ガンバレ|頑張|応援|最高|ナイス|素晴らしい|すごい/;
  const criticism = /厳禁|禁止|やめ|控え|危険|よくない|ダメ|駄目/;
  if (!criticism.test(text)) return false;
  return quotes.some((quote) => cheer.test(quote));
}

export function judgeTweet(raw) {
  const text = normalizeTweet(raw);
  if (!text) {
    return { verdict: 'reject', confidence: 1, reasons: ['empty'], definitive: true };
  }
  if (/^RT\s/i.test(String(raw ?? '').trim())) {
    return { verdict: 'reject', confidence: 1, reasons: ['repost'], definitive: true };
  }
  if (containsInsult(text)) {
    return { verdict: 'reject', confidence: 0.98, reasons: ['insult'], definitive: true };
  }
  const rel = relevance(text);
  if (rel === 'offtopic') {
    return { verdict: 'reject', confidence: 0.95, reasons: ['offtopic'], definitive: true };
  }
  if (rel === 'missing') {
    return { verdict: 'reject', confidence: 0.9, reasons: ['irrelevant'], definitive: true };
  }
  if (isSarcasm(maskExceptions(text))) {
    return { verdict: 'reject', confidence: 0.93, reasons: ['sarcasm'], definitive: true };
  }
  if (quotedPositiveIsRejected(text)) {
    return { verdict: 'reject', confidence: 0.9, reasons: ['quoted'], definitive: true };
  }
  if (isGameReport(text)) {
    return { verdict: 'reject', confidence: 0.92, reasons: ['report'], definitive: true };
  }

  const positive = collectPatternScore(text, POSITIVE_PATTERNS);
  let score = positive.score + wishScore(text);
  if (POSITIVE_EMOJI.test(text)) score += 1;
  if (/草|ワロタ|わろた/.test(text) && score < PUBLISH_SCORE) {
    return { verdict: 'reject', confidence: 0.8, reasons: ['sarcasm'], definitive: true };
  }
  const negative = softNegativeScore(text);
  const meaningful = text.replace(/[\s　]/g, '').length;
  if (meaningful < 4) {
    return { verdict: 'reject', confidence: 0.9, reasons: ['too_short'], definitive: true };
  }

  if ((score >= PUBLISH_SCORE && negative > 0) || underminedCheer(text)) {
    return { verdict: 'reject', confidence: 0.9, reasons: ['mixed'], definitive: true };
  }
  if (unfinishedSupport(text)) {
    return { verdict: 'reject', confidence: 0.86, reasons: ['incomplete'], definitive: true };
  }
  if (negative > 0) {
    return { verdict: 'reject', confidence: 0.88, reasons: ['negative'], definitive: true };
  }
  if (/素晴らしくない|すごくない|良くない|よくない|上手くない|うまくない|期待できない/.test(text) && score < PUBLISH_SCORE) {
    return { verdict: 'reject', confidence: 0.9, reasons: ['negated'], definitive: true };
  }
  if (/悪くない|悪くはない|酷くない|ひどくない|ダメじゃない|駄目ではない/.test(text) && score < PUBLISH_SCORE) {
    return { verdict: 'reject', confidence: 0.86, reasons: ['negated'], definitive: true };
  }
  if (positive.negated && score < PUBLISH_SCORE) {
    return { verdict: 'reject', confidence: 0.9, reasons: ['negated'], definitive: true };
  }
  if (!attachedCheer(text)) {
    if (score >= PUBLISH_SCORE) {
      return { verdict: 'reject', confidence: 0.84, reasons: ['not_focused'], definitive: true };
    }
    if (score > 0 || positive.weak) {
      return { verdict: 'reject', confidence: 0.55, reasons: ['uncertain'], definitive: false };
    }
    return { verdict: 'reject', confidence: 0.8, reasons: ['neutral'], definitive: true };
  }
  if (score >= PUBLISH_SCORE || wishScore(text) >= PUBLISH_SCORE) {
    return { verdict: 'publish', confidence: 0.9, reasons: ['positive'], definitive: true };
  }
  if (score > 0 || positive.weak) {
    return { verdict: 'reject', confidence: 0.55, reasons: ['uncertain'], definitive: false };
  }
  return { verdict: 'reject', confidence: 0.8, reasons: ['neutral'], definitive: true };
}

export async function resolveVerdict(raw, { model = null, modelBudget = { remaining: 0 } } = {}) {
  const local = judgeTweet(raw);
  if (local.definitive) {
    return { ...local, modelUsed: false };
  }
  if (!model || !(modelBudget.remaining > 0)) {
    return {
      verdict: 'reject',
      confidence: local.confidence,
      reasons: [...local.reasons, 'unjudged'],
      definitive: true,
      modelUsed: false,
    };
  }
  modelBudget.remaining -= 1;
  try {
    const result = await model(normalizeTweet(raw));
    const confidence = Number(result?.confidence);
    if (result?.verdict === 'positive' && confidence >= 0.8) {
      return {
        verdict: 'publish',
        confidence,
        reasons: ['model_positive'],
        definitive: true,
        modelUsed: true,
      };
    }
    return {
      verdict: 'reject',
      confidence: Number.isFinite(confidence) ? confidence : 0,
      reasons: ['model_not_positive'],
      definitive: true,
      modelUsed: true,
    };
  } catch {
    return {
      verdict: 'reject',
      confidence: 0,
      reasons: ['model_unavailable'],
      definitive: true,
      modelUsed: false,
    };
  }
}

export async function curateTweets(tweets, options = {}) {
  const source = Array.isArray(tweets) ? tweets : [];
  const cache = options.cache?.items && typeof options.cache.items === 'object' ? options.cache : { items: {} };
  const model = options.model ?? null;
  const modelBudget = options.modelBudget ?? { remaining: 0 };
  const nextItems = {};
  const published = [];
  const seen = new Set();
  const stats = {
    total: source.length,
    publish: 0,
    reject: 0,
    reused: 0,
    judged: 0,
    duplicates: 0,
    modelCalls: 0,
  };
  const publishedText = new Set();
  const takePublished = (tweet, hash) => {
    if (publishedText.has(hash)) {
      stats.duplicates += 1;
      return;
    }
    publishedText.add(hash);
    published.push(tweet);
    stats.publish += 1;
  };

  for (const tweet of source) {
    if (!tweet || typeof tweet !== 'object') {
      stats.reject += 1;
      continue;
    }
    const url = typeof tweet.tweetUrl === 'string' ? tweet.tweetUrl : '';
    if (url && seen.has(url)) {
      stats.reject += 1;
      continue;
    }
    if (url) seen.add(url);

    const text = typeof tweet.text === 'string' ? tweet.text : '';
    const hash = contentHash(text);
    const id = extractXStatusId(url) || hash;
    const prev = cache.items[id];
    if (
      prev
      && prev.hash === hash
      && prev.rulesetVersion === RULESET_VERSION
      && prev.rulesetFingerprint === RULESET_FINGERPRINT
      && (prev.verdict === 'publish' || prev.verdict === 'reject')
    ) {
      stats.reused += 1;
      nextItems[id] = prev;
      if (prev.verdict === 'publish') takePublished(tweet, hash);
      else stats.reject += 1;
      continue;
    }

    const before = modelBudget.remaining;
    const result = await resolveVerdict(text, { model, modelBudget });
    if (modelBudget.remaining < before) stats.modelCalls += 1;
    stats.judged += 1;
    nextItems[id] = {
      hash,
      verdict: result.verdict,
      reasons: result.reasons,
      confidence: result.confidence,
      modelUsed: result.modelUsed === true,
      rulesetVersion: RULESET_VERSION,
      rulesetFingerprint: RULESET_FINGERPRINT,
    };
    if (result.verdict === 'publish') takePublished(tweet, hash);
    else stats.reject += 1;
  }

  return {
    tweets: published,
    cache: { rulesetVersion: RULESET_VERSION, rulesetFingerprint: RULESET_FINGERPRINT, items: nextItems },
    stats,
  };
}
