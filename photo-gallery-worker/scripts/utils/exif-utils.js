import { exiftool } from 'exiftool-vendored';
import fs from 'fs';

// EXIFから撮影日時を取得
export async function getPhotoDateTime(filePath) {
  try {
    const tags = await exiftool.read(filePath);
    const dateTime = tags.DateTimeOriginal || tags.CreateDate || tags.DateTime;
    return dateTime ? dateTime.toISOString().slice(0, 19).replace('T', ' ') : null;
  } catch (error) {
    console.error(`⚠️  EXIF読み取りエラー: ${filePath.split('/').pop()} - ${error.message}`);
    return null;
  }
}

// 撮影日時から日付部分を抽出
export function formatDate(dateTime, filePath) {
  if (!dateTime) {
    // 日時がない場合はファイルの更新日時を使用
    if (filePath) {
      try {
        const stats = fs.statSync(filePath);
        return new Date(stats.mtime).toISOString().slice(0, 10);
      } catch (error) {
        // ファイル情報が取得できない場合は現在日時
        return new Date().toISOString().slice(0, 10);
      }
    }
    return 'unknown';
  }
  return dateTime.split(' ')[0]; // YYYY-MM-DD
}

// exiftoolを終了
export async function closeExiftool() {
  await exiftool.end();
}
