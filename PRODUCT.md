# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Pinned by the PRD (`docs/PRD.md` §5.2): React + Vite + TypeScript + Tailwind CSS. The frontend is served as Cloudflare Workers static assets (the successor to Pages), so one deploy ships the SPA and the API. A Cloudflare Worker serves `/api/*`, with D1 for greetings and R2 only if assets must persist. Animation is procedural Canvas/SVG drawn in the browser.

## Users

- **Senders.** Anyone in India who wants to send a Diwali greeting to friends, family, colleagues or customers, mostly on a phone and often on Diwali day itself. Their job is to make something personal in under a minute and send it on WhatsApp, or post it as a WhatsApp Status or Instagram Story.
- **Recipients.** People who open the link on their phone, usually inside WhatsApp's in-app browser. They watch a greeting made for them. Some go on to make one of their own without signing in, which turns them into senders.

## Product Purpose

The product is **Diwali 2026 — Compile Your Light**, a campaign by Interioring. A sender types a name and an optional wish (or picks one of ours). They get back a 10–15 s animation, made for that person, of a diya being lit and a rangoli forming. It comes with a link they can share and a 9:16 video they can download.

Success means greetings that actually get shared: links created, share actions started, and recipients visiting. Recipients who go on to make their own greeting are the growth loop.

## Positioning

The greeting is generated, not picked from a template. Each one is a procedural diya and rangoli composition rendered live for one named person, and it can be exported as video for Status or Stories. Interioring helps people make homes better, so the closing line "May your lives and homes shine brighter" is something the brand can honestly say.

## Operating Context

- **Launch deadline:** live **before Diwali, Sunday 8 Nov 2026**. The deadline is fixed, and the scope for the first release is cut to fit it.
- Usage peaks on the festival day. Expect mobile networks, mid-range Android phones on Chrome, iPhones on Safari, and WhatsApp's in-app browser.
- Distribution runs through WhatsApp forwards and Status, plus Instagram Stories. Instagram has no web-driven posting, so for Stories users download the video and upload it themselves.

## Capabilities and Constraints

- The full functional spec is in `docs/PRD.md`, with acceptance criteria in §9.
- **Release priority for the 8 Nov deadline** (confirmed): the greeting animation, the share link, and WhatsApp and copy-link sharing come first, then video export as fast as possible. P1 items wait.
- No AI and no API keys: wishes come from a curated list only. AI-written wishes were removed at the user's request on 7 Nov 2026.
- The exported video markets the site (the user's request, 7 Nov 2026), because it carries no link. The footer shows diwali2026.interioring.com through the film, and the closing says "Make a video like this for your family, friends or customers / Free at diwali2026.interioring.com". On the page, the button does that job (the user's choice after the 7 Nov review).
- The end frame is gift-first: the name, the wish and "With love, …" stay to the end, with the brand lines smaller below (the user's choice after the 7 Nov review).
- Video export must detect codec support at runtime. Never label WebM as MP4. If export isn't possible, fall back to the share link.
- No accounts. The only sender data is an optional "From" name the sender chooses to sign with ("With love, …"), added at the user's request on 7 Nov 2026. Never collect email, phone or contacts. Public IDs must be unguessable, with short retention (45 days) and a way to report or remove a greeting.
- Video must play inside WhatsApp's in-app browser and on iOS Safari.

## Brand Commitments

- **Interioring** is an India-focused interiors platform: a marketplace, CRM, ERP and design platform. The public site (https://www.interioring.com) describes it as "Compare verified interior designers across India. See real projects and get free quotes." The site's sections are Projects, Designers, Rooms and Cities.
- **Official identity assets** were taken from interioring.com on 7 Nov 2026:
  - `assets/brand/interioring-mark.svg` is the house mark (the site's `favicon.svg`): an outline of a house with a dot inside, drawn in a single colour.
  - The wordmark is the word "Interioring" set in Anek Latin Variable at weight 760, width 112%, with tight tracking, placed to the right of the mark. The font file is `assets/brand/anek-latin-variable.woff2` (Anek Latin is licensed under OFL). Use these assets as they are. Don't redraw, approximate or restyle the mark.
- **Required copy** (exact):
  - Closing frame: "Happy Diwali 2026" / "May your lives and homes shine brighter." / "Interioring".
  - Maker's mark: "Made with love by Interioring" (the user's wording, 7 Nov 2026; it replaces the PRD's "Made with Interioring"), kept discreet.
  - Campaign title: "Diwali 2026 — Compile Your Light". Never "Diwali.exe".
- Branding is subtle and never competes with the recipient's greeting. The maker's mark links to https://www.interioring.com.

## Evidence on Hand

- The PRD (`docs/PRD.md`) and the official mark and wordmark font (`assets/brand/`).
- There are no testimonials, usage numbers or partner claims, so don't fabricate a greeting counter, "X greetings sent", or any such social proof. A counter is a P1 item and may only show real D1 counts.
- There is no licensed audio. Sound is P1 and needs an original or properly licensed track.

## Product Principles

1. **The greeting is the gift.** Every decision serves the moment the recipient sees their own name lit up. Creating it and branding it come second.
2. **A minute from intent to send.** One required field. Everything else is optional or has a sensible default.
3. **Honest capability.** Feature-detect, then degrade clearly: a share link when video can't be made, and "share initiated" rather than "shared".
4. **Light on the wire.** It has to be fast on Diwali-night mobile networks and in WhatsApp's in-app browser. Procedural visuals are used instead of downloaded imagery.
5. **Inclusive by default.** Wishes don't assume a religion or politics, which suits a greeting sent to colleagues and customers.

## Accessibility & Inclusion

- Respect `prefers-reduced-motion`: show a still or minimal-motion greeting with the same content.
- Text in the greeting must stay readable on small phone screens and in compressed Status video.
- Labelled form controls, full keyboard operation, and never using colour alone to carry meaning (PRD §6).
