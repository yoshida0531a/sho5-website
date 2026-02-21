import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import pLimit from 'p-limit';
import { getPhotoDateTime, formatDate, closeExiftool } from './utils/exif-utils.js';
import { resizeImageWithSips } from './utils/image-utils.js';

// 設定
const defaultSourceFolder = path.join(os.homedir(), 'Pictures', 'sho5org', 'original');
const defaultOutputFolder = path.join(os.homedir(), 'Pictures', 'sho5org', 'resized');

const CONFIG = {
  sourceFolder: process.env.SOURCE_FOLDER || defaultSourceFolder,
  outputFolder: process.env.OUTPUT_FOLDER || defaultOutputFolder,
  maxDimension: 2400,
  supportedFormats: ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'],
  concurrency: parseInt(process.env.CONCURRENCY || '5', 10),
  progressFile: process.env.PROGRESS_FILE || path.join(os.homedir(), 'Pictures', 'sho5org', 'resize-progress.json')
};

console.log('📸 Photo Resize Tool for Mac');
console.log('============================');
console.log(`📁 読み込み: ${CONFIG.sourceFolder}`);
console.log(`📁 出力先: ${CONFIG.outputFolder}`);
console.log(`🔄 対応フォーマット: ${CONFIG.supportedFormats.join(', ')}`);
console.log(`📐 最大サイズ: ${CONFIG.maxDimension}px`);
console.log(`⚡ 並列数: ${CONFIG.concurrency}`);
console.log(`📋 進捗ファイル: ${CONFIG.progressFile}`);
console.log('-----------------------------------\n');

// 進捗管理
function loadProgress() {
  if (fs.existsSync(CONFIG.progressFile)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2), 'utf-8');
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

// フォルダの存在確認
if (!fs.existsSync(CONFIG.sourceFolder)) {
  console.error(`❌ エラー: 読み込みフォルダが見つかりません: ${CONFIG.sourceFolder}`);
  console.log('💡 フォルダを作成するか、環境変数 SOURCE_FOLDER で指定してください\n');
  process.exit(1);
}

// 出力フォルダを作成
if (!fs.existsSync(CONFIG.outputFolder)) {
  fs.mkdirSync(CONFIG.outputFolder, { recursive: true });
  console.log(`✅ 出力フォルダを作成しました: ${CONFIG.outputFolder}\n`);
}

// macOS確認
if (os.platform() !== 'darwin') {
  console.error('❌ このスクリプトはmacOS専用です（sipsコマンドを使用）');
  console.log('💡 他のOSの場合は、ImageMagickなど別のツールをご使用ください\n');
  process.exit(1);
}

// 画像をリサイズ
async function resizeImage(inputPath, outputPath) {
  return await resizeImageWithSips(inputPath, outputPath, CONFIG.maxDimension);
}

// ファイルをリサイズして出力フォルダに保存
async function processFile(filePath, progress) {
  const fileName = path.basename(filePath);

  // 既に完了済みならスキップ
  if (progress[fileName] === 'done') {
    console.log(`⏭️  スキップ（完了済み）: ${fileName}`);
    return { success: true, skipped: true };
  }

  try {
    console.log(`🔍 処理中: ${fileName}`);

    // EXIF情報から撮影日時を取得
    const dateTime = await getPhotoDateTime(filePath);
    const date = formatDate(dateTime, filePath);

    // 日付ごとのフォルダを作成
    const dateFolderPath = path.join(CONFIG.outputFolder, date);
    if (!fs.existsSync(dateFolderPath)) {
      fs.mkdirSync(dateFolderPath, { recursive: true });
    }

    // リサイズして保存
    const outputPath = path.join(dateFolderPath, fileName);
    const resizeResult = await resizeImage(filePath, outputPath);

    if (!resizeResult.success) {
      throw new Error(`リサイズ失敗: ${resizeResult.error}`);
    }

    console.log(`✅ 完了: ${date}/${fileName} (${resizeResult.sizeMB.toFixed(2)}MB)`);

    return { success: true, outputPath };
  } catch (error) {
    console.error(`❌ エラー: ${fileName} - ${error.message}`);
    return { success: false, error: error.message };
  }
}

// メイン処理
async function main() {
  console.log('📋 ファイルをスキャン中...\n');

  // 対応フォーマットのファイルを取得
  const files = fs.readdirSync(CONFIG.sourceFolder)
    .filter(file => CONFIG.supportedFormats.includes(path.extname(file)))
    .map(file => path.join(CONFIG.sourceFolder, file));

  if (files.length === 0) {
    console.log('⚠️  処理対象のファイルが見つかりませんでした\n');
    console.log(`💡 対応フォーマット: ${CONFIG.supportedFormats.join(', ')}\n`);
    await closeExiftool();
    return;
  }

  // 進捗ファイルを読み込み
  const progress = loadProgress();
  const alreadyDone = Object.values(progress).filter(v => v === 'done').length;
  const remaining = files.filter(f => progress[path.basename(f)] !== 'done').length;

  console.log(`📸 ${files.length}枚の画像を発見（完了済み: ${alreadyDone}枚 / 未処理: ${remaining}枚）\n`);

  if (remaining === 0) {
    console.log('✅ すべてのファイルが処理済みです\n');
    await closeExiftool();
    return;
  }

  console.log('🚀 リサイズを開始します...\n');

  // caffeinate でスリープ防止
  const caffeinateProc = startCaffeinate();

  // 並列処理
  const limit = pLimit(CONFIG.concurrency);
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  const tasks = files.map(filePath => limit(async () => {
    const fileName = path.basename(filePath);
    const result = await processFile(filePath, progress);

    if (result.skipped) {
      skipped++;
    } else if (result.success) {
      successful++;
      progress[fileName] = 'done';
      saveProgress(progress);
    } else {
      failed++;
    }
  }));

  await Promise.all(tasks);

  stopCaffeinate(caffeinateProc);

  // 結果サマリー
  console.log('\n============================');
  console.log('📊 リサイズ結果:');
  console.log(`✅ 成功: ${successful}枚`);
  console.log(`⏭️  スキップ（完了済み）: ${skipped}枚`);
  console.log(`❌ 失敗: ${failed}枚`);
  console.log('============================\n');

  console.log(`📁 リサイズ済み画像: ${CONFIG.outputFolder}`);
  console.log(`📋 進捗ファイル: ${CONFIG.progressFile}`);
  console.log('💡 次のステップ: アップロードを実行してください\n');
  console.log('アップロードコマンド例:');
  console.log('  cd photo-gallery-worker');
  console.log(`  node scripts/upload-photos.js "${CONFIG.outputFolder}"\n`);

  await closeExiftool();
}

// エラーハンドリング
process.on('unhandledRejection', async (error) => {
  console.error('❌ 予期しないエラー:', error);
  await closeExiftool();
  process.exit(1);
});

// 実行
main().catch(async (error) => {
  console.error('❌ エラー:', error);
  await closeExiftool();
  process.exit(1);
});
