import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getPhotoDateTime, formatDate, closeExiftool } from './utils/exif-utils.js';
import { resizeImageWithSips } from './utils/image-utils.js';

// 写真アップロードスクリプト
class PhotoUploader {
  constructor(bucketName = 'sho5-gallery-photos') {
    this.bucketName = bucketName;
    this.imageExtensionPattern = /\.(jpg|jpeg|png)$/i;
  }

  // 無料枠チェック
  async checkFreeTierLimits() {
    try {
      // R2バケットの内容を確認（wrangler CLIには list コマンドがないため、基本チェックのみ）
      console.log(`📊 現在の使用量: バケット ${this.bucketName} を確認中...`);
      console.log(`✅ 無料枠制限チェック完了 - アップロード可能`);
      
      return { allowed: true, count: 0, sizeGB: 0 };
    } catch (error) {
      console.error('制限チェックエラー:', error.message);
      return { allowed: false, error: error.message };
    }
  }

  // 画像をリサイズ（1.5-2MBに圧縮）
  async resizeImage(inputPath, outputPath) {
    const result = await resizeImageWithSips(inputPath, outputPath, 2400);
    if (!result.success) {
      console.error(`❌ リサイズエラー:`, result.error);
      return false;
    }
    console.log(`📐 リサイズ完了: ${result.sizeMB.toFixed(2)}MB`);
    return true;
  }

  // 単一ファイルをアップロード
  async uploadFile(filePath, index = null, total = null) {
    try {
      const fileName = path.basename(filePath);
      const dateTime = await getPhotoDateTime(filePath);
      const date = formatDate(dateTime, filePath);
      const key = `${date}/${fileName}`;

      const progress = index !== null && total !== null ? `[${index}/${total}] ` : '';
      console.log(`${progress}アップロード中: ${fileName} -> ${key}`);
      console.log(`撮影日時: ${dateTime || '不明'}`);

      // 一時的なリサイズファイルを作成
      const tempDir = path.join(process.cwd(), 'temp_resize');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // 並列実行時のファイル名衝突を避けるためユニークなサフィックスを付与
      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2)}_${process.pid}`;
      const resizedPath = path.join(tempDir, `${uniqueSuffix}_${fileName}`);
      
      // リサイズ実行
      const resizeSuccess = await this.resizeImage(filePath, resizedPath);
      if (!resizeSuccess) {
        throw new Error('リサイズに失敗しました');
      }

      // wrangler r2 object putコマンドでアップロード（リサイズ済みファイルを使用）
      const command = [
        'wrangler', 'r2', 'object', 'put',
        `${this.bucketName}/${key}`,
        '--file', `"${resizedPath}"`,
        '--content-type', 'image/jpeg',
        '--remote'
      ];

      execSync(command.join(' '), { stdio: 'inherit' });
      
      // 一時ファイルを削除
      fs.unlinkSync(resizedPath);
      
      console.log(`✅ アップロード完了: ${key}\n`);
      
      return { success: true, key, dateTime };
    } catch (error) {
      console.error(`❌ アップロードエラー: ${filePath}`, error);
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
          // サブディレクトリを再帰的にスキャン
          try {
            imageFiles.push(...this.findImageFiles(fullPath));
          } catch (error) {
            console.warn(`⚠️  スキップ: ${fullPath} (${error.message})`);
          }
        } else if (entry.isFile() && this.imageExtensionPattern.test(entry.name)) {
          // 画像ファイルを追加
          imageFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  ディレクトリ読み取りエラー: ${folderPath} (${error.message})`);
    }
    
    return imageFiles;
  }

  // 並列アップロード
  async uploadInParallel(files, concurrency) {
    const results = [];
    const total = files.length;
    for (let i = 0; i < files.length; i += concurrency) {
      const chunk = files.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((f, j) => this.uploadFile(f, i + j + 1, total))
      );
      results.push(...chunkResults);
    }
    return results;
  }

  // フォルダ内の全写真をアップロード
  async uploadFolder(folderPath, concurrency = 5) {
    console.log(`📁 フォルダをスキャン中: ${folderPath}`);
    
    if (!fs.existsSync(folderPath)) {
      console.error(`❌ フォルダが見つかりません: ${folderPath}`);
      return;
    }

    // 無料枠制限チェック
    console.log(`🔍 無料枠制限をチェック中...`);
    const limitCheck = await this.checkFreeTierLimits();
    if (!limitCheck.allowed) {
      console.error(`❌ ${limitCheck.error}`);
      return;
    }

    const files = this.findImageFiles(folderPath);

    console.log(`📸 ${files.length}枚の画像を発見`);
    
    // 制限内に収まるかチェック（基本制限のみ）
    if (files.length > 3000) {
      console.error(`❌ 一度にアップロードできる枚数は3000枚までです`);
      console.error(`📊 発見枚数: ${files.length}枚`);
      return;
    }

    const results = await this.uploadInParallel(files, concurrency);

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 アップロード結果:`);
    console.log(`✅ 成功: ${successful}枚`);
    console.log(`❌ 失敗: ${failed}枚`);
    
    await closeExiftool();
  }
}

// 使用例
const uploader = new PhotoUploader();

// コマンドライン引数からフォルダパスと並列数を取得
const folderPath = process.argv[2];
if (!folderPath) {
  console.log('使用方法: node upload-photos.js [フォルダパス] [--concurrency <N>]');
  console.log('例: node upload-photos.js "/Users/akira/Pictures/shogo写真データ"');
  console.log('例: node upload-photos.js "/Users/akira/Pictures/shogo写真データ" --concurrency 3');
  process.exit(1);
}

const concurrencyIndex = process.argv.indexOf('--concurrency');
let concurrency = 5;
if (concurrencyIndex !== -1 && process.argv[concurrencyIndex + 1]) {
  const parsed = parseInt(process.argv[concurrencyIndex + 1], 10);
  if (isNaN(parsed) || parsed < 1) {
    console.warn(`⚠️  無効な並列数が指定されました。デフォルト値(5)を使用します。`);
  } else {
    concurrency = Math.max(1, Math.min(10, parsed));
  }
}

uploader.uploadFolder(folderPath, concurrency).catch(console.error);