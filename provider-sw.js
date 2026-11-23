// The provider web portal is retired; providers use the ATL Xpres mobile app.
// Browsers that installed the portal fetch this updated worker, which deletes the
// cached portal, unregisters itself and reloads open portal tabs onto the notice page.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    await self.registration.unregister();
    var clients = await self.clients.matchAll({type: 'window'});
    clients.forEach(function (client) { if (client.navigate) client.navigate(client.url); });
  })());
});
