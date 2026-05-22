import { writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://baseball.yahoo.co.jp/npb/player/2118999/top';
const OUTPUT_PATH = new URL('../data/results.json', import.meta.url);

const entityMap = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return entityMap[entity.toLowerCase()] ?? `&${entity};`;
  });
}

function textContent(html) {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function matchOne(html, pattern, label) {
  const match = html.match(pattern);
  if (!match) throw new Error(`${label} が見つかりません`);
  return match[1];
}

function cells(rowHtml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return Array.from(rowHtml.matchAll(pattern), match => textContent(match[1]));
}

function rows(tableHtml) {
  return Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), match => match[1]);
}

function extractFarmSummary(html) {
  const farmSection = matchOne(
    html,
    /<section\b[^>]*>[\s\S]*?<h3[^>]*>\s*ファームの成績\s*<\/h3>([\s\S]*?)<\/section>/,
    'ファーム成績セクション',
  );
  const table = matchOne(
    farmSection,
    /<table\b[^>]*bb-playerStatsTable--summary[^>]*>([\s\S]*?)<\/table>/,
    'ファーム成績テーブル',
  );
  const tableRows = rows(table);
  if (tableRows.length < 4) throw new Error('ファーム成績テーブルの行数が不足しています');

  const raw = {};
  const mergeRow = (headerRow, dataRow) => {
    const headers = cells(headerRow, 'th');
    const values = cells(dataRow, 'td');
    headers.forEach((header, index) => {
      raw[header] = values[index] || '--';
    });
  };

  mergeRow(tableRows[0], tableRows[1]);
  mergeRow(tableRows[2], tableRows[3]);

  const longHits = ['二塁打', '三塁打', '本塁打']
    .reduce((sum, key) => sum + (Number.parseInt(raw[key], 10) || 0), 0);

  return {
    raw,
    display: [
      { label: '打率', value: raw['打率'] || '--' },
      { label: '安打数', value: raw['安打'] || '--' },
      { label: '打点', value: raw['打点'] || '--' },
      { label: '長打', value: String(longHits) },
      { label: '四球', value: raw['四球'] || '--' },
      { label: '盗塁', value: raw['盗塁'] || '--' },
      { label: '出塁率', value: raw['出塁率'] || '--' },
      { label: '得点圏', value: raw['得点圏'] || '--' },
    ],
  };
}

function extractRecentGames(html) {
  const table = matchOne(
    html,
    /<table\b[^>]*id="game_b"[^>]*>([\s\S]*?)<\/table>/,
    '最近6試合テーブル',
  );

  return rows(table).slice(1).map(rowHtml => {
    const values = cells(rowHtml, 'td');
    const href = rowHtml.match(/<a\b[^>]*href="([^"]+)"/)?.[1] || '';
    const gameUrl = href.startsWith('http') ? href : `https://baseball.yahoo.co.jp${href}`;
    const kind = rowHtml.match(/<span\b[^>]*bb-table__gameKind[^>]*>([\s\S]*?)<\/span>/)?.[1];

    return {
      date: values[0]?.replace(textContent(kind || ''), '').trim() || '--',
      gameKind: kind ? textContent(kind) : '',
      opponent: values[1] || '--',
      atBats: values[2] || '--',
      hits: values[3] || '--',
      homeRuns: values[4] || '--',
      rbi: values[5] || '--',
      runs: values[6] || '--',
      strikeouts: values[7] || '--',
      walks: values[8] || '--',
      hitByPitch: values[9] || '--',
      battingResults: values[10] || '--',
      gameUrl,
    };
  });
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; sho5-website-results-updater/1.0)',
    },
  });
  if (!response.ok) throw new Error(`Yahooページの取得に失敗しました: ${response.status}`);

  const html = await response.text();
  const now = new Date();
  const data = {
    sourceUrl: SOURCE_URL,
    fetchedAt: now.toISOString(),
    lastUpdated: now.toLocaleDateString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replaceAll('/', '-'),
    farmSummary: extractFarmSummary(html),
    recentGames: extractRecentGames(html),
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${OUTPUT_PATH.pathname}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
