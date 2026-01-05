import { watch } from 'fs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { exiftool } from 'exiftool-vendored';

// 設定
const CONFIG = {
  watchFolder: process.env.WATCH_FOLDER || '/Users/akira/Pictures/shogo写真データ/auto-upload',
  bucketName: 'sho5-gallery-photos',
  maxSizeMB: 2,
  maxDimension: 2400,
  supportedFormats: ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'],
  processDelay: 2000 // ファイル安定化待機時間（ミリ秒）
};

console.log('📸 Photo Auto-Upload System Started');
console.log('📁 監視フォルダ:', CONFIG.watchFolder);
console.log('🔄 対応フォーマット:', CONFIG.supportedFormats.join(', '));
console.log('-----------------------------------\n');

// 処理中のファイルを追跡
const processingFiles = new Set();
const processedFiles = new Set();

// 監視フォルダが存在しない場合は作成
if (!fs.existsSync(CONFIG.watchFolder)) {
  fs.mkdirSync(CONFIG.watchFolder, { recursive: true });
  console.log(`✅ 監視フォルダを作成しました: ${CONFIG.watchFolder}\n`);
}

// 一時リサイズフォルダ
const tempResizeDir = path.join(process.cwd(), 'temp_resize');
if (!fs.existsSync(tempResizeDir)) {
  fs.mkdirSync(tempResizeDir, { recursive: true });
}

// EXIFから撮影日時を取得
async function getPhotoDateTime(filePath) {
  try {
    const tags = await exiftool.read(filePath);
    const dateTime = tags.DateTimeOriginal || tags.CreateDate || tags.DateTime;
    return dateTime ? dateTime.toISOString().slice(0, 19).replace('T', ' ') : null;
  } catch (error) {
    console.error(`⚠️  EXIF読み取りエラー: ${path.basename(filePath)}`);
    return null;
  }
}

// 撮影日時から日付部分を抽出
function formatDate(dateTime) {
  if (!dateTime) {
    // 日時がない場合はファイルの更新日時を使用
    return new Date().toISOString().slice(0, 10);
  }
  return dateTime.split(' ')[0]; // YYYY-MM-DD
}

// 画像をリサイズ
async function resizeImage(inputPath, outputPath) {
  try {
    const command = [
      'sips',
      '-Z', CONFIG.maxDimension.toString(),
      `"${inputPath}"`,
      '--out', `"${outputPath}"`
    ];
    
    execSync(command.join(' '), { stdio: 'pipe' });
    
    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    return { success: true, sizeMB };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// R2にアップロード
async function uploadToR2(filePath, fileName) {
  try {
    const dateTime = await getPhotoDateTime(filePath);
    const date = formatDate(dateTime);
    const key = `${date}/${fileName}`;

    console.log(`📤 アップロード中: ${fileName}`);
    console.log(`   撮影日時: ${dateTime || '不明（ファイル日時を使用）'}`);
    console.log(`   保存先: ${key}`);

    // リサイズ
    const resizedPath = path.join(tempResizeDir, fileName);
    const resizeResult = await resizeImage(filePath, resizedPath);
    
    if (!resizeResult.success) {
      throw new Error(`リサイズ失敗: ${resizeResult.error}`);
    }

    console.log(`   サイズ: ${resizeResult.sizeMB.toFixed(2)}MB`);

    // R2にアップロード
    const command = [
      'wrangler', 'r2', 'object', 'put',
      `${CONFIG.bucketName}/${key}`,
      '--file', `"${resizedPath}"`,
      '--content-type', 'image/jpeg',
      '--remote'
    ];

    execSync(command.join(' '), { stdio: 'pipe' });
    
    // 一時ファイルを削除
    fs.unlinkSync(resizedPath);
    
    // 元のファイルを処理済みフォルダに移動
    const processedDir = path.join(CONFIG.watchFolder, 'processed');
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }
    
    const processedPath = path.join(processedDir, fileName);
    fs.renameSync(filePath, processedPath);
    
    console.log(`✅ アップロード完了！`);
    console.log(`   処理済みフォルダに移動: ${path.basename(processedPath)}\n`);
    
    return { success: true, key };
  } catch (error) {
    console.error(`❌ アップロードエラー: ${fileName}`);
    console.error(`   ${error.message}\n`);
    return { success: false, error: error.message };
  }
}

// ファイル処理
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  
  // 既に処理中または処理済み
  if (processingFiles.has(filePath) || processedFiles.has(filePath)) {
    return;
  }
  
  // 対応フォーマットチェック
  const ext = path.extname(filePath);
  if (!CONFIG.supportedFormats.includes(ext)) {
    return;
  }
  
  processingFiles.add(filePath);
  
  console.log(`🔍 新しいファイルを検出: ${fileName}`);
  console.log(`   ファイル安定化を待機中... (${CONFIG.processDelay}ms)`);
  
  // ファイルのコピーが完了するまで待機
  await new Promise(resolve => setTimeout(resolve, CONFIG.processDelay));
  
  // ファイルが存在するか確認
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ファイルが見つかりません: ${fileName}\n`);
    processingFiles.delete(filePath);
    return;
  }
  
  // アップロード処理
  const result = await uploadToR2(filePath, fileName);
  
  processingFiles.delete(filePath);
  if (result.success) {
    processedFiles.add(filePath);
  }
}

// フォルダ監視
console.log('👀 フォルダの監視を開始しました');
console.log('💡 写真ファイルを監視フォルダにコピーすると自動処理されます\n');

// 起動時に既存ファイルをチェック
const existingFiles = fs.readdirSync(CONFIG.watchFolder)
  .filter(file => {
    const ext = path.extname(file);
    return CONFIG.supportedFormats.includes(ext);
  })
  .map(file => path.join(CONFIG.watchFolder, file));

if (existingFiles.length > 0) {
  console.log(`📋 既存ファイル ${existingFiles.length}件 を検出しました`);
  console.log('🚀 処理を開始します...\n');
  
  for (const filePath of existingFiles) {
    await processFile(filePath);
    // 負荷軽減のため少し待機
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ファイルシステム監視
const watcher = watch(CONFIG.watchFolder, { recursive: false }, async (eventType, filename) => {
  if (!filename) return;
  
  const filePath = path.join(CONFIG.watchFolder, filename);
  
  // ファイルが追加または変更された場合
  if (eventType === 'rename' || eventType === 'change') {
    // ファイルが存在し、ディレクトリでない場合
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await processFile(filePath);
    }
  }
});

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  プログラムを終了しています...');
  watcher.close();
  await exiftool.end();
  console.log('👋 お疲れ様でした！\n');
  process.exit(0);
});

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ 予期しないエラー:', error);
});
