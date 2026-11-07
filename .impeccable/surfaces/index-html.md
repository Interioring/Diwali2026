---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/greeting/renderer.ts"]
---

# Surface: Diwali 2026 greeting app (create → greeting → share)

Scope: `/` (create), `/g/:id` (greeting + share), and the 1080×1920 greeting renderer that drives both preview and video export. Visitor mode: **Experience**. The greeting leads from the first viewport.

Audience and job: senders on phones on Diwali day make a greeting for one person in under a minute and send it on WhatsApp or post it as a Status or Story. Recipients watch the greeting with their name, then make one of their own. User-flagged failures: a template e-card look, reading like an ad, too techy and not festive, over-decorated.

Unresolved: per-greeting OG image (P1), sound (P1).

## Direction contract

THESIS: Each greeting is a kolam drawn at the recipient's threshold and lit with diyas for their name. It refuses the e-card: maroon ground, gold mandala, clip-art diya, bokeh sparkle.

OWN-WORLD:
- The ground is a polished red-oxide threshold floor at night.
- The kolam is one continuous rice-powder line weaving a pulli dot grid, with turmeric, kumkum and leaf-green powder petals at the dots.
- Clay diyas give computed light: a multiply light map warms whatever it reaches, with no CSS halos.
- Flame gold is reserved for lit things: flames, the recipient's name and the active control.
- Eczar sets the lettering. Anek Latin (Interioring's face) sets the UI.
- Controls are powder-edged, not cards.

STORY: The sender learns in one line that this makes a personal Diwali greeting. They type a name and watch the preview answer, then light it. They send on WhatsApp or save the Status video. The recipient sees their name lit, then makes their own.

FIRST VIEWPORT: Mobile, 390×844.
- The floor is full-bleed.
- H1 "Compile your light" in Eczar at about 44px, top-left at a 24px inset, followed by one line of copy.
- A roughly 320px kolam preview draws itself around a lit centre diya, with the typed name in gold beneath it.
- Step 1 (name) sits directly below the preview.
- The "Light the greeting" action is pinned in the thumb zone.

FORM: Threshold Kolam, #1 of seven grounded candidates, taken as the pick. Seed 21e24026. Carried disciplines: one timeline renders the preview, the replay and the video; states draw themselves, so export progress is a powder line and a failure is a margin note; numerals teach the three steps.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
