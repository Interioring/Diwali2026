# Diwali 2026 — Compile Your Light

## Product Requirements Document (PRD)

**Campaign:** Diwali 2026
**Brand:** Interioring
**Tagline:** *Make your lives and homes brighter with Interioring.*
**Document status:** Build-ready MVP requirements

> Naming note: earlier drafts called the product "Diwali.exe". The product name is **Diwali 2026**.

---

## 1. Product vision

Build a lightweight, delightful, AI-powered Diwali greeting experience that lets people send a personalized festive greeting to friends, family, colleagues, and customers.

The experience should feel like a small digital celebration—not a conventional greeting card. Each recipient gets a beautifully animated diya and rangoli, a personalized message, and a short video they can download and post as their WhatsApp Status or Instagram Story.

The experience should also introduce Interioring in a subtle, tasteful way through a small maker's mark and a closing message:

> **Happy Diwali 2026**
> May your lives and homes shine brighter.
> **Interioring**

The primary goal is to create something people genuinely enjoy and want to share.

## 2. Product principles

- **Delight first:** The greeting should be beautiful and enjoyable before it promotes anything.
- **Personal, not generic:** Each greeting should include the recipient's name and an optional personal wish.
- **Shareable by default:** Sharing and downloading should be obvious and frictionless.
- **Lightweight:** Prefer browser-native capabilities and Cloudflare's platform over a heavyweight application architecture.
- **Subtle branding:** Interioring should be visible, but never overpower the greeting.
- **Fast:** The experience should load quickly on mobile networks and work well on modern mobile browsers.

## 3. Target users and primary journey

### Sender journey

1. Open the Diwali 2026 website.
2. Enter the recipient's name.
3. Optionally add a personal message or choose an AI-suggested wish.
4. Generate the personalized greeting.
5. Preview the animated greeting.
6. Download the video or share the greeting link directly.

### Recipient journey

1. Open the shared link or receive the downloaded video.
2. See a festive animation personalized with their name.
3. Enjoy the greeting and Interioring's subtle closing signature.
4. Optionally create their own greeting and share it with others.

The recipient should be able to create a greeting without signing in.

## 4. Functional requirements

### 4.1 Landing page

- Present the campaign as **Diwali 2026 — Compile Your Light**.
- Use a visually rich but lightweight Diwali-inspired design.
- Explain the experience in one short line: create a personalized Diwali greeting and share it as a video.
- Provide a prominent **Create your greeting** action.
- Include subtle Interioring branding.
- Be responsive, with mobile as the primary design target.

### 4.2 Greeting creation

Provide a simple form with:

- Recipient name — required.
- Personal message — optional.
- Wish style — optional, with a sensible default.

Suggested wish styles:

- Warm and traditional
- Short and cheerful
- Family and togetherness
- Light, playful, and tech-inspired

Requirements:

- Show a live preview where practical.
- Validate input and handle long names or messages gracefully.
- Provide a clear generate action and a useful loading state.
- Allow the user to edit details and regenerate.

### 4.3 AI-generated wishes

Use the **Anthropic Claude API** to generate short, warm, festive wishes when the sender does not provide a message or asks for a suggestion.

Requirements:

- Keep generated wishes concise and suitable for a greeting video.
- Avoid religious, political, or culturally insensitive assumptions.
- Do not require AI generation for the core experience; provide curated fallback wishes if the API is unavailable.
- Call Claude from a Cloudflare Worker. Never expose the API key in browser code.
- Apply input limits, request validation, and basic rate limiting.
- Cache or reuse suitable generated content where appropriate to control cost.

**Important:** The visual rangoli and diya should be generated procedurally in the browser, not by calling an image-generation API for every greeting. This keeps the experience fast, deterministic, and inexpensive.

### 4.4 Animated greeting experience

Create a polished animation with a suggested duration of **10–15 seconds**.

Suggested sequence:

1. **Opening:** A dark, elegant festive background appears.
2. **Lighting:** A diya gradually illuminates, creating a warm glow.
3. **Rangoli:** A colorful geometric or floral rangoli forms around the diya.
4. **Personalization:** The recipient's name appears with the personalized wish.
5. **Closing:** The greeting transitions to the campaign sign-off:
   - Happy Diwali 2026
   - May your lives and homes shine brighter.
   - Interioring logo or wordmark, presented discreetly.

Visual direction:

- Premium, contemporary Indian festive aesthetic.
- Rich colors, warm light, elegant motion, and tasteful details.
- Avoid clutter, excessive glitter, or a template-like look.
- Use smooth transitions and restrained sound only if sound is explicitly enabled.
- Ensure text remains readable on mobile screens.

### 4.5 Greeting link and recipient page

- Generate a unique, shareable URL for each saved greeting.
- The URL should open a recipient-facing greeting page.
- Display the personalized greeting without requiring authentication.
- Include actions to **Create your own greeting**, **Download video**, and **Share**.
- Use an unguessable identifier for public greeting URLs.
- Store only the data required to render the greeting.
- Add appropriate metadata and a social preview image so shared links look good in messaging and social apps.

### 4.6 Video export and download

This is a core feature, not a later enhancement.

Users must be able to download a video suitable for WhatsApp Status and Instagram Stories.

Requirements:

- Export a vertical **9:16** video.
- Target resolution: **1080 × 1920** where device/browser performance permits.
- Target duration: **10–15 seconds**.
- Prefer **MP4** output with broad playback compatibility.
- Keep the file size practical for mobile sharing.
- Include the recipient's name, wish, animation, and Interioring closing signature in the exported video.
- Ensure the exported video visually matches the on-screen greeting.
- Provide a visible export progress state and a retry path if export fails.
- Offer a fallback where direct MP4 export is unsupported: provide the shareable greeting link and explain the alternative.

Implementation guidance:

- Build the animation from reusable HTML Canvas or SVG drawing and animation primitives.
- Investigate browser-native recording/export options such as `canvas.captureStream()` with `MediaRecorder`.
- Check actual browser codec support at runtime; do not assume MP4 recording is available everywhere.
- If reliable MP4 encoding cannot be performed in-browser, evaluate a Cloudflare-compatible rendering/encoding approach before adding infrastructure.
- Do not silently deliver a WebM file while labeling it MP4.

### 4.7 Sharing

Provide clear sharing actions:

- **Share on WhatsApp:** Use the native WhatsApp share URL with a short message and the greeting URL.
- **Share:** Use the Web Share API where supported.
- **Copy link:** Copy the unique greeting URL with visible success feedback.
- **Download video:** Download the generated video to the device.
- **Instagram:** Instagram Stories generally does not support arbitrary website-driven posting. Provide a clear **Download for Instagram Story** action and concise instructions to upload the saved video in Instagram. Use native sharing only where the device/browser supports it.

Suggested share text:

> I made a little Diwali surprise for you! ✨
> Open your personalized greeting: [link]
> Happy Diwali!

### 4.8 Interioring branding

Interioring should be part of the experience without making it feel like an advertisement.

Required brand treatment:

- A small **Made with Interioring** or **Powered by Interioring** maker's mark.
- The mark should appear discreetly in the video and greeting page.
- Closing message: **May your lives and homes shine brighter.** **Interioring**

Use the official Interioring logo and brand assets supplied by the team. Do not recreate or approximate the logo if the official asset is available.

## 5. Technical architecture

### 5.1 Architecture goals

- Cloudflare-native deployment.
- Minimal operational overhead.
- Low hosting cost for a short-lived campaign.
- Fast global delivery.
- No heavyweight server framework unless a concrete requirement justifies it.

### 5.2 Proposed stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript | Greeting creation, preview, recipient page |
| Styling | Tailwind CSS | Responsive UI and visual system |
| Animation | Canvas and/or SVG; CSS animations | Procedural diya, rangoli, transitions |
| Hosting | Cloudflare Pages | Static frontend hosting |
| API | Cloudflare Workers | Greeting APIs, Claude calls, validation, rate limiting |
| Database | Cloudflare D1 (SQLite) | Greeting metadata and persisted wishes |
| Object storage | Cloudflare R2 | Generated video or preview assets, if persistence is needed |
| AI | Anthropic Claude API | Optional personalized wish generation |
| Data access | Drizzle ORM (optional) | Typed database access and migrations |
| Analytics | Cloudflare Web Analytics or a lightweight privacy-conscious analytics tool | Usage and campaign measurement |

**Keep the architecture lean.** D1 is the proposed database; it is not necessary to introduce a separate database server. Use R2 only when generated assets need to be stored or served later. Do not store every generated video by default if it can be created on demand.

### 5.3 High-level request flow

1. The browser loads the React application from Cloudflare Pages.
2. The sender enters the recipient's details.
3. The browser requests a wish from a Cloudflare Worker only when AI assistance is needed.
4. The Worker validates the request and calls Claude using a server-side secret.
5. The browser renders the personalized diya and rangoli animation.
6. The app saves the greeting metadata through the Worker to D1 when a persistent share link is requested.
7. The recipient opens the unique URL and the app loads the greeting data from the Worker/D1.
8. The browser renders the greeting and exports the video where supported.
9. The user downloads or shares the video/link.

### 5.4 Data model

A minimal `greetings` table may include:

| Field | Suggested type | Notes |
| --- | --- | --- |
| id | TEXT | Random, unguessable public identifier |
| recipient_name | TEXT | Required |
| message | TEXT | Final greeting text |
| style | TEXT | Selected wish style |
| created_at | INTEGER | Creation timestamp |
| expires_at | INTEGER, nullable | Optional campaign retention policy |

Do not collect sender email, phone number, address, or other personal information unless a later requirement makes it necessary.

### 5.5 API outline

Suggested Worker endpoints:

- `POST /api/wishes/generate` — generate a short wish using Claude.
- `POST /api/greetings` — validate and save a greeting.
- `GET /api/greetings/:id` — retrieve a greeting by public ID.
- `GET /api/health` — basic service health check.

Use request schemas, strict input length limits, safe error responses, and rate limiting. Keep secrets in Cloudflare Worker secrets, never in frontend environment variables that are exposed to the browser.

## 6. Non-functional requirements

### Performance

- Optimize for mobile-first use and average mobile network conditions.
- Keep the initial page lightweight.
- Lazy-load nonessential assets.
- Avoid large animation or UI libraries unless they provide clear value.
- Provide a reduced-motion experience for users who prefer it.

### Compatibility

- Test current Chrome on Android and Safari on iOS.
- Test desktop browsers as a secondary target.
- Feature-detect Web Share API, MediaRecorder, and supported codecs.
- Provide a graceful fallback when video export or native sharing is unavailable.

### Reliability

- The greeting page must still work if Claude is unavailable.
- Handle failed API calls, slow networks, and interrupted video exports.
- Never lose the user's entered details during a recoverable error.

### Security and privacy

- Keep Claude API credentials server-side.
- Validate and sanitize all user input.
- Rate-limit AI generation and greeting creation.
- Use unguessable public IDs.
- Avoid collecting unnecessary personal information.
- Define a short retention period for greeting records and stored media.
- Provide a simple way to report or remove an inappropriate greeting if public sharing is enabled.

### Accessibility

- Maintain readable contrast and text sizes.
- Provide meaningful labels for form controls.
- Support keyboard navigation.
- Respect reduced-motion preferences.
- Do not rely on color alone to communicate information.

## 7. Analytics and success metrics

Track the campaign funnel with privacy-conscious, aggregate analytics:

- Landing page visits.
- Greeting creation starts.
- Greeting generations completed.
- Shareable links created.
- Video exports started and completed.
- WhatsApp shares and link copies initiated.
- Recipient page visits.
- Recipient-to-new-greeting conversion.

Primary success metric:

**Number of greetings successfully shared**, measured through share-link creation, share actions, and recipient visits.

Secondary metrics:

- Video export completion rate.
- Percentage of recipients who create their own greeting.
- Total unique greeting recipients.
- Campaign traffic to Interioring.

Do not claim a share was completed when the app can only observe that a share action was initiated.

## 8. MVP scope and priorities

### P0 — Required for launch

- Mobile-first landing page.
- Recipient name and optional message input.
- Curated wishes with optional Claude-generated wishes.
- Procedural diya and rangoli animation.
- Personalized greeting page with unique shareable URL.
- WhatsApp sharing and copy-link action.
- Vertical video download flow with capability detection and fallback.
- Subtle Interioring branding and closing message.
- Cloudflare deployment.
- Basic analytics and error handling.

### P1 — If time permits

- Multiple rangoli themes or color palettes.
- Multiple wish styles.
- Sound toggle with an original or properly licensed sound.
- Social preview image for each greeting.
- Lightweight campaign-wide greeting counter or collective light display.
- Additional language options.

### Explicitly out of scope for the first release

- User accounts and login.
- Contact uploads or address-book access.
- A social feed or public gallery of greetings.
- Complex AI-generated images for every greeting.
- Heavy backend video-rendering infrastructure unless browser export proves insufficient.
- Paid features or subscriptions.

## 9. Testing and acceptance criteria

The MVP is ready to launch when all of the following are true:

1. A user can create a greeting with a recipient name without signing in.
2. A user can add a custom message or use a curated/AI-generated wish.
3. The greeting displays a polished diya and rangoli animation.
4. A greeting can be saved and opened through a unique URL on another device.
5. The recipient's name and message render correctly on the shared page.
6. WhatsApp sharing and copy-link work on supported devices.
7. A vertical video can be downloaded in a genuinely supported format, or a clear fallback is shown.
8. The exported video includes the complete greeting and discreet Interioring signature.
9. The closing message reads: **"May your lives and homes shine brighter. Interioring."**
10. The app remains usable when Claude is unavailable.
11. No API secrets are exposed in client-side code.
12. The core journey works on current Android Chrome and iOS Safari.
13. Basic analytics record the main funnel events without collecting unnecessary personal data.

## 10. Visual and creative direction

The product should feel like a crafted digital Diwali experience.

**Mood:** Warm, joyful, elegant, contemporary, distinctly Indian.

**Visual ingredients:**

- A deep, rich background.
- A glowing diya as the visual focal point.
- Rangoli patterns formed through geometric and floral motion.
- Warm golds, saffron, magenta, and complementary festive colors.
- Smooth, deliberate transitions.
- Strong typography and generous spacing.

Avoid:

- Generic stock greeting-card layouts.
- Excessive text.
- Loud or oversized advertising.
- Branding that competes with the recipient's greeting.
- Heavy 3D effects that hurt mobile performance.

## 11. Suggested build plan

1. **Foundation:** Set up React, Vite, TypeScript, Tailwind, Cloudflare Pages, and Worker development.
2. **Visual prototype:** Build the diya and rangoli animation with sample content before integrating AI or persistence.
3. **Personalization:** Add the greeting form, wish selection, and optional Claude integration.
4. **Persistence:** Add D1-backed greeting creation and unique share URLs.
5. **Export:** Implement vertical video capture, test codecs on real Android and iOS devices, and add fallbacks.
6. **Sharing:** Add WhatsApp, Web Share API, copy link, and Instagram download guidance.
7. **Polish and launch:** Add Interioring assets, analytics, performance checks, accessibility checks, and end-to-end testing.

---

## Final product statement

**Diwali 2026 — Compile Your Light** is a small, joyful experiment in combining code, AI, and design to make Diwali greetings more personal and more shareable.

Built with modern web technology. Powered by a little AI. Shared with the people who matter.

**May your lives and homes shine brighter. — Interioring**
