export const FEED_STATUS_VERSION = 1;
const STATES = new Set(['not_generated', 'published']);

export function parseFeedStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('format');
  if (value.version !== FEED_STATUS_VERSION) throw new Error('version');
  const next = { version: FEED_STATUS_VERSION };
  for (const key of ['x', 'youtube']) {
    if (value[key] == null) continue;
    const entry = value[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !STATES.has(entry.state)) {
      throw new Error('format');
    }
    if (entry.count != null && (!Number.isInteger(entry.count) || entry.count < 0)) {
      throw new Error('format');
    }
    const parsed = { state: entry.state, count: entry.count ?? 0 };
    if (entry.historyCount != null) {
      if (!Number.isInteger(entry.historyCount) || entry.historyCount < 0) throw new Error('format');
      parsed.historyCount = entry.historyCount;
    }
    next[key] = parsed;
  }
  return next;
}

export function mergeFeedState(current, feed, state, count) {
  const previous = current?.[feed] && typeof current[feed] === 'object' ? current[feed] : {};
  const entry = { state, count };
  if (Number.isInteger(previous.historyCount)) entry.historyCount = previous.historyCount;
  return parseFeedStatus({
    ...(current || { version: FEED_STATUS_VERSION }),
    version: FEED_STATUS_VERSION,
    [feed]: entry,
  });
}
