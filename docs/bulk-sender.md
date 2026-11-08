# Bulk sender: personal Diwali videos to your contacts on WhatsApp

The bulk sender runs on your Mac. You go through your contacts one at a time in a small page (the **send desk**), and for everyone you choose it:

1. makes their personal greeting on diwali2026.interioring.com,
2. makes the 14-second video (the site's own exporter, music included),
3. uploads it to Cloudflare R2, so it has a public link: `https://diwali2026.interioring.com/v/<id>.mp4`,
4. sends the video with a message from **your own WhatsApp** (WhatsApp Web, in a Chrome window you can watch),
5. writes what happened into your contacts sheet and a sent log.

Phone numbers never leave your Mac: the site only receives names and wishes.

## One-time setup

- Node 24, Google Chrome, and `npm install` in this folder.
- `npx wrangler login` with the Interioring Cloudflare account (for uploading videos to R2).
- WhatsApp on your phone. The first run shows a QR code; scan it once (WhatsApp → Settings → Linked devices → Link a device). The sign-in is kept in `~/.diwali2026-whatsapp`.

## 1. Get your contacts into the sheet

Export your contacts as a CSV with a name column and a phone column, then convert it:

```bash
node scripts/import-contacts.mjs ~/Downloads/whatsapp-contacts.csv ~/Desktop/diwali-contacts.csv
```

The importer:

- puts the name as saved in your phone ("Sankar Bava Friend") in **internal name**, which is only for you and never sent anywhere;
- guesses how the video should greet them in **name** ("Sankar Bava"): the first name plus a family title (Mama, Uncle, Bava, Akka, Garu, Sir…), without workplace, town or class words;
- writes phones as `+91 98765 43210` so Excel and Google Sheets keep them as text;
- marks nobody ready.

Check the guessed names. Initials-only, place-only and business contacts are best skipped.

### The sheet's columns

| Column | Who fills it | What it is |
|---|---|---|
| internal name | you | Your own label. Never sent. |
| name | you | How the video greets them ("Hari annaya"), 40 characters at most. |
| phone | you | 10-digit Indian numbers get +91; include the country code for others. |
| wish | you | Shown in the film, 180 characters at most. Empty uses the default wish. |
| from | you / desk | "With love, …". Empty uses the sender name. |
| caption | desk | The exact WhatsApp message for this person. |
| status | both | `ready` queues a row; then `working`, `sent`, `not on whatsapp`, `video ready` (no number), `failed`, or `skipped`. |
| greeting_link, video_link | bot | The personal page and the public MP4. |
| sent_at, note | bot | When it was sent, or what went wrong. |
| ref | bot | Leave it alone: it ties the row to what was made and sent. |

## 2. Start the send desk

```bash
node scripts/send-desk.mjs --from "Srini 🎇Sujani 🎇 Srithejas 🎇 Sauryaram"
```

Then open **http://localhost:5300**. The desk reads `~/Desktop/diwali-contacts.csv` (pass another path as the first argument), starts the sender in the background, and opens WhatsApp Web in its own Chrome window. Leave that window open.

**Sending as** (top of the page) is the default "From" for everyone. It is remembered in that browser.

## 3. Go through your contacts

| Key | What it does |
|---|---|
| **S** | Send: opens the editor for this person |
| **K** | Skip |
| **⌘↵** | Queue the send (in the editor) |
| **Esc** | Back out of the editor |
| **←** / **→** | Previous contact / next contact still to decide |

In the editor you can change the **name in the video**, the **wish** ("Another wish" cycles the curated ones), **From**, and the **WhatsApp message**, with a preview of what they'll get. **Find a contact** jumps to anyone; **Undo skip** and **Take out of queue** undo a decision.

The side panel shows what is sending now, the queue, what you've done this session, and the sender's log. **For your groups** has a message to copy when you post a video in a WhatsApp group.

People without a usable WhatsApp number still get a video: their card has **Copy message + video link** so you can send it another way.

## What happens after you queue someone

- **Videos are made ahead**: one worker makes and uploads videos for everyone queued (up to 40 people ahead), while another sends finished ones in sheet order. Rendering never holds up sending.
- **Pacing**: about 5 seconds between messages, and a 2-minute break after every 30. No daily cap. (A send itself takes 10–15 seconds: opening the chat, attaching, uploading.)
- **Same video, shared**: people with the same greeting name, wish and From share one video. Each person still counts separately, so nobody gets it twice.
- **Confirmation**: a send is marked `sent` once WhatsApp shows it delivered. If WhatsApp never took the message (a pop-up closed the chat, say), it tries once more by itself.
- **Clean-up**: the local copy of a video is deleted once it's sent; the public link stays on R2 for 46 days.
- **Never twice**: what was sent is remembered in `bulk-out/bot-state.json`, so a re-run, a restart or a reverted sheet can't send the same person the same video again.

## Records

| Where | What |
|---|---|
| `~/Desktop/diwali-contacts.csv` | Every decision and outcome, saved as it happens |
| `bulk-out/sent-log.csv` | One line per outcome: time, result, both names, phone, wish, From, the exact WhatsApp text, links |
| `bulk-out/backups/` | A copy of the sheet from each time the desk starts |
| `bulk-out/errors/` | Screenshots when a WhatsApp step fails |
| `/stats` on the site | Visits, greetings, videos, shares, senders and feedback (needs the stats key) |

`bulk-out/` and contact CSVs are git-ignored and stay on your Mac.

## Stopping and resuming

Press **Ctrl+C** in the terminal running the desk. The sender finishes the message in progress first; press Ctrl+C again only to quit at once. Run the same command to carry on: queued people stay queued and half-done ones are resumed.

## When something goes wrong

| You see | What to do |
|---|---|
| "Scan the QR code" | WhatsApp Web signed out. Scan it again in the WhatsApp window. |
| `not on whatsapp` | WhatsApp says the number isn't on WhatsApp. Use **Copy message + video link** to send it another way. |
| `failed` with a screenshot | Look at the screenshot in `bulk-out/errors/`. Press **S** on the card (Try again) to retry. |
| "Three WhatsApp sends failed in a row" | The sender stopped on purpose: WhatsApp Web has probably changed. The selectors and the current hooks are documented at the top of `scripts/lib/whatsapp.mjs`. |
| Queue not moving | Check the sender log in the desk. Restart the desk if needed; nothing is lost. |

To test without sending anything: `node scripts/send-desk.mjs --no-send` (videos and links only), or `DIWALI_FAKE_WHATSAPP=1 node scripts/greeting-bot.mjs …` (a stand-in that pretends to send).

## Options

`scripts/send-desk.mjs` passes these on to the sender:

| Option | Default | Meaning |
|---|---|---|
| `--from "Name"` | none | Default "With love, …" (the page's Sending as box overrides it) |
| `--gap 4-6` | 4–6 s | Seconds between messages, picked at random |
| `--batch 30` / `--batch-pause 120` | 30 / 120 s | The break after every so many sends |
| `--daily-limit 0` | 0 (none) | Most sends per day |
| `--ahead 40` | 40 | How many people ahead videos are made |
| `--no-send` | off | Make videos and links only |
| `--port 5300` | 5300 | The desk's port |
| `--base URL` | live site | Use `http://localhost:5199` with `npm run dev` to test locally (local R2) |

Without the desk, `node scripts/greeting-bot.mjs contacts.csv --from "Name"` watches a sheet and sends every row whose status you set to `ready`.

## Be careful with

- **Your WhatsApp number.** Automated sending can get a personal number restricted, especially to people who haven't saved it. If WhatsApp shows a warning, slow down (`--gap 30-75 --batch 25`).
- **The WhatsApp session.** `~/.diwali2026-whatsapp` is a signed-in WhatsApp Web. When you're done, remove the "Chrome" device from WhatsApp → Settings → Linked devices on your phone, or delete that folder.
- **Message tags.** Links in the messages carry `utm_source` and `utm_sender` (your From name), which is how `/stats` credits visits to senders.
