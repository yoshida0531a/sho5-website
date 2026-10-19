const referrer = process.env.YOUTUBE_REFERRER || '';
if (referrer) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const headers = new Headers(init?.headers || {});
    if (!headers.has('referer')) headers.set('referer', referrer);
    return original(input, { ...init, headers });
  };
}
