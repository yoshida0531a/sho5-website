import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://baseball.yahoo.co.jp/npb/player/2118999/top';
const ZONE_SOURCE_URL = 'https://baseball.yahoo.co.jp/npb/player/2118999/stadium';
const ZONE_NAMES = ['高め内角', '高め中', '高め外角', '中内角', '中', '中外角', '低め内角', '低め中', '低め外角'];
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

const INTEGER_PATTERN = /^\d+$/;
const RATE_PATTERN = /^(\d+\.\d{3}|\.\d{3})$/;

function assertIntegerField(raw, key) {
  if (!(key in raw)) throw new Error(`ファーム成績に必須列「${key}」がありません`);
  if (!INTEGER_PATTERN.test(raw[key])) {
    throw new Error(`ファーム成績の「${key}」が整数ではありません: ${raw[key]}`);
  }
}

function assertRateField(raw, key, gamesPlayed) {
  if (!(key in raw)) throw new Error(`ファーム成績に必須列「${key}」がありません`);
  if (RATE_PATTERN.test(raw[key])) return;
  // 試合数が 0 のときだけ、率の「--」（記録なし）を許す。
  if (raw[key] === '--' && gamesPlayed === 0) return;
  throw new Error(`ファーム成績の「${key}」が率の形式ではありません: ${raw[key]}`);
}

export function extractFarmSummary(html) {
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
    if (headers.length === 0 || headers.length !== values.length) {
      throw new Error(
        `ファーム成績テーブルの列数が一致しません (見出し ${headers.length} / 値 ${values.length})`,
      );
    }
    headers.forEach((header, index) => {
      raw[header] = values[index];
    });
  };

  mergeRow(tableRows[0], tableRows[1]);
  mergeRow(tableRows[2], tableRows[3]);

  // 必須列と値の形式を検証する。欠落・異常値のまま公開データにしない。
  for (const key of ['試合', '打数', '安打', '二塁打', '三塁打', '本塁打', '打点', '四球', '盗塁']) {
    assertIntegerField(raw, key);
  }
  const gamesPlayed = Number.parseInt(raw['試合'], 10);
  for (const key of ['打率', '出塁率', '得点圏']) {
    assertRateField(raw, key, gamesPlayed);
  }

  const longHits = ['二塁打', '三塁打', '本塁打']
    .reduce((sum, key) => sum + (Number.parseInt(raw[key], 10) || 0), 0);

  return {
    raw,
    display: [
      { label: '打率', value: raw['打率'] },
      { label: '安打数', value: raw['安打'] },
      { label: '打点', value: raw['打点'] },
      { label: '長打', value: String(longHits) },
      { label: '四球', value: raw['四球'] },
      { label: '盗塁', value: raw['盗塁'] },
      { label: '出塁率', value: raw['出塁率'] },
      { label: '得点圏', value: raw['得点圏'] },
    ],
  };
}

const GAME_NUMERIC_INDEXES = [2, 3, 4, 5, 6, 7, 8, 9];

export function extractRecentGames(html) {
  const table = matchOne(
    html,
    /<table\b[^>]*id="game_b"[^>]*>([\s\S]*?)<\/table>/,
    '最近6試合テーブル',
  );

  const games = [];
  for (const rowHtml of rows(table).slice(1)) {
    const values = cells(rowHtml, 'td');
    // 「試合記録なし」等の単独セル行は試合データではないので空として扱う。
    if (values.length === 1 && /記録なし|ありません/.test(values[0])) continue;
    if (values.length < 11) {
      throw new Error(`最近の試合テーブルの列数が不足しています (${values.length})`);
    }
    for (const index of GAME_NUMERIC_INDEXES) {
      if (values[index] !== '--' && !INTEGER_PATTERN.test(values[index])) {
        throw new Error(`最近の試合の数値列が整数ではありません: ${values[index]}`);
      }
    }
    const href = rowHtml.match(/<a\b[^>]*href="([^"]+)"/)?.[1] || '';
    const gameUrl = href.startsWith('http') ? href : `https://baseball.yahoo.co.jp${href}`;
    const kind = rowHtml.match(/<span\b[^>]*bb-table__gameKind[^>]*>([\s\S]*?)<\/span>/)?.[1];

    games.push({
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
    });
  }
  return games;
}


export function extractFirstTeamZoneHeatmap(html) {
  const section = html.match(
    /<(h[1-6])\b[^>]*>\s*ゾーン別データ\s*<\/\1>([\s\S]*?)<(h[1-6])\b[^>]*>\s*打球方向データ\s*<\/\3>/i,
  );
  if (!section) throw new Error('スポーツナビのゾーン別データ欄が見つかりません');

  // Sportsnavi renders a split-by-pitcher-hand panel and a separate aggregate panel.
  // The aggregate panel is the final nine cells in the section.
  const plain = textContent(section[2]);
  const pattern = /(\d+|-+)\s*[-–−－]\s*(\d+|-+)\s+(-+|\.\d{3}|0\.\d{3})\s+HR\s*(\d+|-+)\s*K\s*(\d+|-+)/gi;
  const matches = Array.from(plain.matchAll(pattern));

  if (matches.length < 9 || matches.length % 9 !== 0) {
    throw new Error('ゾーン別データを9区画単位で解析できません: ' + matches.length + '区画');
  }

  // 「合計」のパネル名が取得できないページ構造では、左右別データを
  // 合算データと誤認しないように更新を拒否する。
  const totalLabelIndex = plain.lastIndexOf('合計');
  const lastCell = matches[matches.length - 1];
  const lastCellEnd = lastCell.index + lastCell[0].length;
  if (totalLabelIndex < lastCellEnd) {
    throw new Error('合計パネルを確認できません');
  }

  const totalCells = matches.slice(-9);
  const toCount = value => value.startsWith('-') ? null : Number.parseInt(value, 10);
  const toAverage = value => {
    if (value.startsWith('-')) return null;
    return value.startsWith('0.') ? value.slice(1) : value;
  };

  return totalCells.map((match, index) => ({
    zone: ZONE_NAMES[index],
    atBats: toCount(match[1]),
    hits: toCount(match[2]),
    average: toAverage(match[3]),
    homeRuns: toCount(match[4]),
    strikeouts: toCount(match[5]),
  }));
}

async function fetchFirstTeamZoneHeatmaps(previous, fetchedAt) {
  try {
    const response = await fetch(ZONE_SOURCE_URL, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; sho5-website-results-updater/1.0)',
      },
    });
    if (!response.ok) throw new Error('Sportsnavi zone page returned HTTP ' + response.status);

    const zones = extractFirstTeamZoneHeatmap(await response.text());
    return {
      firstTeam: {
        status: 'available',
        sourceUrl: ZONE_SOURCE_URL,
        fetchedAt,
        zones,
      },
      farm: {
        status: 'not_provided',
        note: 'Sportsnavi publishes this batting-zone data for first-team games; farm zone data is not provided.',
      },
      combined: {
        status: 'not_available',
        note: 'A combined heatmap requires farm zone data as well.',
      },
    };
  } catch (error) {
    console.warn(
      'Sportsnavi zone data could not be refreshed; retaining the previous heatmap when available.',
      error?.message || error,
    );
    return previous || {
      firstTeam: {
        status: 'unavailable',
        sourceUrl: ZONE_SOURCE_URL,
        fetchedAt: null,
        zones: [],
      },
      farm: {
        status: 'not_provided',
        note: 'Sportsnavi does not provide farm batting-zone data.',
      },
      combined: {
        status: 'not_available',
        note: 'A combined heatmap requires farm zone data as well.',
      },
    };
  }
}

export function reuseTimestampsIfUnchanged(previous, next) {
  if (!previous) return next;
  const sameContent = JSON.stringify(previous.farmSummary) === JSON.stringify(next.farmSummary)
    && JSON.stringify(previous.recentGames) === JSON.stringify(next.recentGames);
  const zoneFingerprint = value => JSON.stringify(value ? {
    firstTeam: {
      status: value.firstTeam?.status ?? null,
      zones: value.firstTeam?.zones ?? null,
    },
    farm: value.farm ?? null,
    combined: value.combined ?? null,
  } : null);
  const sameZones = zoneFingerprint(previous.zoneHeatmaps) === zoneFingerprint(next.zoneHeatmaps);
  if (!sameContent || !sameZones) return next;
  return {
    ...next,
    fetchedAt: previous.fetchedAt,
    lastUpdated: previous.lastUpdated,
    zoneHeatmaps: previous.zoneHeatmaps ?? next.zoneHeatmaps,
  };
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; sho5-website-results-updater/1.0)',
    },
  });
  if (!response.ok) throw new Error('Yahooページの取得に失敗しました: ' + response.status);

  const html = await response.text();
  const now = new Date();
  const fetchedAt = now.toISOString();
  const lastUpdated = now.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replaceAll('/', '-');

  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch {
    // 新規作成、または前回データが読めない場合は今回取得分から作る。
  }

  // ゾーン別データは別ページから取得する。失敗してもファーム成績・直近試合の更新を止めない。
  const zoneHeatmaps = await fetchFirstTeamZoneHeatmaps(previous?.zoneHeatmaps, fetchedAt);
  let data = {
    sourceUrl: SOURCE_URL,
    zoneSourceUrl: ZONE_SOURCE_URL,
    fetchedAt,
    lastUpdated,
    farmSummary: extractFarmSummary(html),
    recentGames: extractRecentGames(html),
    zoneHeatmaps,
  };

  // 内容が前回と同じなら日時を前回のままにし、無意味なコミットを発生させない。
  data = reuseTimestampsIfUnchanged(previous, data);

  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log('Updated ' + OUTPUT_PATH.pathname);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
