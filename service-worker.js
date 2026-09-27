const VERSION = "textures-v21";
const CACHE_NAME = "mitsuketa-zukan-theme-art-v21";
const BASE = self.registration.scope;
const CORE = ["./", "./index.html", "./manifest.webmanifest",
  "./assets/texture-leather.webp", "./assets/texture-crosshatch.webp",
  "./assets/texture-woven.webp", "./assets/texture-paper.webp",
  "./assets/texture-grain.webp", "./assets/texture-linen.webp",
  "./assets/texture-emboss.webp", "./assets/texture-smooth.webp"];
const OPTIONAL = ["./update.html", "./app-icon.svg", "./icon-512.png", "./icon-192.png", "./apple-touch-icon.png",
  "./assets/ui-welcome-hero.svg", "./assets/ui-empty-album.svg", "./assets/ui-pro-hero.svg", "./assets/ui-discovery-cluster.svg",
  "./assets/checker.svg", "./assets/library-backdrop.svg", "./assets/shelf-wood.svg", "./assets/cover-leather.svg", "./assets/cover-linen.svg",
  "./assets/cover-grain.svg", "./assets/empty-collection.svg", "./assets/welcome-library.svg", "./assets/nav-home.svg", "./assets/nav-search.svg",
  "./assets/nav-books.svg", "./assets/nav-settings.svg", "./assets/nav-user.svg", "./assets/theme-night-library.svg", "./assets/theme-nature.svg",
  "./assets/theme-block.svg", "./assets/theme-sticker.svg", "./assets/theme-plush.svg", "./assets/theme-classic.svg", "./assets/night-library-bg.svg",
  "./assets/wood-shelf.svg", "./assets/gold-corners.svg", "./assets/preset-night.svg", "./assets/preset-nature.svg", "./assets/preset-collection.svg",
  "./assets/icon-leaf.svg", "./assets/icon-flower.svg", "./assets/icon-bird.svg", "./assets/icon-butterfly.svg", "./assets/icon-blocks.svg",
  "./assets/icon-sticker.svg", "./assets/icon-plush.svg", "./assets/icon-object.svg", "./assets/icon-cafe.svg", "./assets/icon-camera.svg",
  "./assets/icon-heart.svg", "./assets/icon-bookmark.svg", "./assets/icon-sliders.svg", "./assets/icon-more.svg", "./assets/icon-plus.svg", "./assets/icon-back.svg"];
const absolute = path => new URL(path, BASE).href;
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map(path => new Request(absolute(path), {cache: "reload"})));
    await Promise.all(OPTIONAL.map(async path => {
      try { await cache.add(new Request(absolute(path), {cache: "reload"})); } catch (_) { /* Optional art must not block the update. */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("mitsuketa-zukan-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data && event.data.type === "GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage({version: VERSION});
  }
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;
  if (/^\/(?:api)(?:\/|$)/.test(url.pathname.slice(new URL(BASE).pathname.length - 1))) return;
  const root = new URL(BASE).pathname;
  const isAppPage = url.pathname === root || url.pathname === root + "index.html";
  const isStatic = url.pathname.startsWith(root + "assets/") || /\.(?:png|svg|webmanifest|js)$/.test(url.pathname);
  const sensitive = url.searchParams.has("session_id") || url.searchParams.has("purchase") || url.searchParams.has("support");
  const key = isAppPage ? absolute("./index.html") : url.origin + url.pathname;
  event.respondWith((async () => {
    try {
      const response = await fetch(new Request(request, {cache: request.mode === "navigate" ? "no-store" : "no-cache"}));
      if (response.ok && !response.redirected && !sensitive && (isAppPage || isStatic || url.pathname === root + "update.html")) {
        try { const cache = await caches.open(CACHE_NAME); await cache.put(key, response.clone()); } catch (_) { /* Serve online even if storage is full. */ }
      }
      return response;
    } catch (_) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(key);
      if (cached) return cached;
      if (request.mode === "navigate" && isAppPage) {
        const fallback = await cache.match(absolute("./index.html"));
        if (fallback) return fallback;
      }
      // Never return HTML for a failed image request.
      return new Response("Offline resource unavailable", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}});
    }
  })());
});
