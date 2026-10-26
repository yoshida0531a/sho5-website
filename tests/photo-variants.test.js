import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hasTools = ['cwebp', 'magick'].every(command => spawnSync(command, ['-version']).status === 0);
test('display variants preserve EXIF portrait orientation and leave the source unchanged', { skip: !hasTools }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'sho5-variant-test-'));
  try {
    const input = join(temporary, 'input');
    const output = join(temporary, 'output');
    await mkdir(join(input, '2026-02-23'), { recursive: true });
    const source = join(input, '2026-02-23', 'portrait.JPG');
    await copyFile(new URL('./fixtures/oriented-photo.jpg', import.meta.url), source);
    const before = await readFile(source);
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('../photo-gallery-worker/scripts/create-variants.mjs', import.meta.url)), input, output,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (const [size, dimensions] of [['thumb', '320 480'], ['medium', '800 1200'], ['large', '1600 2400']]) {
      const image = join(output, '_variants', size, '2026-02-23', 'portrait.JPG.webp');
      const identify = spawnSync('magick', ['identify', '-format', '%w %h', image], { encoding: 'utf8' });
      assert.equal(identify.status, 0, identify.stderr);
      assert.equal(identify.stdout, dimensions);
    }
    assert.deepEqual(await readFile(source), before);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
