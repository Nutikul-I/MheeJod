/* ===================================================================
   66-calendar.js — ปฏิทินรายเดือน + รายการล่วงหน้า (นัดจ่าย/นัดรับ)
   • เห็นทั้งเดือนว่าวันไหนใช้เท่าไหร่ วันไหนมีนัดจ่าย/นัดรับ
   • ถึงวันแล้วจะเด้งแจ้งเตือน + มีข้อความในแชท
   =================================================================== */
MJ.plan = {
  items: [],          // รายการล่วงหน้าของเดือนที่กำลังดู
  pending: [],        // ที่ถึงกำหนดแล้วแต่ยังไม่ได้ทำ

  async load() {
    const from = MJ.isoDate(MJ.startOfMonth(MJ.state.month));
    const to = MJ.isoDate(MJ.endOfMonth(MJ.state.month));
    const { data } = await MJ.sb.from('planned_items').select('*')
      .gte('due_date', from).lte('due_date', to).order('due_date');
    MJ.plan.items = data || [];
    return MJ.plan.items;
  },

  async save(item) {
    const payload = {
      user_id: MJ.state.user.id,
      title: (item.title || '').trim() || 'รายการล่วงหน้า',
      amount: Number(item.amount),
      type: item.type,
      category_id: item.category_id || null,
      due_date: item.due_date,
      note: item.note || null,
      repeat_freq: item.repeat_freq || 'none',
    };
    const q = item.id
      ? MJ.sb.from('planned_items').update(payload).eq('id', item.id)
      : MJ.sb.from('planned_items').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await this.load();
  },

  async remove(id) {
    await MJ.sb.from('planned_items').delete().eq('id', id);
    await this.load();
  },

  /** บันทึกรายการล่วงหน้าเป็นรายการจริง แล้วปิดงาน */
  async confirm(item) {
    const tx = await MJ.data.addTransaction({
      amount: item.amount,
      type: item.type,
      category_id: item.category_id,
      note: item.title,
      transaction_date: new Date(item.due_date + 'T12:00:00'),
      source: 'manual',
    });
    await MJ.sb.from('planned_items')
      .update({ is_done: true, done_tx_id: tx.id }).eq('id', item.id);
    // ถ้าเป็นนัดซ้ำ สร้างรอบถัดไปให้อัตโนมัติ
    if (item.repeat_freq && item.repeat_freq !== 'none') {
      try { await MJ.sb.rpc('roll_planned', { p_item: item.id }); } catch (e) { /* ไม่สำเร็จก็ข้าม */ }
    }
    await this.load();
    return tx;
  },

  /** เช็กตอนเปิดแอป: มีอะไรถึงกำหนดไหม -> เด้งเตือน + ทักในแชท */
  async checkDue() {
    const today = MJ.isoDate(new Date());
    const { data } = await MJ.sb.from('planned_items').select('*')
      .eq('is_done', false).lte('due_date', today).order('due_date');
    MJ.plan.pending = data || [];
    if (!MJ.plan.pending.length) return 0;

    const total = MJ.plan.pending.reduce((a, i) =>
      a + (i.type === 'expense' ? Number(i.amount) : -Number(i.amount)), 0);
    const lines = MJ.plan.pending.slice(0, 4).map((i) =>
      `• ${i.type === 'income' ? 'รับ' : 'จ่าย'} ${MJ.esc(i.title)} ${MJ.fmtBaht(i.amount)}`
      + (i.due_date < today ? ` (เลยกำหนด ${MJ.dayLabel(i.due_date)})` : ''));

    const text = `⏰ ถึงกำหนดแล้ว ${MJ.plan.pending.length} รายการ\n${lines.join('\n')}`
      + (MJ.plan.pending.length > 4 ? `\n…และอีก ${MJ.plan.pending.length - 4} รายการ` : '')
      + (total > 0 ? `\nรวมต้องจ่าย ${MJ.fmtBaht(total)}` : '')
      + '\nแตะปฏิทินเพื่อกดยืนยันบันทึกได้เลย';

    // ทักในแชท (เก็บไว้ให้เห็นแม้ยังไม่ได้เปิดหน้าแชท)
    const last = MJ.add.chat[MJ.add.chat.length - 1];
    if (!last || last.text !== text) {
      MJ.add.chat.push({ who: 'bot', text, at: Date.now() });
      MJ.add.saveChat();
    }

    // เด้งแจ้งเตือนบนเครื่อง (ถ้าอนุญาตไว้)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('มีนัดต้องจ่าย/รับวันนี้ 🐻', {
          body: lines.join('\n').replace(/•\s/g, ''),
          icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
          tag: 'mheejod-planned', data: { url: './#calendar' },
        });
      } catch (e) { /* ไม่ได้ก็ยังมีข้อความในแชท */ }
    }
    MJ.toast(`มี ${MJ.plan.pending.length} รายการถึงกำหนดวันนี้`, 'err');
    return MJ.plan.pending.length;
  },
};

/* ============================ หน้าปฏิทิน ============================ */
MJ.calendar = { selected: null };

MJ.routes.calendar = (view) => {
  const month = MJ.state.month;
  const first = MJ.startOfMonth(month);
  const days = MJ.endOfMonth(month).getDate();
  const lead = first.getDay();                 // ช่องว่างก่อนวันที่ 1 (อา=0)

  // รวมยอดรายวัน
  const byDay = new Map();
  MJ.state.transactions.forEach((t) => {
    const d = new Date(t.transaction_date).getDate();
    const cur = byDay.get(d) || { income: 0, expense: 0, n: 0 };
    cur[t.type] += Number(t.amount); cur.n++;
    byDay.set(d, cur);
  });
  const plannedByDay = new Map();
  MJ.plan.items.forEach((i) => {
    const d = new Date(i.due_date + 'T12:00:00').getDate();
    if (!plannedByDay.has(d)) plannedByDay.set(d, []);
    plannedByDay.get(d).push(i);
  });

  const maxSpend = Math.max(1, ...Array.from(byDay.values()).map((v) => v.expense));
  const today = new Date();
  const isThisMonth = today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear();
  const sel = MJ.calendar.selected;

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const v = byDay.get(d);
    const plans = plannedByDay.get(d) || [];
    const isToday = isThisMonth && today.getDate() === d;
    const heat = v ? Math.min(1, v.expense / maxSpend) : 0;
    cells += `<button class="cal-cell ${isToday ? 'today' : ''} ${sel === d ? 'sel' : ''}" data-day="${d}">
      <span class="cal-num">${d}</span>
      ${v ? `<span class="cal-bar" style="opacity:${(0.25 + heat * 0.75).toFixed(2)}"></span>` : ''}
      ${v && v.income ? '<span class="cal-dot in"></span>' : ''}
      ${plans.length ? `<span class="cal-plan ${plans.some((p) => p.type === 'income') ? 'in' : ''}">${plans.length}</span>` : ''}
    </button>`;
  }

  const upcoming = MJ.plan.items.filter((i) => !i.is_done).slice(0, 6);

  view.innerHTML = `
    ${MJ.listTabs('calendar')}
    <div class="card">
      <div class="card-head">
        <h3>${MJ.monthLabelFull(month)}</h3>
        <button class="link" id="calAdd"><i class="fa fa-plus"></i> นัดล่วงหน้า</button>
      </div>
      <div class="cal-week">${['อา','จ','อ','พ','พฤ','ศ','ส'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid" id="calGrid">${cells}</div>
      <div class="cal-legend">
        <span><i class="cal-swatch spend"></i> รายจ่าย</span>
        <span><i class="cal-swatch income"></i> รายรับ</span>
        <span><i class="cal-swatch plan"></i> นัดล่วงหน้า</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>นัดที่ยังไม่ได้ทำ</h3>
        <span class="badge">${MJ.plan.items.filter((i) => !i.is_done).length} รายการ</span></div>
      ${upcoming.length ? upcoming.map((i) => planRow(i)).join('')
        : `<div class="empty"><span class="big">🗓️</span>ยังไม่มีนัดล่วงหน้าในเดือนนี้<br>
           <button class="btn btn-soft btn-sm mt" id="calAdd2">เพิ่มนัดจ่าย/นัดรับ</button></div>`}
    </div>`;

  MJ.bindListTabs(view);
  const openAdd = (date) => MJ.calendar.openPlanSheet(null, date);
  MJ.$('#calAdd', view).onclick = () => openAdd(MJ.isoDate(isThisMonth ? today : first));
  if (MJ.$('#calAdd2', view)) MJ.$('#calAdd2', view).onclick = () => openAdd(MJ.isoDate(isThisMonth ? today : first));

  view.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => {
    MJ.calendar.selected = Number(b.dataset.day);
    MJ.calendar.openDaySheet(Number(b.dataset.day));
  });
  view.querySelectorAll('[data-plan]').forEach((el) => el.onclick = () => {
    const item = MJ.plan.items.find((x) => x.id === el.dataset.plan);
    if (item) MJ.calendar.openPlanSheet(item);
  });
};

function planRow(i) {
  const c = MJ.data.catById(i.category_id);
  const overdue = i.due_date < MJ.isoDate(new Date());
  return `<div class="list-item" data-plan="${i.id}">
    <span class="ic" style="background:${MJ.hex2rgba(c?.color || '#F2B23E', .18)}">${c?.icon || '🗓️'}</span>
    <span class="tx2"><b>${MJ.esc(MJ.fixThai(i.title))}</b>
      <small>${overdue ? '⚠️ เลยกำหนด ' : 'กำหนด '}${MJ.dayLabel(i.due_date)}</small></span>
    <span class="tx-amt ${i.type === 'income' ? 'in' : 'out'}">${i.type === 'income' ? '+' : '−'}${MJ.fmtMoney(i.amount)}</span>
  </div>`;
}

/* ---------------------- แผงของแต่ละวัน ---------------------- */
MJ.calendar.openDaySheet = function (day) {
  const date = new Date(MJ.state.month.getFullYear(), MJ.state.month.getMonth(), day);
  const iso = MJ.isoDate(date);
  const txs = MJ.state.transactions.filter((t) => MJ.isoDate(new Date(t.transaction_date)) === iso);
  const plans = MJ.plan.items.filter((i) => i.due_date === iso);
  const sum = MJ.data.summary(txs);

  MJ.sheet.open(MJ.dayLabel(iso), `
    <div class="stat-grid">
      <div class="stat"><div class="k">รายรับ</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(sum.income)}</div></div>
      <div class="stat"><div class="k">รายจ่าย</div><div class="v" style="color:var(--out)">${MJ.fmtBaht(sum.expense)}</div></div>
    </div>
    ${plans.length ? `<div class="card">
      <div class="card-head"><h3>นัดของวันนี้</h3></div>
      ${plans.map((i) => `<div class="plan-item ${i.is_done ? 'done' : ''}">
        <span class="tx2"><b>${MJ.esc(MJ.fixThai(i.title))}</b>
          <small>${i.is_done ? '✅ บันทึกแล้ว' : (i.type === 'income' ? 'รอรับเงิน' : 'รอจ่าย')}</small></span>
        <span class="tx-amt ${i.type === 'income' ? 'in' : 'out'}">${MJ.fmtMoney(i.amount)}</span>
        ${i.is_done ? '' : `<button class="btn btn-primary btn-sm" data-confirm="${i.id}">บันทึก</button>`}
        <button class="icon-btn" data-edit="${i.id}"><i class="fa fa-pen"></i></button>
      </div>`).join('')}
    </div>` : ''}
    <div class="card">
      <div class="card-head"><h3>รายการวันนี้</h3><span class="badge">${txs.length}</span></div>
      ${txs.length ? txs.map((t) => MJ.tx.row(t)).join('') : '<div class="empty tiny">ยังไม่มีรายการ</div>'}
    </div>
    <button class="btn btn-soft btn-block" id="dayAddPlan"><i class="fa fa-calendar"></i> เพิ่มนัดวันนี้</button>
  `, (body) => {
    MJ.tx.bindRows(body);
    MJ.$('#dayAddPlan', body).onclick = () => MJ.calendar.openPlanSheet(null, iso);
    body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () =>
      MJ.calendar.openPlanSheet(MJ.plan.items.find((x) => x.id === b.dataset.edit)));
    body.querySelectorAll('[data-confirm]').forEach((b) => b.onclick = async () => {
      const item = MJ.plan.items.find((x) => x.id === b.dataset.confirm);
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.plan.confirm(item);
        MJ.buzz(30);
        MJ.sheet.close();
        MJ.toast('บันทึกเป็นรายการจริงแล้ว 🐻', 'ok');
        MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    });
  });
};

/* ---------------------- เพิ่ม/แก้ไขนัดล่วงหน้า ---------------------- */
MJ.calendar.openPlanSheet = function (item, defaultDate) {
  const isNew = !item;
  const v = item || {
    title: '', amount: '', type: 'expense', category_id: null,
    due_date: defaultDate || MJ.isoDate(new Date()), note: '',
  };
  const cats = MJ.state.categories;

  MJ.sheet.open(isNew ? 'เพิ่มนัดล่วงหน้า' : 'แก้ไขนัด', `
    <div class="seg" id="planType">
      <button class="seg-btn ${v.type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> ต้องจ่าย</button>
      <button class="seg-btn ${v.type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> จะได้รับ</button>
    </div>
    <label class="field"><span>เรื่องอะไร</span>
      <input type="text" id="plTitle" value="${MJ.esc(v.title)}" placeholder="เช่น ค่าบัตรเครดิต, เงินเดือนออก"></label>
    <div class="row">
      <label class="field"><span>จำนวนเงิน</span>
        <input type="number" step="0.01" inputmode="decimal" id="plAmount" value="${v.amount}"></label>
      <label class="field"><span>วันครบกำหนด</span>
        <input type="date" id="plDate" value="${String(v.due_date).slice(0, 10)}"></label>
    </div>
    <label class="field"><span>ทำซ้ำ</span><select id="plRepeat">
      ${[['none','ครั้งเดียว'],['weekly','ทุกสัปดาห์'],['monthly','ทุกเดือน'],['yearly','ทุกปี']]
        .map(([val, label]) => `<option value="${val}" ${(v.repeat_freq || 'none') === val ? 'selected' : ''}>${label}</option>`).join('')}
    </select></label>
    <label class="field"><span>หมวดหมู่</span><select id="plCat">
      ${cats.filter((c) => c.type === v.type).map((c) =>
        `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${c.icon} ${MJ.esc(c.name)}</option>`).join('')}
    </select></label>
    <p class="tiny muted mb">ถึงวันแล้วหมีจะเด้งแจ้งเตือนและทักในแชทให้ 🐻 (นัดซ้ำจะสร้างรอบถัดไปอัตโนมัติเมื่อกดบันทึก)</p>
    <button class="btn btn-primary btn-block" id="plSave">${isNew ? 'เพิ่มนัด' : 'บันทึก'}</button>
    ${isNew ? '' : `<button class="btn btn-soft btn-block mt" id="plDone">บันทึกเป็นรายการจริงเลย</button>
      <button class="btn btn-danger btn-block mt" id="plDel">ลบนัดนี้</button>`}
  `, (body) => {
    let type = v.type;
    MJ.segInit(MJ.$('#planType', body), (b) => {
      type = b.dataset.type;
      MJ.$('#plCat', body).innerHTML = cats.filter((c) => c.type === type)
        .map((c) => `<option value="${c.id}">${c.icon} ${MJ.esc(c.name)}</option>`).join('');
    });

    MJ.$('#plSave', body).onclick = async () => {
      const amount = parseFloat(MJ.$('#plAmount', body).value);
      if (!amount || amount <= 0) { MJ.toast('ใส่จำนวนเงินก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.plan.save({
          id: v.id, type, amount,
          title: MJ.$('#plTitle', body).value,
          category_id: MJ.$('#plCat', body).value || null,
          due_date: MJ.$('#plDate', body).value,
          repeat_freq: MJ.$('#plRepeat', body).value,
        });
        MJ.sheet.close(); MJ.toast('บันทึกนัดแล้ว 🗓️', 'ok'); MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };

    if (MJ.$('#plDone', body)) MJ.$('#plDone', body).onclick = async () => {
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.plan.confirm(v);
        MJ.sheet.close(); MJ.toast('บันทึกเป็นรายการจริงแล้ว', 'ok'); MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
    if (MJ.$('#plDel', body)) MJ.$('#plDel', body).onclick = async () => {
      if (!(await MJ.confirm('ลบนัด', 'ลบนัดนี้ใช่ไหม?', 'ลบ'))) return;
      await MJ.plan.remove(v.id);
      MJ.sheet.close(); MJ.toast('ลบแล้ว', 'ok'); MJ.render();
    };
  });
};
