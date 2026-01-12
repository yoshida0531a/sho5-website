import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { getFileSize, formatSize } from '../photo-gallery-worker/scripts/utils/image-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const REPO_ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(REPO_ROOT, 'assets', 'images');
const SOURCE_DIR = path.join(IMAGE_DIR, 'top_sources'); // ソース画像を格納するディレクトリ

// 生成設定
const CONFIG = {
  pc: {
    maxWidth: 2000,    // PC向け画像の最大幅
    quality: 85        // JPEG品質
  },
  mobile: {
    maxWidth: 1200,    // モバイル向け画像の最大幅
    quality: 85        // JPEG品質
  }
};

// 出力ファイル名
const OUTPUT_FILES = {
  pc: ['top_pc1.JPG', 'top_pc2.JPG', 'top_pc3.JPG', 'top_pc4.JPG', 'top_pc5.JPG'],
  mobile: ['top_mobile1.JPG', 'top_mobile2.JPG', 'top_mobile3.JPG', 'top_mobile4.JPG', 'top_mobile5.JPG']
};

console.log('🖼️  トップページ画像生成ツール');
console.log('============================');
console.log('このツールは、ソース画像から5枚のPC向けとモバイル向け画像を生成します。');
console.log('');
console.log(`📁 ソースディレクトリ: ${SOURCE_DIR}`);
console.log(`📁 出力ディレクトリ: ${IMAGE_DIR}`);
console.log('');
console.log(`📐 PC向け: 最大${CONFIG.pc.maxWidth}px, 品質${CONFIG.pc.quality}%`);
console.log(`📐 モバイル向け: 最大${CONFIG.mobile.maxWidth}px, 品質${CONFIG.mobile.quality}%`);
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

// ソースディレクトリ内の画像ファイルを取得
function getSourceImages() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ ソースディレクトリが見つかりません: ${SOURCE_DIR}`);
    console.log('\n💡 ソース画像を配置する手順:');
    console.log(`   1. ディレクトリを作成: mkdir -p "${SOURCE_DIR}"`);
    console.log(`   2. 5枚以上の画像を配置 (例: source1.jpg, source2.jpg, ...)`);
    console.log('   3. このスクリプトを再実行\n');
    process.exit(1);
  }

  const files = fs.readdirSync(SOURCE_DIR);
  const imageExtensions = ['.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG'];
  const imageFiles = files.filter(file => {
    const ext = path.extname(file);
    return imageExtensions.includes(ext);
  }).sort();

  if (imageFiles.length === 0) {
    console.error(`❌ ソースディレクトリに画像ファイルが見つかりません: ${SOURCE_DIR}`);
    console.log('\n💡 対応フォーマット: .jpg, .jpeg, .png\n');
    process.exit(1);
  }

  if (imageFiles.length < 5) {
    console.error(`❌ ソース画像が不足しています: ${imageFiles.length}枚 (最低5枚必要)`);
    console.log('\n💡 5枚以上の画像をソースディレクトリに配置してください\n');
    process.exit(1);
  }

  return imageFiles;
}

// 画像をリサイズ（sips使用）
function resizeWithSips(inputPath, outputPath, maxWidth, quality) {
  try {
    const result = spawnSync('sips', [
      '-Z', maxWidth.toString(),
      inputPath,
      '--out', outputPath
    ], { encoding: 'utf-8' });
    
    if (result.status !== 0) {
      throw new Error(`sips resize failed: ${result.stderr}`);
    }
    
    // Note: sips has limited JPEG quality control capabilities
    // The quality parameter is accepted for API consistency but not fully utilized
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 画像をリサイズ（ImageMagick使用）
function resizeWithImageMagick(inputPath, outputPath, maxWidth, quality) {
  try {
    const result = spawnSync('convert', [
      inputPath,
      '-resize', `${maxWidth}x${maxWidth}>`,
      '-quality', quality.toString(),
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

// 画像を生成
function generateImage(sourceFile, outputFile, maxWidth, quality, tool) {
  const sourcePath = path.join(SOURCE_DIR, sourceFile);
  const outputPath = path.join(IMAGE_DIR, outputFile);
  
  console.log(`🔍 生成中: ${outputFile}`);
  console.log(`   ソース: ${sourceFile}`);
  
  // ソースファイルサイズ
  const sourceSize = getFileSize(sourcePath);
  console.log(`   ソースサイズ: ${formatSize(sourceSize)}`);
  
  // リサイズ
  let result;
  if (tool === 'sips') {
    result = resizeWithSips(sourcePath, outputPath, maxWidth, quality);
  } else {
    result = resizeWithImageMagick(sourcePath, outputPath, maxWidth, quality);
  }
  
  if (!result.success) {
    console.error(`   ❌ 生成失敗: ${result.error}\n`);
    return { success: false };
  }
  
  // 生成後のファイルサイズ
  const outputSize = getFileSize(outputPath);
  console.log(`   生成サイズ: ${formatSize(outputSize)}`);
  
  console.log(`✅ 完了\n`);
  
  return {
    success: true,
    sourceSize,
    outputSize
  };
}

// メイン処理
function main() {
  // ツールチェック
  const tool = checkTools();
  
  // ソース画像を取得
  const sourceImages = getSourceImages();
  
  console.log(`📸 ソース画像: ${sourceImages.length}枚見つかりました`);
  console.log('-----------------------------------');
  sourceImages.slice(0, 5).forEach((img, idx) => {
    console.log(`   ${idx + 1}. ${img}`);
  });
  console.log('-----------------------------------\n');
  
  if (sourceImages.length > 5) {
    console.log(`💡 注意: 最初の5枚の画像のみを使用します\n`);
  }
  
  // PC向け画像を生成
  console.log('🖥️  PC向け画像を生成中...\n');
  const pcResults = [];
  for (let i = 0; i < 5; i++) {
    const result = generateImage(
      sourceImages[i],
      OUTPUT_FILES.pc[i],
      CONFIG.pc.maxWidth,
      CONFIG.pc.quality,
      tool
    );
    if (result.success) {
      pcResults.push(result);
    }
  }
  
  // モバイル向け画像を生成
  console.log('📱 モバイル向け画像を生成中...\n');
  const mobileResults = [];
  for (let i = 0; i < 5; i++) {
    const result = generateImage(
      sourceImages[i],
      OUTPUT_FILES.mobile[i],
      CONFIG.mobile.maxWidth,
      CONFIG.mobile.quality,
      tool
    );
    if (result.success) {
      mobileResults.push(result);
    }
  }
  
  // サマリー
  console.log('============================');
  console.log('📊 生成結果サマリー:');
  console.log(`   PC向け画像: ${pcResults.length}枚`);
  console.log(`   モバイル向け画像: ${mobileResults.length}枚`);
  console.log(`   合計: ${pcResults.length + mobileResults.length}枚`);
  console.log('============================\n');
  
  console.log('💡 生成された画像:');
  console.log(`   PC向け: ${IMAGE_DIR}/top_pc*.JPG`);
  console.log(`   モバイル向け: ${IMAGE_DIR}/top_mobile*.JPG\n`);
  
  console.log('📝 次のステップ:');
  console.log('   1. 生成された画像を確認');
  console.log('   2. 必要に応じて最適化スクリプトを実行:');
  console.log('      npm run optimize-top-images\n');
}

// エラーハンドリング
try {
  main();
} catch (error) {
  console.error('❌ エラー:', error);
  process.exit(1);
}
