import { renderBlueskyPost } from './feed-render.js?v=20261024-bluesky';
import { safeBlueskyUrl } from './safe-url.js?v=20261024-bluesky';
import { formatJaDate } from './feed-behavior.js';

const searchUrl = new URL('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts');
searchUrl.search = new URLSearchParams({ q: '"谷端"', sort: 'latest', limit: '100' });
export const BLUESKY_SEARCH_URL = searchUrl.href;
export const BLUESKY_SNAPSHOT_URL = 'data/bluesky-public.json';
const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;

export function normalizeBlueskyPosts(items) {
  if (!Array.isArray(items)) throw new Error('Invalid Bluesky feed');
  const posts = new Map();
  for (const item of items) {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;
    if (typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) continue;
    const post = {
      text: item.text,
      handle: typeof item.handle === 'string' ? item.handle : '',
      displayName: typeof item.displayName === 'string' ? item.displayName : '',
      postUrl: safeBlueskyUrl(item.postUrl) || '',
      createdAt: new Date(item.createdAt).toISOString(),
    };
    const key = post.postUrl || JSON.stringify([post.handle, post.createdAt, post.text]);
    if (!posts.has(key)) posts.set(key, post);
  }
  if (items.length && !posts.size) throw new Error('No valid Bluesky posts');
  return [...posts.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function postsFromBlueskySearch(data) {
  if (!Array.isArray(data?.posts)) throw new Error('Invalid Bluesky search response');
  return normalizeBlueskyPosts(data.posts.map(post => {
    // Link to the stable DID from the record URI, even if the handle changes.
    const match = typeof post?.uri === 'string' && post.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    return {
      text: post?.record?.text,
      handle: post?.author?.handle,
      displayName: post?.author?.displayName,
      postUrl: match ? `https://bsky.app/profile/${match[1]}/post/${match[2]}` : '',
      createdAt: post?.record?.createdAt,
    };
  }));
}

async function readJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Bluesky feed unavailable');
  return response.json();
}

export async function loadBlueskyFeed(fetchImpl = fetch, { onPosts } = {}) {
  let liveFinished = false;
  const snapshot = readJson(fetchImpl, BLUESKY_SNAPSHOT_URL)
    .then(data => {
      if (data?.version !== 1) throw new Error('Invalid Bluesky snapshot');
      const posts = normalizeBlueskyPosts(data.posts);
      if (!liveFinished && posts.length) onPosts?.(posts);
      return posts;
    }).catch(() => null);
  try {
    const posts = postsFromBlueskySearch(await readJson(fetchImpl, BLUESKY_SEARCH_URL));
    liveFinished = true;
    return { source: 'live', posts, message: posts.length ? '' : '投稿はまだありません。' };
  } catch {
    const posts = await snapshot;
    liveFinished = true;
    if (posts?.length) return { source: 'snapshot', posts, message: '最新の投稿を取得できませんでした。保存済みの投稿を表示しています。' };
    return { source: 'error', posts: [], message: '投稿を読み込めませんでした。時間をおいて再度お試しください。' };
  }
}

export function mountBlueskyFeed({ document, fetchImpl = fetch }) {
  const search = document.getElementById('search');
  const container = document.getElementById('post-container');
  const more = document.getElementById('more-posts-btn');
  const message = document.getElementById('feed-message');
  const retry = document.getElementById('retry-feed-btn');
  let posts = [];
  let weeks = 0;
  let status = '読み込み中…';
  let loading = false;

  function display() {
    const query = search.value.trim().toLowerCase();
    const latest = posts.length ? Date.parse(posts[0].createdAt) : 0;
    const jstDay = new Date(latest + JST).toISOString().slice(0, 10);
    const cutoff = Date.parse(`${jstDay}T00:00:00+09:00`) - (weeks ? weeks * 7 : 1) * DAY;
    let hasMore = false;
    const visible = posts.filter(post => {
      if (query) return `${post.displayName} ${post.handle} ${post.text}`.toLowerCase().includes(query);
      if (Date.parse(post.createdAt) >= cutoff) return true;
      hasMore = true;
      return false;
    });
    container.replaceChildren(...visible.map(post => renderBlueskyPost(document, {
      ...post, dateLabel: formatJaDate(new Date(post.createdAt)),
    })));
    if (hasMore) more.classList.remove('hidden');
    else more.classList.add('hidden');
    message.textContent = query && posts.length && !visible.length ? '一致する投稿はありません。' : status;
  }

  async function load() {
    if (loading) return;
    loading = true;
    retry.classList.add('hidden');
    status = '読み込み中…';
    display();
    const result = await loadBlueskyFeed(fetchImpl, { onPosts: items => {
      posts = items;
      status = '最新の投稿を確認しています…';
      display();
    } });
    posts = result.posts;
    status = result.message;
    loading = false;
    if (result.source !== 'live') retry.classList.remove('hidden');
    display();
    return result;
  }
  search.addEventListener('input', display);
  more.addEventListener('click', () => { weeks += 1; display(); });
  retry.addEventListener('click', load);
  return load();
}
