import fs from 'node:fs';
import { readJson, writeJsonAtomic } from './json-file.js';

export const FEED_STATUS_VERSION = 1;
const STATES = new Set(['not_generated', 'published']);

export function parseFeedStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('format');
  }
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
    next[key] = { state: entry.state, count: entry.count ?? 0 };
  }
  return next;
}

export function loadFeedStatus(file) {
  if (!fs.existsSync(file)) return { version: FEED_STATUS_VERSION };
  return parseFeedStatus(readJson(file));
}

export function saveFeedState(file, current, feed, state, count) {
  const next = parseFeedStatus({
    ...current,
    version: FEED_STATUS_VERSION,
    [feed]: { state, count },
  });
  writeJsonAtomic(file, next);
  return next;
}
