// Service worker: cache-first for static assets, pass-through for API, and an
// offline fallback.

const CACHE = "grow-calendar-v2";
// Vite-built JS/CSS files have content-hash suffixes — treat them as immutable.
const IMMUTABLE_RE = /\.(js|css|woff2?)(\?.*)?$/;

// ── Install: seed the cache with the app shell ──────────────────────────────
// The stampSwVersion build plugin injects the new build's JS/CSS bundle URLs
// below, so by the time this SW activates its cache already holds the full new
// shell. Activation is message-driven: the page (main.jsx) tells the installed
// worker to SKIP_WAITING once it is ready, then reloads itself on
// controllerchange - the reload fetches the new index.html whose chunks are
// pre-cached here, which is what makes immediate takeover safe (no
// blank-screen race on flaky connections).
self.addEventListener("install", evt => {
  evt.waitUntil(
    caches.open(CACHE).then(c =>
      // Best-effort — failure here doesn't abort install.
      c.addAll(["/", "/index.html", "/manifest.webmanifest"]).catch(() => {})
    )
  );
});

// The page promotes a freshly-installed worker so every deploy goes live on
// the very next check instead of waiting for all tabs/the PWA to fully close.
self.addEventListener("message", evt => {
  if (evt.data?.type === "SKIP_WAITING") self.skipWaiting();
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
