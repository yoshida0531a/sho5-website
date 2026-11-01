// All three feeds read the approved public timeline; batch links stay pinned.
// No browser-side live API or unselected seed-data fallback.
import { mountPublishedFeed } from './feed-page.js?v=20261102-timeline';
export function mountBlueskyFeed(options) {
  return mountPublishedFeed({ ...options, feed: 'bluesky' });
}
