/* ===================================================================
   00-core.js — ค่าคงที่ สถานะกลาง ตัวช่วย และ router
   =================================================================== */
window.MJ = window.MJ || {};

MJ.CONFIG = {
  SUPABASE_URL: '__SUPABASE_URL__',
  SUPABASE_KEY: '__SUPABASE_KEY__',
};

MJ.sb = window.supabase.createClient(MJ.CONFIG.SUPABASE_URL, MJ.CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ------------------------------ สถานะกลาง ------------------------------ */
MJ.state = {
  user: null,
  profile: null,
  categories: [],
  transactions: [],   // ของเดือนที่เลือก
  recurring: [],
  month: new Date(),  // วันที่ใดก็ได้ในเดือนที่กำลังดู
  route: 'dashboard',
  draft: null,        // ร่างรายการที่รอยืนยัน
};

/* ------------------------------ วันที่/ตัวเลข ------------------------------ */
MJ.TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
MJ.TH_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
MJ.TH_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

MJ.fmtMoney = (n, digits) => {
  const v = Number(n || 0);
  const d = digits === undefined ? (Math.abs(v) % 1 === 0 ? 0 : 2) : digits;
  return v.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
};
MJ.fmtBaht = (n, digits) => '฿' + MJ.fmtMoney(n, digits);
MJ.monthLabel = (d) => `${MJ.TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
MJ.monthLabelFull = (d) => `${MJ.TH_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;

MJ.startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
MJ.endOfMonth   = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
MJ.isoDate = (d) => {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
MJ.isoLocal = (d) => `${MJ.isoDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
MJ.sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

MJ.dayLabel = (dateStr) => {
  const d = new Date(dateStr), now = new Date();
  const yst = new Date(now); yst.setDate(now.getDate() - 1);
  if (MJ.sameDay(d, now)) return 'วันนี้';
  if (MJ.sameDay(d, yst)) return 'เมื่อวาน';
  return `${MJ.TH_DAYS[d.getDay()]} ${d.getDate()} ${MJ.TH_MONTHS[d.getMonth()]}`;
};
MJ.timeLabel = (dateStr) => {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
};

/* ------------------------------ DOM ------------------------------ */
MJ.$  = (sel, root) => (root || document).querySelector(sel);
MJ.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
MJ.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
MJ.hex2rgba = (hex, a) => {
  const h = String(hex || '#F2B23E').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ---------------------- แถบสลับที่มีตัวชี้เลื่อนตาม ---------------------- */
MJ.segInit = (segEl, onPick) => {
  if (!segEl) return;
  const btns = MJ.$$('.seg-btn', segEl);
  segEl.style.setProperty('--seg-n', btns.length);
  const move = (i) => segEl.style.setProperty('--seg-i', i);
  btns.forEach((b, i) => {
    if (b.classList.contains('active')) move(i);
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.toggle('active', x === b));
      move(i);
      MJ.buzz(8);
      if (onPick) onPick(b, i);
    });
  });
};

/* ---------------------- ตัวเลขวิ่งขึ้น (ใช้กับยอดเงิน) ---------------------- */
MJ.countUp = (el, to, opts) => {
  if (!el) return;
  const o = Object.assign({ ms: 850, prefix: '฿', digits: undefined }, opts || {});
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = o.prefix + MJ.fmtMoney(to, o.digits); return;
  }
  const from = 0, start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / o.ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = o.prefix + MJ.fmtMoney(from + (to - from) * eased, t < 1 ? 0 : o.digits);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/* ------------------------------ Feedback ------------------------------ */
let toastTimer;
MJ.toast = (msg, kind) => {
  const el = MJ.$('#toast');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
};
MJ.loading = (on, text) => {
  const el = MJ.$('#loading');
  MJ.$('#loadingText').textContent = text || 'กำลังโหลด…';
  el.classList.toggle('hidden', !on);
};
MJ.buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms || 12); } catch (e) {} };

/* ------------------------------ Bottom sheet ------------------------------ */
MJ.sheet = {
  open(title, html, onMount) {
    MJ.$('#sheetTitle').textContent = title;
    MJ.$('#sheetBody').innerHTML = html;
    MJ.$('#sheet').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (onMount) onMount(MJ.$('#sheetBody'));
  },
  close() {
    MJ.$('#sheet').classList.add('hidden');
    MJ.$('#sheetBody').innerHTML = '';
    document.body.style.overflow = '';
  },
};

MJ.confirm = (title, message, okLabel) => new Promise((resolve) => {
  MJ.sheet.open(title, `
    <p class="muted mb">${MJ.esc(message)}</p>
    <button class="btn btn-danger btn-block" id="cfmOk">${MJ.esc(okLabel || 'ยืนยัน')}</button>
    <button class="btn btn-ghost btn-block" id="cfmNo">ยกเลิก</button>`, (body) => {
    MJ.$('#cfmOk', body).onclick = () => { MJ.sheet.close(); resolve(true); };
    MJ.$('#cfmNo', body).onclick = () => { MJ.sheet.close(); resolve(false); };
  });
});

/* ------------------------------ Router ------------------------------ */
MJ.routes = {};
MJ.go = (route, params) => {
  MJ.state.route = route;
  MJ.state.routeParams = params || {};
  location.hash = '#' + route;
  MJ.render();
};
MJ.render = () => {
  const r = MJ.routes[MJ.state.route] || MJ.routes.dashboard;
  const view = MJ.$('#view');
  view.innerHTML = '';
  const titles = {
    dashboard: ['ภาพรวม', 'สรุปเงินเดือนนี้'],
    transactions: ['รายการ', 'ประวัติทั้งหมด'],
    add: ['จดรายการ', 'พิมพ์ พูด หรือถ่ายสลิป'],
    analysis: ['วิเคราะห์', 'เงินหายไปไหนบ้าง'],
    budget: ['หมวดหมู่และงบ', 'ตั้งงบรายเดือน'],
    settings: ['ตั้งค่า', MJ.state.profile?.display_name || ''],
  };
  const t = titles[MJ.state.route] || ['หมีจด', ''];
  MJ.$('#topTitle').textContent = t[0];
  MJ.$('#topSub').textContent = t[1];
  MJ.$$('.tab, .fab').forEach((el) => el.classList.toggle('active', el.dataset.route === MJ.state.route));
  // หน้าแชทมีแถบพิมพ์ตรึงล่าง ต้องเผื่อที่ว่างให้เนื้อหา
  const inChat = MJ.state.route === 'add' && MJ.add?.tab === 'chat';
  document.body.classList.toggle('chat-open', inChat);
  const dock = MJ.$('#composerDock');
  if (dock && !inChat) { dock.classList.add('hidden'); dock.innerHTML = ''; }
  r(view);
  if (window.scrollTo) window.scrollTo({ top: 0 });
};
