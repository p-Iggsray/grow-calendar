// Service worker: cache-first for static assets, pass-through for API,
// push notification handler, and offline fallback.

const CACHE = "grow-calendar-v2";
// Vite-built JS/CSS files have content-hash suffixes — treat them as immutable.
const IMMUTABLE_RE = /\.(js|css|woff2?)(\?.*)?$/;

// ── Install: seed the cache with the app shell ──────────────────────────────
self.addEventListener("install", evt => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE).then(c =>
      // Best-effort — failure here doesn't abort install
      c.addAll(["/", "/index.html", "/manifest.webmanifest"]).catch(() => {})
    )
  );
});

// ── Activate: delete stale caches from previous versions ────────────────────
self.addEventListener("activate", evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache strategy per resource type ──────────────────────────────────
self.addEventListener("fetch", evt => {
  const { request } = evt;
  const url = new URL(request.url);

  // Don't intercept non-GET, API calls, or cross-origin requests.
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  evt.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);

      // Immutable hashed assets: serve from cache, skip network entirely.
      if (cached && IMMUTABLE_RE.test(url.pathname)) return cached;

      // For everything else: network-first, cache on success, fall back to cache.
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return cached ?? new Response("Offline — please check your connection.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })
  );
});

// ── Push: fetch notification content from the server and show it ─────────────
self.addEventListener("push", evt => {
  evt.waitUntil(
    fetch("/api/push/today", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        const title = data?.title ?? "The Grow Calendar";
        const body = data?.body ?? "Check in on your grow today.";
        const url = data?.url ?? "/";
        return self.registration.showNotification(title, {
          body,
          icon: "/icon-180.png",
          badge: "/icon-32.png",
          data: { url },
          tag: "grow-reminder",
          renotify: false,
        });
      })
  );
});

// ── Notification click: focus or open the app ────────────────────────────────
self.addEventListener("notificationclick", evt => {
  evt.notification.close();
  const url = evt.notification.data?.url ?? "/";
  evt.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url.includes(self.location.origin));
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});
