import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import pLimit from 'p-limit';
import { getPhotoDateTime, formatDate, closeExiftool } from './utils/exif-utils.js';

// 写真アップロードスクリプト
// 前提: resize-photos.js で圧縮済みの画像フォルダを受け取り、Cloudflare R2 にアップロードする

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const BUCKET_NAME = process.env.BUCKET_NAME || 'sho5-gallery-photos';
const defaultProgressFile = path.join(os.homedir(), 'Pictures', 'shogo写真データ', 'upload-progress.json');
const PROGRESS_FILE = process.env.PROGRESS_FILE || defaultProgressFile;

// 進捗管理
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
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

class PhotoUploader {
  constructor(bucketName = BUCKET_NAME) {
    this.bucketName = bucketName;
    this.imageExtensionPattern = /\.(jpg|jpeg|png)$/i;
  }

  // 単一ファイルをアップロード（圧縮済みファイルをそのままアップロード）
  async uploadFile(filePath, progress) {
    const fileName = path.basename(filePath);

    // 既に完了済みならスキップ
    if (progress[fileName] === 'uploaded') {
      console.log(`⏭️  スキップ（完了済み）: ${fileName}`);
      return { success: true, skipped: true };
    }

    try {
      const dateTime = await getPhotoDateTime(filePath);
      const date = formatDate(dateTime, filePath);
      const key = `${date}/${fileName}`;

      console.log(`📤 アップロード中: ${fileName} -> ${key}`);

      // wrangler r2 object put コマンドでアップロード
      const command = [
        'wrangler', 'r2', 'object', 'put',
        `${this.bucketName}/${key}`,
        '--file', `"${filePath}"`,
        '--content-type', 'image/jpeg',
        '--remote'
      ];

      execSync(command.join(' '), { stdio: 'inherit' });

      console.log(`✅ アップロード完了: ${key}`);

      return { success: true, key };
    } catch (error) {
      console.error(`❌ アップロードエラー: ${fileName} - ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // フォルダ内の画像ファイルを再帰的に検索
  findImageFiles(folderPath) {
    let imageFiles = [];

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          try {
            imageFiles.push(...this.findImageFiles(fullPath));
          } catch (error) {
            console.warn(`⚠️  スキップ: ${fullPath} (${error.message})`);
          }
        } else if (entry.isFile() && this.imageExtensionPattern.test(entry.name)) {
          imageFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  ディレクトリ読み取りエラー: ${folderPath} (${error.message})`);
    }

    return imageFiles;
  }

  // フォルダ内の全写真をアップロード
  async uploadFolder(folderPath) {
    console.log(`📁 フォルダをスキャン中: ${folderPath}`);

    if (!fs.existsSync(folderPath)) {
      console.error(`❌ フォルダが見つかりません: ${folderPath}`);
      return;
    }

    const files = this.findImageFiles(folderPath);
    const progress = loadProgress();
    const alreadyDone = Object.values(progress).filter(v => v === 'uploaded').length;
    const remaining = files.filter(f => progress[path.basename(f)] !== 'uploaded').length;

    console.log(`📸 ${files.length}枚の画像を発見（完了済み: ${alreadyDone}枚 / 未処理: ${remaining}枚）`);
    console.log(`⚡ 並列数: ${CONCURRENCY}`);
    console.log(`📋 進捗ファイル: ${PROGRESS_FILE}\n`);

    if (remaining === 0) {
      console.log('✅ すべてのファイルがアップロード済みです\n');
      await closeExiftool();
      return;
    }

    // caffeinate でスリープ防止
    const caffeinateProc = startCaffeinate();

    const limit = pLimit(CONCURRENCY);
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    const tasks = files.map(filePath => limit(async () => {
      const fileName = path.basename(filePath);
      const result = await this.uploadFile(filePath, progress);

      if (result.skipped) {
        skipped++;
      } else if (result.success) {
        successful++;
        progress[fileName] = 'uploaded';
        saveProgress(progress);
      } else {
        failed++;
      }
    }));

    await Promise.all(tasks);

    stopCaffeinate(caffeinateProc);

    console.log(`\n📊 アップロード結果:`);
    console.log(`✅ 成功: ${successful}枚`);
    console.log(`⏭️  スキップ（完了済み）: ${skipped}枚`);
    console.log(`❌ 失敗: ${failed}枚`);

    await closeExiftool();
  }
}

// 使用例
const uploader = new PhotoUploader();

// コマンドライン引数からフォルダパスを取得
const folderPath = process.argv[2];
if (!folderPath) {
  console.log('使用方法: node upload-photos.js [フォルダパス]');
  console.log('例: node upload-photos.js "/Users/akira/Pictures/shogo写真データ/resized"');
  process.exit(1);
}

uploader.uploadFolder(folderPath).catch(console.error);