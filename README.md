<div align="center">

<img src="assets/banner.svg" alt="Grow Calendar — your season, planned" width="100%" />

<br />

<img src="https://readme-typing-svg.demolab.com?font=Georgia&size=22&color=16a34a&center=true&vCenter=true&width=720&height=46&duration=4000&pause=1200&lines=Your+grow+plan%2C+anywhere+you+are.;Phase-aware+daily+tasks+from+sprout+to+harvest.;An+AI+assistant+that+knows+your+exact+grow." alt="rotating tagline" />

<br /><br />

![Stack](https://img.shields.io/badge/react+vite+workers-db2777?style=for-the-badge&logo=react&logoColor=fff&labelColor=0e1a12)
![Hosting](https://img.shields.io/badge/cloudflare-ea580c?style=for-the-badge&logo=cloudflare&logoColor=fff&labelColor=0e1a12)
![PWA](https://img.shields.io/badge/PWA-offline%20ready-16a34a?style=for-the-badge&labelColor=0e1a12)
![AI](https://img.shields.io/badge/AI-Claude%20powered-7c3aed?style=for-the-badge&labelColor=0e1a12)
![License](https://img.shields.io/badge/license-MIT-d97706?style=for-the-badge&labelColor=0e1a12)

</div>

<img src="assets/divider.svg" alt="" width="100%" />

## What it is

**Grow Calendar** is a full-featured grow management PWA built for outdoor and indoor cannabis growers. It gives you a living season plan — phase-aware task lists, an AI grow assistant, a daily journal, weather threat alerts, a garden map, and a buddy share link — all in one calm, offline-capable app that installs on your phone like a native app.

The whole season lives here. Every day from transplant to harvest has its own task list, its own notes, its own phase context. Check things off in the garden on your phone. Open your laptop later. It's all there.

> It's a planner, but it's also a moment of breath every morning. Open it, see what today wants, do the thing, close it.

<img src="assets/divider.svg" alt="" width="100%" />

## Features

### Phase-Aware Planning
The app knows exactly where you are in your grow and surfaces only what matters right now.

|   |   |
|---|---|
| **AI-generated season plan** | Answer a short survey — strains, pot size, medium, location, skill level — and MJ (your AI grow assistant) builds a complete day-by-day plan for your entire season. |
| **Six growth phases** | Pre-veg, veg, pre-flower, flower, flush, harvest. Phase boundaries are tracked automatically and every task list adjusts in real time. |
| **Daily task checklists** | Every day has a curated task list specific to its phase. Check off as you go — state syncs across all your devices instantly. |
| **Per-task notes** | Long-press any task to attach a note. Great for dosing records, observations, or "I used half strength today." |
| **Phase overrides** | Override any phase's task list manually or apply a feed preset — your customizations live alongside the AI plan without replacing it. |

### MJ — AI Grow Assistant
MJ is a Claude-powered assistant that has full context of your plan, your phase, and your history.

|   |   |
|---|---|
| **Contextual answers** | Ask anything: "Is it too early to start flushing?" or "What should my VPD be right now?" MJ knows your exact grow. |
| **Writes to your plan** | MJ can add tasks, adjust phase boundaries, and log notes directly — ask it to and it will. |
| **Streaming responses** | Replies stream in real time, no spinner waiting. |
| **Usage tracking** | Daily usage visible so you always know where you stand. |
| **Plan quality review** | Ask MJ to critique your current plan and suggest improvements. |

### Daily Journal
|   |   |
|---|---|
| **Grow log** | Record watering, feeding, temperature, and humidity for every day. |
| **Day notes** | Free-form notes per day — observations, wins, concerns. |
| **Photos & voice memos** | Attach photos and audio recordings to any day — stored in Cloudflare R2. |
| **CSV export** | Download your entire grow log as a spreadsheet anytime. |

### Weather & Threat Alerts
|   |   |
|---|---|
| **Live NWS forecasts** | Pulls real National Weather Service data for your location — highs, lows, conditions, hourly. |
| **Phase-aware threat filter** | Heat, cold, frost, high humidity, heavy rain, hail, wind, pests — only the threats that matter for your current phase are surfaced. |
| **Threat reference guide** | Built-in reference card for every threat type with mitigation advice. |

### Feed Schedule Presets
Apply a proven nutrient schedule with one tap. Three built-in presets covering the full veg-through-harvest arc:

| Preset | Key Products |
|--------|-------------|
| 🦊 **Fox Farm Trio** | Big Bloom · Grow Big · Tiger Bloom |
| 💧 **GH Flora Trio** | FloraMicro · FloraGro · FloraBloom |
| 🌿 **Organic** | Worm castings · Fish emulsion · Kelp · Molasses |

Presets write directly into your phase task lists via the same override system — swap anytime, or mix with manual edits.

### Season Analytics
A dedicated stats screen gives you a bird's-eye view of your season:

- Checkoff rate by phase and overall
- Streak and completion trends
- Grow log data over time (temp, humidity, feed events)

### Garden Map
An interactive SVG map of your grow space. Drag pots to match your actual yard layout, see each plant's current phase color, and tap a pot to see its strain and phase detail. Saved to local storage — no backend required.

### Buddy Share Link
Share a read-only view of your grow with a friend, mentor, or grow partner — no account required on their end.

- Generates a secure token link
- Buddy sees your current month calendar, today's phase card, and task list
- They can't edit, log, or see your private notes
- Revoke or rotate the link anytime

### Push Notifications
Enable daily reminders and the app will push a morning nudge on grow days — even when the browser is closed. Powered by the Web Push API via your service worker.

### Themes
Three appearance modes — Auto (follows OS), Light, and Dark — with your preference persisted across sessions. Auto mode smoothly tracks system preference with no flash on load.

### PWA — Install Anywhere
Add to your home screen on iOS, Android, or desktop. Works offline. Syncs when you're back online. No app store required.

<img src="assets/divider.svg" alt="" width="100%" />

## Screenshots

<div align="center">
<img src="assets/screenshot.png" alt="Grow Calendar — day view showing tasks and phase info" width="380" />
</div>

<img src="assets/divider.svg" alt="" width="100%" />

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, CSS custom properties theming |
| Backend | Cloudflare Workers (edge runtime) |
| Database | Cloudflare D1 (SQLite at the edge) |
| Storage | Cloudflare R2 (photos, voice memos) |
| AI | Anthropic Claude via Cloudflare AI Gateway |
| Auth | Cookie sessions, PBKDF2 password hashing |
| Push | Web Push API + service worker |
| Deployment | Wrangler, auto-deploy on push to main |

<img src="assets/divider.svg" alt="" width="100%" />

## The Design

Dark mossy greens. Soft amber accents like late-evening lamplight. Courier-style monospace for labels, Georgia serif for headlines — like an old field journal. The whole app is designed to feel less like a productivity tool and more like a journal you check while drinking your morning coffee. No streaks. No achievements. No dopamine loops. Just the plan, the day, and the plant.

Light mode flips to a warm cream palette that holds up just as well in the garden on a bright afternoon.

<img src="assets/divider.svg" alt="" width="100%" />

## Self-Hosting

Clone the repo, run your own instance, and set up your own grow plan. Full instructions — schema setup, Wrangler config, D1/R2 provisioning, environment variables, and the auth model — are in **[DEV.md](DEV.md)**.

The self-host path is first-class. Everything that powers the production deployment is in this repo.

<img src="assets/divider.svg" alt="" width="100%" />

## Security

- Passwords hashed with PBKDF2 + per-user salt
- HttpOnly, Secure, SameSite=Lax session cookies
- CSRF defense via `content-type: application/json` check on every mutating endpoint
- Share tokens use 24 bytes of cryptographic randomness (base64url)
- Admin routes separated from user routes with explicit role checks
- Client-side errors reported to `/api/errors` with a per-session cap to prevent log flooding

<img src="assets/divider.svg" alt="" width="100%" />

<div align="center">

<br />

<img src="public/icon.svg" width="56" alt="" />

<br /><br />

<sub><em>Built with Cloudflare Workers · Anthropic Claude · React · A lot of sun.</em></sub>

<br /><br />

</div>
