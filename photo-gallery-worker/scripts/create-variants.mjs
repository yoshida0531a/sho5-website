// Usage: node create-variants.mjs /path/to/photos /path/to/output
// Input: YYYY-MM-DD/filename.JPG. Output can be uploaded as _variants/... in R2.
// Requires cwebp (brew install webp). Generates files locally; never uploads.
import { readdir, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const [input, output] = process.argv.slice(2).map(path => resolve(path));
if (!input || !output || input === output || output.startsWith(input + '/')) {
  throw new Error('Supply separate input and output directories');
}
if (spawnSync('cwebp', ['-version']).status !== 0) throw new Error('Install cwebp first');
let count = 0;
for (const day of await readdir(input, { withFileTypes: true })) {
  if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
  for (const file of await readdir(join(input, day.name), { withFileTypes: true })) {
    if (!file.isFile() || !/\.(jpe?g|png)$/i.test(file.name)) continue;
    for (const [size, width, quality] of [['thumb', 320, 72], ['medium', 800, 78], ['large', 1600, 82]]) {
      const destination = join(output, '_variants', size, day.name);
      await mkdir(destination, { recursive: true });
      const result = spawnSync('cwebp', ['-quiet', '-mt', '-q', String(quality), '-resize', String(width), '0',
        join(input, day.name, file.name), '-o', join(destination, `${file.name}.webp`)], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`Conversion failed: ${day.name}/${file.name}`);
    }
    count++;
  }
}
console.log(`Created three display sizes for ${count} photos in ${output}`);
