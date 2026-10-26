// The legacy API is public. UI save restrictions are not access control.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Photo-Variant',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { ...corsHeaders, Allow: 'GET, HEAD, OPTIONS' } });
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/photos') {
        const photos = await listPhotos(env.PHOTOS, url.searchParams);
        return new Response(request.method === 'HEAD' ? null : JSON.stringify(photos), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
        });
      }
      if (url.pathname.startsWith('/images/')) {
        const key = decodeURIComponent(url.pathname.slice('/images/'.length));
        if (!/^\d{4}-\d{2}-\d{2}\/[^/\\]+\.(jpe?g|png)$/i.test(key)) {
          return new Response('Invalid image key', { status: 400, headers: corsHeaders });
        }
        return await serveImage(request, env, key, url.searchParams.get('size') || 'medium');
      }
      return new Response('Photo Gallery Worker', { headers: corsHeaders });
    } catch (error) {
      if (error instanceof URIError || error instanceof RangeError) {
        return new Response('Invalid request', { status: 400, headers: corsHeaders });
      }
      console.error('Photo gallery request failed', error);
      return new Response('Photo service unavailable', { status: 500, headers: corsHeaders });
    }
  },
};

async function listPhotos(bucket, params) {
  const date = params.get('date');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Invalid date');
  const parsed = Number(params.get('limit') || 300);
  const limit = Number.isInteger(parsed) ? Math.min(1000, Math.max(1, parsed)) : 300;
  const objects = await bucket.list({
    limit,
    prefix: date ? `${date}/` : '',
    ...(params.get('cursor') ? { cursor: params.get('cursor') } : {}),
    include: ['customMetadata'],
  });
  const photos = objects.objects
    .filter(object => /^\d{4}-\d{2}-\d{2}\/[^/]+\.(jpg|jpeg|png)$/i.test(object.key))
    .map(object => {
      const [datePart, filename] = object.key.split('/');
      return {
        key: object.key,
        filename,
        dateTime: object.customMetadata?.dateTime || `${datePart} 12:00:00`,
        size: object.size,
        url: `/images/${object.key.split('/').map(encodeURIComponent).join('/')}`,
      };
    })
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime) || a.key.localeCompare(b.key));
  return { photos, total: photos.length, hasMore: objects.truncated, nextCursor: objects.truncated ? objects.cursor : null };
}

async function serveImage(request, env, key, size) {
  if (!['thumb', 'medium', 'large', 'original'].includes(size)) {
    return new Response('Invalid image size', { status: 400, headers: corsHeaders });
  }
  // Enable only after uploading pre-generated variants; no paid image service.
  // Existing buckets keep serving the current files until PHOTO_VARIANTS=1.
  let variant = 'source';
  let object;
  const conditions = new Headers();
  // Forward cache validators only; other HTTP preconditions have different statuses.
  for (const name of ['If-None-Match', 'If-Modified-Since']) {
    if (request.headers.has(name)) conditions.set(name, request.headers.get(name));
  }
  const options = { onlyIf: conditions };
  if (env.PHOTO_VARIANTS === '1' && size !== 'original') {
    object = await env.PHOTOS.get(`_variants/${size}/${key}.webp`, options);
    if (object) variant = size;
  }
  if (!object) object = await env.PHOTOS.get(key, options);
  if (!object) return new Response('Image not found', { status: 404, headers: corsHeaders });
  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', variant === 'source' ? object.httpMetadata?.contentType || 'image/jpeg' : 'image/webp');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Photo-Variant', variant);
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  // Stream from R2. Do not wait for arrayBuffer() or list the bucket per image.
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}
