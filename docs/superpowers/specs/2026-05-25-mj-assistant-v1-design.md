# MJ Assistant v1 (read + act) - Design

Date: 2026-05-25
Status: Approved (design); pending implementation plan
Scope: Sub-project 2 of the MJ effort, sequenced as v1. Builds on the merged D1 grow-plan foundation (PR #88). Plan-editing (shift dates, adjust dosing, per-day overrides) is a separate v2 with a confirm-before-write flow.

## Goal

Turn the existing reply-only grow chat into MJ: a tool-calling assistant that not only answers questions about the grow but takes actions on the user's behalf - checking tasks off and writing daily notes - through natural language. MJ acts directly (no confirmation) because v1 actions are per-user, reversible, and immediately visible. Editing the shared season plan is deferred to v2.

## Non-goals (deferred to v2 or later)

- Plan editing: shifting driving dates, adjusting dosing, per-day task/note/warning overrides, and the confirm-before-write UX.
- Plan write endpoints (`PUT /api/plan/config`, override CRUD).
- A second AI provider (Gemini). v1 ships a model-selection seam but only the Claude branch.
- Streaming responses. v1 is request/response like the current chat.

## Key decisions

1. **Server-side tool-calling (Anthropic tool use).** The worker runs the agentic loop: the model emits `tool_use` blocks, the worker executes them against D1 and the generator, returns `tool_result`, and loops until the model returns a final text reply. The API key already lives in the worker, so the loop belongs there. Rejected: context-only with parsed commands (brittle, no real tool protocol); client-side tool execution (spreads logic, extra round-trips, key still forces a server hop).

2. **MJ replaces the existing chat.** `worker/chat.js` and `/api/chat` are retired; `worker/mj.js` and `POST /api/mj` replace them. `ChatPanel.jsx` is evolved in place (same shell) to drive `/api/mj` and render actions. There is one assistant, not two.

3. **Act directly, with append-only notes as the safety rule.** Checkoff and note actions execute immediately and MJ reports what it did. To make "act directly" safe, `append_note` always appends to the existing note text and never overwrites it. Checkoffs are inherently reversible (toggling indices). Confirmation is reserved for v2 plan edits.

4. **v1 absorbs two foundation-deferred items because acting requires them.** To map "mark watering done" to a task index and to know the live plan, the worker must compute a day's detail server-side. That requires:
   - Splitting the pure date helpers out of `src/lib/dates.js` (which imports React) so the worker can import the generator without bundling React.
   - `buildPlanText(config, overrides)` generating the AI context from live D1 config, retiring the hand-written `worker/growContext.js`.

5. **Model: Claude Haiku 4.5** (`claude-haiku-4-5`), matching the current chat, supports tool use, cheap. Swappable via the seam.

## Current state (what exists today)

- `worker/chat.js`: `POST /api/chat`. Single-shot. Builds a system prompt from a static `PERSONA` + `GROW_CONTEXT` (hand-authored in `worker/growContext.js`) + today's date + the user's `day_notes`, calls Anthropic (`claude-haiku-4-5`, non-streaming), returns `{ reply }`. Uses `cache_control` on the static block.
- `worker/growContext.js`: hand-authored static plan summary. A duplicate of the generator's knowledge.
- `worker/checkoffs.js`: `getCheckoffs(request, env, date)` / `putCheckoffs(request, env, date)`. Checkoffs stored per `(user_id, date)` as an array of checked task indices.
- `worker/notes.js`: `getNote` / `putNote`. One note body per `(user_id, date)` in `day_notes`.
- `src/lib/growData.js`: config-driven generator. `getDetail(date, config, overrides)` returns `{title, summary, tasks[], notes}`. `getPhase`, `buildMilestones`, etc.
- `src/lib/dates.js`: pure date helpers AND the React `useToday` hook (imports `react`). This React import is why the worker cannot currently import the generator cleanly.
- `worker/plan.js`: `GET /api/plan` returns `{config, overrides}`.
- `src/components/ChatPanel.jsx`: full-screen chat UI; `send()` posts `api.chat(messages)` and renders bubbles. A floating "Ask" button in `App.jsx` opens it.
- `src/lib/api.js`: `chat(messages)` wrapper; D1 binding is `env.DB`; `currentUser(request, env)` in `worker/auth.js`.

## Architecture

### React-free generator (prerequisite)

- Create `src/lib/dates-core.js` exporting the pure helpers: `getToday`, `MONTH_NAMES`, `DOW_SHORT`, `sameDay`, `daysBetween`, `fmt`, `fmtL`. No React, no DOM.
- `src/lib/dates.js` keeps the `useToday` React hook and re-exports everything from `dates-core.js` (so existing `from "./dates.js"` imports across the frontend keep working unchanged).
- `src/lib/growData.js` changes its import from `./dates.js` to `./dates-core.js`. No other change; the generator parity tests must stay green (proves no behavior change).

### Server-side context generation

- Add `buildPlanText(config, overrides)` to `src/lib/growData.js` (or a co-located module): renders a compact full-season overview string from live config for the MJ system prompt. It must cover the same key dates and dosing the current `worker/growContext.js` conveys (verified by test for containment of key dates/dosing), but it is generated, not hand-authored.
- `worker/growContext.js` is removed; nothing imports it after `chat.js` is retired.

### Shared data-access helpers (avoid duplication)

The MJ tools and the existing HTTP handlers must share one implementation:
- `worker/checkoffs.js`: extract `readCheckoffs(env, userId, date) -> number[]` and `writeCheckoffs(env, userId, date, checkedIndices) -> void`. `getCheckoffs`/`putCheckoffs` become thin wrappers that parse the request and delegate.
- `worker/notes.js`: extract `readNote(env, userId, date) -> string` and `writeNote(env, userId, date, body) -> void`. `getNote`/`putNote` delegate.

### MJ worker module (`worker/mj.js`)

`POST /api/mj`, auth-gated via `currentUser`. Body: `{ messages: [{role, content}] }` (same normalization rules as the current chat: cap count/length, last message must be user).

The handler:
1. Resolves the model via `pickModel(user, env)` (v1: always `{ model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY }`; documented stub for a future non-owner -> Gemini branch). If no key, return the existing 503 "not configured" behavior.
2. Builds the system prompt: MJ persona + `buildPlanText(config, overrides)` + today's date (America/New_York, matching the current chat). Static block uses `cache_control` like today. Config/overrides are loaded from D1 with seed fallback (same logic as `worker/plan.js`) and the raw ISO config is passed through `parseConfig` to Date objects before any generator call (`buildPlanText`, `getDetail`); parsing ISO as local dates avoids the UTC day-shift. This load+parse is shared by the system-prompt build and the `get_day` tool.
3. Runs the tool-use loop (max 6 iterations):
   - Call Anthropic with `tools` defined and the running message list.
   - If the response has `tool_use` blocks, execute each via the tool executor, append a `tool_result` for each, and continue the loop.
   - If the response is final text, stop.
   - On hitting the iteration cap, stop and return whatever text exists plus a note that MJ stopped early.
4. Returns `{ reply, actions }` where `actions` is the list of mutating tool calls performed (`[{type, date, summary}]`) so the UI can show what MJ did.

### Tools (v1)

Defined in `worker/mj.js`. All operate only on the authenticated user's data.

- `get_day(date)` -> `{ date, phase, title, summary, tasks: [{index, text, done}], guidance, userNote }`. Server computes detail via `getDetail(date, config, overrides)`, maps each task to its index, marks `done` from `readCheckoffs`. `guidance` is the generator's plan-level note (`detail.notes`); `userNote` is this user's saved `day_notes` text (`readNote`). The two are named distinctly to avoid conflating plan guidance with the user's personal note. Read-only.
- `set_tasks_done(date, taskIndices: number[], done: boolean)` -> `{ date, checked: number[] }`. Reads current checkoffs, adds (or removes) the given indices, writes via `writeCheckoffs`, returns the new checked list. Validates indices against that day's task count; out-of-range indices are ignored and reported.
- `append_note(date, text)` -> `{ date, note }`. Reads the current note; appends `text` (with a separating newline if a note already exists); writes via `writeNote`; returns the full new note. Never overwrites.

`date` arguments are `YYYY-MM-DD`. The system prompt states today's date so the model can resolve "today"/"this week" to explicit dates before calling tools.

### Frontend (`ChatPanel.jsx` -> MJ)

- `send()` posts `api.mj(messages)`; on success it appends the assistant reply and renders any `actions` as compact inline chips (e.g. "Marked 'Water to runoff' done - Jun 12", "Added to Jun 12 note").
- Branding updated to MJ (header text, empty-state copy, suggestions that hint at actions like "mark today's watering done"). The floating button label may change from "Ask" to "MJ".
- `src/lib/api.js`: `mj: (messages) => request("/api/mj", { method: "POST", body: JSON.stringify({ messages }) })` replaces `chat`.
- Because MJ can change checkoffs/notes while the calendar isn't visible, no live cross-component sync is added in v1; the existing focus-refetch in `useCheckoffs`/`useDayNote` picks up changes when the user returns to a day. This is acceptable and matches the app's existing "sync on focus" model.

## Error handling

- Tool execution errors are caught and returned to the model as a `tool_result` with an error message, so MJ can recover or tell the user, rather than 500ing the request.
- Invalid tool arguments (bad date format, non-array indices) are rejected inside the executor with a clear error result; the model can correct and retry within the iteration budget.
- Anthropic/network errors return the same friendly 502/503 messages the current chat returns.
- The iteration cap (6) guarantees termination.
- All tools derive `userId` from the authenticated session; tool arguments cannot target another user.

## Testing

Node built-in runner (`node --test`):
- `set_tasks_done` merge logic: adding/removing indices against a current set; out-of-range handling. Run against a small in-memory fake `env.DB` (implements `prepare().bind().first()/.all()/.run()`).
- `append_note`: appends to existing text, creates when empty, never overwrites. Same fake DB.
- `buildPlanText(parseConfig(DEFAULT_CONFIG), {})`: contains the key dates/dosing the old `growContext.js` conveyed (transplant, feeding start, harvest dates, flush days).
- Generator parity: the existing `test/plan-parity.test.js` must still pass after the `dates.js` split (no behavior change).
- The live Anthropic tool-use loop is validated manually (local stack): ask MJ to mark a task done and to add a note, confirm the D1 rows change and the day view reflects them on return.

## Migration / deploy

- No new D1 tables (v1 uses existing `task_checkoffs`, `day_notes`, `plan_config`, `plan_day_overrides`). No remote migration needed for v1 beyond what the foundation already requires.
- `ANTHROPIC_API_KEY` must be set as a Worker secret in production (already a tracked prerequisite). Without it, MJ returns "not configured" like the current chat.
- Auto-deploy on push to `main` ships worker + frontend together.

## Open items for the implementation plan

- Final location of `buildPlanText` (in `growData.js` vs a small sibling module).
- Exact MJ persona wording and the tool JSON schemas (names/descriptions the model sees).
- Whether `get_day` is also exposed for the assistant to read arbitrary days vs only days it intends to act on (default: available for any in-range date).
- The fake-`env.DB` test helper shape.
