# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Diwali 2026 — Compile Your Light**: a campaign site for the brand **Interioring**. A sender types a recipient's name, an optional wish, and optionally their own name. The app plays a 14-second procedural kolam and diya animation for that greeting, saves a shareable link (`/g/:id`), and exports a 9:16 MP4 for WhatsApp Status or Instagram Stories.

- Requirements are in `docs/PRD.md`, with acceptance criteria in §9. Product facts and brand commitments are in `PRODUCT.md`.
- The visual direction contract is in `.impeccable/surfaces/index-html.md`. The world is "Threshold Kolam": a red-oxide floor at night, one continuous rice-powder kolam line, clay diyas whose light is computed, and flame gold used only for lit things. Read it before changing anything visual. `DESIGN.md`, when present, records the built system.
- Naming: the product is "Diwali 2026". Earlier drafts called it "Diwali.exe", so don't bring that name back in copy or code.

## Commands

```bash
npm run dev                  # Vite + the Worker together (Cloudflare Vite plugin), with local D1
npm run typecheck            # tsc -b over the app, worker, and node/test projects
npm test                     # vitest, unit tests in tests/
npx vitest run tests/kolam.test.ts -t "deterministic"   # a single test
npm run build                # typecheck + production build to dist/
npm run db:migrate:local     # apply migrations/ to the local D1 (run once before dev)
npm run db:migrate:remote    # apply migrations to the production D1
npm run deploy               # build + wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY   # the AI wish key: a Worker secret, never a VITE_ var
node scripts/capture.mjs <baseUrl> <outDir>  # review screenshots; reads a SHOTS JSON env var (see the file)
node scripts/og-image.mjs [baseUrl]          # regenerate public/og.png using the real renderer (dev server must be running)
```

`vitest.config.ts` is deliberately separate from `vite.config.ts`. The Cloudflare plugin would otherwise boot workerd for the unit tests.

Production: the Worker `diwali2026` serves https://diwali2026.interioring.com (a custom domain on the interioring.com zone) and the workers.dev subdomain, with the D1 database `diwali2026` (id in `wrangler.jsonc`). To ship a change: `npm run db:migrate:remote` if `migrations/` changed, then `npm run deploy`. Hosting uses Workers with static assets, the current successor to Pages, so one `wrangler deploy` ships the SPA and the API together.

## Architecture

- **`shared/`** holds code imported by both the browser and the Worker: input limits, wish styles, validation (`validateGreetingInput`), and the curated wishes. Validation rules live here once.
- **`worker/index.ts`** is the whole backend. It serves `/api/health`, `POST /api/greetings`, `GET /api/greetings/:id`, `POST /api/greetings/:id/report` (hides a greeting immediately), `POST /api/wishes/generate`, and `POST /api/events`.
  - It also intercepts `GET /g/:id` (`run_worker_first`) and uses HTMLRewriter to inject per-greeting OG and title tags, because link-preview crawlers don't run JS. Everything else falls through to the SPA assets.
  - Rate limits use the `RL_GREETINGS` and `RL_WISHES` bindings.
  - Claude is called through `@anthropic-ai/sdk` with structured JSON output and `fallbacks: "default"`. Generated wishes are cached per style in D1 (`wish_cache`, 6 hours) and never contain the recipient's name. With no key, or on any error, the curated list is returned.
- **D1 schema** is in `migrations/`. `greetings` holds the public id (12-char base62 with rejection sampling), the recipient name, the optional `sender_name`, the message, the style, the `seed`, `created_at`, `expires_at` (45 days), and `reported_at`. `event_counts` holds per-day aggregate funnel counts with no identifiers. Add schema changes as new numbered migrations.
- **`src/greeting/renderer.ts`** is the single source of every frame. `GreetingRenderer.draw(t)` is a pure function of the scene data (name, sender, wish, seed) and the time.
  - The live creator preview (`stage` mode), the greeting player (`play` mode) and the MP4 exporter all call it, so they cannot drift apart. Never add a separate export-only animation.
  - The timeline lives in the `T` table: ember strike, then camera pull-back, kolam line, petal ripple, light running out to the side diyas, sparkler-written name, wish, sender line, and closing.
  - Particles (embers, sparks) are scheduled by index and seeded, never by `Math.random()`, so exported frames are deterministic.
  - Lighting works like this: the scene is drawn "fully lit", multiplied by a quarter-resolution light map, then flames and glows are added on top.
- **`src/greeting/kolam.ts`** generates the kolam as a mirror curve. Dots sit on an n×n grid, and the line bounces off the border and off mirrors with four-fold rotational symmetry. That symmetry, not mirror symmetry, is what lets a single unbroken loop exist. The seed is stored per greeting, so every device draws the same kolam.
- **`src/components/SceneCanvas.tsx`** owns the canvas lifecycle. A `?t=<seconds>` query freezes a single frame, which the review captures and the OG script rely on. Resizing clears the canvas, so it repaints the last frame.
- **`src/audio/music.ts`** is an original score, synthesised with an `OfflineAudioContext` and keyed to the renderer's timeline: a tanpura drone, a raag Bhupali bansuri phrase, bells as the lamps catch, sparkler crackle, and a closing chord. It is deterministic, with no `Math.random()`. On the page it plays only after the viewer taps "Play with music"; Safari unlocks audio only when `MusicPlayer.unlock()` runs inside the tap, before any await. The exporter muxes the same buffer into the MP4 as AAC when `AudioEncoder` supports it, and otherwise reports `withMusic: false` so the UI says the video is silent.
- **`src/export/exportVideo.ts`** encodes frame by frame with WebCodecs H.264 and `mp4-muxer`, faster than real time. It falls back to MediaRecorder only when that can produce real MP4, and throws otherwise so the UI can offer the link instead. It never returns WebM labelled as MP4.
- **Routing** is a tiny pushState router (`src/lib/router.ts`): `/` is the creator and `/g/:id` is the greeting. After creating, the greeting is passed through `history.state`, so the first view doesn't wait on a fetch. Sender versus recipient actions come from `localStorage` (`src/lib/mine.ts`).

## Rules that are easy to get wrong

- The closing copy must read exactly: "Happy Diwali 2026 / May your lives and homes shine brighter. / Interioring" (acceptance criterion 9).
- The maker's mark reads "Made with love by Interioring" (the user's wording, which overrides the PRD). The Interioring mark (`src/greeting/brand.ts`, `assets/brand/interioring-mark.svg`) is the official path from interioring.com, and the wordmark is Anek Latin at weight 760, width 112%. Don't redraw, restyle or recolour the mark beyond a single fill.
- Flame gold (`--color-gold`, `#ffc95c`) is reserved for lit things: flames, the recipient's name and the one active control.
- The sender name is optional and shown only as "With love, …". Collect no other sender data (no email, phone or contacts).
- Analytics are aggregate per-day counts. Record shares as "initiated", never "completed".
- Respect `prefers-reduced-motion`: the player shows still frames (`STILL_FRAME`, then the closing).
- Out of scope for v1: accounts, contact access, a public gallery, per-greeting AI images, paid features, and server-side video rendering.
