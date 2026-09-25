var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var FREE_TIER_LIMITS = {
  STORAGE_GB: 9.8,
  // 10GBの98%まで使用可能
  MONTHLY_REQUESTS: 5e4,
  // リクエスト制限を緩和（月中旬なのでリセット）
  MAX_PHOTOS: 25e3
  // より多くの写真を許可
};
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const usageCheck = await checkUsageLimits(env);
    if (!usageCheck.allowed) {
      return new Response(JSON.stringify({
        error: "Usage limit exceeded",
        message: usageCheck.message,
        limit: "FREE_TIER_PROTECTION"
      }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (path === "/api/photos") {
        const photos = await listPhotos(env.PHOTOS, url.searchParams);
        return new Response(JSON.stringify(photos), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      if (path.startsWith("/images/")) {
        const key = path.replace("/images/", "");
        const size = url.searchParams.get("size") || "medium";
        return await serveImage(env.PHOTOS, key, size, corsHeaders);
      }
      return new Response("Photo Gallery Worker", { headers: corsHeaders });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  }
};
async function listPhotos(bucket, searchParams) {
  const date = searchParams.get("date");
  const limit = parseInt(searchParams.get("limit") || "300");
  const objects = await bucket.list({
    limit: 1e3,
    // R2の最大値
    prefix: date ? `${date}/` : ""
  });
  const photos = objects.objects.filter((obj) => obj.key.toLowerCase().match(/\.(jpg|jpeg|png)$/)).map((obj) => {
    const [datePart, filename] = obj.key.split("/");
    const dateTime = obj.customMetadata?.dateTime || datePart + " 12:00:00";
    return {
      key: obj.key,
      filename: filename || obj.key,
      dateTime,
      size: obj.size,
      url: `/images/${obj.key}`
    };
  }).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)).slice(0, limit);
  return {
    photos,
    total: photos.length,
    hasMore: objects.objects.length > limit
  };
}
__name(listPhotos, "listPhotos");
async function serveImage(bucket, key, size, corsHeaders) {
  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response("Image not found", { status: 404, headers: corsHeaders });
    }
    const imageData = await object.arrayBuffer();
    const sizeConfigs = {
      thumb: { width: 300, quality: 70 },
      medium: { width: 800, quality: 80 },
      large: { width: 1200, quality: 85 },
      original: null
    };
    const config = sizeConfigs[size];
    if (!config) {
      return new Response(imageData, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=31536000",
          ...corsHeaders
        }
      });
    }
    return new Response(imageData, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Image serve error:", error);
    return new Response("Error serving image", { status: 500, headers: corsHeaders });
  }
}
__name(serveImage, "serveImage");
async function checkUsageLimits(env) {
  try {
    const objects = await env.PHOTOS.list({ limit: 100 });
    const estimatedStorageGB = objects.objects.length * 700 * 1024 / (1024 * 1024 * 1024);
    console.log(`Current usage: ${objects.objects.length} photos, ~${estimatedStorageGB.toFixed(2)}GB`);
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
    console.error("Usage check error:", error);
    return { allowed: true };
  }
}
__name(checkUsageLimits, "checkUsageLimits");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
