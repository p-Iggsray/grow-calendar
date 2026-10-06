import { daysBetweenKeys, rangeLabel, shortDate, weeksRangeLabel } from "../lib/plantClock.js";
import HarvestLine, { HARVEST_COLOR } from "./HarvestLine.jsx";

const MONO = "var(--font-num)";
const BAR_HEIGHT = 8;

// The road from the day the breeder's clock started to the end of the window:
// how far along it is, and where the window sits on it. A photoperiod that has
// not been flipped has no road yet, so it says what will start one.
export default function HarvestWindowBar({ window, status, todayKey }) {
  if (!window) return null;
  if (window.pending) {
    return (
      <div>
        <HarvestLine window={window} status={status} todayKey={todayKey} size={12.5} />
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.5 }}>
          Move it to Flowering to start the countdown. The breeder says {weeksRangeLabel({ min: window.minWeeks, max: window.maxWeeks })} from there.
        </div>
      </div>
    );
  }

  const total = Math.max(1, daysBetweenKeys(window.anchor, window.end));
  const pct = (key) => `${Math.min(100, Math.max(0, (daysBetweenKeys(window.anchor, key) / total) * 100))}%`;
  const doneTo = window.harvestedOn ?? todayKey;
  const from = window.auto ? "Started" : "Flipped";

  return (
    <div>
      <HarvestLine window={window} status={status} todayKey={todayKey} size={12.5} />
      <div
        role="img"
        aria-label={`${from} ${shortDate(window.anchor)}, harvest window ${rangeLabel(window.start, window.end)}`}
        style={{
          position: "relative", height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, marginTop: 10,
          background: "var(--c-surface-2)", overflow: "hidden",
        }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: pct(window.start), right: 0,
          background: HARVEST_COLOR, opacity: 0.35,
        }} />
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: pct(doneTo),
          background: HARVEST_COLOR, opacity: 0.9,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)" }}>
        <span>{from} {shortDate(window.anchor)}</span>
        <span>Window {rangeLabel(window.start, window.end)} ({weeksRangeLabel({ min: window.minWeeks, max: window.maxWeeks })})</span>
      </div>
    </div>
  );
}
