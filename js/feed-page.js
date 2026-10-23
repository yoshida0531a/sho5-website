import { filterFeed, formatJaDate, formatVideoDate, parseCustomDate, snowflakeToDate, sortNewest, videoMatches } from './feed-behavior.js';
import { renderTweet, renderVideo } from './feed-render.js';
import { loadPublishedFeed } from './published-feed.js';

export function mountPublishedFeed({ document, feed, fetchImpl = fetch, now = new Date() }) {
  const search = document.getElementById('search');
  const container = document.getElementById(feed === 'youtube' ? 'video-container' : 'tweet-container');
  const more = document.getElementById('past-posts-btn');
  const message = document.getElementById('feed-message');
  let records = [];
  let weeksToShow = 0;
  let statusMessage = '読み込み中…';

  function updateMessage(visible) {
    message.textContent = search.value.trim() && records.length && !visible
      ? (feed === 'youtube' ? '一致する動画はありません。' : '一致する投稿はありません。')
      : statusMessage;
  }

  function dateOf(item) {
    if (feed === 'youtube') return parseCustomDate(item?.publishedAt) || new Date(item?.publishedAt || 0);
    const id = String(item?.tweetUrl || '').match(/status\/(\d+)/)?.[1];
    return id ? snowflakeToDate(id) : new Date(0);
  }

  function updateVisibility() {
    if (feed === 'youtube') {
      let visible = false;
      records.forEach(record => {
        const matches = videoMatches(record, search.value);
        record.node.style.display = matches ? 'block' : 'none';
        visible ||= matches;
      });
      more.classList.add('hidden');
      updateMessage(visible);
      return;
    }
    const result = filterFeed(records, { searchQuery: search.value, weeksToShow, mostRecentDate: records[0]?.date || now });
    records.forEach((record, index) => { record.node.style.display = result.visible[index] ? 'block' : 'none'; });
    if (result.hasMore) more.classList.remove('hidden');
    else more.classList.add('hidden');
    updateMessage(result.visible.some(Boolean));
  }

  function display(items) {
    records = sortNewest(items, dateOf).map(item => {
      const parsed = dateOf(item);
      const date = Number.isFinite(parsed?.getTime()) ? parsed : new Date(0);
      const node = feed === 'youtube'
        ? renderVideo(document, { ...item, dateLabel: formatVideoDate(date) })
        : renderTweet(document, { ...item, dateIso: date.toISOString(), dateLabel: formatJaDate(date) });
      return {
        node, date,
        username: node.getAttribute('data-username') || '', text: node.getAttribute('data-text') || '',
        title: node.getAttribute('data-title') || '', description: node.getAttribute('data-description') || '',
      };
    });
    container.replaceChildren(...records.map(record => record.node));
    updateVisibility();
  }

  search.addEventListener('input', updateVisibility);
  more.addEventListener('click', () => { weeksToShow += 1; updateVisibility(); });
  more.classList.add('hidden');
  message.textContent = statusMessage;
  return loadPublishedFeed(fetchImpl, feed, now, { onItems: items => { statusMessage = ''; display(items); } }).then(result => {
    statusMessage = result.message;
    display(result.items);
    return result;
  });
}
