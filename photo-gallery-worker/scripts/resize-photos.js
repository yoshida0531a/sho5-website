import fs from 'fs';
import path from 'path';
import os from 'os';
import { getPhotoDateTime, formatDate, closeExiftool } from './utils/exif-utils.js';
import { resizeImageWithSips } from './utils/image-utils.js';

// 設定
const defaultSourceFolder = path.join(os.homedir(), 'Pictures', 'sho5org', 'original');
const defaultOutputFolder = path.join(os.homedir(), 'Pictures', 'sho5org', 'resized');

const CONFIG = {
  sourceFolder: process.env.SOURCE_FOLDER || defaultSourceFolder,
  outputFolder: process.env.OUTPUT_FOLDER || defaultOutputFolder,
  maxDimension: 2400,
  supportedFormats: ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
};

console.log('📸 Photo Resize Tool for Mac');
console.log('============================');
console.log(`📁 読み込み: ${CONFIG.sourceFolder}`);
console.log(`📁 出力先: ${CONFIG.outputFolder}`);
console.log(`🔄 対応フォーマット: ${CONFIG.supportedFormats.join(', ')}`);
console.log(`📐 最大サイズ: ${CONFIG.maxDimension}px`);
console.log('-----------------------------------\n');

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
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  
  try {
    console.log(`🔍 処理中: ${fileName}`);
    
    // EXIF情報から撮影日時を取得
    const dateTime = await getPhotoDateTime(filePath);
    const date = formatDate(dateTime, filePath);
    
    console.log(`   撮影日時: ${dateTime || 'なし（ファイル日時を使用）'}`);
    console.log(`   日付フォルダ: ${date}`);
    
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
    
    console.log(`   サイズ: ${resizeResult.sizeMB.toFixed(2)}MB`);
    console.log(`   保存先: ${date}/${fileName}`);
    console.log(`✅ 完了\n`);
    
    return { success: true, outputPath };
  } catch (error) {
    console.error(`❌ エラー: ${fileName} - ${error.message}\n`);
    return { success: false, error: error.message };
  }
}

// メイン処理
async function main() {
  console.log('📋 ファイルをスキャン中...\n');
  
  // 対応フォーマットのファイルを取得
  const files = fs.readdirSync(CONFIG.sourceFolder)
    .filter(file => {
      const ext = path.extname(file);
      return CONFIG.supportedFormats.includes(ext);
    })
    .map(file => path.join(CONFIG.sourceFolder, file));
  
  if (files.length === 0) {
    console.log('⚠️  処理対象のファイルが見つかりませんでした\n');
    console.log(`💡 対応フォーマット: ${CONFIG.supportedFormats.join(', ')}\n`);
    await closeExiftool();
    return;
  }
  
  console.log(`📸 ${files.length}枚の画像を発見しました\n`);
  console.log('🚀 リサイズを開始します...\n');
  
  // 各ファイルを処理
  const results = [];
  for (const filePath of files) {
    const result = await processFile(filePath);
    results.push(result);
    
    // 負荷軽減のため少し待機
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 結果サマリー
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('============================');
  console.log('📊 リサイズ結果:');
  console.log(`✅ 成功: ${successful}枚`);
  console.log(`❌ 失敗: ${failed}枚`);
  console.log('============================\n');
  
  console.log(`📁 リサイズ済み画像: ${CONFIG.outputFolder}`);
  console.log('💡 次のステップ: 手動でCloudflare R2にアップロードしてください\n');
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
