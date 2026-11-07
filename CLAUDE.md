# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Diwali 2026 — Compile Your Light**: a campaign site for the brand **Interioring**. A sender enters a recipient's name and an optional wish. The app plays a procedural diya and rangoli animation for that greeting, saves a shareable link, and exports a vertical video for WhatsApp Status or Instagram Stories.

- The full requirements are in `docs/PRD.md`. Read it before starting a feature. Its §9 acceptance criteria define when the MVP is done.
- Naming: the product is "Diwali 2026". Earlier drafts called it "Diwali.exe", so don't bring that name back in copy or code.

## Status

This is a greenfield project with no code scaffolded yet. The build order comes from PRD §11: foundation, then the visual prototype, then personalization, persistence, export, sharing, and finally polish.

**Commands:** none exist yet. Once the scaffold is in place, replace this note with the real commands: dev (Vite and the Worker running together), build, lint, typecheck, tests (including running a single test), D1 migrations (local and remote), setting Worker secrets, and deploy.

## Planned architecture

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite + TypeScript + Tailwind, hosted on Cloudflare Pages |
| API | Cloudflare Worker at `/api/*` |
| DB | Cloudflare D1; Drizzle is optional |
| Storage | R2, but only if assets must be stored. Don't store every video by default. |
| AI | Anthropic Claude API, called only from the Worker |

Worker endpoints: `POST /api/wishes/generate`, `POST /api/greetings`, `GET /api/greetings/:id`, `GET /api/health`.

The `greetings` table holds only `id`, `recipient_name`, `message`, `style`, `created_at`, and `expires_at`. Collect no sender PII (no email, phone, or address).

### Cross-cutting design constraints

- **One renderer for preview and export.** The exported video must match what is shown on screen. Build the animation as one deterministic Canvas renderer. Its output should depend only on the greeting data and the time `t`. Both the live preview and the video exporter should use it, so don't build a separate export animation.
- **Procedural visuals only.** Draw the diya and rangoli in the browser. Don't call an image-generation API per greeting. Variations such as palette or pattern should be derived deterministically from greeting data, so a shared link looks the same on every device.
- **Video export must be honest.**
  - Output is 9:16 at 1080×1920 (where the device can manage it) and 10–15 s long.
  - Prefer MP4, and detect codec support at runtime with `MediaRecorder.isTypeSupported` (don't assume it). Never label a WebM file as `.mp4`.
  - If MP4 export is impossible, fall back to the share link with an explanation.
  - Show export progress and give a retry path.
  - Try in-browser options before adding any server-side encoding.
- **AI is optional.** The core journey must work with Claude down, so curated fallback wishes are required. Generation must be validated, length-limited, rate-limited, and cached where practical. Wishes must not assume a religion or politics.
- **Secrets stay in the Worker.** Keep the Anthropic key as a Worker secret. Vite inlines any `VITE_*` variable into the client bundle, so never put the key in one.
- **Social previews need server help.** Link-preview crawlers don't run JS, so the static SPA can't set per-greeting OG and meta tags on its own. The greeting route needs a Worker or Pages Function to inject them.
- **Public IDs must be unguessable.** Use random IDs, not sequential ones. There must also be a simple way to report or remove a greeting, and a short retention period.

### Product rules that are easy to get wrong

- The closing copy must read exactly as follows (acceptance criterion 9):
  > Happy Diwali 2026 / May your lives and homes shine brighter. / Interioring
- Branding stays subtle: a small "Made with Interioring" mark, plus the sign-off. Use the official Interioring logo and assets supplied by the team. Don't recreate or approximate the logo; ask for the assets if they aren't in the repo.
- Instagram has no web-driven Story posting. Provide "Download for Instagram Story" with instructions, and use the Web Share API only where it's supported. WhatsApp sharing uses its native share URL with the share text from PRD §4.7.
- Analytics count aggregate events only, with no PII. Record share actions as "initiated", never "completed".
- Respect `prefers-reduced-motion`. Mobile is the primary target: test on current Android Chrome and iOS Safari.
- Out of scope for v1: accounts or login, contact access, a public gallery or feed, per-greeting AI images, paid features, and heavy backend rendering.
