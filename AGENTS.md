# AGENTS.md

## Cursor Cloud specific instructions

This repo is the Sho5 fan site: static HTML/CSS/JS served via GitHub Pages, plus one Cloudflare Worker (`photo-gallery-worker/`) and Node utility scripts in `scripts/`. See `README.md` for page overview.

### Running the site (development)
- It is fully static — serve the repo root with any static server, e.g. `python3 -m http.server 8080`, then open `http://localhost:8080/index.html`.
- Live data features call PRODUCTION endpoints baked into the HTML (e.g. `sho5-meter.html` fetches `https://sho5-meter.chjqnfv62h.workers.dev`). When served locally these may show "データの取得に失敗しました" (failed to fetch) due to network/CORS to production; the page layout still renders. To exercise the meter end-to-end, run the `sho5-meter` Worker locally from the sibling `sho5-script` repo (`wrangler dev --local`) rather than relying on the production URL.

### photo-gallery-worker
- Run with `npx --yes wrangler@3 dev --local`. It binds R2 bucket `PHOTOS` (`sho5-gallery-photos`); `--local` simulates R2 (empty unless populated). There is no committed `package.json` here.

### scripts/
- `node scripts/update-results-data.js` fetches Yahoo data into `data/results.json` (network only).
- `npm run filter-youtube` needs `YOUTUBE_API_KEY`.
- `create-top-images.js` / `optimize-top-images.js` are currently broken (import a missing `../photo-gallery-worker/scripts/utils/image-utils.js`) and also expect image tooling; avoid relying on them.

### Tests / lint
- No automated tests and no linter are configured in this repo.
