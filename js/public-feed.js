const MESSAGES = {
  x: {
    not_generated: '公開用の投稿はまだ作られていません。',
    empty: 'いま公開できる投稿はありません。',
    missing: '公開用の投稿ファイルが見つかりませんでした。',
    corrupt: '公開用の投稿データが壊れています。',
    network: '通信できないため、公開用の投稿を読み込めませんでした。',
    server: 'サーバーのエラーのため、公開用の投稿を読み込めませんでした。',
  },
  youtube: {
    not_generated: '公開用の動画はまだ作られていません。',
    empty: 'いま公開できる動画はありません。',
    missing: '公開用の動画ファイルが見つかりませんでした。',
    corrupt: '公開用の動画データが壊れています。',
    network: '通信できないため、公開用の動画を読み込めませんでした。',
    server: 'サーバーのエラーのため、公開用の動画を読み込めませんでした。',
  },
};

export function messageFor(feed, situation) {
  return MESSAGES[feed]?.[situation] || MESSAGES[feed]?.server || '';
}

function serverStatus(status) {
  return status === 408 || status === 429 || status >= 500 || status < 200 || status >= 300;
}

export function classifyPublicBody(status, bodyText) {
  if (status === 404) return { kind: 'absent' };
  if (serverStatus(status)) return { kind: 'server' };
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { kind: 'corrupt' };
  }
  if (!Array.isArray(data)) return { kind: 'corrupt' };
  if (data.length === 0) return { kind: 'empty' };
  return { kind: 'ready', items: data };
}

export function classifyStatusDocument(status, bodyText) {
  if (status === 404) return { kind: 'absent' };
  if (serverStatus(status)) return { kind: 'server' };
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { kind: 'corrupt' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'corrupt' };
  return { kind: 'ready', status: data };
}

export function situationFromAbsent(statusResult, feedKey) {
  if (!statusResult || statusResult.kind === 'absent') return 'not_generated';
  if (statusResult.kind === 'network') return 'network';
  if (statusResult.kind === 'server') return 'server';
  if (statusResult.kind !== 'ready') return 'corrupt';
  const entry = statusResult.status?.[feedKey];
  if (!entry) return 'not_generated';
  if (entry.state === 'not_generated') return 'not_generated';
  if (entry.state === 'published') return 'missing';
  return 'corrupt';
}

function outcome(feed, kind) {
  return { kind, items: [], message: messageFor(feed, kind) };
}

export async function loadPublicFeed(fetchImpl, publicUrl, statusUrl, feed) {
  let response;
  try {
    response = await fetchImpl(publicUrl);
  } catch {
    return outcome(feed, 'network');
  }
  let bodyText = '';
  if (response.status !== 404 && !serverStatus(response.status)) {
    try {
      bodyText = await response.text();
    } catch {
      return outcome(feed, 'network');
    }
  }
  const classified = classifyPublicBody(response.status, bodyText);
  if (classified.kind === 'ready') {
    return { kind: 'ready', items: classified.items, message: '' };
  }
  if (classified.kind !== 'absent') return outcome(feed, classified.kind);

  let statusResponse;
  try {
    statusResponse = await fetchImpl(statusUrl);
  } catch {
    return outcome(feed, 'network');
  }
  let statusText = '';
  if (statusResponse.status !== 404 && !serverStatus(statusResponse.status)) {
    try {
      statusText = await statusResponse.text();
    } catch {
      return outcome(feed, 'network');
    }
  }
  const statusResult = classifyStatusDocument(statusResponse.status, statusText);
  return outcome(feed, situationFromAbsent(statusResult, feed));
}
