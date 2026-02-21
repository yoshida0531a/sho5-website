/**
 * process-photos.js
 * 圧縮（resize）とアップロード（upload）を一括で実行するオールインワンスクリプト
 *
 * 使用方法:
 *   node scripts/process-photos.js [元画像フォルダ] [圧縮済み出力フォルダ]
 *
 * 環境変数:
 *   SOURCE_FOLDER  - 元画像フォルダ（デフォルト: ~/Pictures/sho5org/original）
 *   OUTPUT_FOLDER  - 圧縮済み出力フォルダ（デフォルト: ~/Pictures/sho5org/resized）
 *   BUCKET_NAME    - R2バケット名（デフォルト: sho5-gallery-photos）
 *   CONCURRENCY    - 並列数（デフォルト: 5）
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import pLimit from 'p-limit';
import { getPhotoDateTime, formatDate, closeExiftool } from './utils/exif-utils.js';
import { resizeImageWithSips } from './utils/image-utils.js';
import { execSync } from 'child_process';

// 設定
const defaultSourceFolder = path.join(os.homedir(), 'Pictures', 'sho5org', 'original');
const defaultOutputFolder = path.join(os.homedir(), 'Pictures', 'sho5org', 'resized');

const CONFIG = {
  sourceFolder: process.argv[2] || process.env.SOURCE_FOLDER || defaultSourceFolder,
  outputFolder: process.argv[3] || process.env.OUTPUT_FOLDER || defaultOutputFolder,
  bucketName: process.env.BUCKET_NAME || 'sho5-gallery-photos',
  maxDimension: 2400,
  supportedFormats: ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'],
  concurrency: parseInt(process.env.CONCURRENCY || '5', 10),
  resizeProgressFile: process.env.RESIZE_PROGRESS_FILE || path.join(os.homedir(), 'Pictures', 'sho5org', 'resize-progress.json'),
  uploadProgressFile: process.env.UPLOAD_PROGRESS_FILE || path.join(os.homedir(), 'Pictures', 'sho5org', 'upload-progress.json'),
};

// 進捗管理
function loadProgress(file) {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveProgress(file, progress) {
  fs.writeFileSync(file, JSON.stringify(progress, null, 2), 'utf-8');
}

// macOSのスリープ防止（caffeinate）
function startCaffeinate() {
  if (os.platform() !== 'darwin') return null;
  const proc = spawn('caffeinate', ['-i'], { stdio: 'ignore', detached: true });
  proc.unref();
  console.log(`☕ caffeinate起動済み (PID: ${proc.pid}) - スリープを防止します\n`);
  return proc;
}

function stopCaffeinate(proc) {
  if (proc) {
    try { process.kill(proc.pid); } catch { /* process may have already exited */ }
  }
}

// 画像ファイルを再帰的に検索
function findImageFiles(folderPath, supportedFormats) {
  let imageFiles = [];
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        try { imageFiles.push(...findImageFiles(fullPath, supportedFormats)); } catch (err) { console.warn(`⚠️  スキップ: ${fullPath} (${err.message})`); }
      } else if (entry.isFile() && supportedFormats.includes(path.extname(entry.name))) {
        imageFiles.push(fullPath);
      }
    }
  } catch (err) { console.warn(`⚠️  ディレクトリ読み取りエラー: ${folderPath} (${err.message})`); }
  return imageFiles;
}

// --- ステージ1: 圧縮 ---
async function runResize(caffeinateProc) {
  console.log('\n========================================');
  console.log('📐 ステージ1: 圧縮（リサイズ）');
  console.log('========================================\n');

  if (!fs.existsSync(CONFIG.sourceFolder)) {
    console.error(`❌ 元画像フォルダが見つかりません: ${CONFIG.sourceFolder}`);
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG.outputFolder)) {
    fs.mkdirSync(CONFIG.outputFolder, { recursive: true });
  }

  if (os.platform() !== 'darwin') {
    console.error('❌ このスクリプトはmacOS専用です（sipsコマンドを使用）');
    process.exit(1);
  }

  const files = fs.readdirSync(CONFIG.sourceFolder)
    .filter(f => CONFIG.supportedFormats.includes(path.extname(f)))
    .map(f => path.join(CONFIG.sourceFolder, f));

  const progress = loadProgress(CONFIG.resizeProgressFile);
  const remaining = files.filter(f => progress[path.basename(f)] !== 'done');

  console.log(`📸 ${files.length}枚の画像（未処理: ${remaining.length}枚）\n`);

  if (remaining.length === 0) {
    console.log('✅ すべての圧縮が完了済みです\n');
    return;
  }

  const limit = pLimit(CONFIG.concurrency);
  let successful = 0, failed = 0, skipped = files.length - remaining.length;

  const tasks = files.map(filePath => limit(async () => {
    const fileName = path.basename(filePath);
    if (progress[fileName] === 'done') { return; }

    try {
      const dateTime = await getPhotoDateTime(filePath);
      const date = formatDate(dateTime, filePath);
      const dateFolderPath = path.join(CONFIG.outputFolder, date);
      if (!fs.existsSync(dateFolderPath)) {
        fs.mkdirSync(dateFolderPath, { recursive: true });
      }
      const outputPath = path.join(dateFolderPath, fileName);
      const result = await resizeImageWithSips(filePath, outputPath, CONFIG.maxDimension);
      if (!result.success) throw new Error(result.error);

      console.log(`✅ 圧縮完了: ${date}/${fileName} (${result.sizeMB.toFixed(2)}MB)`);
      successful++;
      progress[fileName] = 'done';
      saveProgress(CONFIG.resizeProgressFile, progress);
    } catch (error) {
      console.error(`❌ 圧縮エラー: ${fileName} - ${error.message}`);
      failed++;
    }
  }));

  await Promise.all(tasks);

  console.log(`\n📊 圧縮結果: ✅ 成功 ${successful}枚 / ⏭️ スキップ ${skipped}枚 / ❌ 失敗 ${failed}枚\n`);
}

// --- ステージ2: アップロード ---
async function runUpload() {
  console.log('\n========================================');
  console.log('📤 ステージ2: アップロード（Cloudflare R2）');
  console.log('========================================\n');

  const files = findImageFiles(CONFIG.outputFolder, CONFIG.supportedFormats);
  const progress = loadProgress(CONFIG.uploadProgressFile);
  const remaining = files.filter(f => progress[path.basename(f)] !== 'uploaded');

  console.log(`📸 ${files.length}枚の画像（未処理: ${remaining.length}枚）\n`);

  if (remaining.length === 0) {
    console.log('✅ すべてのアップロードが完了済みです\n');
    return;
  }

  const limit = pLimit(CONFIG.concurrency);
  let successful = 0, failed = 0, skipped = files.length - remaining.length;

  const tasks = files.map(filePath => limit(async () => {
    const fileName = path.basename(filePath);
    if (progress[fileName] === 'uploaded') { return; }

    try {
      const dateTime = await getPhotoDateTime(filePath);
      const date = formatDate(dateTime, filePath);
      const key = `${date}/${fileName}`;

      console.log(`📤 アップロード中: ${fileName} -> ${key}`);

      const command = [
        'wrangler', 'r2', 'object', 'put',
        `${CONFIG.bucketName}/${key}`,
        '--file', `"${filePath}"`,
        '--content-type', 'image/jpeg',
        '--remote'
      ];

      execSync(command.join(' '), { stdio: 'inherit' });

      console.log(`✅ アップロード完了: ${key}`);
      successful++;
      progress[fileName] = 'uploaded';
      saveProgress(CONFIG.uploadProgressFile, progress);
    } catch (error) {
      console.error(`❌ アップロードエラー: ${path.basename(filePath)} - ${error.message}`);
      failed++;
    }
  }));

  await Promise.all(tasks);

  console.log(`\n📊 アップロード結果: ✅ 成功 ${successful}枚 / ⏭️ スキップ ${skipped}枚 / ❌ 失敗 ${failed}枚\n`);
}

// --- メイン ---
async function main() {
  console.log('🚀 Photo Process Tool for Mac（圧縮 → アップロード 一括処理）');
  console.log('================================================================');
  console.log(`📁 元画像フォルダ: ${CONFIG.sourceFolder}`);
  console.log(`📁 圧縮後フォルダ: ${CONFIG.outputFolder}`);
  console.log(`🪣 R2バケット: ${CONFIG.bucketName}`);
  console.log(`⚡ 並列数: ${CONFIG.concurrency}`);
  console.log(`📋 圧縮進捗ファイル: ${CONFIG.resizeProgressFile}`);
  console.log(`📋 アップロード進捗ファイル: ${CONFIG.uploadProgressFile}`);
  console.log('================================================================\n');

  const caffeinateProc = startCaffeinate();

  try {
    await runResize(caffeinateProc);
    await runUpload();
  } finally {
    stopCaffeinate(caffeinateProc);
    await closeExiftool();
  }

  console.log('🎉 すべての処理が完了しました！');
}

process.on('unhandledRejection', async (error) => {
  console.error('❌ 予期しないエラー:', error);
  await closeExiftool();
  process.exit(1);
});

main().catch(async (error) => {
  console.error('❌ エラー:', error);
  await closeExiftool();
  process.exit(1);
});
