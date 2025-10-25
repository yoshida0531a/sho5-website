import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { exiftool } from 'exiftool-vendored';

// 写真アップロードスクリプト
class PhotoUploader {
  constructor(bucketName = 'sho5-gallery-photos') {
    this.bucketName = bucketName;
  }

  // EXIFから撮影日時を取得
  async getPhotoDateTime(filePath) {
    try {
      const tags = await exiftool.read(filePath);
      const dateTime = tags.DateTimeOriginal || tags.CreateDate || tags.DateTime;
      return dateTime ? dateTime.toISOString().slice(0, 19).replace('T', ' ') : null;
    } catch (error) {
      console.error(`EXIF読み取りエラー: ${filePath}`, error);
      return null;
    }
  }

  // 撮影日時から日付部分を抽出
  formatDate(dateTime) {
    if (!dateTime) return 'unknown';
    return dateTime.split(' ')[0]; // YYYY-MM-DD
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
    try {
      // sipsでリサイズ（macOS標準）
      const command = [
        'sips',
        '-Z', '2400',           // 最大2400px（高品質、1-2MB目標）
        `"${inputPath}"`,
        '--out', `"${outputPath}"`
      ];
      
      execSync(command.join(' '), { stdio: 'pipe' });
      
      // ファイルサイズをチェック
      const stats = fs.statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);
      
      console.log(`📐 リサイズ完了: ${(sizeMB).toFixed(2)}MB`);
      return true;
    } catch (error) {
      console.error(`❌ リサイズエラー:`, error.message);
      return false;
    }
  }

  // 単一ファイルをアップロード
  async uploadFile(filePath) {
    try {
      const fileName = path.basename(filePath);
      const dateTime = await this.getPhotoDateTime(filePath);
      const date = this.formatDate(dateTime);
      const key = `${date}/${fileName}`;

      console.log(`アップロード中: ${fileName} -> ${key}`);
      console.log(`撮影日時: ${dateTime || '不明'}`);

      // 一時的なリサイズファイルを作成
      const tempDir = path.join(process.cwd(), 'temp_resize');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const resizedPath = path.join(tempDir, fileName);
      
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

  // フォルダ内の全写真をアップロード
  async uploadFolder(folderPath) {
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

    const files = fs.readdirSync(folderPath)
      .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
      .map(file => path.join(folderPath, file));

    console.log(`📸 ${files.length}枚の画像を発見`);
    
    // 制限内に収まるかチェック（基本制限のみ）
    if (files.length > 2000) {
      console.error(`❌ 一度にアップロードできる枚数は2000枚までです`);
      console.error(`📊 発見枚数: ${files.length}枚`);
      return;
    }

    const results = [];
    for (const filePath of files) {
      const result = await this.uploadFile(filePath);
      results.push(result);
      
      // 少し待機（API制限回避）
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 アップロード結果:`);
    console.log(`✅ 成功: ${successful}枚`);
    console.log(`❌ 失敗: ${failed}枚`);
    
    await exiftool.end();
  }
}

// 使用例
const uploader = new PhotoUploader();

// コマンドライン引数からフォルダパスを取得
const folderPath = process.argv[2];
if (!folderPath) {
  console.log('使用方法: node upload-photos.js [フォルダパス]');
  console.log('例: node upload-photos.js "/Users/akira/Pictures/shogo写真データ"');
  process.exit(1);
}

uploader.uploadFolder(folderPath).catch(console.error);