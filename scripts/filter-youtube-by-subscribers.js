/**
 * 互換用の入口です。
 * 公開JSONは書き換えません。日次の追加は Worker の選別が行います。
 */
import { main } from './curate-youtube.js';

await main();
