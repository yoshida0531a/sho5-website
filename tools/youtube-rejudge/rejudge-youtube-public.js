import fs from 'node:fs';
import { extractYouTubeId } from './safe-url.js';
import { applyYouTubeRejudge, rejudgeYouTubePublic } from './youtube-quality.js';

export const YOUTUBE_REJUDGE_COUNT = 472;

export function youtubeRejudgeInputError(videos, status) {
  if (!Array.isArray(videos) || videos.length !== YOUTUBE_REJUDGE_COUNT) {
    return 'YouTube public input must be a JSON array of 472 videos. Public JSON was not changed.';
  }
  const ids = new Set();
  const urls = new Set();
  for (const video of videos) {
    const url = typeof video?.url === 'string' ? video.url : '';
    const id = url ? extractYouTubeId(url) : '';
    if (!id) return 'A video is missing its id or URL. Public JSON was not changed.';
    if (ids.has(id) || urls.has(url)) {
      return 'Video ids or URLs are duplicated. Public JSON was not changed.';
    }
    ids.add(id);
    urls.add(url);
  }
  if (status?.youtube?.count !== YOUTUBE_REJUDGE_COUNT) {
    return 'feed-status YouTube count must be 472. Public JSON was not changed.';
  }
  return '';
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return '';
  return argv[index + 1];
}

export function youtubeRejudgePreview(plan) {
  const counts = plan?.counts || {};
  return {
    input: counts.input ?? 0,
    complete: plan?.complete === true,
    kept: counts.publish ?? 0,
    belowSubscriberBar: counts.belowSubscriberBar ?? 0,
    subscribersUnavailable: counts.subscribersUnavailable ?? 0,
    videoUnavailable: counts.videoUnavailable ?? 0,
    unverified: counts.unverified ?? 0,
    other: counts.other ?? 0,
    excluded: plan?.excluded || [],
    duplicateIds: plan?.duplicateIds || [],
    duplicateUrls: plan?.duplicateUrls || [],
  };
}

export async function runYouTubeRejudge(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const env = options.env || process.env;
  const publicPath = options.publicPath || argument(argv, '--public');
  const statusPath = options.statusPath || argument(argv, '--status');
  const previewPath = options.previewPath || argument(argv, '--preview');
  const apply = options.apply === true || argv.includes('--apply');
  const log = options.log || ((message) => console.error(message));
  const apiKey = options.apiKey ?? env.YOUTUBE_API_KEY ?? '';

  if (!publicPath || !statusPath) {
    log('Missing --public or --status. Public JSON was not changed.');
    return 1;
  }
  if (!apiKey) {
    log('YOUTUBE_API_KEY is not set. Public JSON was not changed.');
    return 2;
  }

  let videos;
  let status;
  try {
    videos = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch {
    log('YouTube public input could not be read. Public JSON was not changed.');
    return 1;
  }
  const inputError = youtubeRejudgeInputError(videos, status);
  if (inputError) {
    log(inputError);
    return 1;
  }

  // Injected fetches are the unit tests. The live API keeps the existing retry
  // wait and a short pause between batches of 50.
  const usesLiveApi = typeof options.fetchImpl !== 'function';
  const plan = await rejudgeYouTubePublic(videos, {
    apiKey,
    fetchImpl: options.fetchImpl,
    sleep: usesLiveApi
      ? (ms) => new Promise((resolve) => { setTimeout(resolve, ms); })
      : async () => {},
    batchDelayMs: usesLiveApi ? 100 : 0,
  });
  const preview = youtubeRejudgePreview(plan);
  const previewText = `${JSON.stringify(preview, null, 2)}\n`;
  if (previewPath) fs.writeFileSync(previewPath, previewText);
  else if (options.writePreview !== false) log(previewText.trimEnd());

  if (!apply) return plan.complete ? 0 : 3;
  if (!plan.complete || plan.counts?.unverified !== 0) {
    log('Rejudge is incomplete. Public JSON was not changed.');
    return 3;
  }
  const applied = applyYouTubeRejudge(videos, status, plan);
  if (!applied || applied.status.youtube.count !== applied.videos.length) {
    log('Rejudge could not be applied. Public JSON was not changed.');
    return 3;
  }
  fs.writeFileSync(publicPath, `${JSON.stringify(applied.videos, null, 2)}\n`);
  fs.writeFileSync(statusPath, `${JSON.stringify(applied.status, null, 2)}\n`);
  log(`Wrote ${applied.videos.length} public videos.`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('rejudge-youtube-public.js')) {
  runYouTubeRejudge().then((code) => {
    process.exitCode = code;
  });
}
