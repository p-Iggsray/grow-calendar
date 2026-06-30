// Parses an AC-Infinity-style controller CSV export into environment readings.
// Expected header (column order may vary; we match by name, fall back to order):
//   Timestamp(1 min),Built-in Temperature(℉),Built-in Humidity(%),Built-in VPD(kPa),
//   Probe Temperature(℉),Probe Humidity(%),Probe VPD(kPa)
// Probe columns are "-" when no probe is attached; built-in is preferred, probe
// is used as a fallback. Returns { readings, skipped }.

function num(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// "2026/06/28 09:38:00" -> "2026-06-28T09:38" (minute resolution, drop seconds).
function normalizeTs(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\//g, "-").replace(" ", "T");
  const m = t.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function findCol(headers, ...needles) {
  return headers.findIndex(h => {
    const low = h.toLowerCase();
    return needles.every(n => low.includes(n));
  });
}

export function parseEnvCsv(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return { readings: [], skipped: 0 };

  const headers = lines[0].split(",").map(h => h.trim());
  // Match columns by name; fall back to the documented positions.
  const tsIdx = findCol(headers, "timestamp") >= 0 ? findCol(headers, "timestamp") : 0;
  const biTemp = findCol(headers, "built-in", "temp");
  const biHum  = findCol(headers, "built-in", "humid");
  const biVpd  = findCol(headers, "built-in", "vpd");
  const prTemp = findCol(headers, "probe", "temp");
  const prHum  = findCol(headers, "probe", "humid");
  const prVpd  = findCol(headers, "probe", "vpd");

  const tempCols = [biTemp >= 0 ? biTemp : 1, prTemp >= 0 ? prTemp : 4];
  const humCols  = [biHum  >= 0 ? biHum  : 2, prHum  >= 0 ? prHum  : 5];
  const vpdCols  = [biVpd  >= 0 ? biVpd  : 3, prVpd  >= 0 ? prVpd  : 6];

  const pick = (cells, cols) => {
    for (const c of cols) {
      if (c >= 0 && c < cells.length) {
        const v = num(cells[c]);
        if (v !== null) return v;
      }
    }
    return null;
  };

  const readings = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const ts = normalizeTs(cells[tsIdx]);
    if (!ts) { skipped++; continue; }
    const tempF = pick(cells, tempCols);
    const humidity = pick(cells, humCols);
    const vpd = pick(cells, vpdCols);
    if (tempF === null && humidity === null && vpd === null) { skipped++; continue; }
    readings.push({ ts, tempF, humidity, vpd });
  }
  return { readings, skipped };
}
