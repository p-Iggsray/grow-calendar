# Full-Screen Day View with Per-Day Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking any calendar day opens a dedicated full-screen page (on every device) showing that day's instructions, a checkable task list, a Threats view, and a freeform autosaving Notes box that persists to the server. Also fix the app's display name to "The Grow Calendar" everywhere it shows to the user.

**Architecture:** State-driven React SPA served by a Cloudflare Worker with D1. No router and no new dependencies. `App.jsx` renders either the calendar screen or a new full-width `DayView` based on whether a day is selected; selecting pushes a history entry so the device/browser back button returns to the calendar. Notes get a new `day_notes` D1 table and `GET/PUT /api/notes/:date` endpoints, consumed by a `useDayNote` hook that mirrors the existing `useCheckoffs` pattern with debounced autosave.

**Tech Stack:** React 18, Vite, Cloudflare Workers, Cloudflare D1 (SQLite), Wrangler 4. Manual verification (the project has no test framework) via `npx wrangler dev` + `curl.exe` and browser checks.

---

## File Structure

- `schema.sql` — Modify: add `day_notes` table.
- `worker/notes.js` — Create: `getNote` / `putNote` handlers.
- `worker/index.js` — Modify: import and route `/api/notes/:date`.
- `src/lib/api.js` — Modify: add `getNote` / `putNote` client methods.
- `src/lib/useDayNote.js` — Create: per-day note hook with debounced autosave.
- `src/components/DayView.jsx` — Create: full-screen day page (Tasks/Notes/Threats tabs).
- `src/App.jsx` — Modify (substantial): screen swap, history wiring, pass note props.
- `src/components/DetailPanel.jsx` — Delete: folded into `DayView`.
- `src/styles.css` — Modify: replace two-column detail grid with single centered screen.
- `src/components/Header.jsx` — Modify: "The Summer Grow" -> "The Grow Calendar".
- `index.html` — Modify: `<title>`.
- `public/manifest.webmanifest` — Modify: `name`.
- `launch.bat` — Modify: dev window title.
- `DEV.md` — Modify: mark notes done, list new files.

---

## Task 1: D1 schema for notes + migration

**Files:**
- Modify: `schema.sql` (append after the `task_checkoffs` block, end of file)

- [ ] **Step 1: Add the `day_notes` table to `schema.sql`**

Append to the end of `schema.sql`:

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

- [ ] **Step 2: Apply the table to the LOCAL D1 database**

Run:
```
npx wrangler d1 execute grow-calendar-db --local --command "CREATE TABLE IF NOT EXISTS day_notes (user_id INTEGER NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);"
```
Expected: prints a success summary (1 command executed, rows written 0).

> **Remote migration is deferred.** The production `day_notes` table is NOT created here. It is created in Task 8 immediately before deploy, per the user's instruction to hold all remote changes until then.

- [ ] **Step 3: Verify the table exists locally**

Run:
```
npx wrangler d1 execute grow-calendar-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```
Expected: the result list includes `day_notes` alongside `users`, `sessions`, `task_checkoffs`.

- [ ] **Step 4: Commit**

```
git add schema.sql
git commit -m "Add day_notes table for per-day notes"
```

---

## Task 2: Worker notes endpoints

**Files:**
- Create: `worker/notes.js`
- Modify: `worker/index.js`

- [ ] **Step 1: Create `worker/notes.js`**

```js
import { json, error, nowIso } from "./util.js";
import { currentUser } from "./auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_LEN = 20000;

export async function getNote(request, env, date) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  const row = await env.DB.prepare(
    "SELECT body FROM day_notes WHERE user_id = ? AND date = ?",
  ).bind(user.id, date).first();

  return json({ date, body: row?.body ?? "" });
}

export async function putNote(request, env, date) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }

  if (typeof body.body !== "string") return error(400, "body must be a string");
  const text = body.body;
  if (text.length > MAX_BODY_LEN) return error(400, `body exceeds ${MAX_BODY_LEN} characters`);

  // An empty/whitespace-only note removes the row instead of storing a blank record.
  if (text.trim() === "") {
    await env.DB.prepare(
      "DELETE FROM day_notes WHERE user_id = ? AND date = ?",
    ).bind(user.id, date).run();
    return json({ date, body: "" });
  }

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO day_notes (user_id, date, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  ).bind(user.id, date, text, now).run();

  return json({ date, body: text });
}
```

- [ ] **Step 2: Wire the routes in `worker/index.js`**

Add the import next to the existing handler imports (after the `checkoffs.js` import line):

```js
import { getNote, putNote } from "./notes.js";
```

Inside `route()`, add this block immediately after the existing `checkoffsMatch` block and before `return error(404, "not found");`:

```js
  const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
  if (notesMatch) {
    const date = notesMatch[1];
    if (method === "GET") return getNote(request, env, date);
    if (method === "PUT") return putNote(request, env, date);
  }
```

- [ ] **Step 3: Start the local Worker**

In a dedicated terminal, run:
```
npx wrangler dev
```
Expected: serves on `http://localhost:8787`. Leave it running for the next steps. (The frontend may 404 because `dist/` is not built yet; that is fine, we are testing the API only.)

- [ ] **Step 4: Create a local test user and capture its session cookie**

The local D1 is empty, so `signup` succeeds locally and logs you in (sets the cookie). Run:
```
curl.exe -s -c cookies.txt -X POST http://localhost:8787/api/auth/signup -H "content-type: application/json" -d "{\"username\":\"test\",\"password\":\"testpass123\"}"
```
Expected: `{"user":{"id":1,"username":"test"}}`. (If it returns 403 because a local user already exists, instead log in: replace `signup` with `login` in the URL.)

- [ ] **Step 5: Verify GET returns an empty body for a fresh day**

Run:
```
curl.exe -s -b cookies.txt http://localhost:8787/api/notes/2026-05-24
```
Expected: `{"date":"2026-05-24","body":""}`

- [ ] **Step 6: Verify PUT saves, GET reads back, blank PUT deletes**

Run:
```
curl.exe -s -b cookies.txt -X PUT http://localhost:8787/api/notes/2026-05-24 -H "content-type: application/json" -d "{\"body\":\"leaves drooping in the heat\"}"
curl.exe -s -b cookies.txt http://localhost:8787/api/notes/2026-05-24
curl.exe -s -b cookies.txt -X PUT http://localhost:8787/api/notes/2026-05-24 -H "content-type: application/json" -d "{\"body\":\"   \"}"
curl.exe -s -b cookies.txt http://localhost:8787/api/notes/2026-05-24
```
Expected, in order:
1. `{"date":"2026-05-24","body":"leaves drooping in the heat"}`
2. `{"date":"2026-05-24","body":"leaves drooping in the heat"}`
3. `{"date":"2026-05-24","body":""}`
4. `{"date":"2026-05-24","body":""}`

- [ ] **Step 7: Verify validation rejects a bad date and a non-string body**

Run:
```
curl.exe -s -b cookies.txt http://localhost:8787/api/notes/not-a-date
curl.exe -s -b cookies.txt -X PUT http://localhost:8787/api/notes/2026-05-24 -H "content-type: application/json" -d "{\"body\":123}"
```
Expected:
1. `{"error":"invalid date format, expected YYYY-MM-DD"}`
2. `{"error":"body must be a string"}`

- [ ] **Step 8: Stop the Worker, delete the cookie file, and commit**

Stop `wrangler dev` (Ctrl+C). Remove the temp cookie file so it is not committed:
```
Remove-Item cookies.txt
git add worker/notes.js worker/index.js
git commit -m "Add GET/PUT /api/notes/:date worker endpoints"
```

---

## Task 3: API client methods

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add `getNote` and `putNote` to the `api` object**

In `src/lib/api.js`, inside the exported `api` object, immediately after the `putCheckoffs` entry, add:

```js
  getNote: (date) => request(`/api/notes/${date}`),
  putNote: (date, body) =>
    request(`/api/notes/${date}`, { method: "PUT", body: JSON.stringify({ body }) }),
```

- [ ] **Step 2: Verify the file still parses**

Run:
```
npx vite build
```
Expected: build completes without errors (this also confirms no syntax mistakes were introduced).

- [ ] **Step 3: Commit**

```
git add src/lib/api.js
git commit -m "Add notes API client methods"
```

---

## Task 4: useDayNote hook

**Files:**
- Create: `src/lib/useDayNote.js`

- [ ] **Step 1: Create `src/lib/useDayNote.js`**

```js
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";

const DEBOUNCE_MS = 800;

// Per-day note with debounced autosave. Mirrors useCheckoffs:
//   - loads on date/enabled change, guarding stale responses
//   - keeps live text in state for instant typing
//   - autosaves DEBOUNCE_MS after the last keystroke; flush() saves immediately
// status is one of: "idle" | "saving" | "saved" | "error"
export function useDayNote(date, enabled) {
  const [note, setNoteState] = useState("");
  const [status, setStatus] = useState("idle");
  const dateKey = date ? ymd(date) : null;

  const requestId = useRef(0);
  const saveTimer = useRef(null);
  const latest = useRef("");   // most recent text the user has typed
  const dirty = useRef(false); // true when latest differs from what is saved

  const doSave = useCallback(async () => {
    if (!dateKey || !enabled || !dirty.current) return;
    const text = latest.current;
    setStatus("saving");
    try {
      await api.putNote(dateKey, text);
      if (latest.current === text) dirty.current = false;
      setStatus(dirty.current ? "saving" : "saved");
    } catch {
      setStatus("error");
    }
  }, [dateKey, enabled]);

  // Load the note when the selected day (or auth) changes.
  useEffect(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    dirty.current = false;
    latest.current = "";
    if (!dateKey || !enabled) { setNoteState(""); setStatus("idle"); return; }

    const myId = ++requestId.current;
    setStatus("idle");
    (async () => {
      try {
        const data = await api.getNote(dateKey);
        if (myId === requestId.current && !dirty.current) {
          setNoteState(data.body || "");
          latest.current = data.body || "";
        }
      } catch {
        // leave the box empty; user can still type and save
      }
    })();
  }, [dateKey, enabled]);

  const setNote = useCallback((value) => {
    latest.current = value;
    dirty.current = true;
    setNoteState(value);
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { doSave(); }, DEBOUNCE_MS);
  }, [doSave]);

  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    doSave();
  }, [doSave]);

  // Best-effort save when the tab is hidden (mobile background, tab switch).
  useEffect(() => {
    function onHide() { if (document.hidden) flush(); }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  return { note, setNote, status, flush };
}
```

- [ ] **Step 2: Verify the file parses**

Run:
```
npx vite build
```
Expected: build completes without errors. (Runtime behavior is verified through the UI in Task 8.)

- [ ] **Step 3: Commit**

```
git add src/lib/useDayNote.js
git commit -m "Add useDayNote hook with debounced autosave"
```

---

## Task 5: DayView component

**Files:**
- Create: `src/components/DayView.jsx`

- [ ] **Step 1: Create `src/components/DayView.jsx`**

```jsx
import { useState } from "react";
import { fmtL } from "../lib/dates.js";

export default function DayView({
  selected, detail, selStyle, threats,
  checked, onToggle,
  note, onChangeNote, onFlushNote, noteStatus,
  onBack,
}) {
  const [tab, setTab] = useState("tasks");
  const checkedCount = checked?.length ?? 0;
  const totalTasks = detail?.tasks?.length ?? 0;

  const statusLabel =
    noteStatus === "saving" ? "Saving..." :
    noteStatus === "saved"  ? "Saved" :
    noteStatus === "error"  ? "Save failed — keep typing to retry" : "";
  const statusColor =
    noteStatus === "error" ? "#f87171" :
    noteStatus === "saved" ? "#4ade80" : "#5a7a5a";

  return (
    <div style={{ padding: "12px 14px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 2px 14px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "8px 14px", color: "#a0d0a0",
            fontFamily: "'Courier New', monospace", fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0, letterSpacing: 1,
          }}>
          ‹ Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: selStyle?.color, textTransform: "uppercase" }}>
            {selStyle?.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.4 }}>
            {fmtL(selected)}, 2026
          </div>
        </div>
        {totalTasks > 0 && (
          <div style={{
            fontSize: 11, fontFamily: "'Courier New', monospace",
            color: checkedCount === totalTasks ? "#4ade80" : selStyle?.color,
            background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 8,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {checkedCount}/{totalTasks}
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 14,
        border: `1px solid ${selStyle?.color}44`, overflow: "hidden",
      }}>
        <div style={{ background: `${selStyle?.color}22`, padding: "14px 16px 12px", borderBottom: `1px solid ${selStyle?.color}33` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#e8f5e3", lineHeight: 1.2, letterSpacing: -0.3 }}>
            {detail?.title}
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { id: "tasks",   label: "Day Tasks" },
            { id: "notes",   label: "Notes" },
            { id: "threats", label: `Threats${threats.length > 0 ? ` (${threats.length})` : ""}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 0", background: "none",
              border: "none", borderBottom: tab === t.id ? `2px solid ${selStyle?.color}` : "2px solid transparent",
              color: tab === t.id ? selStyle?.color : "#5a7a5a",
              fontSize: 12, fontFamily: "'Courier New', monospace",
              fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", letterSpacing: 1, transition: "color 0.2s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "14px 16px" }}>
          {tab === "tasks" && detail && (
            <>
              <div style={{
                background: `${selStyle?.color}11`, borderRadius: 8,
                padding: "10px 12px", fontSize: 13, color: "#c0d8c0",
                lineHeight: 1.7, marginBottom: 16,
                border: `1px solid ${selStyle?.color}22`,
              }}>
                {detail.summary}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.tasks.map((task, i) => {
                  const isChecked = checked?.includes(i);
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => onToggle?.(i)}
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        background: isChecked ? "rgba(34,197,94,0.05)" : "transparent",
                        border: "none", borderRadius: 8,
                        padding: "4px 6px", margin: "-4px -6px",
                        textAlign: "left", width: "calc(100% + 12px)",
                        cursor: onToggle ? "pointer" : "default",
                        transition: "background 0.15s",
                      }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6,
                        background: isChecked ? selStyle?.color : `${selStyle?.color}22`,
                        color: isChecked ? "#0e1a12" : selStyle?.color,
                        fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        border: `1px solid ${isChecked ? selStyle?.color : `${selStyle?.color}44`}`,
                        transition: "background 0.15s, color 0.15s",
                      }}>
                        {isChecked ? "✓" : i + 1}
                      </div>
                      <div style={{
                        fontSize: 13.5, lineHeight: 1.7,
                        color: isChecked ? "#5a7a5a" : "#c8dcc8",
                        paddingTop: 3,
                        textDecoration: isChecked ? "line-through" : "none",
                        transition: "color 0.15s",
                      }}>
                        {task}
                      </div>
                    </button>
                  );
                })}
              </div>

              {detail.notes && (
                <div style={{
                  marginTop: 16, padding: "10px 14px",
                  background: "rgba(250,204,21,0.06)", borderRadius: 8,
                  borderLeft: "3px solid #f59e0b",
                  fontSize: 12.5, color: "#b8a870", lineHeight: 1.7,
                }}>
                  <strong style={{ color: "#f59e0b", fontStyle: "normal" }}>Note: </strong>
                  {detail.notes}
                </div>
              )}
            </>
          )}

          {tab === "notes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label htmlFor="day-note" style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1, color: "#7a9a7a", textTransform: "uppercase" }}>
                  Your notes & concerns
                </label>
                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: statusColor, minHeight: 12 }}>
                  {statusLabel}
                </span>
              </div>
              <textarea
                id="day-note"
                value={note}
                onChange={(e) => onChangeNote(e.target.value)}
                onBlur={() => onFlushNote()}
                placeholder="Write anything you observed or are worried about on this day — watering, leaf color, pests, weather, questions to look up later..."
                rows={12}
                style={{
                  width: "100%", resize: "vertical",
                  background: "rgba(0,0,0,0.25)", color: "#e8f5e3",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
                  padding: "12px 14px", fontSize: 14, lineHeight: 1.7,
                  fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
                }}
              />
            </div>
          )}

          {tab === "threats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {threats.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#3a5a3a", fontFamily: "'Courier New', monospace", fontSize: 13 }}>
                  No active threats for this phase.
                </div>
              ) : threats.map(threat => (
                <div key={threat.id} style={{
                  background: "rgba(245,158,11,0.07)", borderRadius: 10,
                  border: "1px solid rgba(245,158,11,0.2)", padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{threat.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", letterSpacing: -0.2 }}>
                      {threat.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#c0a87a", lineHeight: 1.7 }}>
                    {threat.desc}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file parses**

Run:
```
npx vite build
```
Expected: build completes without errors. (`DetailPanel` is still imported by `App.jsx` at this point, so the build should still succeed.)

- [ ] **Step 3: Commit**

```
git add src/components/DayView.jsx
git commit -m "Add full-screen DayView with Tasks/Notes/Threats tabs"
```

---

## Task 6: Wire App, swap layout, remove DetailPanel

**Files:**
- Modify (full rewrite): `src/App.jsx`
- Modify: `src/styles.css`
- Delete: `src/components/DetailPanel.jsx`

- [ ] **Step 1: Replace the entire contents of `src/App.jsx`**

```jsx
import { useCallback, useEffect, useState } from "react";
import { TODAY, daysBetween } from "./lib/dates.js";
import {
  PHASES,
  getPhase,
  getDetail,
  getThreatsForPhase,
  getNextMilestone,
  getGrowProgress,
} from "./lib/growData.js";
import { useAuth } from "./lib/auth.jsx";
import { useCheckoffs } from "./lib/useCheckoffs.js";
import { useDayNote } from "./lib/useDayNote.js";
import { ymd } from "./lib/api.js";

import Header from "./components/Header.jsx";
import MilestoneStrip from "./components/MilestoneStrip.jsx";
import Calendar from "./components/Calendar.jsx";
import PhaseLegend from "./components/PhaseLegend.jsx";
import DayView from "./components/DayView.jsx";
import ThreatsReference from "./components/ThreatsReference.jsx";
import AuthFooter from "./components/AuthFooter.jsx";

const SHELL_STYLE = {
  fontFamily: "'Georgia', 'Times New Roman', serif",
  background: "#0e1a12",
  minHeight: "100vh",
  paddingBottom: 24,
  color: "#f0ebe0",
};

export default function App() {
  const { user } = useAuth();
  const [month,    setMonth]    = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(null);

  const todayPhase = getPhase(TODAY);
  const todayStyle = todayPhase ? PHASES[todayPhase] : null;
  const nextMs     = getNextMilestone();
  const daysToNext = nextMs ? daysBetween(nextMs.date, TODAY) : 0;
  const progress   = getGrowProgress();

  const selPhase = selected ? getPhase(selected) : null;
  const selStyle = selPhase ? PHASES[selPhase]    : null;
  const detail   = selected ? getDetail(selected) : null;
  const threats  = selPhase ? getThreatsForPhase(selPhase) : [];

  const { checked, toggle } = useCheckoffs(selected, Boolean(user));
  const { note, setNote, status: noteStatus, flush: flushNote } =
    useDayNote(selected, Boolean(user));

  // Opening a day pushes a history entry so the device/browser back button
  // returns to the calendar instead of leaving the app.
  const openDay = useCallback((date) => {
    setSelected(date);
    window.history.pushState({ growDay: ymd(date) }, "");
  }, []);

  useEffect(() => {
    function onPop() { setSelected(null); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goBack = useCallback(() => {
    flushNote();
    window.history.back();
  }, [flushNote]);

  function pickDay(date)       { openDay(date); }
  function pickMilestone(date) { setMonth(date.getMonth()); openDay(date); }
  function jumpToday()         { setMonth(TODAY.getMonth()); openDay(TODAY); }

  if (selected) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen">
          <DayView
            selected={selected}
            detail={detail}
            selStyle={selStyle}
            threats={threats}
            checked={checked}
            onToggle={toggle}
            note={note}
            onChangeNote={setNote}
            onFlushNote={flushNote}
            noteStatus={noteStatus}
            onBack={goBack}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={SHELL_STYLE}>
      <Header
        todayStyle={todayStyle}
        nextMs={nextMs}
        daysToNext={daysToNext}
        progress={progress}
        onJumpToday={jumpToday}
      />
      <MilestoneStrip onPick={pickMilestone} />
      <div className="app-screen">
        <Calendar
          month={month}
          setMonth={setMonth}
          selected={selected}
          onPickDay={pickDay}
          onClearSelection={() => setSelected(null)}
        />
        <PhaseLegend />
        <ThreatsReference />
      </div>
      <AuthFooter />
    </div>
  );
}
```

- [ ] **Step 2: Replace the layout rules in `src/styles.css`**

Replace this exact block (the `.app-shell` rule at line 53 through the end of the `@media (min-width: 1400px)` block at line 104):

```css
.app-shell {
  width: 100%;
}

.app-header,
.app-strip {
  width: 100%;
}

.app-main {
  display: block;
}

.app-detail-wrap {
  display: block;
}

@media (min-width: 640px) and (max-width: 1023px) {
  .app-shell {
    max-width: 720px;
    margin: 0 auto;
  }
}

@media (min-width: 1024px) {
  .app-shell {
    max-width: 1400px;
    margin: 0 auto;
  }
  .app-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 460px);
    align-items: start;
    gap: 4px;
  }
  .app-main-left,
  .app-main-right {
    min-width: 0;
  }
  .app-main-right {
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
  }
}

@media (min-width: 1400px) {
  .app-main {
    grid-template-columns: minmax(0, 1fr) minmax(0, 520px);
  }
}
```

with this:

```css
.app-shell {
  width: 100%;
}

.app-screen {
  width: 100%;
}

/* Single centered column on every device. The calendar and the day view are
   the same readable width; the detail side panel no longer exists. */
@media (min-width: 640px) {
  .app-shell {
    max-width: 760px;
    margin: 0 auto;
  }
}
```

- [ ] **Step 3: Delete the obsolete DetailPanel component**

```
git rm src/components/DetailPanel.jsx
```

- [ ] **Step 4: Verify the production build succeeds with no references to DetailPanel**

Run:
```
npx vite build
```
Expected: build completes with no "failed to resolve import" errors. (If it errors about `DetailPanel`, a stray import remains — remove it.)

- [ ] **Step 5: Commit**

```
git add src/App.jsx src/styles.css
git commit -m "Swap to full-screen DayView; remove DetailPanel side panel"
```

---

## Task 7: Fix the display name to "The Grow Calendar"

**Files:**
- Modify: `src/components/Header.jsx`
- Modify: `index.html`
- Modify: `public/manifest.webmanifest`
- Modify: `launch.bat`

- [ ] **Step 1: Fix the main screen title in `src/components/Header.jsx`**

Change the title line:

```jsx
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, color: "#e8f5e3" }}>
            The Summer Grow
          </div>
```

to:

```jsx
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, color: "#e8f5e3" }}>
            The Grow Calendar
          </div>
```

- [ ] **Step 2: Fix the document title in `index.html`**

Change `<title>Grow Calendar</title>` to `<title>The Grow Calendar</title>`.

- [ ] **Step 3: Fix the PWA name in `public/manifest.webmanifest`**

Change the `name` field value from `Grow Calendar` to `The Grow Calendar`. Leave `short_name` as `Grow` (home-screen icon labels must stay short).

- [ ] **Step 4: Fix the dev window title in `launch.bat`**

Change `title Grow Calendar - Dev Server` to `title The Grow Calendar - Dev Server`.

- [ ] **Step 5: Confirm no remaining "Summer Grow" references**

Run:
```
git grep -n "Summer Grow"
```
Expected: no output (exit status 1, nothing found).

- [ ] **Step 6: Commit**

```
git add src/components/Header.jsx index.html public/manifest.webmanifest launch.bat
git commit -m "Rename display name to The Grow Calendar everywhere"
```

---

## Task 8: End-to-end verification + docs

**Files:**
- Modify: `DEV.md`

- [ ] **Step 1: Build and serve the full app locally**

Run:
```
npm run build
```
Then in a dedicated terminal:
```
npx wrangler dev
```
Open `http://localhost:8787` and sign in with the local test account (`test` / `testpass123` from Task 2; if the local DB was reset, sign up once).

- [ ] **Step 2: Verify the full-screen swap and back button**

In the browser:
1. Click a highlighted day. Expected: the calendar disappears and a full-screen day page appears with a back arrow, the date, the phase label, and the `Day Tasks | Notes | Threats` tabs.
2. Narrow the window to phone width (or use device emulation) and repeat. Expected: same full-screen behavior, no side panel anywhere.
3. Click the in-app "‹ Back" control. Expected: returns to the calendar at the same month.
4. Open a day again and press the browser/device Back button. Expected: also returns to the calendar (does not leave the app).

- [ ] **Step 3: Verify checkoffs still persist**

On a day page, Tasks tab: check a few tasks (the `n/n` counter updates), press Back, reopen the same day, then hard-reload the page (Ctrl+Shift+R) and reopen the day. Expected: the same tasks remain checked.

- [ ] **Step 4: Verify notes autosave and persist**

On a day page, Notes tab: type a few sentences. Expected: the status shows "Saving..." then "Saved" about a second after you stop typing. Press Back, reopen the same day, hard-reload, reopen. Expected: the typed note is still there. Clear the note entirely and wait; reopen. Expected: the box is empty (the row was deleted).

- [ ] **Step 5: Verify notes are per-day**

Open day A, type "note A". Open day B, type "note B". Reopen each. Expected: each day shows only its own note.

- [ ] **Step 6: Update `DEV.md`**

In `DEV.md`:
1. In the Roadmap, change `- [ ] Daily notes / journal` to `- [x] Daily notes / journal`.
2. In the Project layout `lib/` list, add a line: `    useDayNote.js                 Per-day note state hook with debounced autosave.`
3. In the Project layout `components/` list, add `DayView.jsx` and remove `DetailPanel.jsx` from the listed component names.
4. In the Project layout `worker/` list, add: `  notes.js                        GET/PUT /api/notes/:date.`

- [ ] **Step 7: Commit**

```
git add DEV.md
git commit -m "Update DEV.md for notes feature and DayView"
```

- [ ] **Step 8: Create the remote table, then deploy (only when the user approves shipping)**

Confirm with the user before making any remote change. Then create the production `day_notes` table (deferred from Task 1):
```
npx wrangler d1 execute grow-calendar-db --remote --command "CREATE TABLE IF NOT EXISTS day_notes (user_id INTEGER NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);"
```
Expected: a success summary against the remote DB. Then publish:
```
npm run deploy
```
Or push to `main` (Cloudflare auto-deploys per `DEV.md`). Note: pushing to `main` deploys the new code, which expects the `day_notes` table — so the remote `d1 execute` above MUST run before the code goes live, or notes requests will error in production.

---

## Notes for the implementer

- The app gates the whole UI behind login, so `enabled` passed to `useDayNote` / `useCheckoffs` is effectively always true in practice; the guards are a safety net.
- Do not rename `grow-calendar` / `grow-calendar-db` in `wrangler.jsonc` or the `name` in `package.json` — those are infrastructure identifiers, not display names. Renaming them breaks the deployment and the D1 binding.
- `fmtL(selected)` returns a month/day string (e.g. "May 24"); the `, 2026` suffix is appended in the markup, matching the old `DetailPanel` exactly.
- The local and remote D1 databases are separate. A user created locally (Task 2) does not exist in production and vice versa.
