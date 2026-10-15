import { createHash } from 'node:crypto';
import { extractXStatusId } from '../../js/safe-url.js';

export const RULESET_VERSION = 1;
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
  if (!text.includes('谷端')) return 'missing';
  const place = /谷端昭夫|谷端プール|谷端駅|谷端公園|北谷端|谷端川|水温|茶道具|茶室|テニスの森|市ヶ谷/;
  const baseball = /阪神|タイガース|選手|くん|君|さん|プロ野球|ドラフト|ファーム|二軍|２軍|一軍|１軍|スタメン|安打|ヒット|守備|打席|日本大|日大/;
  if (place.test(text) && !baseball.test(text)) return 'offtopic';
  return 'ok';
}

function suffixPolarity(after) {
  if (/^(?:い?ないわけではない|い?ないわけじゃない|くはない|くもない|なくはない|なくもない)/.test(after)) {
    return 'weak';
  }
  if (/^(?:じゃないか|じゃない？|じゃない\?|じゃん)/.test(after)) return 'rhetorical';
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
  if (/【ファームハイライト】|【スコア詳細】/.test(text)) {
    return { verdict: 'reject', confidence: 0.92, reasons: ['neutral'], definitive: true };
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

  if (score >= PUBLISH_SCORE && negative > 0) {
    return { verdict: 'reject', confidence: 0.9, reasons: ['mixed'], definitive: true };
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
  if (score >= PUBLISH_SCORE) {
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
    modelCalls: 0,
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
      if (prev.verdict === 'publish') {
        published.push(tweet);
        stats.publish += 1;
      } else {
        stats.reject += 1;
      }
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
    if (result.verdict === 'publish') {
      published.push(tweet);
      stats.publish += 1;
    } else {
      stats.reject += 1;
    }
  }

  return {
    tweets: published,
    cache: { rulesetVersion: RULESET_VERSION, rulesetFingerprint: RULESET_FINGERPRINT, items: nextItems },
    stats,
  };
}
