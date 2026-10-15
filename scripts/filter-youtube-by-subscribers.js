/**
 * 互換用の入口です。
 * YouTube-data.txt は変更せず、data/youtube-public.json だけを更新します。
 */
import { main } from './curate-youtube.js';

await main();
