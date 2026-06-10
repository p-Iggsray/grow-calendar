// @ts-check
// System-prompt context builders: grow log, weather, stats, supplies, grows list.

export async function buildGrowLogContext(env, userId, growId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const res = await env.DB.prepare(
    `SELECT date, water_gal, feed, temp_high, temp_low, humidity
     FROM grow_log
     WHERE user_id = ? AND grow_id = ? AND date >= ?
     ORDER BY date DESC`
  ).bind(userId, growId, cutoffStr).all();

  const rows = res.results ?? [];
  if (rows.length === 0) return "RECENT GROW LOG (last 14 days): No entries recorded yet.";

  const lines = ["RECENT GROW LOG (last 14 days):"];
  for (const r of rows) {
    const parts = [];
    if (r.water_gal != null) parts.push(`${r.water_gal} gal water`);
    if (r.temp_high != null || r.temp_low != null) {
      parts.push(`temp ${r.temp_high ?? "?"}°/${r.temp_low ?? "?"}°F`);
    }
    if (r.humidity != null) parts.push(`${r.humidity}% RH`);
    if (r.feed) parts.push(`feed: ${r.feed}`);
    lines.push(`  ${r.date}: ${parts.length > 0 ? parts.join(", ") : "(no fields logged)"}`);
  }
  return lines.join("\n");
}

export async function buildWeatherContext(env) {
  try {
    // Read from cache directly — avoid importing getWeather which returns a Response.
    const row = await env.DB.prepare(
      "SELECT value, updated_at FROM weather_cache WHERE key LIKE 'weather:hourly:%' LIMIT 1"
    ).first();
    const alertRow = await env.DB.prepare(
      "SELECT value FROM weather_cache WHERE key LIKE 'weather:alerts:%' LIMIT 1"
    ).first();

    const lines = ["CURRENT WEATHER (Athens, OH):"];
    if (row?.value) {
      try {
        const { periods, highLow } = JSON.parse(row.value);
        if (highLow?.high != null || highLow?.low != null) {
          lines.push(`  Forecast today: High ${highLow.high ?? "?"}°F, Low ${highLow.low ?? "?"}°F`);
        }
        const current = periods?.[0];
        if (current) {
          lines.push(`  Now: ${current.temp}°F — ${current.shortForecast}`);
        }
        const next = periods?.slice(1, 4);
        if (next?.length) {
          const nexts = next.map(p => `${p.temp}°F (${p.shortForecast})`).join(" → ");
          lines.push(`  Next ${next.length}h: ${nexts}`);
        }
      } catch { /* corrupt cache */ }
    }
    if (alertRow?.value) {
      try {
        const alerts = JSON.parse(alertRow.value);
        if (alerts.length > 0) {
          lines.push(`  ⚠ ACTIVE ALERTS:`);
          for (const a of alerts.slice(0, 3)) {
            lines.push(`    - ${a.event}: ${a.headline || a.severity}`);
          }
        }
      } catch { /* corrupt cache */ }
    }
    if (lines.length === 1) lines.push("  (no recent weather data — cache may be cold)");
    return lines.join("\n");
  } catch {
    return "CURRENT WEATHER: unavailable";
  }
}

export async function buildStatsContext(env, userId, growId) {
  try {
    const [logRow, checkoffRow] = await Promise.all([
      env.DB.prepare(`
        SELECT
          ROUND(COALESCE(SUM(water_gal), 0), 2) AS total_water,
          COUNT(CASE WHEN feed IS NOT NULL AND feed != '' THEN 1 END) AS feed_days,
          COUNT(*) AS log_days
        FROM grow_log WHERE user_id = ? AND grow_id = ?
      `).bind(userId, growId).first(),
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done
        FROM task_checkoffs WHERE user_id = ? AND grow_id = ?
      `).bind(userId, growId).first(),
    ]);

    const lines = ["SEASON STATS:"];
    if (logRow) {
      lines.push(`  Total water logged: ${logRow.total_water ?? 0} gal over ${logRow.log_days ?? 0} days`);
      lines.push(`  Feed days recorded: ${logRow.feed_days ?? 0}`);
    }
    if (checkoffRow && Number(checkoffRow.total) > 0) {
      const total = Number(checkoffRow.total);
      const done  = Number(checkoffRow.done ?? 0);
      const pct   = Math.round((done / total) * 100);
      lines.push(`  Tasks completed: ${done}/${total} (${pct}%)`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export function buildSupplyContext(survey) {
  if (!survey?.supplies) return "";
  const LABELS = {
    soil: "potting mix", perlite: "perlite", containers: "containers/pots",
    calmag: "Cal-Mag", veg_nutes: "veg nutrients", bloom_nutes: "bloom nutrients",
    bloom_boost: "bloom booster", ph_kit: "pH kit", tds_meter: "TDS/EC meter",
    support: "stakes/trellis", ties: "plant ties", watering: "watering can/irrigation",
    loupe: "jeweler's loupe", humidity: "hygrometer", drying: "drying space",
    jars: "mason jars", neem: "pest preventative",
  };
  const have = [];
  const need = [];
  for (const [id, status] of Object.entries(survey.supplies)) {
    const label = LABELS[id] || id;
    if (status === "have") have.push(label);
    else if (status === "need_to_order") need.push(label);
  }
  if (have.length === 0 && need.length === 0) return "";
  const lines = ["GROWER'S SUPPLIES:"];
  if (have.length > 0) lines.push(`  On hand: ${have.join(", ")}`);
  if (need.length > 0) lines.push(`  Still need to order: ${need.join(", ")}`);
  return lines.join("\n");
}

export function buildGrowsContext(grows, activeGrowId) {
  if (!grows || grows.length <= 1) return "";
  const lines = ["ALL GROWER'S GROWS:"];
  for (const g of grows) {
    const isActive = g.id === activeGrowId;
    const strains = g.generatedPlan?.strains?.map(s => s.name).filter(Boolean).join(" × ")
      || g.survey?.strains?.map(s => s.name).filter(Boolean).join(" × ")
      || "";
    const statusLabel = g.status === "active" ? "active" : g.status;
    lines.push(`  - "${g.displayName}" [${statusLabel}]${strains ? ` — ${strains}` : ""}${isActive ? " ← ACTIVE GROW (calendar context)" : ""}`);
  }
  lines.push("When asked about a specific grow other than the active one, acknowledge which one you're discussing.");
  return lines.join("\n");
}
