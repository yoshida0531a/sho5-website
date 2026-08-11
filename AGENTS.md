# AGENTS.md

## Cursor Cloud specific instructions

This repo is the **static fan site** for 谷端将伍 (deployed to GitHub Pages at `sho5.org`). There is no build, bundler, lint, or test step for the site itself — it is plain HTML/CSS/JS.

### Running the site (development)
- Serve over HTTP from the repo root, e.g. `python3 -m http.server 8000`, then open `http://localhost:8000/index.html`.
- Pages load committed data via client-side `fetch` (`x-data.txt`, `YouTube-data.txt`, `bsky-data.txt`, `data/results.json`, `data/sho5-meter-messages.json`). You **must** serve over HTTP — opening files via `file://` breaks `fetch` and the pages render empty.

### Pages that depend on remote Workers (gotcha)
- `photo.html` and `sho5-meter.html` call live `https://*.chjqnfv62h.workers.dev` endpoints. They work when online and fail gracefully otherwise.
- The Sho5 Meter tap button POSTs to the **production** counter Worker. Do not click it in tests/demos — it mutates real production data. The page's initial GET (read) is safe.

### photo-gallery-worker (in-repo Cloudflare Worker)
- Located in `photo-gallery-worker/`. It has **no `package.json`** but commits `node_modules/` and seeded local Miniflare R2/KV state under `.wrangler/` (gitignored copies aside, sample photo blobs are present).
- Run locally with `npx wrangler@3 dev --local` (wrangler is not on `node_modules/.bin`, so use `npx`). `/api/photos` returns the seeded sample photos fully offline.

### Optional maintenance scripts (`scripts/`)
- Run via `npm run create-top-images` / `optimize-top-images` / `filter-youtube`. These need extra deps not in `package.json` (`sharp`) and/or a `YOUTUBE_API_KEY`; they are not part of normal local dev.
