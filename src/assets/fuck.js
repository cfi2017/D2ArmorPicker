self.addEventListener('fetch', (event) => {
  // Using a URL object will make routing easier.
  const url = new URL(event.request.url);
  const pathAndQuery = url.pathname + url.search;

  if (pathAndQuery in MOCK_DATA) {
    const cacheKey = MOCK_DATA[pathAndQuery];
    event.respondWith(
      caches.match(cacheKey, {
        cacheName: CACHE_NAME,
      })
    );
  }

  // If pathAndQuery isn't in MOCK_DATA, then respondWith()
  // won't be called, and the default network behavior will
  // be used for this request.
});
