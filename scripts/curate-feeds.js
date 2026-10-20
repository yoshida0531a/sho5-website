import { main as curateX } from './curate-x.js';
import { main as curateYouTube } from './curate-youtube.js';

await curateX();
const xFailed = process.exitCode || 0;
process.exitCode = 0;
await curateYouTube();
const youtubeFailed = process.exitCode || 0;
if (xFailed || youtubeFailed) process.exitCode = 1;
