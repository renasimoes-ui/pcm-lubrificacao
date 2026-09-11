const CACHE_NAME = 'pcm-lubrificacao-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(error => {
        console.error('Erro ao criar cache:', error);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // APIs sempre vão direto ao servidor.
  if (
    request.method !== 'GET' ||
    new URL(request.url).pathname.startsWith('/api/')
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        // Atualiza o cache somente para respostas válidas.
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, copy);
          });
        }

        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then(cachedResponse => {
            return cachedResponse || caches.match('/index.html');
          });
      })
  );
});
