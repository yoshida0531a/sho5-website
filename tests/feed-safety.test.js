import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { filterFeed, parseCustomDate, sortNewest, videoMatches } from '../js/feed-behavior.js';
import { renderTweet, renderVideo } from '../js/feed-render.js';
import { safeXUrl, safeYouTubeUrl } from '../js/safe-url.js';
import { createDocument, walk } from './dom-mock.js';

test('accepts only https X status URLs and YouTube watch URLs', () => {
  assert.equal(safeXUrl('https://x.com/fan/status/123'), 'https://x.com/fan/status/123');
  assert.equal(safeXUrl('https://twitter.com/fan/status/123?s=20'), 'https://x.com/fan/status/123');
  assert.equal(safeXUrl('javascript:alert(1)'), null);
  assert.equal(safeXUrl('https://evil.example/fan/status/123'), null);
  assert.equal(safeXUrl('https://x.com.evil.example/fan/status/123'), null);
  assert.equal(safeXUrl('http://x.com/fan/status/123'), null);

  assert.equal(
    safeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(safeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(safeYouTubeUrl('https://evil.example/?v=dQw4w9WgXcQ'), null);
  assert.equal(safeYouTubeUrl('javascript:alert(1)'), null);
});

test('renders external text without innerHTML and keeps unsafe URLs unlinked', () => {
  const doc = createDocument();
  const tweet = renderTweet(doc, {
    userName: '<img onerror="alert(1)">',
    text: '<script>alert(1)</script>谷端がんばれ &quot;最高&quot;',
    tweetUrl: 'javascript:alert(1)',
    dateIso: '2026-10-01T00:00:00.000Z',
    dateLabel: '2026/10/01 09:00',
  });
  const texts = [];
  walk(tweet, (node) => {
    if (node._text) texts.push(node._text);
    assert.equal(node.attrs?.href, undefined);
  });
  assert.ok(texts.some((text) => text.includes('<script>alert(1)</script>')));
  assert.ok(texts.some((text) => text.includes('"最高"')));

  const video = renderVideo(doc, {
    title: '<b>谷端</b>',
    description: '説明<script>alert(1)</script>',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    publishedAt: 'November 7, 2025 at 12:21AM',
    dateLabel: '2025/11/07 00:21',
  });
  const links = [];
  walk(video, (node) => {
    if (node.attrs?.href) links.push(node);
    if (node._text) assert.equal(node._text.includes('<b>谷端</b>') || node._text.includes('<script>alert(1)</script>') || node.className === 'date' || node.className === 'video-link', true);
  });
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.equal(link.attrs.href, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(link.attrs.target, '_blank');
    assert.equal(link.attrs.rel, 'noopener noreferrer');
  }
});

test('keeps newest-first order, search, and the X date window', () => {
  const newest = new Date(2026, 9, 15, 18, 0, 0);
  const items = [
    { username: 'a', text: '谷端ナイス', date: newest },
    { username: 'b', text: '昨日の応援', date: new Date(2026, 9, 14, 12, 0, 0) },
    { username: 'c', text: '三日前', date: new Date(2026, 9, 13, 12, 0, 0) },
    { username: 'd', text: 'ずっと前の谷端', date: new Date(2026, 8, 1, 12, 0, 0) },
  ];
  const first = filterFeed(items, { searchQuery: '', weeksToShow: 0, mostRecentDate: newest });
  assert.deepEqual(first.visible, [true, true, false, false]);
  assert.equal(first.hasMore, true);

  const searching = filterFeed(items, { searchQuery: 'ナイ', weeksToShow: 0, mostRecentDate: newest });
  assert.deepEqual(searching.visible, [true, false, false, false]);
  assert.equal(searching.hasMore, false);

  const videos = [
    { title: '古い', publishedAt: 'November 1, 2025 at 1:00AM' },
    { title: '新しい', publishedAt: 'November 7, 2025 at 12:21AM' },
  ];
  const sorted = sortNewest(videos, (video) => parseCustomDate(video.publishedAt));
  assert.deepEqual(sorted.map((video) => video.title), ['新しい', '古い']);
  assert.equal(videoMatches({ title: '谷端<script>', description: '守備' }, 'SCRIPT'), true);
  assert.equal(videoMatches({ title: '谷端', description: '守備' }, ''), true);
});

test('pages read only the curated files and do not assign innerHTML', () => {
  const x = fs.readFileSync(new URL('../x.html', import.meta.url), 'utf8');
  const youtube = fs.readFileSync(new URL('../youtube.html', import.meta.url), 'utf8');
  const workflow = fs.readFileSync(new URL('../.github/workflows/curate-feeds.yml', import.meta.url), 'utf8');

  assert.match(x, /loadTodayFeed\(fetch, 'x', new Date\(\)\)/);
  assert.match(x, /loadArchiveFeed\(fetch, 'x', new Date\(\)\)/);
  assert.match(youtube, /loadTodayFeed\(fetch, 'youtube', new Date\(\)\)/);
  assert.match(youtube, /loadArchiveFeed\(fetch, 'youtube', new Date\(\)\)/);
  assert.doesNotMatch(x, /x-data\.txt/);
  assert.doesNotMatch(youtube, /YouTube-data\.txt/);
  assert.doesNotMatch(x, /loadPublicFeed/);
  assert.doesNotMatch(youtube, /loadPublicFeed/);
  assert.doesNotMatch(x, /innerHTML/);
  assert.doesNotMatch(youtube, /innerHTML/);
  assert.doesNotMatch(workflow, /git add[^\n]*x-data\.txt/);
  assert.doesNotMatch(workflow, /git add[^\n]*YouTube-data\.txt/);
  assert.match(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /curate-x\.js/);
  assert.match(workflow, /curate-youtube\.js/);
  assert.match(workflow, /steps\.curate_x\.outcome == 'failure'/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /DRY_RUN:\s*'true'/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.doesNotMatch(workflow, /git push/);
  assert.doesNotMatch(workflow, /git commit/);
  assert.doesNotMatch(workflow, /git add/);
  assert.doesNotMatch(workflow, /node scripts\/curate-feeds\.js/);
  const curateX = fs.readFileSync(new URL('../scripts/curate-x.js', import.meta.url), 'utf8');
  const curateYouTube = fs.readFileSync(new URL('../scripts/curate-youtube.js', import.meta.url), 'utf8');
  assert.doesNotMatch(curateX, /writeFile|writeJsonAtomic|saveFeedState/);
  assert.doesNotMatch(curateYouTube, /writeFile|writeJsonAtomic|saveFeedState/);
  assert.equal(fs.existsSync(new URL('../.github/workflows/filter-youtube.yml', import.meta.url)), false);
});
