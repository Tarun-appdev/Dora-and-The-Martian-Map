// Cache-first so the HUD, its 3D terrain and the last mission work with no network.
const CACHE = 'eva-hud-3d-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'hud-terrain.js', 'terrain-renderer.js',
               'vendor/three.module.js', 'vendor/three.core.js', 'terrain/meta.json'];
const BIG = ['terrain/elevation.f32'];   // about 22 MB, cached on a best-effort basis
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(BIG.map(u => c.add(u).catch(() => {})));
  }));
  self.skipWaiting();
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('mission.json')) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
