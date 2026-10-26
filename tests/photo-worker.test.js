import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../photo-gallery-worker/src/index.js';

const base = 'https://photos.example';
function imageObject(body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } })) {
  return {
    body, httpEtag: '"photo-v1"', httpMetadata: { contentType: 'image/jpeg' },
    writeHttpMetadata(headers) { headers.set('Content-Type', 'image/jpeg'); },
  };
}

test('image requests stream from R2 without a bucket-wide usage listing', async () => {
  const object = imageObject();
  const response = await worker.fetch(new Request(`${base}/images/2026-02-23/IMG_5905.JPG?size=medium`), {
    PHOTOS: {
      list() { assert.fail('No bucket listing on image requests'); },
      async get(key) { assert.equal(key, '2026-02-23/IMG_5905.JPG'); return object; },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, object.body);
  assert.equal(response.headers.get('ETag'), '"photo-v1"');
  assert.equal(response.headers.get('Content-Disposition'), 'inline');
});

test('conditional image requests return 304 without downloading a body', async () => {
  const object = imageObject();
  delete object.body;
  const request = new Request(`${base}/images/2026-02-23/IMG.JPG`, { headers: { 'If-None-Match': '"photo-v1"' } });
  const response = await worker.fetch(request, { PHOTOS: { async get(key, options) {
    assert.equal(options.onlyIf.get('If-None-Match'), '"photo-v1"');
    return object;
  } } });
  assert.equal(response.status, 304);
  assert.equal(response.body, null);
});

test('variants are opt-in and a missing variant falls back to the existing photo', async () => {
  const keys = [];
  const response = await worker.fetch(new Request(`${base}/images/2026-02-23/IMG.JPG?size=large`), {
    PHOTO_VARIANTS: '1',
    PHOTOS: { async get(key) { keys.push(key); return key.startsWith('_variants/') ? null : imageObject(); } },
  });
  assert.deepEqual(keys, ['_variants/large/2026-02-23/IMG.JPG.webp', '2026-02-23/IMG.JPG']);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Photo-Variant'), 'source');
});

test('a generated variant has WebP content type and does not read the source', async () => {
  const response = await worker.fetch(new Request(`${base}/images/2026-02-23/IMG.JPG?size=medium`), {
    PHOTO_VARIANTS: '1',
    PHOTOS: { async get(key) {
      assert.equal(key, '_variants/medium/2026-02-23/IMG.JPG.webp');
      return imageObject();
    } },
  });
  assert.equal(response.headers.get('Content-Type'), 'image/webp');
  assert.equal(response.headers.get('X-Photo-Variant'), 'medium');
});

test('preflight, invalid methods and invalid image keys never read R2', async () => {
  for (const [path, method, status] of [
    ['/api/photos', 'OPTIONS', 200], ['/api/photos', 'POST', 405],
    ['/images/2026-02-23%2Fother%2Fsecret.JPG', 'GET', 400],
    ['/images/%ZZ', 'GET', 400], ['/images/2026-02-23/IMG.JPG?size=invalid', 'GET', 400],
  ]) {
    assert.equal((await worker.fetch(new Request(base + path, { method }), {})).status, status);
  }
});

test('listing excludes variants, escapes filenames and passes a continuation cursor', async () => {
  const response = await worker.fetch(new Request(`${base}/api/photos?date=2026-02-23&limit=10000&cursor=page2`), {
    PHOTOS: { async list(options) {
      assert.equal(options.limit, 1000);
      assert.equal(options.prefix, '2026-02-23/');
      assert.equal(options.cursor, 'page2');
      assert.deepEqual(options.include, ['customMetadata']);
      return { objects: [
        { key: '_variants/medium/2026-02-23/a.JPG.webp' },
        { key: '2026-02-23/a #1.JPG', size: 5, customMetadata: { dateTime: '2026-02-23 10:00:00' } },
      ], truncated: true, cursor: 'page3' };
    } },
  });
  const data = await response.json();
  assert.equal(data.photos.length, 1);
  assert.equal(data.photos[0].url, '/images/2026-02-23/a%20%231.JPG');
  assert.equal(data.nextCursor, 'page3');
});
