const TAB_KEY = 'sho5-meter-tab-id';
const PENDING_KEY = 'sho5-meter-pending-tap';
const ORPHAN_KEY = 'sho5-meter-orphans-v2';
const ORPHAN_LOCK = 'sho5-meter-orphan-replay';
const TAP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const METER_STATUS = {
  unknown: '通信結果を確認できません。保存できたかどうかは未確認です。同じタップとして再送します。表示している数は、最後に確認できた保存済みの値です。',
  confirming: '未確認のタップを確認しています。',
  rejected: '送信は受け付けられませんでした。このタップは保存されていません。',
};

export function isTapId(value) {
  return TAP_ID_PATTERN.test(value || '');
}

export function isSavedMeter(data) {
  return Boolean(data)
    && Number.isInteger(data.todayTapCount)
    && Number.isInteger(data.monthTapCount)
    && Number.isInteger(data.allTimeTapCount);
}

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    },
  };
}

function bindStorage(storage) {
  const memory = new Map();
  let failed = !storage;
  return {
    get(key) {
      if (failed) return memory.has(key) ? memory.get(key) : null;
      try {
        const value = storage.getItem(key);
        return value == null ? null : String(value);
      } catch {
        failed = true;
        return memory.has(key) ? memory.get(key) : null;
      }
    },
    set(key, value) {
      const text = String(value);
      if (failed) {
        memory.set(key, text);
        return;
      }
      try {
        storage.setItem(key, text);
      } catch {
        failed = true;
        memory.set(key, text);
      }
    },
    remove(key) {
      memory.delete(key);
      if (failed) return;
      try {
        storage.removeItem(key);
      } catch {
        failed = true;
      }
    },
  };
}

export function createMemoryLocks() {
  const held = new Set();
  const waiters = new Map();

  function wake(name) {
    const queue = waiters.get(name);
    if (!queue || queue.length === 0) {
      waiters.delete(name);
      held.delete(name);
      return;
    }
    const next = queue.shift();
    if (queue.length === 0) waiters.delete(name);
    grant(name, next);
  }

  function grant(name, job) {
    held.add(name);
    let result;
    try {
      result = job.callback({});
    } catch (error) {
      wake(name);
      job.reject(error);
      return;
    }
    Promise.resolve(result).then(() => {
      wake(name);
      job.resolve(result);
    }, (error) => {
      wake(name);
      job.reject(error);
    });
  }

  return {
    request(name, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      const ifAvailable = Boolean(options && options.ifAvailable);
      return new Promise((resolve, reject) => {
        if (held.has(name)) {
          if (ifAvailable) {
            Promise.resolve().then(() => callback(null)).then(resolve, reject);
            return;
          }
          const queue = waiters.get(name) || [];
          queue.push({ callback, resolve, reject });
          waiters.set(name, queue);
          return;
        }
        grant(name, { callback, resolve, reject });
      });
    },
  };
}

function tabLockName(tabId) {
  return `sho5-meter-tab:${tabId}`;
}

export function createTapCoordinator(options = {}) {
  const locks = options.locks && typeof options.locks.request === 'function' ? options.locks : null;
  const randomUUID = options.randomUUID || (() => crypto.randomUUID());
  const now = options.now || (() => Date.now());
  const session = bindStorage(options.session);
  const local = bindStorage(options.local);
  let tabId = '';
  let pending = '';
  let queue = [];
  let releaseHold = () => {};
  let holdSettled = Promise.resolve();
  let opened = false;

  function hold(name) {
    return new Promise((resolve) => {
      let settleRelease = () => {};
      const released = new Promise((resolveRelease) => {
        settleRelease = resolveRelease;
      });
      holdSettled = locks.request(name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return released;
      }).catch(() => {
        resolve(false);
      });
      releaseHold = () => {
        releaseHold = () => {};
        settleRelease();
      };
    });
  }

  async function tabAlive(id) {
    let available = false;
    await locks.request(tabLockName(id), { ifAvailable: true }, (lock) => {
      available = lock !== null;
    });
    return !available;
  }

  function readOrphans() {
    const raw = local.get(ORPHAN_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      return {};
    }
  }

  function writeOrphans(map) {
    local.set(ORPHAN_KEY, JSON.stringify(map));
  }

  async function syncOrphans() {
    await locks.request(ORPHAN_LOCK, async () => {
      const map = readOrphans();
      const legacy = local.get(PENDING_KEY);
      if (isTapId(legacy) && !map[legacy]) {
        map[legacy] = { tabId: '', createdAt: now() };
      }
      if (legacy != null) local.remove(PENDING_KEY);

      if (isTapId(pending)) {
        const current = map[pending];
        const ownedByOther = current
          && current.tabId
          && current.tabId !== tabId
          && await tabAlive(current.tabId);
        if (!ownedByOther) {
          map[pending] = {
            tabId,
            createdAt: current && current.createdAt ? current.createdAt : now(),
          };
        }
      }

      const claimed = [];
      for (const requestId of Object.keys(map)) {
        const record = map[requestId];
        if (!isTapId(requestId) || !record || typeof record !== 'object') {
          delete map[requestId];
          continue;
        }
        if (record.tabId === tabId) {
          claimed.push(requestId);
          continue;
        }
        if (record.tabId && await tabAlive(record.tabId)) continue;
        record.tabId = tabId;
        claimed.push(requestId);
      }
      claimed.sort((left, right) => {
        const delta = Number(map[left].createdAt || 0) - Number(map[right].createdAt || 0);
        if (delta !== 0) return delta;
        return left < right ? -1 : 1;
      });
      writeOrphans(map);
      queue = claimed.filter((id) => id !== pending);
    });
  }

  async function forget(id) {
    if (pending === id) pending = '';
    queue = queue.filter((item) => item !== id);
    if (!locks) return;
    if (session.get(PENDING_KEY) === id) session.remove(PENDING_KEY);
    await locks.request(ORPHAN_LOCK, async () => {
      const map = readOrphans();
      delete map[id];
      writeOrphans(map);
    });
  }

  return {
    async open() {
      if (opened) return;
      opened = true;
      if (!locks) {
        tabId = randomUUID();
        pending = '';
        queue = [];
        return;
      }

      const existingTab = session.get(TAB_KEY);
      const existingPending = session.get(PENDING_KEY);
      const tabKnown = isTapId(existingTab);
      const pendingKnown = isTapId(existingPending);
      if (tabKnown && await hold(tabLockName(existingTab))) {
        tabId = existingTab;
        pending = pendingKnown ? existingPending : '';
      } else if (tabKnown) {
        session.remove(PENDING_KEY);
        tabId = randomUUID();
        pending = '';
        if (!await hold(tabLockName(tabId))) return;
      } else {
        tabId = randomUUID();
        pending = pendingKnown ? existingPending : '';
        if (!await hold(tabLockName(tabId))) return;
      }
      session.set(TAB_KEY, tabId);
      if (pending) session.set(PENDING_KEY, pending);
      else session.remove(PENDING_KEY);
      await syncOrphans();
    },

    hasRetry() {
      return isTapId(pending) || queue.length > 0;
    },

    async beginTap() {
      if (!opened) await this.open();
      if (isTapId(pending)) return pending;
      if (queue.length > 0) {
        pending = queue[0];
        if (locks) session.set(PENDING_KEY, pending);
        return pending;
      }
      pending = randomUUID();
      if (locks) {
        session.set(PENDING_KEY, pending);
        await syncOrphans();
      }
      return pending;
    },

    async finishTap(id) {
      await forget(id);
    },

    async discardTap(id) {
      await forget(id);
    },

    async close() {
      releaseHold();
      await holdSettled;
    },
  };
}
