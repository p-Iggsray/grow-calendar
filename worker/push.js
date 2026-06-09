// @ts-check
// Push notification backend: VAPID key management, subscription CRUD,
// daily cron sender, and the /api/push/today endpoint consumed by the SW.
import { json, error, safeJsonBounded } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { logError, logInfo } from "./log.js";

const VAPID_SUBJECT = "mailto:admin@growcalendar.app";

// ── Base64url helpers ─────────────────────────────────────────────────────────

function base64urlEncode(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── VAPID key storage ─────────────────────────────────────────────────────────
// Keys are auto-generated on first use and stored in the settings D1 table.
// Env vars VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY_JWK override stored keys.

async function generateAndStoreVapidKeys(env) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const rawPub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const privJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
  const pubKey = base64urlEncode(new Uint8Array(rawPub));

  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_public_key', ?)").bind(pubKey),
    env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_private_key_jwk', ?)").bind(privJwk),
  ]);
  return { publicKey: pubKey, privateKeyJwk: privJwk };
}

async function getVapidKeys(env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY_JWK) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKeyJwk: env.VAPID_PRIVATE_KEY_JWK };
  }
  const [pubRow, privRow] = await Promise.all([
    env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid_public_key'").first(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid_private_key_jwk'").first(),
  ]);
  if (pubRow?.value && privRow?.value) {
    return { publicKey: pubRow.value, privateKeyJwk: privRow.value };
  }
  return generateAndStoreVapidKeys(env);
}

// ── VAPID JWT creation ────────────────────────────────────────────────────────

async function createVapidJwt(endpoint, privateKeyJwk) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const enc = new TextEncoder();

  const header  = base64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64urlEncode(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: VAPID_SUBJECT,
  })));
  const input = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    typeof privateKeyJwk === "string" ? JSON.parse(privateKeyJwk) : privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${base64urlEncode(new Uint8Array(sig))}`;
}

// ── Send one empty push (SW fetches content on receipt) ──────────────────────

async function sendPush(endpoint, vapidJwt, vapidPublicKey) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${vapidJwt},k=${vapidPublicKey}`,
      "TTL": "86400",
      "Urgency": "normal",
    },
  });
  return res.status;
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function getPushVapidKey(env) {
  try {
    const { publicKey } = await getVapidKeys(env);
    return json({ key: publicKey });
  } catch (e) {
    logError("push-vapid-key", { message: String(e?.message ?? e) });
    return error(503, "Push notifications are not available");
  }
}

export async function postPushSubscribe(request, env, user) {
  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const { endpoint, keys } = body ?? {};
  if (!endpoint || typeof endpoint !== "string") return error(400, "endpoint required");
  if (!keys?.p256dh || !keys?.auth) return error(400, "keys.p256dh and keys.auth required");

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh  = excluded.p256dh,
       auth    = excluded.auth`
  ).bind(user.id, endpoint, keys.p256dh, keys.auth, new Date().toISOString()).run();

  return json({ ok: true });
}

export async function deletePushSubscribe(request, env, user) {
  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const { endpoint } = body ?? {};
  if (!endpoint) return error(400, "endpoint required");

  await env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?"
  ).bind(user.id, endpoint).run();

  return json({ ok: true });
}

export async function getPushToday(env, user) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  try {
    const raw = await loadRawPlan(env, user.id);
    if (raw.needsSetup) return json({ title: "The Grow Calendar", body: "Check in on your grow today.", url: "/" });

    const config = parseConfig(raw.config);
    const todayDt = parseDate(today);
    const phase = getPhase(todayDt, config);
    if (!phase) return json({ title: "The Grow Calendar", body: "Check in on your grow today.", url: "/" });

    const detail = getDetail(todayDt, config, raw.overrides, raw.generatedPlan, raw.phaseOverrides);
    const n = detail.tasks?.length ?? 0;
    return json({
      title: detail.title ?? "Grow Calendar",
      body: n > 0
        ? `${n} task${n === 1 ? "" : "s"} today — ${(detail.summary ?? "").slice(0, 80)}`
        : "Check in on your grow today.",
      url: `/?d=${today}`,
    });
  } catch (e) {
    logError("push-today", { message: String(e?.message ?? e) });
    return json({ title: "The Grow Calendar", body: "Check in on your grow today.", url: "/" });
  }
}

// ── Cron: send daily reminders to all subscribers ────────────────────────────

export async function sendDailyReminders(env) {
  let vapidKeys;
  try {
    vapidKeys = await getVapidKeys(env);
  } catch {
    logInfo("push-daily-skip", { reason: "VAPID keys unavailable" });
    return;
  }

  const rows = await env.DB.prepare("SELECT user_id, endpoint FROM push_subscriptions").all();
  if (!rows.results?.length) {
    logInfo("push-daily-skip", { reason: "no subscriptions" });
    return;
  }

  logInfo("push-daily-start", { count: rows.results.length });
  let sent = 0, cleaned = 0, failed = 0;

  for (const sub of rows.results) {
    try {
      const jwt = await createVapidJwt(sub.endpoint, vapidKeys.privateKeyJwk);
      const status = await sendPush(sub.endpoint, jwt, vapidKeys.publicKey);

      if (status === 410 || status === 404) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(sub.endpoint).run();
        cleaned++;
      } else if (status >= 200 && status < 300) {
        sent++;
      } else {
        logError("push-send-non2xx", { status, endpoint: sub.endpoint.slice(0, 50) });
        failed++;
      }
    } catch (e) {
      logError("push-send-error", { endpoint: sub.endpoint.slice(0, 50), message: String(e?.message ?? e) });
      failed++;
    }
  }

  logInfo("push-daily-done", { sent, cleaned, failed });
}
