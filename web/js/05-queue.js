/* ===================================================================
   05-queue.js — คิวออฟไลน์ + ปุ่มเลิกทำ + ล็อกแอปด้วย PIN
   เน็ตหลุดก็ยังจดได้ เก็บไว้ในเครื่องแล้วส่งขึ้นให้เองเมื่อกลับมาออนไลน์
   =================================================================== */
MJ.queue = {
  KEY: 'mj-queue',

  all() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch (e) { return []; }
  },
  save(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) { /* เต็มก็ข้าม */ }
  },

  /** เก็บรายการที่บันทึกไม่ได้ไว้ก่อน แล้วคืนรายการชั่วคราวให้แสดงผลทันที */
  push(op, payload) {
    const list = this.all();
    const local = Object.assign({}, payload, {
      id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      pending: true,
      created_at: new Date().toISOString(),
    });
    list.push({ op, payload, local_id: local.id, at: Date.now() });
    this.save(list);

    MJ.state.transactions.unshift(local);
    MJ.state.transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    MJ.toast('ออฟไลน์อยู่ — เก็บไว้ให้แล้ว จะส่งขึ้นให้เองเมื่อเน็ตกลับมา', 'err');
    return local;
  },

  count() { return this.all().length; },

  /** ส่งของในคิวขึ้นเซิร์ฟเวอร์ */
  async flush() {
    if (!navigator.onLine || !MJ.state.user) return 0;
    const list = this.all();
    if (!list.length) return 0;

    let done = 0;
    const left = [];
    for (const job of list) {
      try {
        if (job.op === 'insert') {
          const { error } = await MJ.sb.from('transactions').insert(job.payload);
          if (error && !/duplicate key/i.test(error.message)) throw error;
        }
        done++;
      } catch (e) {
        left.push(job);
      }
    }
    this.save(left);
    if (done) {
      MJ.state.transactions = MJ.state.transactions.filter((t) => !t.pending);
      await MJ.data.loadMonth();
      MJ.toast(`ส่งรายการที่ค้างไว้ขึ้นแล้ว ${done} รายการ 🐻`, 'ok');
      MJ.render();
    }
    return done;
  },

  init() {
    window.addEventListener('online', () => this.flush());
    window.addEventListener('offline', () => MJ.toast('ออฟไลน์อยู่ — ยังจดได้ เดี๋ยวส่งให้ทีหลัง'));
  },
};

/* ------------------------ Toast แบบมีปุ่มเลิกทำ ------------------------ */
MJ.toastUndo = (msg, onUndo) => {
  const el = MJ.$('#toast');
  el.className = 'toast has-action';
  el.innerHTML = `<span>${MJ.esc(msg)}</span><button id="toastUndo">เลิกทำ</button>`;
  el.classList.remove('hidden');
  const timer = setTimeout(() => el.classList.add('hidden'), 6000);
  MJ.$('#toastUndo', el).onclick = async () => {
    clearTimeout(timer);
    el.classList.add('hidden');
    await onUndo();
  };
};

/* ------------------------ ล็อกแอปด้วย PIN ------------------------ */
MJ.lock = {
  KEY: 'mj-pin',

  enabled() { return !!localStorage.getItem(this.KEY); },

  async hash(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mheejod:' + pin));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  },

  async set(pin) { localStorage.setItem(this.KEY, await this.hash(pin)); },
  clear() { localStorage.removeItem(this.KEY); },
  async verify(pin) { return localStorage.getItem(this.KEY) === await this.hash(pin); },

  /** แสดงหน้าจอล็อก คืน Promise เมื่อปลดล็อกสำเร็จ */
  ask() {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'lock-screen';
      wrap.innerHTML = `
        <div class="lock-box">
          <div class="lock-bear">🐻</div>
          <h2>ใส่ PIN เพื่อเข้าใช้งาน</h2>
          <div class="lock-dots" id="lockDots">${'<i></i>'.repeat(4)}</div>
          <div class="keypad lock-pad">
            ${['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) =>
              k ? `<button data-k="${k}">${k}</button>` : '<span></span>').join('')}
          </div>
          <p class="tiny muted" id="lockHint">แตะตัวเลข 4 หลัก</p>
        </div>`;
      document.body.appendChild(wrap);

      let pin = '';
      const dots = () => MJ.$$('#lockDots i', wrap).forEach((d, i) => d.classList.toggle('on', i < pin.length));
      wrap.querySelectorAll('[data-k]').forEach((b) => b.onclick = async () => {
        MJ.buzz(8);
        if (b.dataset.k === '⌫') pin = pin.slice(0, -1);
        else if (pin.length < 4) pin += b.dataset.k;
        dots();
        if (pin.length === 4) {
          if (await MJ.lock.verify(pin)) {
            wrap.classList.add('unlocked');
            setTimeout(() => { wrap.remove(); resolve(true); }, 220);
          } else {
            MJ.$('#lockHint', wrap).textContent = 'PIN ไม่ถูกต้อง ลองใหม่อีกครั้ง';
            wrap.querySelector('.lock-box').classList.add('shake');
            setTimeout(() => wrap.querySelector('.lock-box').classList.remove('shake'), 400);
            pin = ''; dots();
          }
        }
      });
    });
  },
};
