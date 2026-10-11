import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = dirname(fileURLToPath(import.meta.url));
const API_HOST = 'https://sho5-meter.chjqnfv62h.workers.dev/**';
const CHROME_CANDIDATES = [
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
];

function chromePath() {
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) || '';
}

function meterPayload(allTime, extra = {}) {
  return {
    date: '2026-10-11',
    month: '2026-10',
    todayTapCount: allTime,
    monthTapCount: allTime,
    allTimeTapCount: allTime,
    monthlyGoal: 300,
    progressPercent: 0,
    updatedAt: '2026-10-11T00:00:00.000Z',
    history: allTime > 0 ? [{ month: '2026-10', tapCount: allTime }] : [],
    cacheSeconds: 0,
    ...extra,
  };
}

function startSite() {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname);
    const filePath = normalize(join(ROOT, relative));
    if (!filePath.startsWith(ROOT) || request.method !== 'GET') {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = readFileSync(filePath);
      const type = filePath.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : filePath.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'text/html; charset=utf-8';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function installApi(context, state) {
  await context.route(API_HOST, async (route) => {
    const request = route.request();
    assert.equal(request.url().startsWith('https://sho5-meter.chjqnfv62h.workers.dev/'), true);
    const origin = request.headers().origin || 'http://127.0.0.1';
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Sho5-Tap-Id',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(meterPayload(state.allTime)),
      });
      return;
    }
    const tapId = request.headers()['x-sho5-tap-id'] || '';
    state.posts.push(tapId);
    if (state.mode === 'invalid') {
      state.mode = 'ok';
      await route.fulfill({
        status: 400,
        headers,
        body: JSON.stringify({ ok: false, accepted: false, error: 'tap request id is invalid' }),
      });
      return;
    }
    const known = state.ids.has(tapId);
    if (!known) {
      state.allTime += 1;
      state.ids.add(tapId);
    }
    if (state.dropNext) {
      state.dropNext = false;
      await route.abort('failed');
      return;
    }
    if (state.hold) {
      await state.hold;
    }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(meterPayload(state.allTime, {
        accepted: true,
        message: known ? 'このタップは保存済みです' : '今月の応援タップを追加しました',
      })),
    });
  });
}

function newState() {
  return { allTime: 0, ids: new Set(), posts: [], dropNext: false, mode: 'ok', hold: null };
}

async function openPage(context, origin) {
  const page = await context.newPage();
  await page.goto(`${origin}/sho5-meter.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const button = document.querySelector('#tap-button');
    const status = document.querySelector('#status-text');
    return button && status && !button.disabled && status.textContent !== '読み込み中…' && status.textContent !== '未確認のタップを確認しています。';
  });
  return page;
}

describe('sho5-meter browser tabs', { timeout: 60_000 }, () => {
  it('counts two tabs separately, retries one tap, and isolates a duplicated session', async () => {
    const executablePath = chromePath();
    assert.equal(executablePath.length > 0, true, 'system Chrome was not found');
    const site = await startSite();
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const twoTabs = await browser.newContext();
      const twoState = newState();
      await installApi(twoTabs, twoState);
      const left = await openPage(twoTabs, site.origin);
      const right = await openPage(twoTabs, site.origin);
      await left.click('#tap-button');
      await right.click('#tap-button');
      const savedStatus = () => {
        const status = document.querySelector('#status-text').textContent;
        return status.includes('追加しました') || status.includes('保存済み');
      };
      await left.waitForFunction(savedStatus);
      await right.waitForFunction(savedStatus);
      assert.equal(twoState.allTime, 2);
      assert.equal(new Set(twoState.posts).size, 2);
      await twoTabs.close();

      const lost = await browser.newContext();
      const lostState = newState();
      lostState.dropNext = true;
      await installApi(lost, lostState);
      const page = await openPage(lost, site.origin);
      await page.click('#tap-button');
      await page.waitForFunction(() => document.querySelector('#status-text').textContent.includes('通信結果を確認できません'));
      const unknownText = await page.locator('#status-text').innerText();
      assert.equal(unknownText.includes('増えていません'), false);
      assert.equal(await page.locator('#all-time-count').innerText(), '0');
      assert.equal(lostState.allTime, 1);
      const savedId = lostState.posts[0];
      const copiedSession = await page.evaluate(() => ({ ...sessionStorage }));
      assert.equal(copiedSession['sho5-meter-pending-tap'], savedId);

      const duplicate = await lost.newPage();
      await duplicate.addInitScript((entries) => {
        for (const [key, value] of Object.entries(entries)) sessionStorage.setItem(key, value);
      }, copiedSession);
      await duplicate.goto(`${site.origin}/sho5-meter.html`, { waitUntil: 'domcontentloaded' });
      await duplicate.waitForFunction(() => {
        const button = document.querySelector('#tap-button');
        const status = document.querySelector('#status-text');
        return button && status && !button.disabled
          && status.textContent !== '読み込み中…'
          && status.textContent !== '未確認のタップを確認しています。';
      });
      assert.deepEqual(lostState.posts, [savedId]);
      await duplicate.click('#tap-button');
      await duplicate.waitForFunction(() => document.querySelector('#all-time-count').textContent === '2');
      assert.equal(lostState.posts[1] === savedId, false);
      await page.click('#tap-button');
      await page.waitForFunction(() => document.querySelector('#all-time-count').textContent === '2');
      assert.equal(lostState.posts.filter((id) => id === savedId).length, 2);
      assert.equal(lostState.allTime, 2);
      assert.equal((await page.locator('#status-text').innerText()).includes('保存済み'), true);
      await lost.close();

      const restarted = await browser.newContext();
      const restartState = newState();
      restartState.dropNext = true;
      await installApi(restarted, restartState);
      const original = await openPage(restarted, site.origin);
      await original.click('#tap-button');
      await original.waitForFunction(() => document.querySelector('#status-text').textContent.includes('通信結果を確認できません'));
      const orphanId = restartState.posts[0];
      await original.close();
      const revived = await openPage(restarted, site.origin);
      assert.equal(restartState.posts[1], orphanId);
      assert.equal(restartState.allTime, 1);
      assert.equal(await revived.locator('#all-time-count').innerText(), '1');
      await revived.click('#tap-button');
      await revived.waitForFunction(() => document.querySelector('#all-time-count').textContent === '2');
      assert.notEqual(restartState.posts[2], orphanId);
      assert.equal(restartState.allTime, 2);
      await restarted.close();

      const burst = await browser.newContext();
      const burstState = newState();
      let releaseHold;
      burstState.hold = new Promise((resolve) => {
        releaseHold = resolve;
      });
      await installApi(burst, burstState);
      const burstPage = await openPage(burst, site.origin);
      await burstPage.evaluate(() => {
        const button = document.querySelector('#tap-button');
        button.click();
        button.disabled = false;
        button.click();
      });
      const burstDeadline = Date.now() + 5000;
      while (burstState.posts.length < 1 && Date.now() < burstDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(burstState.posts.length, 1);
      releaseHold();
      await burstPage.waitForFunction(() => document.querySelector('#all-time-count').textContent === '1');
      assert.equal(burstState.allTime, 1);
      await burst.close();

      const rejected = await browser.newContext();
      const rejectedState = newState();
      rejectedState.mode = 'invalid';
      await installApi(rejected, rejectedState);
      const rejectedPage = await openPage(rejected, site.origin);
      await rejectedPage.click('#tap-button');
      await rejectedPage.waitForFunction(() => document.querySelector('#status-text').textContent.includes('保存されていません'));
      const rejectedText = await rejectedPage.locator('#status-text').innerText();
      assert.equal(rejectedText.includes('確認できません'), false);
      assert.equal(rejectedText.includes('増えていません'), false);
      assert.equal(rejectedState.allTime, 0);
      await rejectedPage.click('#tap-button');
      await rejectedPage.waitForFunction(() => document.querySelector('#all-time-count').textContent === '1');
      assert.notEqual(rejectedState.posts[0], rejectedState.posts[1]);
      assert.equal(rejectedState.allTime, 1);
      await rejected.close();
    } finally {
      await browser.close();
      await new Promise((resolve) => site.server.close(resolve));
    }
  });
});
