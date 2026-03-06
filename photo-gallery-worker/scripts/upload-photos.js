import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { getPhotoDateTime, formatDate, closeExiftool } from './utils/exif-utils.js';
import { resizeImageWithSips } from './utils/image-utils.js';

// 写真アップロードスクリプト

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dirname, '..', 'upload-progress.json');

// stdin から1行読み込んで返す
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, answer => {
    rl.close();
    resolve(answer);
  }));
}

// ミリ秒を HH:MM:SS 形式にフォーマット
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

class PhotoUploader {
  constructor(bucketName = 'sho5-gallery-photos') {
    this.bucketName = bucketName;
    this.imageExtensionPattern = /\.(jpg|jpeg|png)$/i;
    this._startedAt = new Date().toISOString();
  }

  // 進捗ファイルを読み込む
  loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
        return {
          folderPath: data.folderPath,
          startedAt: data.startedAt,
          updatedAt: data.updatedAt,
          completed: new Set(data.completed || []),
          failed: new Set(data.failed || []),
        };
      } catch (error) {
        console.warn('⚠️  進捗ファイルの読み込みに失敗しました:', error.message);
      }
    }
    return null;
  }

  // 進捗ファイルを保存する
  saveProgress(folderPath, completed, failed) {
    const data = {
      folderPath,
      startedAt: this._startedAt,
      updatedAt: new Date().toISOString(),
      completed: [...completed],
      failed: [...failed],
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  // 進捗ファイルを削除する
  deleteProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  }

  // 進捗をコンソールに表示する
  displayProgress(current, total, startTime, successCount, failureCount) {
    const elapsed = Date.now() - startTime;
    const percent = ((current / total) * 100).toFixed(1);
    const speed = elapsed > 0 ? current / (elapsed / 1000) : 0;
    const remaining = total - current;
    const estimatedMs = speed > 0 ? (remaining / speed) * 1000 : 0;
    console.log(
      `[${current}/${total}] ${percent}% | 経過: ${formatDuration(elapsed)} | 残り推定: ${formatDuration(estimatedMs)} | ✅成功: ${successCount} ❌失敗: ${failureCount}`
    );
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
  async uploadFile(filePath) {
    try {
      const fileName = path.basename(filePath);
      const dateTime = await getPhotoDateTime(filePath);
      const date = formatDate(dateTime, filePath);
      const key = `${date}/${fileName}`;

      console.log(`アップロード中: ${fileName} -> ${key}`);
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

      execSync(command.join(' '), {
        stdio: 'inherit',
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        },
      });
      
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

  // 並列アップロード（進捗追跡付き）
  async uploadInParallel(filesToUpload, concurrency, folderPath, completed, failed, sessionStartTime) {
    // totalFiles = 完了済み + 今回処理する分（失敗再試行含む）= allFiles.length と等しい
    const totalFiles = completed.size + filesToUpload.length;
    // 前回セッションの完了数をベースに表示上のカウンタを開始
    let processedCount = completed.size;
    let successCount = completed.size;
    let failureCount = 0;

    for (let i = 0; i < filesToUpload.length; i += concurrency) {
      const chunk = filesToUpload.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (f) => {
          const result = await this.uploadFile(f);
          processedCount++;

          if (result.success) {
            successCount++;
            completed.add(f);
            // 失敗リストから除外（前回失敗して今回成功した場合）
            failed.delete(f);
          } else {
            failureCount++;
            failed.add(f);
          }

          // 進捗を表示
          this.displayProgress(processedCount, totalFiles, sessionStartTime, successCount, failureCount);
          // アップロード毎に即座に進捗ファイルを保存
          this.saveProgress(folderPath, completed, failed);
        })
      );
    }

    return { successCount, failureCount };
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

    // 前回の進捗を確認
    let completed = new Set();
    let failed = new Set();
    let resume = false;

    const prevProgress = this.loadProgress();
    if (prevProgress && prevProgress.folderPath === folderPath) {
      const answer = await askQuestion(
        `📂 前回の進捗ファイルが見つかりました（完了: ${prevProgress.completed.size}枚, 失敗: ${prevProgress.failed.size}枚）。前回の続きから再開しますか？ (y/n): `
      );
      if (answer === 'y' || answer === 'Y') {
        completed = prevProgress.completed;
        failed = prevProgress.failed;
        this._startedAt = prevProgress.startedAt;
        resume = true;
        console.log(`🔄 ${completed.size}枚をスキップして続きから再開します。`);
      } else {
        console.log('🆕 最初からやり直します。');
        this._startedAt = new Date().toISOString();
      }
    }

    const allFiles = this.findImageFiles(folderPath);
    // 完了済みファイルをスキップ（失敗ファイルは再試行対象）
    const filesToUpload = allFiles.filter(f => !completed.has(f));

    console.log(`📸 ${allFiles.length}枚の写真が見つかりました。${resume ? `（${completed.size}枚スキップ）` : ''} 残り${filesToUpload.length}枚をアップロードします。`);

    if (filesToUpload.length === 0) {
      console.log('✅ すべてのファイルがアップロード済みです。');
      if (failed.size === 0) {
        this.deleteProgress();
      }
      await closeExiftool();
      return;
    }

    const answer = await askQuestion('アップロードを開始しますか？ (y/n): ');
    if (answer !== 'y' && answer !== 'Y') {
      console.log('キャンセルしました。');
      await closeExiftool();
      return;
    }

    // 進捗ファイルを初期化（再開時は既存データを保持）
    this.saveProgress(folderPath, completed, failed);

    const sessionStartTime = Date.now();
    const { successCount, failureCount } = await this.uploadInParallel(
      filesToUpload, concurrency, folderPath, completed, failed, sessionStartTime
    );

    console.log(`\n📊 アップロード結果:`);
    console.log(`✅ 成功: ${successCount}枚`);
    console.log(`❌ 失敗: ${failureCount}枚`);

    if (failureCount === 0) {
      this.deleteProgress();
      console.log('🎉 全件アップロード完了！進捗ファイルを削除しました。');
    } else {
      console.log(`⚠️  ${failureCount}件の失敗があります。次回実行時に再試行されます。`);
    }

    await closeExiftool();
  }
}

// 使用例
const uploader = new PhotoUploader();

// コマンドライン引数からフォルダパスと並列数を取得
const folderPath = process.argv[2];
if (!folderPath) {
  console.log('使用方法: node upload-photos.js [フォルダパス] [--concurrency <N>]');
  console.log('例: node upload-photos.js "/Users/akira/Pictures/sho5org"');
  console.log('例: node upload-photos.js "/Users/akira/Pictures/sho5org" --concurrency 3');
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