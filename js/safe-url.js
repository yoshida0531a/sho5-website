const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parseHttps(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url;
}

export function safeXUrl(raw) {
  const url = parseHttps(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return null;
  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
  if (!match) return null;
  if (!/^[A-Za-z0-9_]{1,50}$/.test(match[1])) return null;
  return `https://x.com/${match[1]}/status/${match[2]}`;
}

export function safeYouTubeUrl(raw) {
  const url = parseHttps(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] || '';
    if (!YOUTUBE_ID.test(id)) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;
  const id = url.searchParams.get('v') || '';
  if (!YOUTUBE_ID.test(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function extractYouTubeId(raw) {
  const safe = safeYouTubeUrl(raw);
  if (!safe) return null;
  return new URL(safe).searchParams.get('v');
}

export function extractXStatusId(raw) {
  const safe = safeXUrl(raw);
  if (!safe) return null;
  const match = safe.match(/status\/(\d+)$/);
  return match ? match[1] : null;
}
