import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { resizeImageWithSips } from '../photo-gallery-worker/scripts/utils/image-utils.js';
import { getFileSize, formatSize } from '../photo-gallery-worker/scripts/utils/image-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const REPO_ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(REPO_ROOT, 'assets', 'images');
const BACKUP_DIR = path.join(IMAGE_DIR, 'backup_originals');
const IMAGES = ['top_pc1.JPG', 'top_pc2.JPG', 'top_pc3.JPG', 'top_pc4.JPG', 'top_pc5.JPG'];

// 最適化設定
const CONFIG = {
  maxWidth: 2000,  // 幅の最大サイズ（Web表示に適したサイズ）
  quality: 85      // JPEG品質（85は高品質だがファイルサイズを削減）
};

console.log('🖼️  トップページ画像最適化ツール');
console.log('============================');
console.log(`📐 最大幅: ${CONFIG.maxWidth}px`);
console.log(`🎨 品質: ${CONFIG.quality}%`);
console.log('-----------------------------------\n');

// macOSかLinuxかを判定
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

if (!isMac && !isLinux) {
  console.error('❌ このスクリプトはmacOSまたはLinux専用です');
  process.exit(1);
}

// 画像最適化ツールの確認
function checkTools() {
  if (isMac) {
    // macOSの場合は sips を使用（標準搭載）
    const result = spawnSync('which', ['sips'], { encoding: 'utf-8' });
    if (result.status !== 0) {
      console.error('❌ sipsコマンドが見つかりません');
      process.exit(1);
    }
    console.log('✅ sips コマンドを使用します（macOS標準）\n');
    return 'sips';
  } else {
    // Linuxの場合は ImageMagick の convert を試す
    const result = spawnSync('which', ['convert'], { encoding: 'utf-8' });
    if (result.status === 0) {
      console.log('✅ ImageMagick (convert) を使用します\n');
      return 'imagemagick';
    }
    
    console.error('❌ 画像変換ツールが見つかりません');
    console.log('💡 ImageMagickをインストールしてください:');
    console.log('   Ubuntu/Debian: sudo apt-get install imagemagick');
    console.log('   CentOS/RHEL: sudo yum install ImageMagick\n');
    process.exit(1);
  }
}

// 画像を最適化（sips使用）
function optimizeWithSips(inputPath, outputPath) {
  try {
    // 幅をリサイズ
    const resizeResult = spawnSync('sips', [
      '-Z', CONFIG.maxWidth.toString(),
      inputPath,
      '--out', outputPath
    ], { encoding: 'utf-8' });
    
    if (resizeResult.status !== 0) {
      throw new Error(`sips resize failed: ${resizeResult.stderr}`);
    }
    
    // JPEG品質を設定（sipsは直接品質設定ができないため、必要に応じてskip）
    // sipsでの品質調整は限定的なので、リサイズのみ実施
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 画像を最適化（ImageMagick使用）
function optimizeWithImageMagick(inputPath, outputPath) {
  try {
    const result = spawnSync('convert', [
      inputPath,
      '-resize', `${CONFIG.maxWidth}x${CONFIG.maxWidth}>`,
      '-quality', CONFIG.quality.toString(),
      outputPath
    ], { encoding: 'utf-8' });
    
    if (result.status !== 0) {
      throw new Error(`convert failed: ${result.stderr}`);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ファイルサイズを取得
// サイズを人間が読める形式に変換
// (imported from image-utils.js)

// 画像を最適化
function optimizeImage(imageName, tool) {
  const inputPath = path.join(IMAGE_DIR, imageName);
  const backupPath = path.join(BACKUP_DIR, imageName);
  const tempPath = path.join(IMAGE_DIR, `temp_${imageName}`);
  
  console.log(`🔍 処理中: ${imageName}`);
  
  // 元のファイルサイズ
  const originalSize = getFileSize(inputPath);
  console.log(`   元のサイズ: ${formatSize(originalSize)}`);
  
  // バックアップが存在しない場合のみバックアップ
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(inputPath, backupPath);
    console.log(`   バックアップ作成: backup_originals/${imageName}`);
  } else {
    console.log(`   バックアップ済み: backup_originals/${imageName}`);
  }
  
  // 最適化
  let result;
  if (tool === 'sips') {
    result = optimizeWithSips(inputPath, tempPath);
  } else {
    result = optimizeWithImageMagick(inputPath, tempPath);
  }
  
  if (!result.success) {
    console.error(`   ❌ 最適化失敗: ${result.error}\n`);
    return { success: false };
  }
  
  // 最適化後のファイルサイズ
  const optimizedSize = getFileSize(tempPath);
  const reduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
  
  console.log(`   最適化後: ${formatSize(optimizedSize)}`);
  console.log(`   削減率: ${reduction}%`);
  
  // 元のファイルを置き換え
  fs.renameSync(tempPath, inputPath);
  
  console.log(`✅ 完了\n`);
  
  return {
    success: true,
    originalSize,
    optimizedSize,
    reduction: parseFloat(reduction)
  };
}

// メイン処理
function main() {
  // バックアップディレクトリを作成
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 バックアップディレクトリを作成: ${BACKUP_DIR}\n`);
  }
  
  // ツールチェック
  const tool = checkTools();
  
  console.log('🚀 最適化を開始します...\n');
  
  // 各画像を最適化
  const results = [];
  for (const imageName of IMAGES) {
    const imagePath = path.join(IMAGE_DIR, imageName);
    
    if (!fs.existsSync(imagePath)) {
      console.log(`⚠️  スキップ: ${imageName} が見つかりません\n`);
      continue;
    }
    
    const result = optimizeImage(imageName, tool);
    if (result.success) {
      results.push(result);
    }
  }
  
  // サマリー
  if (results.length > 0) {
    const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalOptimized = results.reduce((sum, r) => sum + r.optimizedSize, 0);
    const totalReduction = ((totalOriginal - totalOptimized) / totalOriginal * 100).toFixed(1);
    
    console.log('============================');
    console.log('📊 最適化結果サマリー:');
    console.log(`   処理枚数: ${results.length}枚`);
    console.log(`   元の合計サイズ: ${formatSize(totalOriginal)}`);
    console.log(`   最適化後: ${formatSize(totalOptimized)}`);
    console.log(`   合計削減率: ${totalReduction}%`);
    console.log('============================\n');
  }
  
  console.log('💡 最適化された画像は以下のパスに保存されています:');
  console.log(`   ${IMAGE_DIR}/top_pc*.JPG`);
  console.log('💡 元の画像のバックアップ:');
  console.log(`   ${BACKUP_DIR}/top_pc*.JPG\n`);
}

// エラーハンドリング
try {
  main();
} catch (error) {
  console.error('❌ エラー:', error);
  process.exit(1);
}
