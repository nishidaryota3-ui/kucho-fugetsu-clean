self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  return self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // 常にネットワークの最新データを優先取得
  e.respondWith(fetch(e.request));
});
