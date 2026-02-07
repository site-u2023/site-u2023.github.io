const CACHE_NAME = 'openwrt-builder-v1';
const urlsToCache = [
  './index.html',
  './custom.html',
  './custom.js',
  './index.js',
  './config.js',
  './index.css',
  './custom.css',
  './logo.svg',
  './img/OpenWrt_Logo.svg',
  './img/openwrt_text_blue_and_dark_blue.svg',
  './img/openwrt_text_white_and_blue.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
