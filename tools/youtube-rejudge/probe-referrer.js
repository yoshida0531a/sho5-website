import fs from 'node:fs';
import { extractYouTubeId } from './safe-url.js';

const key = process.env.YOUTUBE_API_KEY || '';
const videos = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const id = extractYouTubeId(videos[0]?.url);
const outPath = process.argv[3];
if (!id || !key || !outPath) process.exit(4);

const referrers = [
  'https://sho5.org/',
  'https://www.sho5.org/',
  'https://yoshida0531a.github.io/',
  'https://yoshida0531a.github.io/sho5-website/',
  'http://localhost:3000/',
  'http://localhost/',
  'https://sho5-meter.chjqnfv62h.workers.dev/',
  'https://photo-gallery-worker.chjqnfv62h.workers.dev/',
];

function redact(text) {
  let out = String(text || '');
  if (key) out = out.split(key).join('REDACTED');
  return out.replace(/key=[^&\s]+/g, 'key=REDACTED');
}

for (const referrer of referrers) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', id);
  url.searchParams.set('fields', 'items(id)');
  url.searchParams.set('key', key);
  const response = await fetch(url, { headers: { referer: referrer, accept: 'application/json' } });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  console.log(JSON.stringify({
    referrer,
    status: response.status,
    reason: body?.error?.errors?.[0]?.reason || '',
    message: redact(body?.error?.message || ''),
  }));
  if (response.ok) {
    fs.writeFileSync(outPath, referrer);
    process.exit(0);
  }
}
process.exit(4);
