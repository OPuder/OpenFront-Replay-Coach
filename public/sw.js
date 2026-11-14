const CACHE_NAME = "openfront-replay-coach-shell-v2.2.35";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const base = self.registration.scope;
    const shell = [
      base,
      new URL("manifest.webmanifest", base).href,
      new URL("icons/replay-coach-192.png", base).href,
      new URL("icons/replay-coach-512.png", base).href,
      new URL("icons/replay-coach-maskable-512.png", base).href
    ];
    await Promise.all(shell.map(async url => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (url === base && response.ok) {
          const html = await response.clone().text();
          const bundledAssets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
            .map(match => new URL(match[1], base))
            .filter(asset => asset.origin === new URL(base).origin && asset.pathname.startsWith(new URL(base).pathname));
          await Promise.all(bundledAssets.map(async asset => {
            try {
              const bundle = await fetch(asset.href, { cache: "reload" });
              if (bundle.ok) await cache.put(asset.href, bundle);
            } catch {
              // Keep the rest of the shell even if one optional asset is unreachable.
            }
          }));
        }
        if (response.ok) await cache.put(url, response.clone());
      } catch {
        // A transient network issue should not prevent the first installation.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("openfront-replay-coach-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(scope.href, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(scope.href);
        if (cached) return cached;
        return new Response("Die Replay-Coach-Oberfläche ist offline nicht verfügbar. Bitte verbinde dich mit dem Internet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  // Cache only the app's own static shell. Replay JSON, OpenFront API traffic
  // and user-selected files are deliberately never stored by this worker.
  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
