/* ===================================================================
   sw.js — Service worker: แคชหน้าแอป + รับไฟล์สลิปที่แชร์เข้ามา
   =================================================================== */
const VERSION = 'mj-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'mj-share').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* ---------- รับสลิปจากเมนูแชร์ของระบบ ---------- */
  if (event.request.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const file = form.get('file');
        if (file) {
          const cache = await caches.open('mj-share');
          await cache.put('shared-slip', new Response(file, {
            headers: { 'content-type': file.type || 'image/jpeg' },
          }));
        }
      } catch (e) { /* ข้ามไป */ }
      const base = url.pathname.replace(/share$/, '');
      return Response.redirect(base + '?share=1', 303);
    })());
    return;
  }

  if (event.request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin.split('://')[1].split('.')[0]) && url.origin !== self.location.origin) {
    // ปล่อยผ่านคำขอข้ามโดเมน (Supabase API, CDN) — network เท่านั้น
    return;
  }

  /* ---------- network-first สำหรับหน้าแอป, cache-first สำหรับ asset ---------- */
  const isDoc = event.request.mode === 'navigate';
  event.respondWith((async () => {
    if (isDoc) {
      try {
        const fresh = await fetch(event.request);
        const cache = await caches.open(VERSION);
        cache.put('./', fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match('./');
        return cached || new Response('ออฟไลน์อยู่ ลองเชื่อมเน็ตแล้วเปิดใหม่นะ 🐻',
          { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    }
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok) {
        const cache = await caches.open(VERSION);
        cache.put(event.request, fresh.clone());
      }
      return fresh;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
