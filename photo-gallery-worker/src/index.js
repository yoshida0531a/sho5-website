// 無料枠制限設定（R2容量を最大活用）
const FREE_TIER_LIMITS = {
  STORAGE_GB: 9.8, // 10GBの98%まで使用可能
  MONTHLY_REQUESTS: 50000, // リクエスト制限を緩和（月中旬なのでリセット）
  MAX_PHOTOS: 25000 // より多くの写真を許可
};

// 撮影日時が不明な場合のデフォルト時刻（正午）
const DEFAULT_FALLBACK_TIME = '12:00:00';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 使用量チェック
    const usageCheck = await checkUsageLimits(env);
    if (!usageCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Usage limit exceeded',
        message: usageCheck.message,
        limit: 'FREE_TIER_PROTECTION'
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // CORS設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 写真一覧API
      if (path === '/api/photos') {
        const photos = await listPhotos(env.PHOTOS, url.searchParams);
        return new Response(JSON.stringify(photos), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // 画像配信（圧縮版）
      if (path.startsWith('/images/')) {
        const key = path.replace('/images/', '');
        const size = url.searchParams.get('size') || 'medium';
        return await serveImage(env.PHOTOS, key, size, corsHeaders);
      }

      // デフォルトレスポンス
      return new Response('Photo Gallery Worker', { headers: corsHeaders });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

// 写真一覧を取得
async function listPhotos(bucket, searchParams) {
  const date = searchParams.get('date');
  const limit = parseInt(searchParams.get('limit') || '300');
  
  // R2から写真一覧を取得
  const objects = await bucket.list({
    limit: 1000, // R2の最大値
    prefix: date ? `${date}/` : ''
  });

  // メタデータから撮影日時を取得してソート
  const photos = objects.objects
    .filter(obj => obj.key.toLowerCase().match(/\.(jpg|jpeg|png)$/))
    .map(obj => {
      // キーから日付と時間を抽出: YYYY-MM-DD/IMG_XXXX.JPG
      const [datePart, filename] = obj.key.split('/');
      const dateTime = obj.customMetadata?.dateTime || `${datePart} ${DEFAULT_FALLBACK_TIME}`;
      
      return {
        key: obj.key,
        filename: filename || obj.key,
        dateTime: dateTime,
        size: obj.size,
        url: `/images/${obj.key}`
      };
    })
    .sort((a, b) => {
      // まず撮影日時で比較
      const dateComparison = new Date(a.dateTime) - new Date(b.dateTime);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      // 撮影日時が同じ場合はファイル名で比較（安定したソート）
      return a.key.localeCompare(b.key);
    })
    .slice(0, limit);

  return {
    photos,
    total: photos.length,
    hasMore: objects.objects.length > limit
  };
}

// 画像を圧縮して配信
async function serveImage(bucket, key, size, corsHeaders) {
  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response('Image not found', { status: 404, headers: corsHeaders });
    }

    const imageData = await object.arrayBuffer();
    
    // サイズ別の圧縮設定
    const sizeConfigs = {
      thumb: { width: 300, quality: 70 },
      medium: { width: 800, quality: 80 },
      large: { width: 1200, quality: 85 },
      original: null
    };

    const config = sizeConfigs[size];
    
    // オリジナルサイズの場合はそのまま返す
    if (!config) {
      return new Response(imageData, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000',
          ...corsHeaders
        }
      });
    }

    // 簡易圧縮（実際のプロダクションではCloudflare Images等を使用）
    // ここでは基本的な応答のみ実装
    return new Response(imageData, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Image serve error:', error);
    return new Response('Error serving image', { status: 500, headers: corsHeaders });
  }
}

// 無料枠使用量チェック機能（簡易版）
async function checkUsageLimits(env) {
  try {
    // R2使用量の概算チェックのみ（KV統計は無視）
    const objects = await env.PHOTOS.list({ limit: 100 });
    const estimatedStorageGB = (objects.objects.length * 700 * 1024) / (1024 * 1024 * 1024); // 700KB平均に更新

    console.log(`Current usage: ${objects.objects.length} photos, ~${estimatedStorageGB.toFixed(2)}GB`);

    // ストレージ容量のみチェック
    if (estimatedStorageGB >= FREE_TIER_LIMITS.STORAGE_GB) {
      return {
        allowed: false,
        message: `Storage limit reached (${FREE_TIER_LIMITS.STORAGE_GB}GB)`
      };
    }

    if (objects.objects.length >= FREE_TIER_LIMITS.MAX_PHOTOS) {
      return {
        allowed: false,
        message: `Photo count limit reached (${FREE_TIER_LIMITS.MAX_PHOTOS})`
      };
    }

    return { allowed: true };

  } catch (error) {
    console.error('Usage check error:', error);
    // エラー時は許可（制限を緩く）
    return { allowed: true };
  }
}