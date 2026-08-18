/* ===================================================================
   99-boot.js — เริ่มระบบ: ธีม, auth, การนำทาง, service worker, share target
   =================================================================== */
MJ.applyTheme = (mode) => {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
};

MJ.boot = async function () {
  MJ.applyTheme(localStorage.getItem('mj-theme') || 'auto');

  /* ---------- การนำทาง ---------- */
  document.querySelectorAll('.tab, .fab').forEach((el) => {
    el.onclick = () => { MJ.buzz(8); MJ.go(el.dataset.route); };
  });
  document.querySelectorAll('#sheet [data-close]').forEach((el) => el.onclick = () => MJ.sheet.close());
  window.addEventListener('hashchange', () => {
    const r = location.hash.replace('#', '') || 'dashboard';
    if (MJ.routes[r] && r !== MJ.state.route) { MJ.state.route = r; MJ.render(); }
  });

  /* ---------- เปลี่ยนเดือน ---------- */
  const shiftMonth = async (delta) => {
    MJ.state.month = new Date(MJ.state.month.getFullYear(), MJ.state.month.getMonth() + delta, 1);
    MJ.$('#btnMonth').textContent = MJ.monthLabel(MJ.state.month);
    MJ.loading(true, 'กำลังโหลดเดือน ' + MJ.monthLabel(MJ.state.month));
    await MJ.data.loadMonth();
    MJ.loading(false);
    MJ.render();
  };
  MJ.$('#btnMonthPrev').onclick = () => shiftMonth(-1);
  MJ.$('#btnMonthNext').onclick = () => shiftMonth(1);
  MJ.$('#btnMonth').onclick = () => MJ.openMonthPicker(shiftToMonth);

  /** ไปยังเดือนที่เลือกจากตัวเลือกเดือน */
  async function shiftToMonth(date) {
    MJ.state.month = new Date(date.getFullYear(), date.getMonth(), 1);
    MJ.$('#btnMonth').textContent = MJ.monthLabel(MJ.state.month);
    MJ.loading(true, 'กำลังโหลด ' + MJ.monthLabelFull(MJ.state.month));
    await MJ.data.loadMonth();
    MJ.loading(false);
    MJ.render();
  }

  /* ---------- Service worker + share target ---------- */
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js', { scope: './' });
    } catch (e) { /* ใช้งานต่อได้แม้ลงทะเบียนไม่สำเร็จ */ }
  }

  /* ---------- Auth ---------- */
  const { data: { session } } = await MJ.sb.auth.getSession();
  MJ.sb.auth.onAuthStateChange((event, sess) => {
    if (event === 'SIGNED_IN' && !MJ.state.user) MJ.start(sess.user);
    if (event === 'SIGNED_OUT') location.reload();
  });

  if (session?.user) await MJ.start(session.user);
  else {
    MJ.$('#authScreen').classList.remove('hidden');
    MJ.auth.mount();
  }
};

MJ.start = async function (user) {
  MJ.state.user = user;
  MJ.$('#authScreen').classList.add('hidden');
  MJ.loading(true, 'กำลังเตรียมข้อมูล…');
  try {
    await MJ.data.loadAll();
  } catch (e) {
    MJ.toast('โหลดข้อมูลไม่สำเร็จ: ' + (e.message || e), 'err');
  }
  MJ.loading(false);

  const theme = MJ.state.profile?.theme || 'auto';
  localStorage.setItem('mj-theme', theme);
  MJ.applyTheme(theme);

  MJ.$('#app').classList.remove('hidden');
  MJ.$('#btnMonth').textContent = MJ.monthLabel(MJ.state.month);
  const hash = location.hash.replace('#', '');
  MJ.state.route = MJ.routes[hash] ? hash : 'dashboard';
  MJ.render();

  MJ.reminder.schedule();
  MJ.push.sync();
  MJ.data.runRecurring().then((n) => { if (n) MJ.render(); });
  handleSharedSlip();
};

/* ---------- รับรูปสลิปที่แชร์เข้ามาจากแอปอื่น (Web Share Target) ---------- */
async function handleSharedSlip() {
  const params = new URLSearchParams(location.search);
  if (!params.has('share')) return;
  history.replaceState({}, '', location.pathname + location.hash);
  try {
    const cache = await caches.open('mj-share');
    const res = await cache.match('shared-slip');
    if (!res) return;
    const blob = await res.blob();
    await cache.delete('shared-slip');
    const file = new File([blob], 'slip.jpg', { type: blob.type || 'image/jpeg' });
    MJ.go('add', { tab: 'slip' });
    MJ.add.processSlip(file);
  } catch (e) { /* ไม่มีไฟล์ก็ข้ามไป */ }
}

document.addEventListener('DOMContentLoaded', () => MJ.boot());
