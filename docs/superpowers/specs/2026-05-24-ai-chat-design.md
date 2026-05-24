# In-App AI Grow Assistant (MVP)

Date: 2026-05-24
Status: Approved design, pending implementation

## Problem / goal

The user wants to ask questions and raise concerns about their grow from inside
the app and get immediate, knowledgeable help. The assistant should understand
*this specific grow* (the 147-day 2026 plan, the two strains, dosing, threats)
and the user's own saved notes, not just give generic cannabis advice.

This is the first, intentionally minimal version. No saved history, no
streaming, no per-day binding yet. Just a working, grow-aware chat.

## Decisions (locked during brainstorming)

- **Placement:** a floating "Ask" button on every authenticated screen that
  opens a full-screen chat panel (same full-screen pattern as the day view).
- **Memory:** ephemeral. The panel holds the conversation in memory and sends it
  each turn so the bot remembers the current exchange; it clears on reload.
- **Context:** full grow plan + today's date (bot infers the current phase) +
  the user's saved daily notes.
- **Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`).
- **Delivery:** non-streaming (request returns the full reply).

## Architecture

Stays a state-driven React SPA + Cloudflare Worker + D1. No new npm
dependencies (the Worker calls the Anthropic REST API with `fetch`; no SDK).
The Anthropic API key is a Worker **secret**, never exposed to the browser.

### Endpoint: `POST /api/chat`

- Auth required (`currentUser`); 401 if not authenticated.
- Request body: `{ messages: [{ role: "user" | "assistant", content: string }, ...] }`
  — the conversation so far (the latest user turn is the last element).
- The Worker validates the body, assembles the system prompt, calls Anthropic,
  and returns `{ reply: string }`.
- Validation/guards: `messages` must be a non-empty array of `{role, content}`
  with roles limited to `user`/`assistant` and string content; reject otherwise
  with 400. Cap the number of messages accepted (e.g. last 20) and per-message
  length (e.g. 4000 chars) to bound token cost and abuse.

### Context assembly (the system prompt)

The system prompt has two parts:

1. **Static grow knowledge** (`worker/growContext.js`, exported as a string):
   a curated, prompt-friendly summary composed from the data in
   `src/lib/growData.js` — season window (May 21 to Oct 18, 2026, Athens, Ohio),
   the two strains (1 Grandaddy Purp, indica; 2 Strawberry Haze, sativa), the
   phase timeline with dates (transplant, Cal-Mag start, feeding half/full dose,
   pre-flower, flower, flushes, GDP flush/harvest Sept 20/27, Haze flush/harvest
   Oct 4/18), the dosing details (Cal-Mag, Fox Farm trio amounts, pH 6.5), and
   the phase-specific threats (heat, cold, frost, rain, humidity, hail, wind,
   pests). This block is stable across the season and is sent with
   `cache_control` for prompt caching.
   - Maintenance note: this is a hand-authored summary, not generated at runtime,
     so it can drift from `growData.js`. The plan is fixed for the 2026 season,
     so drift risk is low; if the plan dates/dosing change, update this file too.

2. **Dynamic context** (built per request, not cached):
   - "Today's date is YYYY-MM-DD." (the bot infers the current phase from the
     timeline rather than the Worker re-implementing `getPhase`).
   - The grower's saved notes: read all rows from `day_notes` for the current
     user (`SELECT date, body ... ORDER BY date`), formatted as a dated list. If
     there are none, say so. Bounded by the natural size of a personal grow's
     notes; if this ever grows large, switch to "most recent N".
     - Dependency: this read requires the `day_notes` table (added by the
       day-view feature) to exist in the target environment. It exists locally;
       in production it is created by that feature's pending remote migration,
       which must run before chat is deployed.

The system prompt also sets the persona and guardrails: a calm, practical
outdoor-cannabis growing assistant for the user's own personal grow; concise,
actionable horticultural answers; ask a clarifying question when a diagnosis
needs more detail; defer to the saved plan's dates/dosing.

### Anthropic call

`POST https://api.anthropic.com/v1/messages` with headers
`x-api-key: <env.ANTHROPIC_API_KEY>`, `anthropic-version: 2023-06-01`,
`content-type: application/json`. Body: `model` =
`claude-haiku-4-5-20251001`, `max_tokens` ~1024, `system` (the assembled blocks,
static block marked with `cache_control: { type: "ephemeral" }`), and `messages`
(the validated conversation). Parse the first text block from `content` and
return it as `{ reply }`. Implementation follows the **claude-api skill**
(prompt caching, correct message/system shape, model id).

### Frontend

- `src/lib/api.js` — add `chat(messages)` → `POST /api/chat`.
- `src/components/ChatPanel.jsx` — full-screen panel: a scrollable message list
  (user vs assistant bubbles in the app's dark theme), a text input + send
  button, a "thinking" indicator while awaiting the reply, an inline error row on
  failure, a back/close control, and an empty-state prompt suggesting what to
  ask. Holds the `messages` array and loading/error state locally. Sends the full
  message list on each turn; appends the user message optimistically and the
  reply when it returns. Respects `env(safe-area-inset-*)` like the other
  full-screen surfaces.
- `src/App.jsx` — a floating "🌿 Ask" button (fixed, bottom corner, respects
  `safe-area-inset-bottom`) rendered on both the calendar and day screens, and a
  `chatOpen` state that mounts `ChatPanel` over the current screen.

## Data flow

1. User taps "Ask" → `chatOpen = true` → `ChatPanel` mounts.
2. User types a message → panel appends it to `messages`, calls
   `api.chat(messages)`, shows the thinking indicator.
3. Worker authenticates, assembles system prompt (static plan + today + notes),
   calls Anthropic, returns `{ reply }`.
4. Panel appends the assistant reply; the user can continue the thread.
5. Closing the panel or reloading clears the conversation.

## Error handling

- Missing `ANTHROPIC_API_KEY` → Worker returns 503 with a clear message; panel
  shows "Chat isn't configured yet" rather than a generic failure.
- Anthropic non-200 or network error → Worker returns 502 with a short message;
  panel shows an inline error and keeps the user's text so they can retry.
- Invalid request body → 400.
- Unauthenticated → 401 (the UI is already gated behind login; safety net).

## Secret management

- **Local:** a gitignored `.dev.vars` file at the project root with
  `ANTHROPIC_API_KEY=sk-ant-...`, read automatically by `wrangler dev`. Confirm
  `.dev.vars` is in `.gitignore`.
- **Production:** `npx wrangler secret put ANTHROPIC_API_KEY`. Added at deploy
  time, like the deferred D1 migration. The feature is built and merged before
  the key exists; until the key is set, the endpoint returns the friendly 503.

## Cost

Haiku 4.5 is inexpensive; with prompt caching on the static grow block, a typical
exchange is a fraction of a cent. Negligible for one-person personal use.

## Testing (manual; project has no test framework)

- Worker: with `.dev.vars` set and `wrangler dev` running, `curl.exe` a sample
  `POST /api/chat` and confirm a coherent, grow-aware reply; confirm 401 without
  the session cookie; confirm 503 when the key is unset; confirm 400 on a
  malformed body.
- UI: open the Ask button on calendar and day screens and at phone width; send a
  question; confirm the reply renders, the thinking indicator works, errors show
  inline, and the conversation clears on reload.

## Out of scope (fast-follows)

- Saved/scrollable conversation history (D1-backed).
- Streaming responses.
- Binding the chat to a specific selected day's context.
- Conversation export.
