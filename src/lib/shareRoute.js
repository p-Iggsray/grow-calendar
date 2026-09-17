// Where the friend view is, encoded in the URL.
//
// The whole state of a read lives in the query string: which space, which
// view, which day. That is what makes the phone's back button step back
// through what somebody just read instead of leaving the page, and what makes
// a single day of a single space something they can send on to someone else.
//
// Pure string work, so the rules are testable without a browser.

export const SHARE_TABS = ["calendar", "journal", "photos"];
export const DEFAULT_TAB = "calendar";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPACE_RE = /^[A-Za-z0-9]{1,40}$/;

/** Read a route out of a location's search string. Anything unrecognised
 *  falls back rather than throwing: a hand-edited URL should land somewhere. */
export function parseRoute(search) {
  const q = new URLSearchParams(String(search ?? ""));
  const spaceId = q.get("g");
  const tab = q.get("t");
  const date = q.get("d");
  return {
    spaceId: SPACE_RE.test(spaceId ?? "") ? spaceId : null,
    tab: SHARE_TABS.includes(tab) ? tab : DEFAULT_TAB,
    date: DATE_RE.test(date ?? "") ? date : null,
  };
}

/** The search string for a route, or "" for the plain link. The default tab is
 *  left out so the URL somebody is handed first is the shortest one. */
export function routeSearch(route) {
  const q = new URLSearchParams();
  if (SPACE_RE.test(route?.spaceId ?? "")) q.set("g", route.spaceId);
  if (SHARE_TABS.includes(route?.tab) && route.tab !== DEFAULT_TAB) q.set("t", route.tab);
  if (DATE_RE.test(route?.date ?? "")) q.set("d", route.date);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * The month the calendar opens on.
 *
 * An open day wins: arriving on a deep link must land on that day's month.
 * Otherwise it is the month of the last thing written in the space, because a
 * link to a grow that finished in June is useless if it opens on September and
 * shows a blank grid. Today is only the answer when the space has nothing in
 * it at all, or when the newest entry is already in this month.
 */
export function openingMonth({ date, lastDate, today }) {
  const pick = (key) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 });
  if (DATE_RE.test(date ?? "")) return pick(date);
  const now = { year: today.getFullYear(), month: today.getMonth() };
  if (!DATE_RE.test(lastDate ?? "")) return now;
  const last = pick(lastDate);
  // Never open ahead of today, which a clock skew or a future-dated entry
  // could otherwise cause.
  if (last.year > now.year || (last.year === now.year && last.month >= now.month)) return now;
  return last;
}
