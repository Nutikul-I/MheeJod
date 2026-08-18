/* ===================================================================
   sw.js — Service worker: แคชหน้าแอป + รับไฟล์สลิปที่แชร์เข้ามา
   =================================================================== */
const VERSION = 'mj-v2';
const SHELL = [
  './', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './font/FCIconic-Regular.ttf', './font/FCIconic-Bold.ttf', './font/FCIconic-Light.ttf',
  './font/fa-light-300.woff',
];

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

/* ---------- รับข้อความ push จากเซิร์ฟเวอร์ ---------- */
self.addEventListener('push', (event) => {
  let data = { title: 'หมีจดเตือนแล้วนะ 🐻', body: 'อย่าลืมจดรายรับรายจ่ายวันนี้', url: './#add' };
  try { if (event.data) data = Object.assign(data, event.data.json()); }
  catch (e) { if (event.data) data.body = event.data.text(); }

  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'mheejod',
    renotify: true,
    data: { url: data.url || './#add' },
    actions: [{ action: 'open', title: 'จดเลย' }],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || './#add';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) { c.navigate && c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
