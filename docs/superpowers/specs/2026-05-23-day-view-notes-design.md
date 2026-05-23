# Full-Screen Day View with Per-Day Notes

Date: 2026-05-23
Status: Approved design, pending implementation

## Problem

Today, clicking a calendar day sets `selected` in `App.jsx` and renders a
`DetailPanel`. On desktop the panel sits in a sticky right column; on mobile it
just stacks below the calendar. There is no dedicated "screen" for a day, and
there is no way to record notes or concerns. The user wants:

1. Clicking any day opens an entirely separate full-screen view on every device.
2. That screen shows all the day's instructions, lets the user check tasks off
   (already works), and lets the user add freeform notes/concerns.
3. Notes and checkoffs both persist to the server.

## Decisions

- **Notes shape:** one freeform notes box per day (single text body), autosaving.
- **Navigation:** state-based full-screen swap, no router, no new dependencies.
- **Layout:** three tabs on the day screen — Tasks | Notes | Threats.
- **Saving:** notes autosave (debounced) with a subtle saved indicator.

## Architecture

The app stays a state-driven React SPA served by the Cloudflare Worker, with D1
for persistence. No new dependencies.

### Navigation: full-screen swap

`App.jsx` renders one of two screens based on whether a day is selected:

- `selected == null` -> **Calendar screen**: Header, MilestoneStrip, Calendar,
  PhaseLegend, ThreatsReference, AuthFooter.
- `selected != null` -> **Day screen**: the new `DayView` component, full width,
  replacing the calendar screen entirely.

Selecting a day (from the calendar grid or a milestone) sets `selected` and shows
`DayView`. A back control in `DayView` calls `onBack` which clears `selected` and
returns to the calendar at the month that was being viewed.

Browser/phone back button support without a router: when a day is opened, push a
history entry (`history.pushState`). A `popstate` listener clears `selected` so
the device back button returns to the calendar instead of leaving the app. When
the user taps the in-app back control, call `history.back()` so the pushed entry
is consumed and history stays clean.

The two-column desktop grid in `styles.css` (`.app-main`) is no longer used to
show the detail side panel. The calendar screen renders single-column; the
calendar, legend, and threats reference center within the existing
`max-width` shell. `DayView` is its own full-width screen and is centered using
the same shell max-widths so it reads as one focused page on large monitors.

### DayView component

New file `src/components/DayView.jsx`. Receives the same data `App.jsx` already
computes for the current `DetailPanel` (`selected`, `detail`, `selStyle`,
`threats`, `checked`, `onToggle`) plus notes props (`note`, `onChangeNote`,
`noteStatus`) and `onBack`.

Structure:

- **Top bar:** back arrow, the date (e.g. "May 24, 2026"), and the phase
  label rendered in the phase color. Includes the existing `checkedCount/total`
  chip.
- **Tab bar:** `Tasks` | `Notes` | `Threats` (reuses the current tab styling).
- **Tasks tab:** the existing summary block, checkable task list, and the
  optional `detail.notes` callout. Behavior and persistence unchanged — this is
  the current `DetailPanel` "tasks" tab moved verbatim.
- **Notes tab:** a labeled `<textarea>` bound to the day's note body, styled to
  match the dark theme. Autosaves on a debounce. A small status line shows
  "Saving...", "Saved", or "Save failed" based on `noteStatus`.
- **Threats tab:** the existing threat cards for the phase, unchanged.

`DetailPanel.jsx` is removed; its task and threat rendering moves into `DayView`.
The empty-state ("Tap any highlighted day") is no longer needed because the day
screen only renders when a day is selected.

### Notes persistence

Mirrors the existing checkoffs implementation end to end.

**Schema** (`schema.sql`, plus a one-off remote migration):

```sql
CREATE TABLE IF NOT EXISTS day_notes (
  user_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

One row per (user, date). Empty body is allowed; an all-whitespace/empty save
deletes the row to avoid storing blank notes.

**Worker** (`worker/notes.js`, routed from `worker/index.js`):

- `GET /api/notes/:date` -> `{ date, body }` for the current user; `body` is
  `""` when no row exists. Auth required, date validated with the existing
  `YYYY-MM-DD` regex.
- `PUT /api/notes/:date` with `{ body }` -> upserts the row (or deletes it when
  body is empty after trimming). Validate `body` is a string and cap its length
  (max 20000 chars) to bound storage. Returns `{ date, body }`.

Router additions in `worker/index.js`:

```js
const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
if (notesMatch) {
  const date = notesMatch[1];
  if (method === "GET") return getNote(request, env, date);
  if (method === "PUT") return putNote(request, env, date);
}
```

**API client** (`src/lib/api.js`):

```js
getNote: (date) => request(`/api/notes/${date}`),
putNote: (date, body) =>
  request(`/api/notes/${date}`, { method: "PUT", body: JSON.stringify({ body }) }),
```

**Hook** (`src/lib/useDayNote.js`): same shape as `useCheckoffs`.

- Loads the note when `date`/`enabled` change, guarding stale responses with a
  `requestId` ref (same pattern as `useCheckoffs`).
- Holds the live text in state for instant typing.
- Autosaves via a debounce (about 800ms after the last keystroke). A trailing
  save also fires on blur and on `beforeunload`/visibility-hidden so nothing is
  lost when leaving the page or switching tabs.
- Exposes `{ note, setNote, status }` where `status` is one of
  `idle | saving | saved | error`. On error it surfaces "Save failed" but keeps
  the user's text in the box so they can retry.
- Refetches on window focus / visibility like `useCheckoffs`, but does not
  clobber unsaved local edits in flight.

### App.jsx wiring

`App.jsx` keeps `month` and `selected` state; the `tab` state moves into
`DayView` (local to the day screen, defaulting to `tasks` each open). It calls
`useCheckoffs(selected, ...)` and `useDayNote(selected, ...)` and passes both
down to `DayView`. It renders the calendar screen when `selected` is null and
`DayView` otherwise, and owns the `pushState`/`popstate` wiring for back-button
support.

## Data flow

1. User taps a highlighted day -> `App` sets `selected`, pushes a history entry.
2. `App` renders `DayView`; `useCheckoffs` and `useDayNote` fetch that date's
   checkoffs and note body.
3. Checking a task -> optimistic state update -> `PUT /api/checkoffs/:date`
   (existing behavior).
4. Typing in the notes box -> instant local update -> debounced
   `PUT /api/notes/:date` -> status flips saving -> saved.
5. Back control -> `history.back()` -> `popstate` clears `selected` -> calendar
   screen returns at the same month.

## Error handling

- Network failures on checkoffs keep current behavior (refetch on failure).
- Notes save failure sets status to `error` and shows "Save failed"; text is
  retained and the next keystroke or blur retries.
- Worker rejects oversized bodies (>20000 chars) and non-string bodies with 400.
- Unauthenticated requests return 401 as today; the app already gates the whole
  UI behind login, so this is a safety net.

## Testing

- Worker: getNote returns empty body when none exists; putNote upserts; empty
  body deletes the row; oversized/invalid body rejected; auth enforced; date
  format validated. Verify via `wrangler dev` with the local D1 binding.
- Hook: debounce coalesces rapid keystrokes into one save; stale-response guard
  prevents an older fetch from overwriting newer input; blur/unload flush works.
- Manual: open a day on mobile width and desktop width, confirm full-screen swap,
  back button (in-app and browser/phone), checkoffs persist across reload, notes
  persist across reload, switching days loads the correct note.

## Migration

`day_notes` must be created in both local and remote D1:

```
npx wrangler d1 execute grow-calendar-db --local  --command "CREATE TABLE IF NOT EXISTS day_notes (user_id INTEGER NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);"
npx wrangler d1 execute grow-calendar-db --remote --command "<same as above>"
```

`schema.sql` is updated so fresh setups get the table automatically.

## Out of scope

- The conversational Claude agent / chat bar (separate future effort).
- Sharing or exporting notes.
- Per-plant notes (notes are per-day for now).
- Real URL routing / deep links.
