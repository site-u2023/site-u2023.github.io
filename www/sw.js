const CACHE_NAME = 'openwrt-builder-v2';
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
      .then(() => self.skipWaiting())  // 追加：即座にアクティベート
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
