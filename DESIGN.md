---
name: Diwali 2026 — Compile Your Light
description: A kolam drawn at the recipient's threshold and lit with diyas for their name.
colors:
  oxide-950: "#140703"
  oxide-900: "#1c0a06"
  oxide-800: "#2b110a"
  oxide-700: "#3d1810"
  oxide-500: "#86341f"
  powder: "#f4efe4"
  ink: "#f3ece0"
  ink-dim: "#d9c8b6"
  ink-faint: "#a8907c"
  gold: "#ffc95c"
  gold-deep: "#f0a93a"
  rani: "#e2457f"
  turmeric: "#f4a930"
  leaf: "#43a86c"
  alert: "#ff9a7a"
typography:
  display:
    fontFamily: "Eczar, Georgia, serif"
    fontSize: "2.6rem"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Eczar, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 600
    lineHeight: 1.4
  field:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 500
    lineHeight: 1.25
  body:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "1.04rem"
    fontWeight: 400
    lineHeight: 1.375
  label:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.375
  numeral:
    fontFamily: "Eczar, Georgia, serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1
  wordmark:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontWeight: 760
    letterSpacing: "-0.025em"
    fontVariation: "\"wdth\" 112"
rounded:
  full: "9999px"
  action: "1rem"
spacing:
  inset: "24px"
  inset-tight: "20px"
  step-gap: "36px"
  control-gap: "8px"
  column: "30rem"
  column-wide: "34rem"
components:
  button-flame:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.oxide-900}"
    rounded: "{rounded.full}"
    padding: "0 28px"
    height: "56px"
  button-powder:
    backgroundColor: "{colors.oxide-900}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "48px"
  button-powder-hover:
    backgroundColor: "{colors.oxide-700}"
    textColor: "{colors.powder}"
  button-quiet:
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "44px"
  chip-style:
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "40px"
  chip-style-selected:
    backgroundColor: "{colors.powder}"
    textColor: "{colors.oxide-900}"
  field-powder-edge:
    textColor: "{colors.powder}"
    typography: "{typography.field}"
    padding: "0 0 8px"
  step-number:
    textColor: "{colors.ink-dim}"
    typography: "{typography.numeral}"
    rounded: "{rounded.full}"
    size: "28px"
  step-number-active:
    textColor: "{colors.gold}"
  share-action:
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.action}"
    height: "64px"
  share-action-hover:
    backgroundColor: "{colors.oxide-700}"
    textColor: "{colors.powder}"
  maker-mark:
    textColor: "{colors.ink-faint}"
  toast:
    backgroundColor: "{colors.powder}"
    textColor: "{colors.oxide-900}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
---

# Design System: Diwali 2026 — Compile Your Light

## Overview

**Creative North Star: "The Threshold Kolam"**

Every screen is a polished red-oxide threshold floor at night. On it, one continuous rice-powder line weaves a pulli dot grid, powder petals bloom at the dots, and clay diyas light the floor with computed light. The greeting is the gift: the recipient's name is the brightest thing in the world, and every control steps back into the floor as powder rather than sitting on it as a card.

The world is drawn, not decorated. One canvas renderer, on a 1080×1920 logical frame driven by a single 14-second timeline, produces the live preview, the replay and the exported MP4. So whatever the page shows is what gets sent. States draw themselves: export progress is a dotted powder line filling with gold, and failures are short margin notes in alert coral, never modals or spinners. Numerals teach the three steps (name, wish, from).

Density is low and the type is large. The page is a single narrow column on a full-bleed floor. Ornament comes only from the world's own materials (powder, petals, clay, flame); the build ships no maroon-and-gold mandala, no clip-art diya, no bokeh sparkle and no CSS halos.

**Key Characteristics:**
- Full-bleed, dark red-oxide floor, lit by a multiply light map.
- One continuous rice-powder kolam line on a pulli grid, with rani, turmeric and leaf powder petals.
- Flame gold reserved for lit things.
- Eczar for lettering, Anek Latin (Interioring's face) for UI.
- Controls drawn with powder edges and powder rings, never cards.
- One timeline for preview, replay, video and the synthesised score.

## Colors

A night palette of red-oxide grounds and warm off-white powder, with a single flame gold and three powder pigments that appear only in the kolam.

### Primary
- **Flame Gold** (gold): Lit things only. It is used for the diya flames, the recipient's name in the greeting, the one active (flame) action on a screen, the active step numeral, the focused field's dots, focus outlines, the caret, text selection, and the export progress dots and percentage. **Deep Flame** (gold-deep) is its defined companion tone. In the build it exists only as a token and the flame gradients are written inline, so treat it as reserved.

### Secondary
- **Rani Pink** (rani), **Turmeric** (turmeric), **Leaf Green** (leaf): The three powder-petal pigments, laid at the kolam's dots by the renderer. They are pigments of the drawing, not UI colours.

### Neutral
- **Rice Powder** (powder): The kolam line, headings (h1 "Compile your light"), field values, the sender's name, "Happy Diwali 2026", the closing lockup, and the selected chip and toast fills.
- **Lamp-lit Ink** (ink): Default text and the wish in the greeting.
- **Dusk Ink** (ink-dim): Secondary copy, the "With love," prefix, quiet buttons, and resting share-action labels.
- **Ash Ink** (ink-faint): The maker's mark, the privacy note, and placeholders (at full strength, not faded).
- **Night Oxide** (oxide-900): The root background, and the text colour on gold and powder fills. **Oxide 700** is the hover wash on powder controls and share actions. **Red Oxide** (oxide-500, rgb 134 52 33) is the floor's base pigment in the canvas. Oxide 950 and 800 complete the defined ramp.
- **Alert Coral** (alert): Inline error notes and the invalid field's dots. It always comes with text, never colour alone.

### Named Rules
**The Lit Things Rule.** Gold marks only what is lit: flames, the recipient's name, and the single active control. A screen never shows two flame buttons, and a selected chip is powder, not gold.

**The Pigment Rule.** Rani, turmeric and leaf live in the kolam's petals. They never fill buttons, text or chrome.

**The Computed Light Rule.** Light on the floor comes from the renderer's multiply light map: lamp radial gradients, a doorway spill from below, and a closing boost. DOM elements never fake glow with CSS halos.

## Typography

**Display Font:** Eczar (with Georgia, serif). Self-hosted Latin, Latin-ext and Devanagari subsets, weights 400–800.
**Body Font:** Anek Latin (with system-ui, sans-serif). Variable, weights 100–800, width 75–125%.
**Label/Mono Font:** none. Counters use tabular numerals in Anek Latin.

**Character:** Eczar's sharp, warm lettering writes the names and the festival line. Anek Latin, Interioring's own face, carries every control. Where the Interioring wordmark appears, it is set in the same face at 760 weight and 112% width.

### Hierarchy
- **Display** (Eczar 700, 2.6rem rising to 3.1rem at sm, line-height 0.98, -0.02em): the page h1 only, balanced.
- **Headline** (Eczar 700, 2rem): the h1 on the unavailable or missing-greeting state.
- **Title** (Anek 600, 1.02rem): step labels.
- **Field** (Anek 500, 1.35rem): name and sender inputs. The wish textarea is Anek 400 at 1.15rem with relaxed leading.
- **Body** (Anek 400, 1.04rem, snug): the intro line, capped near 30ch, pretty-wrapped.
- **Label** (Anek 400, 0.9rem, Dusk Ink): helper notes and counters. Share-action labels are 500 at 0.76rem, and the maker's mark is 0.82rem.
- **Canvas lettering (1080×1920 frame):** the name is Eczar 700, starting at 132px and shrinking to 76px within a 920px measure, in gold. The wish is Anek 420, 50 down to 36px, within 880px and at most 4 lines, with the rag balanced. "With love, <name>" is Anek, a 400 prefix plus a 650 name, at 42px (28px minimum). In the sign-off the gift block eases to a resting layout: the name at up to 100px (84px for two lines), the wish at up to 42px and "With love" at up to 38px, scaled down together (never below 70%) when a long name, a long wish and the brand lines would run past the frame. Below it, smaller: "Happy Diwali 2026" in Eczar 600 at 50px, the closing line in Anek 400 at 32px, and the lockup at 28px.

### Named Rules
**The Two Voices Rule.** Eczar writes names, festival lines and step numerals. Anek Latin writes everything you operate. Never set UI in Eczar or a greeting name in Anek.

## Layout

The floor is full-bleed and fixed behind the content. Content sits in one centred column (max 30rem on mobile, 34rem at md) with a 24px side inset (20px on the greeting's share sheet) and safe-area-aware top and bottom padding. On create, the header is followed by a reserved stage box (min(23rem, 46svh), or min(26rem, 48svh) at sm) where the canvas draws the kolam and the typed name. Below it are three numbered steps, 36px apart. The flame action is pinned in the thumb zone on mobile, over a fade to the night floor so the form dims out beneath it, and returns to the flow at md. The wish field grows with its text, so its powder edge sits under the last line. Until a name is typed the stage shows only the kolam (no ghost name). Focus rings follow each control's own shape (pills stay pills), and the scrolling chip row keeps room for them. The greeting page is a single 100dvh stage: music and replay controls sit in the top corners, and the share sheet rises in from the bottom once the greeting closes. Canvas composition is always in the 1080×1920 logical frame, scaled to fit, so the preview and the 9:16 video share a layout.

## Elevation & Depth

The world is lit, not layered. Depth comes from the canvas: a multiply light map over the oxide floor, and clay diyas with floor reflections and contact shadows. The DOM is flat. The only CSS shadows are a warm, diffuse glow under the flame button and a soft drop under the toast. Powder rings are drawn as inset 1.5px strokes, not lifts.

### Shadow Vocabulary
- **Flame glow** (`0 10px 30px -8px rgba(255,170,60,0.55), 0 2px 6px rgba(20,6,2,0.4)`): flame button only.
- **Toast drop** (`0 8px 24px -6px rgba(0,0,0,0.5)`): the transient powder toast.
- **Powder ring** (`inset 0 0 0 1.5px rgba(244,239,228,0.38)`): the stroke of powder buttons, unselected chips and resting step numerals. Its gold counterpart (`inset 0 0 0 1.5px` gold) marks the active numeral.

### Named Rules
**The Flat Floor Rule.** Nothing sits above the floor except the flame action and the toast. Panels, cards and frosted sheets are not part of this world.

## Shapes

Controls are pill-shaped (fully rounded). Step numerals are 28px powder circles. Share actions are soft 16px-radius tiles that appear only as a hover wash. Fields have no box at all: their only edge is a row of pulli dots along the bottom (1.3px dots on a 10px pitch, 55% powder). The dots turn gold on focus and coral when invalid. The kolam's line is a single closed, smoothed mirror curve through a square pulli grid, and the petals are four-lobed powder sprites.

## Components

### Buttons
- **Shape:** pill (9999px), Anek 600, with an active press scale of 0.98 and a 200ms ease-out.
- **Flame (primary):** gold fill, oxide-900 text, 56px min height, 28px side padding, 1.06rem, flame glow. Hovers to a lighter gold (#ffd47a). One per screen: "Light the greeting", "Send on WhatsApp", "Download video" or "Make one for someone".
- **Powder (secondary):** 35% oxide-900 wash, powder ring, ink text, 48px. Hovers to a 70% oxide-700 wash with powder text.
- **Quiet:** text only, ink-dim, 44px, underlined on hover.
- **Focus:** a 2px gold outline at a 3px offset, everywhere.

### Chips
- **Style:** wish-style radio pills, 40px, a powder ring with ink-dim text, scrolling horizontally past the gutter.
- **State:** selected is a solid powder fill with oxide-900 text, never gold.

### Inputs / Fields
- **Style:** a transparent field with a powder-dot bottom edge. Values are set in powder, and placeholders in ink-faint.
- **Focus:** the dots turn gold and become the focus indicator. The caret is gold.
- **Error:** the dots turn alert coral, with a role="alert" note below in alert coral.

### Navigation
There is no navigation bar. The greeting page carries two floating corner controls. "Play with music" is a powder-ring pill and becomes the quiet "Music off" once playing. "Replay" is quiet.

### Step Numbers
Eczar numerals in 28px powder rings. The current step turns gold. They teach the three-step order.

### Share Actions
A 4-column grid of 64px tiles: a 20px Lucide line icon (stroke 1.8) over an Anek 500 label, in ink-dim at rest and with an oxide-700 wash on hover. The labels are exact: "Download video", "WhatsApp", "Copy link", "Share", "Edit". Report asks inline, "Hide this greeting for everyone?" with Hide and Keep, before it acts, and steps aside while a video is being made or saved. The share sheet is `inert` until it appears. On greetings made with "Make one for someone else", a powder "Skip to send" button sits where the sheet will appear and jumps the film to 11.4 s; the first greeting always plays in full. Under the grid, the sender gets a powder button, "Make one for someone else", which opens the creator with the same wish and "From" name, an empty name field (focused) and a new kolam seed, so one person can send to many quickly.

### Export Progress
A powder dot line (1.4px dots on a 10px pitch at 28%) overdrawn by gold dots as the video renders, with a gold tabular percentage, "Drawing your video", and a quiet Cancel.

### Maker's Mark
The official Interioring house mark (the unaltered path from interioring.com/favicon.svg, filled with the current colour), followed by "Made with love by **Interioring**", with the wordmark set at 760 weight and 112% width. It is discreet: ink-faint at 0.82rem in the DOM, and 60% opacity at 27px at the foot of the canvas frame until the sign-off takes over. The closing lockup sets the mark with the wordmark "Interioring" in powder.

### Closing Invitation (video only)
In the exported video, an invitation sits under the lockup: "Send a personal Diwali greeting to your friends at" in Anek 400 at 28px, Dusk Ink, over "diwali2026.interioring.com" in Anek 650 at 34px, Rice Powder (12.45–13.55). A video on someone's Status carries no link, so the address is spelled out. The page leaves it out: its own "Make one for someone" button does that job.

### Greeting Canvas (signature)
A timeline in seconds. An ember strikes the first wick (0.15–0.95). The dots appear as the light reaches them (1.0–2.2). The powder line draws (1.9–6.3). Petals bloom with a colour ripple (5.5–7.1). Light runs along the kolam to each side lamp (6.55–7.6). A phuljhadi writes the name (7.7–9.1), then the wish arrives (8.9–10.0) and the optional "With love, <name>" (9.9–10.6). The closing is gift-first (11.7–12.8): the name, the wish and "With love" stay and ease together into their resting places, so nothing crosses anything else. Then "Happy Diwali 2026" and "May your lives and homes shine brighter." fade in below (from 12.15), then the Interioring lockup (from 12.3), and in the video the invitation (from 12.45). Total length is 14s. Reduced motion shows the still frame at 10.6s. An original synthesised score follows the same timeline: a tanpura drone, a bell on each ignition, a raag Bhupali bansuri phrase, santoor at the petals, sparkler crackle and a closing chord. It is opt-in on the page through "Play with music" and baked into the MP4.

## Do's and Don'ts

### Do:
- **Do** derive every greeting surface from the single renderer timeline, so the preview, the replay and the video stay identical.
- **Do** keep gold for lit things: flames, the recipient's name, one active control, and focus.
- **Do** draw field edges and progress as pulli-dot powder lines, and controls as powder rings.
- **Do** use the maker's mark copy exactly as "Made with love by Interioring", linked to https://www.interioring.com and kept discreet.
- **Do** use the official Interioring mark path as shipped in `src/greeting/brand.ts`, filled with one colour.
- **Do** label the export action "Download video" everywhere.
- **Do** treat the sender name as optional and render it as "With love, <name>", with a Dusk Ink prefix and the name in Rice Powder.
- **Do** keep music opt-in through "Play with music", and bake the same synthesised score into the MP4.
- **Do** report failures as short margin notes in Alert Coral with a working fallback (the share link).

### Don't:
- **Don't** redraw, approximate or restyle the Interioring mark.
- **Don't** use maroon grounds with gold mandalas, clip-art diyas, bokeh sparkle or any other e-card trope.
- **Don't** add CSS glows or halos to suggest light. Light belongs to the canvas light map.
- **Don't** put controls on cards, panels or frosted sheets.
- **Don't** use rani, turmeric or leaf outside the kolam petals.
- **Don't** show more than one flame button on a screen.
