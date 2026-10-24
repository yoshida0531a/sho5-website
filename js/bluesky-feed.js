// All three feeds use the same immutable, selected notification release.
// No browser-side live API or unselected seed-data fallback.
import { mountPublishedFeed } from './feed-page.js?v=20261024-curation-audit';
export function mountBlueskyFeed(options) {
  return mountPublishedFeed({ ...options, feed: 'bluesky' });
}
