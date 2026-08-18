/* ===================================================================
   65-settings.js — โปรไฟล์ ธีม แจ้งเตือน รายการประจำ OCR ส่งออกข้อมูล
   =================================================================== */
MJ.routes.settings = (view) => {
  const p = MJ.state.profile || {};
  const notifState = ('Notification' in window) ? Notification.permission : 'unsupported';

  view.innerHTML = `
    <div class="card">
      <div class="list-item">
        <span class="ic" style="font-size:22px">🐻</span>
        <span class="tx2"><b>${MJ.esc(p.display_name || 'หมีน้อย')}</b><small>${MJ.esc(MJ.state.user.email || '')}</small></span>
        <button class="btn btn-soft btn-sm" id="editProfile">แก้ไข</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>การแสดงผล</h3></div>
      <div class="list-item"><span class="ic"><i class="fa fa-palette"></i></span>
        <span class="tx2"><b>ธีม</b><small>เลือกโหมดสว่าง/มืด</small></span>
        <select id="themeSel" style="width:auto;padding:8px 10px;border-radius:12px;border:1.5px solid var(--line);background:var(--card)">
          <option value="auto" ${p.theme === 'auto' ? 'selected' : ''}>ตามเครื่อง</option>
          <option value="light" ${p.theme === 'light' ? 'selected' : ''}>สว่าง</option>
          <option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>มืด</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>แจ้งเตือนให้จด</h3></div>
      <div class="list-item"><span class="ic"><i class="fa fa-bell"></i></span>
        <span class="tx2"><b>เวลาเตือนประจำวัน</b><small>${notifState === 'granted' ? 'เปิดใช้งานแล้ว' : 'ต้องอนุญาตการแจ้งเตือนก่อน'}</small></span>
        <input type="time" id="reminderTime" value="${p.reminder_time ? String(p.reminder_time).slice(0, 5) : ''}"
          style="width:auto;padding:8px 10px;border-radius:12px;border:1.5px solid var(--line);background:var(--card)">
      </div>
      <div class="list-item"><span class="ic"><i class="fa fa-mobile"></i></span>
        <span class="tx2"><b>แจ้งเตือนแม้ปิดแอป (Push)</b><small id="pushHint">กำลังตรวจสอบ…</small></span>
        <div class="switch" id="pushSwitch"><i></i></div>
      </div>
      <div class="list-item"><span class="ic"><i class="fa fa-piggy"></i></span>
        <span class="tx2"><b>เตือนเมื่อใกล้เกินงบ</b><small>ส่งเตือนเมื่อใช้ถึงเปอร์เซ็นต์ที่ตั้งไว้ และตอนเกินงบ</small></span>
        <select id="alertPct" style="width:auto;padding:6px 8px;border-radius:10px;border:1.5px solid var(--line);background:var(--card)">
          ${[50, 70, 80, 90, 100].map((v) => `<option value="${v}" ${(p.budget_alert_pct || 80) === v ? 'selected' : ''}>${v}%</option>`).join('')}
        </select>
      </div>
      <div class="list-item"><span class="ic"><i class="fa fa-chart-bar"></i></span>
        <span class="tx2"><b>สรุปประจำสัปดาห์</b><small>ส่งสรุปทุกเช้าวันจันทร์</small></span>
        <div class="switch ${p.weekly_summary !== false ? 'on' : ''}" id="weeklySw"><i></i></div>
      </div>
      <button class="btn btn-soft btn-block btn-sm mt" id="pushTest"><i class="fa fa-bell"></i> ทดสอบส่งแจ้งเตือน</button>
      <p class="tiny muted mt">บน iPhone ต้องเพิ่มแอปลงหน้าจอโฮมก่อน แล้วเปิดจากไอคอนแอปถึงจะแจ้งเตือนได้ (iOS 16.4+)</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>เงินของฉัน</h3></div>
      <div class="list-item" id="goAccounts"><span class="ic"><i class="fa fa-wallet"></i></span>
        <span class="tx2"><b>กระเป๋าเงิน</b><small>${(MJ.state.accounts || []).length} กระเป๋า • โอนระหว่างกระเป๋าได้</small></span>
        <span class="tiny muted"><i class="fa fa-angle-r"></i></span></div>
      <div class="list-item" id="goPlans"><span class="ic"><i class="fa fa-piggy"></i></span>
        <span class="tx2"><b>เป้าหมายเก็บเงิน & หนี้</b><small>ตั้งเป้า หยอดกระปุก ทวงหนี้</small></span>
        <span class="tiny muted"><i class="fa fa-angle-r"></i></span></div>
      <div class="list-item" id="goImport"><span class="ic"><i class="fa fa-download"></i></span>
        <span class="tx2"><b>นำเข้าจากไฟล์ CSV/Excel</b><small>ย้ายข้อมูลจากแอปเดิมหรือ statement ธนาคาร</small></span>
        <span class="tiny muted"><i class="fa fa-angle-r"></i></span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>ความปลอดภัย</h3></div>
      <div class="list-item"><span class="ic"><i class="fa fa-mobile"></i></span>
        <span class="tx2"><b>ล็อกแอปด้วย PIN</b><small id="pinHint">${MJ.lock.enabled() ? 'เปิดอยู่ — ถาม PIN ทุกครั้งที่เปิดแอป' : 'ปิดอยู่'}</small></span>
        <div class="switch ${MJ.lock.enabled() ? 'on' : ''}" id="pinSwitch"><i></i></div>
      </div>
      <div class="list-item" id="changePw"><span class="ic"><i class="fa fa-user"></i></span>
        <span class="tx2"><b>เปลี่ยนรหัสผ่าน</b><small>ตั้งรหัสใหม่สำหรับบัญชีนี้</small></span>
        <span class="tiny muted"><i class="fa fa-angle-r"></i></span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>รายการประจำ (Subscription)</h3><button class="link" id="addRecur">+ เพิ่ม</button></div>
      ${MJ.state.recurring.length ? MJ.state.recurring.map((r) => {
        const c = MJ.data.catById(r.category_id);
        const freq = { daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์', monthly: 'ทุกเดือน', yearly: 'ทุกปี' }[r.frequency];
        return `<div class="list-item" data-recur="${r.id}">
          <span class="ic" style="background:${MJ.hex2rgba(c?.color || '#F2B23E', .18)}">${c?.icon || '<i class="fa fa-repeat"></i>'}</span>
          <span class="tx2"><b>${MJ.esc(r.note || c?.name || 'รายการประจำ')}</b>
            <small>${freq} • ครั้งถัดไป ${MJ.dayLabel(r.next_run_date)}</small></span>
          <span class="tx-amt ${r.type === 'income' ? 'in' : 'out'}">${MJ.fmtMoney(r.amount)}</span>
        </div>`;
      }).join('') : '<div class="empty tiny">ยังไม่มีรายการประจำ เช่น ค่าเน็ต Netflix ค่าเช่าห้อง</div>'}
    </div>

    <div class="card">
      <div class="card-head"><h3>อ่านสลิป (OCR)</h3></div>
      <div class="list-item"><span class="ic"><i class="fa fa-eye"></i></span>
        <span class="tx2"><b>${p.ocr_endpoint ? 'PaddleOCR (เซิร์ฟเวอร์ของคุณ)' : 'อ่านในเครื่อง (Tesseract.js)'}</b>
          <small>${p.ocr_endpoint ? MJ.esc(p.ocr_endpoint) : 'ฟรี ไม่ต้องตั้งค่าอะไร'}</small></span>
        <button class="btn btn-soft btn-sm" id="editOcr">ตั้งค่า</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>ข้อมูลของฉัน</h3></div>
      <div class="list-item" id="expMonth"><span class="ic"><i class="fa fa-excel"></i></span>
        <span class="tx2"><b>ส่งออกเดือนนี้เป็น Excel</b><small>${MJ.monthLabelFull(MJ.state.month)}</small></span><span class="tiny muted">›</span></div>
      <div class="list-item" id="expAll"><span class="ic"><i class="fa fa-boxes"></i></span>
        <span class="tx2"><b>ส่งออกทั้งหมด</b><small>ทุกรายการที่เคยบันทึก</small></span><span class="tiny muted">›</span></div>
      <div class="list-item" id="runRecur"><span class="ic"><i class="fa fa-rotate"></i></span>
        <span class="tx2"><b>ประมวลผลรายการประจำเดี๋ยวนี้</b><small>เผื่อรายการที่ถึงกำหนดแล้ว</small></span><span class="tiny muted">›</span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>เกี่ยวกับ</h3></div>
      <div class="list-item" id="howInstall"><span class="ic"><i class="fa fa-mobile"></i></span>
        <span class="tx2"><b>ติดตั้งลงหน้าจอโฮม</b><small>ใช้เหมือนแอปจริง</small></span><span class="tiny muted">›</span></div>
      <div class="list-item"><span class="ic">🍯</span>
        <span class="tx2"><b>หมีจด MheeJod</b><small>เวอร์ชัน 1.0 • ข้อมูลเก็บใน Supabase ของคุณเอง</small></span></div>
    </div>

    <button class="btn btn-danger btn-block" id="signOut">ออกจากระบบ</button>
    <div style="height:16px"></div>`;

  MJ.$('#editProfile', view).onclick = () => openProfileSheet();
  MJ.$('#themeSel', view).onchange = async (e) => {
    const v = e.target.value;
    MJ.applyTheme(v);
    try { await MJ.data.saveProfile({ theme: v }); } catch (err) { MJ.toast('บันทึกธีมไม่สำเร็จ', 'err'); }
  };
  MJ.$('#reminderTime', view).onchange = async (e) => {
    const v = e.target.value || null;
    try {
      await MJ.data.saveProfile({ reminder_time: v });
      MJ.reminder.schedule();
      MJ.toast(v ? `จะเตือนทุกวันเวลา ${v} น.` : 'ปิดการเตือนแล้ว', 'ok');
    } catch (err) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
  };
  /* ---------- สวิตช์ Push ---------- */
  (async () => {
    const sw = MJ.$('#pushSwitch', view);
    const hint = MJ.$('#pushHint', view);
    if (!sw) return;
    const st = await MJ.push.status();
    const texts = {
      on: 'เปิดอยู่บนเครื่องนี้',
      off: MJ.push.needsInstall() ? 'ต้องเพิ่มลงหน้าจอโฮมก่อน' : 'ปิดอยู่ — แตะเพื่อเปิด',
      denied: 'ถูกปิดไว้ในตั้งค่าเบราว์เซอร์',
      unsupported: 'เบราว์เซอร์นี้ไม่รองรับ',
    };
    hint.textContent = texts[st] || '';
    sw.classList.toggle('on', st === 'on');
    sw.onclick = async () => {
      const now = await MJ.push.status();
      const ok = now === 'on' ? await MJ.push.disable() : await MJ.push.enable();
      if (ok) MJ.render();
    };
  })();
  if (MJ.$('#pushTest', view)) MJ.$('#pushTest', view).onclick = () => MJ.push.test();

  MJ.$('#goAccounts', view).onclick = () => MJ.go('accounts');
  MJ.$('#goPlans', view).onclick = () => MJ.go('plans');
  MJ.$('#goImport', view).onclick = () => MJ.importer.open();
  MJ.$('#changePw', view).onclick = () => MJ.auth.promptNewPassword();

  MJ.$('#alertPct', view).onchange = async (e) => {
    try {
      await MJ.data.saveProfile({ budget_alert_pct: Number(e.target.value) });
      MJ.toast(`จะเตือนเมื่อใช้ถึง ${e.target.value}% ของงบ`, 'ok');
    } catch (err) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
  };
  MJ.$('#weeklySw', view).onclick = async (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    try { await MJ.data.saveProfile({ weekly_summary: on }); }
    catch (err) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
  };

  MJ.$('#pinSwitch', view).onclick = async () => {
    if (MJ.lock.enabled()) {
      if (!(await MJ.confirm('ปิดล็อกแอป', 'ปิดการถาม PIN ตอนเปิดแอปใช่ไหม?', 'ปิดล็อก'))) return;
      MJ.lock.clear(); MJ.toast('ปิดล็อกแล้ว', 'ok'); MJ.render();
      return;
    }
    MJ.sheet.open('ตั้ง PIN 4 หลัก', `
      <label class="field"><span>PIN ใหม่</span>
        <input type="password" inputmode="numeric" maxlength="4" id="pinA" placeholder="••••"></label>
      <label class="field"><span>ยืนยัน PIN</span>
        <input type="password" inputmode="numeric" maxlength="4" id="pinB" placeholder="••••"></label>
      <p class="tiny muted mb">PIN เก็บไว้ในเครื่องนี้เท่านั้น (เก็บเป็นค่าแฮช ไม่ได้ส่งขึ้นเซิร์ฟเวอร์)
        ถ้าลืมให้ล้างข้อมูลเว็บไซต์แล้วเข้าใหม่</p>
      <button class="btn btn-primary btn-block" id="pinSave">ตั้ง PIN</button>`, (body) => {
      MJ.$('#pinSave', body).onclick = async () => {
        const a = MJ.$('#pinA', body).value, b = MJ.$('#pinB', body).value;
        if (!/^\d{4}$/.test(a)) { MJ.toast('ใส่ตัวเลข 4 หลัก', 'err'); return; }
        if (a !== b) { MJ.toast('PIN ไม่ตรงกัน', 'err'); return; }
        await MJ.lock.set(a);
        MJ.sheet.close(); MJ.toast('ตั้ง PIN แล้ว 🔒', 'ok'); MJ.render();
      };
    });
  };
  MJ.$('#addRecur', view).onclick = () => openRecurSheet(null);
  view.querySelectorAll('[data-recur]').forEach((el) => el.onclick = () =>
    openRecurSheet(MJ.state.recurring.find((r) => r.id === el.dataset.recur)));
  MJ.$('#editOcr', view).onclick = () => openOcrSheet();
  MJ.$('#expMonth', view).onclick = () => MJ.tx.exportExcel(MJ.state.transactions);
  MJ.$('#expAll', view).onclick = async () => {
    MJ.loading(true, 'กำลังรวบรวมข้อมูล…');
    const { data } = await MJ.sb.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(10000);
    MJ.loading(false);
    MJ.tx.exportExcel(data || [], 'หมีจด-ทั้งหมด.xlsx');
  };
  MJ.$('#runRecur', view).onclick = async () => {
    MJ.loading(true, 'กำลังประมวลผล…');
    const n = await MJ.data.runRecurring();
    MJ.loading(false);
    if (!n) MJ.toast('ยังไม่มีรายการที่ถึงกำหนด');
    MJ.render();
  };
  MJ.$('#howInstall', view).onclick = () => MJ.sheet.open('ติดตั้งลงหน้าจอโฮม', `
    <p class="mb"><b>iPhone / iPad (Safari)</b><br>
      1. แตะปุ่มแชร์ <b>􀈂</b> ด้านล่าง<br>2. เลือก “เพิ่มไปยังหน้าจอโฮม”<br>3. กด “เพิ่ม” แล้วเปิดจากไอคอนหมี 🐻</p>
    <p class="mb"><b>Android (Chrome)</b><br>1. แตะเมนู ⋮ มุมขวาบน<br>2. เลือก “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอหลัก”</p>
    <p class="tiny muted">เมื่อติดตั้งแล้วจะเปิดเต็มจอ ใช้ออฟไลน์ได้บางส่วน และแชร์รูปสลิปเข้าแอปได้โดยตรง</p>`);
  MJ.$('#signOut', view).onclick = () => MJ.auth.signOut();
};

/* ---------------------- โปรไฟล์ ---------------------- */
function openProfileSheet() {
  const p = MJ.state.profile;
  MJ.sheet.open('แก้ไขโปรไฟล์', `
    <label class="field"><span>ชื่อที่อยากให้เรียก</span>
      <input type="text" id="pName" value="${MJ.esc(p.display_name || '')}"></label>
    <label class="field"><span>อีเมล</span>
      <input type="text" value="${MJ.esc(MJ.state.user.email || '')}" disabled></label>
    <button class="btn btn-primary btn-block" id="pSave">บันทึก</button>`, (body) => {
    MJ.$('#pSave', body).onclick = async () => {
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.data.saveProfile({ display_name: MJ.$('#pName', body).value.trim() || 'หมีน้อย' });
        MJ.sheet.close(); MJ.toast('บันทึกแล้ว', 'ok'); MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
  });
}

/* ---------------------- รายการประจำ ---------------------- */
function openRecurSheet(r) {
  const isNew = !r;
  const v = r || { amount: '', type: 'expense', category_id: null, note: '', frequency: 'monthly',
                   next_run_date: MJ.isoDate(new Date()), is_active: true };
  const cats = MJ.state.categories;

  MJ.sheet.open(isNew ? 'เพิ่มรายการประจำ' : 'แก้ไขรายการประจำ', `
    <div class="seg" id="rType">
      <button class="seg-btn ${v.type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> รายจ่าย</button>
      <button class="seg-btn ${v.type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> รายรับ</button>
    </div>
    <label class="field"><span>ชื่อรายการ</span>
      <input type="text" id="rNote" value="${MJ.esc(v.note || '')}" placeholder="เช่น Netflix, ค่าเช่าห้อง"></label>
    <label class="field"><span>จำนวนเงิน</span>
      <input type="number" step="0.01" inputmode="decimal" id="rAmount" value="${v.amount}"></label>
    <label class="field"><span>หมวดหมู่</span><select id="rCat">
      ${cats.filter((c) => c.type === v.type).map((c) => `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${c.icon} ${MJ.esc(c.name)}</option>`).join('')}
    </select></label>
    <div class="row">
      <label class="field"><span>ความถี่</span><select id="rFreq">
        <option value="daily" ${v.frequency === 'daily' ? 'selected' : ''}>ทุกวัน</option>
        <option value="weekly" ${v.frequency === 'weekly' ? 'selected' : ''}>ทุกสัปดาห์</option>
        <option value="monthly" ${v.frequency === 'monthly' ? 'selected' : ''}>ทุกเดือน</option>
        <option value="yearly" ${v.frequency === 'yearly' ? 'selected' : ''}>ทุกปี</option>
      </select></label>
      <label class="field"><span>ครั้งถัดไป</span>
        <input type="date" id="rDate" value="${String(v.next_run_date).slice(0, 10)}"></label>
    </div>
    <div class="list-item"><span class="ic"><i class="fa fa-check"></i></span><span class="tx2"><b>เปิดใช้งาน</b><small>ปิดไว้ถ้ายังไม่อยากให้จดอัตโนมัติ</small></span>
      <div class="switch ${v.is_active ? 'on' : ''}" id="rActive"><i></i></div></div>
    <button class="btn btn-primary btn-block mt" id="rSave">${isNew ? 'เพิ่มรายการ' : 'บันทึก'}</button>
    ${isNew ? '' : '<button class="btn btn-danger btn-block mt" id="rDel">ลบรายการประจำ</button>'}
  `, (body) => {
    let type = v.type, active = v.is_active !== false;
    MJ.segInit(MJ.$('#rType', body), (b) => {
      type = b.dataset.type;
      body.querySelectorAll('#rType .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      MJ.$('#rCat', body).innerHTML = cats.filter((c) => c.type === type)
        .map((c) => `<option value="${c.id}">${c.icon} ${MJ.esc(c.name)}</option>`).join('');
    });
    MJ.$('#rActive', body).onclick = (e) => { active = !active; e.currentTarget.classList.toggle('on', active); };

    MJ.$('#rSave', body).onclick = async () => {
      const amount = parseFloat(MJ.$('#rAmount', body).value);
      if (!amount || amount <= 0) { MJ.toast('ใส่จำนวนเงินก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.data.saveRecurring({
          id: v.id, amount, type,
          category_id: MJ.$('#rCat', body).value || null,
          note: MJ.$('#rNote', body).value.trim() || null,
          frequency: MJ.$('#rFreq', body).value,
          next_run_date: MJ.$('#rDate', body).value,
          is_active: active,
        });
        MJ.sheet.close(); MJ.toast('บันทึกแล้ว 🐻', 'ok'); MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
    if (MJ.$('#rDel', body)) MJ.$('#rDel', body).onclick = async () => {
      if (!(await MJ.confirm('ลบรายการประจำ', 'รายการที่บันทึกไปแล้วจะยังอยู่ ยืนยันไหม?', 'ลบ'))) return;
      await MJ.data.deleteRecurring(v.id);
      MJ.sheet.close(); MJ.toast('ลบแล้ว', 'ok'); MJ.render();
    };
  });
}

/* ---------------------- ตั้งค่า OCR ---------------------- */
function openOcrSheet() {
  const cur = MJ.state.profile?.ocr_endpoint || '';
  MJ.sheet.open('ตั้งค่าการอ่านสลิป', `
    <p class="tiny muted mb">ค่าเริ่มต้นอ่านในเครื่องด้วย Tesseract.js (ฟรี ไม่ต้องตั้งค่า)
      ถ้าต้องการความแม่นยำสูงขึ้น รัน PaddleOCR เองแล้วใส่ URL ที่นี่
      (มีไฟล์ Docker ให้ในโฟลเดอร์ <code>ocr-service/</code> ของโปรเจกต์)</p>
    <label class="field"><span>PaddleOCR endpoint</span>
      <input type="url" id="oUrl" value="${MJ.esc(cur)}" placeholder="https://ocr.example.com"></label>
    <button class="btn btn-soft btn-block mb" id="oTest">ทดสอบการเชื่อมต่อ</button>
    <button class="btn btn-primary btn-block" id="oSave">บันทึก</button>
    <button class="btn btn-ghost btn-block" id="oClear">กลับไปใช้การอ่านในเครื่อง</button>`, (body) => {
    MJ.$('#oTest', body).onclick = async () => {
      const url = MJ.$('#oUrl', body).value.trim();
      if (!url) { MJ.toast('ใส่ URL ก่อนนะ', 'err'); return; }
      // เซิร์ฟเวอร์ฟรีอาจหลับอยู่ ให้เวลาปลุกสักหน่อย
      for (let i = 0; i < 8; i++) {
        MJ.loading(true, i === 0 ? 'กำลังทดสอบ…' : `กำลังปลุกเซิร์ฟเวอร์… (${i}/7)`);
        try {
          const res = await fetch(url.replace(/\/$/, '') + '/health');
          if (res.ok) {
            const info = await res.json().catch(() => ({}));
            MJ.loading(false);
            MJ.toast(`เชื่อมต่อได้ 👍 ${info.model || ''} ${info.lang ? '(' + info.lang + ')' : ''}`.trim(), 'ok');
            return;
          }
        } catch (e) { /* ยังไม่ตื่น ลองใหม่ */ }
        await new Promise((r) => setTimeout(r, 6000));
      }
      MJ.loading(false);
      MJ.toast('เชื่อมต่อไม่ได้ ลองเช็ก URL อีกครั้ง', 'err');
    };
    MJ.$('#oSave', body).onclick = async () => {
      await MJ.data.saveProfile({ ocr_endpoint: MJ.$('#oUrl', body).value.trim() || null });
      MJ.sheet.close(); MJ.toast('บันทึกแล้ว', 'ok'); MJ.render();
    };
    MJ.$('#oClear', body).onclick = async () => {
      await MJ.data.saveProfile({ ocr_endpoint: null });
      MJ.sheet.close(); MJ.toast('กลับไปใช้การอ่านในเครื่องแล้ว', 'ok'); MJ.render();
    };
  });
}

/* ---------------------- ตัวเตือนประจำวัน (ฝั่งเครื่อง) ---------------------- */
MJ.reminder = {
  timer: null,
  schedule() {
    clearTimeout(this.timer);
    const t = MJ.state.profile?.reminder_time;
    if (!t || !('Notification' in window) || Notification.permission !== 'granted') return;
    const [h, m] = String(t).split(':').map(Number);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    this.timer = setTimeout(() => {
      const s = MJ.data.summary();
      new Notification('หมีจดเตือนแล้วนะ 🐻', {
        body: s.count ? `วันนี้จดไปแล้ว ${s.count} รายการ อย่าลืมจดที่เหลือน้า` : 'วันนี้ยังไม่ได้จดเลย มาจดกัน!',
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'mheejod-daily',
      });
      this.schedule();
    }, next - now);
  },
};
