const CACHE_NAME = "mitsuketa-zukan-system-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app-icon.svg",
  "./assets/library-backdrop.svg",
  "./assets/shelf-wood.svg",
  "./assets/cover-leather.svg",
  "./assets/cover-linen.svg",
  "./assets/cover-grain.svg",
  "./assets/empty-collection.svg",
  "./assets/nav-home.svg",
  "./assets/nav-search.svg",
  "./assets/nav-books.svg",
  "./assets/nav-settings.svg",
  "./assets/theme-night-library.svg",
  "./assets/theme-nature.svg",
  "./assets/theme-block.svg",
  "./assets/theme-sticker.svg",
  "./assets/theme-plush.svg",
  "./assets/theme-classic.svg",
  "./assets/night-library-bg.svg",
  "./assets/wood-shelf.svg",
  "./assets/texture-leather.svg",
  "./assets/texture-linen.svg",
  "./assets/gold-corners.svg",
  "./assets/preset-night.svg",
  "./assets/preset-nature.svg",
  "./assets/preset-collection.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match("./index.html")))
  );
});
