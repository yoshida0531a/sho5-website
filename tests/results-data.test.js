import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractFarmSummary,
  extractFirstTeamZoneHeatmap,
  extractRecentGames,
  reuseTimestampsIfUnchanged,
} from '../scripts/update-results-data.js';

const FARM_TABLE = `
<section><h3>ファームの成績</h3>
<table class="bb-playerStatsTable--summary">
<tr><th>打率</th><th>試合</th><th>打席</th><th>打数</th><th>安打</th><th>二塁打</th><th>三塁打</th><th>本塁打</th><th>打点</th></tr>
<tr><td>.250</td><td>10</td><td>40</td><td>36</td><td>9</td><td>2</td><td>0</td><td>1</td><td>5</td></tr>
<tr><th>四球</th><th>盗塁</th><th>出塁率</th><th>得点圏</th></tr>
<tr><td>4</td><td>1</td><td>.325</td><td>.300</td></tr>
</table></section>`;

const GAME_TABLE = `
<table id="game_b">
<tr><th>日付</th></tr>
<tr><td>10/28</td><td>相手</td><td>2</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>2</td><td>0</td><td>四球、右安</td></tr>
</table>`;

function page(farm = FARM_TABLE, games = GAME_TABLE) {
  return `<html><body>${farm}${games}</body></html>`;
}

test('正常な表からは成績を取り出せる', () => {
  const farm = extractFarmSummary(page());
  assert.equal(farm.display[0].value, '.250');
  assert.equal(farm.display[3].value, '3'); // 長打 = 2 + 0 + 1
  const games = extractRecentGames(page());
  assert.equal(games.length, 1);
  assert.equal(games[0].hits, '1');
});

test('必須列が欠けた表はエラーになり、前回データを上書きしない', () => {
  const broken = FARM_TABLE.replace('<th>打率</th>', '<th>順位</th>');
  assert.throws(() => extractFarmSummary(page(broken)), /必須列「打率」/);
});

test('見出しと値の列数が違う表はエラーになる', () => {
  const broken = FARM_TABLE.replace('<td>5</td>', '');
  assert.throws(() => extractFarmSummary(page(broken)), /列数が一致しません/);
});

test('率が数値でない場合はエラーになる', () => {
  const broken = FARM_TABLE.replace('<td>.250</td>', '<td>abc</td>');
  assert.throws(() => extractFarmSummary(page(broken)), /率の形式ではありません/);
});

test('「試合記録なし」行は試合データとして数えない', () => {
  const empty = `<table id="game_b"><tr><th>日付</th></tr><tr><td colspan="11">試合記録なし</td></tr></table>`;
  assert.deepEqual(extractRecentGames(page(FARM_TABLE, empty)), []);
});

test('列不足の試合行はエラーになる', () => {
  const broken = `<table id="game_b"><tr><th>日付</th></tr><tr><td>10/28</td><td>相手</td></tr></table>`;
  assert.throws(() => extractRecentGames(page(FARM_TABLE, broken)), /列数が不足/);
});

test('内容が同じなら fetchedAt と lastUpdated を前回のままにする', () => {
  const previous = {
    fetchedAt: '2026-11-20T00:00:00.000Z',
    lastUpdated: '2026-11-20',
    farmSummary: { display: [] },
    recentGames: [],
  };
  const next = {
    fetchedAt: '2026-11-21T00:00:00.000Z',
    lastUpdated: '2026-11-21',
    farmSummary: { display: [] },
    recentGames: [],
  };
  const merged = reuseTimestampsIfUnchanged(previous, next);
  assert.equal(merged.fetchedAt, previous.fetchedAt);
  assert.equal(merged.lastUpdated, previous.lastUpdated);

  const changed = reuseTimestampsIfUnchanged(previous, {
    ...next,
    farmSummary: { display: [{ label: '打率', value: '.300' }] },
  });
  assert.equal(changed.fetchedAt, next.fetchedAt);
});


const ZONE_NAMES_FOR_TEST = ['高め内角', '高め中', '高め外角', '中内角', '中', '中外角', '低め内角', '低め中', '低め外角'];
const EMPTY_ZONE_CELL = '- - - - HR- K-';

function zoneCell(ab, hits, average, homeRuns, strikeouts) {
  return [ab, '-', hits, average, 'HR', homeRuns, 'K', strikeouts].join(' ');
}

function zonePage() {
  const splitPanel = ZONE_NAMES_FOR_TEST.map((_, index) =>
    zoneCell(10 + index, 1, '.100', 0, 1)).join(' ');
  const aggregatePanel = ZONE_NAMES_FOR_TEST.map((_, index) =>
    index === 8 ? zoneCell(28, 5, '.179', 1, 4) : EMPTY_ZONE_CELL).join(' ');
  return '<html><body>' +
    '<h3>ゾーン別データ</h3><div>' + splitPanel + '</div>' +
    '<div>対左投手 対右投手</div><div>' + aggregatePanel + '</div>' +
    '<div>合計 打数 - 安打 打率 本塁打 三振</div>' +
    '<h3>打球方向データ</h3></body></html>';
}

test('Sportsnavi zone parser uses the aggregate nine-zone panel', () => {
  const zones = extractFirstTeamZoneHeatmap(zonePage());
  assert.equal(zones.length, 9);
  assert.equal(zones[0].zone, '高め内角');
  assert.equal(zones[0].atBats, null);
  assert.equal(zones[0].hits, null);
  assert.equal(zones[0].average, null);
  assert.equal(zones[8].zone, '低め外角');
  assert.equal(zones[8].atBats, 28);
  assert.equal(zones[8].hits, 5);
  assert.equal(zones[8].average, '.179');
  assert.equal(zones[8].homeRuns, 1);
  assert.equal(zones[8].strikeouts, 4);
});

test('Sportsnavi zone parser rejects missing or malformed data instead of creating zero-filled cells', () => {
  const missing = '<h3>ゾーン別データ</h3><div>データ配信後に更新されます</div><h3>打球方向データ</h3>';
  assert.throws(() => extractFirstTeamZoneHeatmap(missing), /9区画単位/);
});
