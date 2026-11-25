/*
 * Offline-Funktion ("Service Worker").
 * Speichert NUR die Programmdateien der Webseite auf dem Gerät,
 * damit sie auch ohne Internet startet. Deine Finanzdaten werden
 * hier nicht berührt.
 *
 * Nach Änderungen am Code: VERSION erhöhen, damit Geräte die neue
 * Version laden.
 */
const VERSION = "finanz-dashboard-v20";
const DATEIEN = [
  "./",
  "index.html",
  "css/style.css",
  "js/xlsx-reader.js",
  "js/rechnen.js",
  "js/app.js",
  "vendor/chart.umd.min.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "beispieldaten/beispiel-finanzen.xlsx",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Zuerst aus dem Netz (damit Updates ankommen), sonst aus dem Offline-Speicher
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(antwort => {
        const kopie = antwort.clone();
        if (antwort.ok) caches.open(VERSION).then(c => c.put(event.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
