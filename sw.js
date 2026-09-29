// Service worker : permet d'ouvrir l'appli sans réseau.
// Fichiers de l'appli : réseau d'abord (pour recevoir les mises à jour), cache en secours.
// Les appels Google / Microsoft ne passent pas par le cache.

const CACHE = "fraiskm-v1";
const MSAL = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.28.1/lib/msal-browser.min.js";
const FICHIERS = [
  "./",
  "index.html",
  "style.css",
  "manifest.json",
  "js/config.js",
  "js/app.js",
  "js/geo.js",
  "js/onedrive.js",
  "js/storage.js",
  "js/csv.js",
  "js/voice.js",
  "js/parametres.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  MSAL,
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin && e.request.url !== MSAL) return;

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copie = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return r;
      })
      // ignoreSearch : le retour de connexion Microsoft ajoute des paramètres à l'adresse.
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./")))
  );
});
