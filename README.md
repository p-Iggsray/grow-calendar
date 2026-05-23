# Grow Calendar

A personal grow calendar for the 2026 outdoor season (1× Grandaddy Purp, 2× Strawberry Haze, Athens OH). Single-page React app, deployed to Cloudflare Pages.

## Stack

- Vite + React 18 (static SPA, no router)
- Cloudflare Pages (static hosting, GitHub-driven auto-deploy)
- Planned: Cloudflare D1 (SQL) + R2 (photos) + Pages Functions backend behind a passcode

## Local dev

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Production build

```bash
npm run build
npm run preview
```

`npm run build` outputs to `dist/`. `npm run preview` serves that build locally for a final smoke test.

## Deploy to Cloudflare Pages

First-time setup:

1. Push this repo to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Pick this repo.
4. Build settings:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave blank
5. Click **Save and Deploy**.

After that, every push to `main` triggers a deploy. The dashboard shows build logs and the live URL (typically `grow-calendar.pages.dev`).

## Project layout

```
src/
  main.jsx              entry, mounts App to #root
  App.jsx               shell, owns top-level state
  lib/
    dates.js            TODAY, sameDay, daysBetween, formatters
    growData.js         D dates, PHASES, THREATS, MILESTONES, getPhase, getDetail
  components/
    Header.jsx          gradient header + progress bar + status pills
    MilestoneStrip.jsx  horizontal scrollable milestones
    Calendar.jsx        month nav + day grid
    PhaseLegend.jsx     phase color key
    DetailPanel.jsx     selected-day card with Tasks/Threats tabs
    ThreatsReference.jsx  all-season threat list

index.html, vite.config.js, package.json   build setup
```

## Roadmap

This is step 1 of a multi-step build. Pure frontend, no persistence. Next steps:

1. Passcode auth + Cloudflare D1 setup
2. Task check-offs synced to D1
3. Daily notes / journal
4. Structured grow log (pH, water, feed, temp, humidity)
5. Photo uploads via R2

Each step lands as its own commit so the live site stays working between increments.
