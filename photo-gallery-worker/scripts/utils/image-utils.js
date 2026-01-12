import { spawnSync } from 'child_process';
import fs from 'fs';

// 画像をリサイズ（macOS sips使用）
export async function resizeImageWithSips(inputPath, outputPath, maxDimension) {
  try {
    // Use spawnSync with array arguments to prevent command injection
    const result = spawnSync('sips', [
      '-Z', maxDimension.toString(),
      inputPath,
      '--out', outputPath
    ], { encoding: 'utf-8' });
    
    if (result.error) {
      throw result.error;
    }
    
    if (result.status !== 0) {
      throw new Error(`sips exited with code ${result.status}: ${result.stderr}`);
    }
    
    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    return { success: true, sizeMB };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ファイルサイズを取得
export function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

// サイズを人間が読める形式に変換
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// macOS確認
export async function checkMacOS() {
  const os = await import('os');
  return os.platform() === 'darwin';
}

// 対応フォーマットのファイルをフィルタリング
export async function filterImageFiles(files, supportedFormats) {
  const path = await import('path');
  return files.filter(file => {
    const ext = path.extname(file);
    return supportedFormats.includes(ext);
  });
}
