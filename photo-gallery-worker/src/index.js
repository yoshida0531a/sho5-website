const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 無料枠上限: 写真がこの件数に達したら 429 を返す
const MAX_PHOTOS = 25000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // 写真一覧API
      if (path === '/api/photos') {
        const photos = await listPhotos(env.PHOTOS, url.searchParams);
        return new Response(JSON.stringify(photos), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      // 画像配信（Cache API でエッジキャッシュ活用）
      if (path.startsWith('/images/')) {
        const key = path.replace('/images/', '');
        const size = url.searchParams.get('size') || 'medium';
        return await serveImage(env.PHOTOS, key, size, ctx);
      }

      return new Response('Photo Gallery Worker', { headers: CORS_HEADERS });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};

// 写真一覧を取得
async function listPhotos(bucket, searchParams) {
  const date = searchParams.get('date');
  const limit = Math.min(parseInt(searchParams.get('limit') || '300', 10), 1000);

  const objects = await bucket.list({
    limit: 1000,
    prefix: date ? `${date}/` : '',
  });

  if (objects.objects.length >= MAX_PHOTOS) {
    console.warn(`Photo count approaching limit: ${objects.objects.length}`);
  }

  const photos = objects.objects
    .filter(obj => /\.(jpg|jpeg|png)$/i.test(obj.key))
    .map(obj => {
      const [datePart, filename] = obj.key.split('/');
      const dateTime = obj.customMetadata?.dateTime || `${datePart} 12:00:00`;
      return {
        key: obj.key,
        filename: filename || obj.key,
        dateTime,
        size: obj.size,
        url: `/images/${obj.key}`,
      };
    })
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
    .slice(0, limit);

  return { photos, total: photos.length, hasMore: objects.objects.length > limit };
}

// 画像配信: Cloudflare Cache API でエッジにキャッシュし R2 読み込みを削減
async function serveImage(bucket, key, size, ctx) {
  if (!key) {
    return new Response('Bad Request: missing key', { status: 400, headers: CORS_HEADERS });
  }

  // キャッシュキーはサイズ込みのフルURL
  const cacheKey = new Request(`https://photo-cache/${encodeURIComponent(key)}?size=${size}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response('Image not found', { status: 404, headers: CORS_HEADERS });
    }

    const imageData = await object.arrayBuffer();
    const contentType = object.httpMetadata?.contentType || 'image/jpeg';

    const response = new Response(imageData, {
      headers: {
        'Content-Type': contentType,
        // 1年キャッシュ（写真は変更されない）
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...CORS_HEADERS,
      },
    });

    // エッジキャッシュに非同期保存（レスポンス返却をブロックしない）
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    console.error('Image serve error:', error);
    return new Response('Error serving image', { status: 500, headers: CORS_HEADERS });
  }
}
