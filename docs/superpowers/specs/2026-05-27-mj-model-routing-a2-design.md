# Sub-project A2: Per-user MJ model routing

Design spec. Part of the multi-user epic (#90); A2 is the second half of #91 (A1 was the foundation). Builds on A1 (merged): `postMj(request, env, user)`, the `pickModel(user, env)` seam, and the `mj_usage` table all exist.

## Goal

Route MJ per user so only the owner spends money:
- The owner (admin) uses paid Claude (`claude-haiku-4-5`) on `ANTHROPIC_API_KEY`.
- Every other (approved, non-admin) user uses free Gemini (`gemini-2.5-flash`) on one shared owner-provided `GEMINI_API_KEY`.

Plus a per-user daily message cap (30/day for non-admins) to keep friends within Gemini's shared free quota, and graceful handling of Gemini quota errors.

## Out of scope

- Any schema change (none needed; `mj_usage` already exists from A1).
- Frontend changes (the `/api/mj` request and `{ reply, actions }` response shape are unchanged).
- AI Gateway (#94), plan editing/onboarding (B/C).

## Current state

`worker/mj.js` speaks only Anthropic. `postMj` validates the body, calls `pickModel` (today always Claude), builds a `system` array (persona + plan text cached, today's date uncached), then runs a tool-use loop (up to `MAX_TOOL_ITERATIONS=6`) hitting Anthropic, parsing `content` blocks (`text`/`tool_use`), executing tools via `executeTool`, and feeding back `tool_result` blocks. Shared tool definitions and pure helpers live in `worker/mj-logic.js` (`MJ_PERSONA`, `MJ_TOOLS` in Anthropic `input_schema` form, `mergeChecked`, `appendNoteText`, `buildDayView`). The actions array (what MJ did) is accumulated by `executeTool`.

## Design

### Provider routing

`pickModel(user, env)` returns `{ provider, model, apiKey }`:
- `isAdmin(user)` -> `{ provider: "anthropic", model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY }`
- else -> `{ provider: "gemini", model: "gemini-2.5-flash", apiKey: env.GEMINI_API_KEY }`

If the chosen `apiKey` is falsy, `postMj` returns the existing `503 "MJ is not configured yet"`. The two providers are gated independently (owner can have Claude working while Gemini is unset, or vice versa).

### Provider adapters (the tool-use loop becomes provider-specific, everything else shared)

The conversation representation differs enough between Anthropic and Gemini that each provider owns its own loop. Both share: the system content, the tool definitions, the `executeTool` logic, and the actions array.

Two modules, each exporting one async function with the same signature and return:

```
runConversation({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations })
  -> { reply: string }     // throws ProviderError on failure (see below)
```

- `systemSegments`: `[{ text, cache }]` - lets the Anthropic adapter apply `cache_control` to the cacheable segment (persona + plan) while keeping today's date uncached; the Gemini adapter just concatenates them into `systemInstruction.parts`.
- `tools`: the neutral shared definitions `[{ name, description, parameters }]` (JSON Schema in `parameters`).
- `messages`: the normalized conversation so far `[{ role: "user"|"assistant", content: string }]` (the user/assistant turns from the request body).
- `executeToolUse(name, input)`: async callback returning the tool result object. Each adapter extracts `name` + `input` from its provider's native tool-call shape and calls this; the result object is sent back in the provider's native tool-result shape.
- Returns `{ reply }`. On a provider/network failure it throws a `ProviderError` with `kind: "quota" | "upstream" | "unreachable"`.

**`worker/providers/anthropic.js`** - today's loop, lifted out of `mj.js` verbatim in behavior:
- `system` = `systemSegments.map(s => ({ type: "text", text: s.text, ...(s.cache ? { cache_control: { type: "ephemeral" } } : {}) }))`.
- tools mapped to `{ name, description, input_schema: t.parameters }`.
- loop: POST to `https://api.anthropic.com/v1/messages`; parse `content`; if `stop_reason !== "tool_use"` return `{ reply: text }`; else push the assistant `content`, run each `tool_use` block via `executeToolUse(b.name, b.input)`, push a user turn of `tool_result` blocks. Non-OK response -> `ProviderError("upstream")`; fetch throw -> `ProviderError("unreachable")`.

**`worker/providers/gemini.js`** - native Gemini loop:
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, API key in the `x-goog-api-key` header, `content-type: application/json`.
- Body: `{ systemInstruction: { parts: systemSegments.map(s => ({ text: s.text })) }, contents, tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }], generationConfig: { temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } } }`.
  - `thinkingBudget: 0` disables "thinking" so tool calls are fast and quota-frugal. (If the API rejects `thinkingBudget: 0` for this model, fall back to omitting `thinkingConfig`; the plan's task verifies this against a real call.)
- `contents` starts as the mapped `messages`: `{ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }`.
- loop: POST; on `res.status === 429` throw `ProviderError("quota")`; other non-OK -> `ProviderError("upstream")`; fetch throw -> `ProviderError("unreachable")`. Parse `data.candidates[0].content.parts`: collect `text` parts (concatenate) and `functionCall` parts. If no `functionCall` -> return `{ reply: text }`. Else: push the model turn (`{ role: "model", parts: <the returned parts> }`), run each functionCall via `executeToolUse(fc.name, fc.args)`, push a user turn `{ role: "user", parts: results.map(r => ({ functionResponse: { name: r.name, response: r.result } })) }`. Loop up to `maxIterations`; if exhausted return `{ reply: text || fallback }`.
- Pure, unit-testable helpers extracted into the module (or a `gemini-map.js`): `buildGeminiBody(...)` and `parseGeminiResponse(data) -> { text, functionCalls: [{ name, args }] }`.

### `executeTool` refactor

Change `executeTool(block, env, userId, config, overrides, actions)` to `executeTool(name, input, env, userId, config, overrides, actions)` (take `name`/`input` directly instead of an Anthropic-shaped block). `postMj` builds the closure `executeToolUse = (name, input) => executeTool(name, input, env, user.id, config, overrides, actions)` and passes it to whichever adapter runs. Tool *logic* is unchanged.

### `postMj` (provider-agnostic)

1. Parse + validate body (unchanged).
2. `const { provider, model, apiKey } = pickModel(user, env);` -> 503 if no `apiKey`.
3. Rate limit (below).
4. Normalize `messages` (unchanged), build `systemSegments` = `[{ text: persona + "\n\n" + planText, cache: true }, { text: "Today's date is " + today + ".", cache: false }]`.
5. `const run = provider === "gemini" ? runGemini : runAnthropic;`
6. `try { const { reply } = await run({ apiKey, model, systemSegments, tools: MJ_TOOLS, messages, executeToolUse, maxIterations: MAX_TOOL_ITERATIONS }); return json({ reply, actions }); }` `catch (e)` -> map `ProviderError.kind`: `"quota"` -> `429 "MJ has hit today's limit, please try again later"`; otherwise -> `502` (the existing "AI service" messages). 

### Per-user daily cap

- Constant `MJ_DAILY_LIMIT = 30`.
- After the 503 check, before running: if `!isAdmin(user)`, read `mj_usage` for `(user.id, today)` (NY date, same value used in the system prompt). If `count >= MJ_DAILY_LIMIT` -> `429 "You have reached today's MJ limit (30 messages). It resets tomorrow."`. Otherwise `INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, 1) ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`. Admins skip this entirely.
- Pure decision helper `isOverMjLimit(count, limit)` for testing.
- The counter counts user messages (one per accepted `/api/mj` call), not individual model calls; it is a coarse guard, with Gemini's own `429` (handled above) as the hard backstop for the shared quota.

## Testing (node --test, pure functions)

- `pickModel`: admin -> anthropic provider/model/key; non-admin -> gemini; missing key path leaves `apiKey` falsy.
- `toGeminiTools`/`buildGeminiBody`: neutral tools map to `functionDeclarations`; `systemInstruction` and `contents` shaped correctly; `thinkingConfig` present.
- `parseGeminiResponse`: given a recorded Gemini response with a `functionCall` part, returns the right `{ text, functionCalls }`; given a text-only response, returns `{ text, functionCalls: [] }`.
- `isOverMjLimit`: boundary at the limit.
- Existing `mj-logic` tests (mergeChecked, appendNoteText, buildDayView) stay green; tool definitions still expose `name`/`description`/`parameters`.

No live API calls in tests; the Anthropic and Gemini loops are exercised manually (wrangler dev + a real key) during verification, and the pure mappers are fixture-tested.

## Deployment

No D1 migration. `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` are already set on Cloudflare. Merging A2 to `main` auto-deploys; because there is no schema change, the deploy is safe on its own. After deploy, the owner may approve non-owner users (their MJ now routes to free Gemini under the daily cap).

## Decisions / alternatives

- Two provider loops rather than one fully-generic loop: the conversation/tool-result shapes differ enough that two small native loops are clearer and less bug-prone than an over-abstracted single loop. They share everything that matters (tools, system, `executeTool`, actions).
- Message-count cap (not model-call-count): simpler, matches the `mj_usage` shape from A1; Gemini's own quota 429 is the precise backstop.
- `thinkingBudget: 0` on Gemini Flash: keep MJ snappy and quota-frugal for tool use; verified during implementation.
