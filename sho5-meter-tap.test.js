import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  createMemoryLocks,
  createMemoryStorage,
  createTapCoordinator,
  isTapId,
} from './sho5-meter-tap.js';

const TAB_KEY = 'sho5-meter-tab-id';
const PENDING_KEY = 'sho5-meter-pending-tap';

function uuidSource(start) {
  let number = start;
  return () => {
    number += 1;
    return `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
  };
}

function coordinator({ session, local, locks, randomUUID, now }) {
  return createTapCoordinator({
    session,
    local,
    locks,
    randomUUID,
    now: now || (() => 1_700_000_000_000),
  });
}

describe('tap coordinator', () => {
  it('gives two tabs different ids and reuses one id until that tap is finished', async () => {
    const local = createMemoryStorage();
    const locks = createMemoryLocks();
    const first = coordinator({
      session: createMemoryStorage(),
      local,
      locks,
      randomUUID: uuidSource(0),
    });
    const second = coordinator({
      session: createMemoryStorage(),
      local,
      locks,
      randomUUID: uuidSource(100),
    });
    await Promise.all([first.open(), second.open()]);
    const firstId = await first.beginTap();
    assert.equal(await first.beginTap(), firstId);
    const secondId = await second.beginTap();
    assert.notEqual(firstId, secondId);
    assert.equal(isTapId(firstId), true);
    assert.equal(isTapId(secondId), true);
    await first.finishTap(firstId);
    const nextId = await first.beginTap();
    assert.notEqual(nextId, firstId);
    assert.notEqual(nextId, secondId);
  });

  it('treats a copied session as a new tab while the original lock is held', async () => {
    const local = createMemoryStorage();
    const locks = createMemoryLocks();
    const originalSession = createMemoryStorage();
    const original = coordinator({
      session: originalSession,
      local,
      locks,
      randomUUID: uuidSource(10),
    });
    await original.open();
    const originalId = await original.beginTap();

    const copied = createMemoryStorage(originalSession.dump());
    const duplicate = coordinator({
      session: copied,
      local,
      locks,
      randomUUID: uuidSource(20),
    });
    await duplicate.open();
    assert.equal(duplicate.hasRetry(), false);
    const duplicateId = await duplicate.beginTap();
    assert.notEqual(duplicateId, originalId);
    assert.equal(originalSession.dump()[PENDING_KEY], originalId);
    assert.equal(await original.beginTap(), originalId);
    assert.equal(JSON.parse(local.dump()['sho5-meter-orphans-v2'])[originalId].tabId.length > 0, true);
  });

  it('reuses the pending id after a reload and replays it once after restart', async () => {
    const local = createMemoryStorage();
    const locks = createMemoryLocks();
    const session = createMemoryStorage();
    const original = coordinator({
      session,
      local,
      locks,
      randomUUID: uuidSource(30),
    });
    await original.open();
    const id = await original.beginTap();
    await original.close();

    const reloaded = coordinator({
      session,
      local,
      locks,
      randomUUID: () => {
        throw new Error('reload must not mint a new id');
      },
    });
    await reloaded.open();
    assert.equal(await reloaded.beginTap(), id);
    await reloaded.close();

    const restarted = coordinator({
      session: createMemoryStorage(),
      local,
      locks,
      randomUUID: uuidSource(40),
    });
    await restarted.open();
    assert.equal(restarted.hasRetry(), true);
    assert.equal(await restarted.beginTap(), id);
    await restarted.finishTap(id);
    const fresh = coordinator({
      session: createMemoryStorage(),
      local,
      locks,
      randomUUID: uuidSource(50),
    });
    await fresh.open();
    assert.equal(fresh.hasRetry(), false);
    assert.notEqual(await fresh.beginTap(), id);
  });

  it('lets only one tab adopt a shared orphan or the legacy localStorage id', async () => {
    const legacyId = '00000000-0000-4000-8000-0000000000aa';
    const local = createMemoryStorage({ [PENDING_KEY]: legacyId });
    const locks = createMemoryLocks();
    const first = coordinator({
      session: createMemoryStorage(),
      local,
      locks,
      randomUUID: uuidSource(60),
    });
    const second = coordinator({
      session: createMemoryStorage(),
      local,
      locks,
      randomUUID: uuidSource(70),
    });
    await Promise.all([first.open(), second.open()]);
    const holders = [first, second].filter((item) => item.hasRetry());
    assert.equal(holders.length, 1);
    assert.equal(await holders[0].beginTap(), legacyId);
    assert.equal(local.dump()[PENDING_KEY], undefined);
    const other = first === holders[0] ? second : first;
    assert.notEqual(await other.beginTap(), legacyId);
  });

  it('does not share a pending id when storage throws or locks are unavailable', async () => {
    const copiedId = '00000000-0000-4000-8000-0000000000bb';
    const copiedTab = '00000000-0000-4000-8000-0000000000cc';
    const sharedSession = createMemoryStorage({
      [TAB_KEY]: copiedTab,
      [PENDING_KEY]: copiedId,
    });
    const withoutLocks = [
      coordinator({
        session: sharedSession,
        local: createMemoryStorage(),
        locks: null,
        randomUUID: uuidSource(80),
      }),
      coordinator({
        session: sharedSession,
        local: createMemoryStorage(),
        locks: null,
        randomUUID: uuidSource(90),
      }),
    ];
    await Promise.all(withoutLocks.map((item) => item.open()));
    const firstId = await withoutLocks[0].beginTap();
    const secondId = await withoutLocks[1].beginTap();
    assert.notEqual(firstId, secondId);
    assert.notEqual(firstId, copiedId);
    assert.notEqual(secondId, copiedId);
    assert.equal(sharedSession.dump()[PENDING_KEY], copiedId);

    const throwing = {
      getItem() {
        throw new Error('storage denied');
      },
      setItem() {
        throw new Error('storage denied');
      },
      removeItem() {
        throw new Error('storage denied');
      },
    };
    const isolated = coordinator({
      session: throwing,
      local: throwing,
      locks: createMemoryLocks(),
      randomUUID: uuidSource(110),
    });
    await isolated.open();
    const isolatedId = await isolated.beginTap();
    assert.notEqual(isolatedId, copiedId);
    const otherIsolated = coordinator({
      session: throwing,
      local: throwing,
      locks: createMemoryLocks(),
      randomUUID: uuidSource(120),
    });
    await otherIsolated.open();
    assert.notEqual(await otherIsolated.beginTap(), isolatedId);
  });

  it('keeps the unknown-result copy and does not say the count stayed unchanged', () => {
    const html = readFileSync(new URL('./sho5-meter.html', import.meta.url), 'utf8');
    const script = readFileSync(new URL('./sho5-meter-tap.js', import.meta.url), 'utf8');
    assert.equal(html.includes('カウントは増えていません'), false);
    assert.equal(script.includes('カウントは増えていません'), false);
    assert.match(html, /type="module"/);
    assert.match(html, /sho5-meter-tap\.js/);
    assert.match(script, /通信結果を確認できません/);
    assert.match(script, /同じタップとして再送します/);
    assert.doesNotMatch(html, /localStorage\.setItem\('sho5-meter-pending-tap'/);
  });
});
