/* ===================================================================
   69-plans.js — เป้าหมายเก็บเงิน + หนี้/ให้ยืม
   =================================================================== */
MJ.goals = {
  list: [],
  async load() {
    const { data } = await MJ.sb.from('goals').select('*').order('is_done').order('due_date', { nullsFirst: false });
    MJ.goals.list = data || [];
    return MJ.goals.list;
  },
  async save(g) {
    const payload = {
      user_id: MJ.state.user.id,
      title: (g.title || '').trim() || 'เป้าหมายใหม่',
      target_amount: Number(g.target_amount),
      saved_amount: Number(g.saved_amount || 0),
      icon: g.icon || '🎯',
      color: g.color || '#3EA96B',
      due_date: g.due_date || null,
    };
    const q = g.id ? MJ.sb.from('goals').update(payload).eq('id', g.id) : MJ.sb.from('goals').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await this.load();
  },
  async addMoney(goal, amount) {
    const saved = Number(goal.saved_amount) + Number(amount);
    await MJ.sb.from('goals').update({
      saved_amount: saved,
      is_done: saved >= Number(goal.target_amount),
    }).eq('id', goal.id);
    await this.load();
  },
  async remove(id) { await MJ.sb.from('goals').delete().eq('id', id); await this.load(); },
};

MJ.debts = {
  list: [],
  async load() {
    const { data } = await MJ.sb.from('debts').select('*').order('is_settled').order('due_date', { nullsFirst: false });
    MJ.debts.list = data || [];
    return MJ.debts.list;
  },
  async save(d) {
    const payload = {
      user_id: MJ.state.user.id,
      person: (d.person || '').trim() || 'ไม่ระบุชื่อ',
      direction: d.direction,
      amount: Number(d.amount),
      paid_amount: Number(d.paid_amount || 0),
      due_date: d.due_date || null,
      note: d.note || null,
    };
    const q = d.id ? MJ.sb.from('debts').update(payload).eq('id', d.id) : MJ.sb.from('debts').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await this.load();
  },
  async pay(debt, amount, alsoRecord) {
    const paid = Number(debt.paid_amount) + Number(amount);
    await MJ.sb.from('debts').update({
      paid_amount: paid,
      is_settled: paid >= Number(debt.amount),
    }).eq('id', debt.id);

    if (alsoRecord) {
      await MJ.data.addTransaction({
        amount,
        type: debt.direction === 'i_owe' ? 'expense' : 'income',
        note: (debt.direction === 'i_owe' ? 'จ่ายคืน ' : 'ได้รับคืนจาก ') + debt.person,
        transaction_date: new Date(),
        source: 'manual',
      });
    }
    await this.load();
  },
  async remove(id) { await MJ.sb.from('debts').delete().eq('id', id); await this.load(); },
};

/* ============================ หน้าแผนการเงิน ============================ */
MJ.plans = { tab: 'goals' };

MJ.routes.plans = (view) => {
  const tab = MJ.plans.tab;
  view.innerHTML = `
    <div class="seg" id="planTabs">
      <button class="seg-btn ${tab === 'goals' ? 'active' : ''}" data-tab="goals"><i class="fa fa-piggy"></i> เป้าหมายเก็บเงิน</button>
      <button class="seg-btn ${tab === 'debts' ? 'active' : ''}" data-tab="debts"><i class="fa fa-rightleft"></i> หนี้/ให้ยืม</button>
    </div>
    <div id="plansBody"></div>`;
  MJ.segInit(MJ.$('#planTabs', view), (b) => { MJ.plans.tab = b.dataset.tab; MJ.render(); });
  const body = MJ.$('#plansBody', view);
  (tab === 'goals' ? renderGoals : renderDebts)(body);
};

function renderGoals(body) {
  const list = MJ.goals.list;
  const active = list.filter((g) => !g.is_done);
  const totalTarget = active.reduce((a, g) => a + Number(g.target_amount), 0);
  const totalSaved = active.reduce((a, g) => a + Number(g.saved_amount), 0);

  body.innerHTML = `
    ${active.length ? `<div class="stat-grid">
      <div class="stat"><div class="k">เก็บได้แล้ว</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(totalSaved)}</div></div>
      <div class="stat"><div class="k">เป้าหมายรวม</div><div class="v">${MJ.fmtBaht(totalTarget)}</div></div>
    </div>` : ''}
    <div class="card">
      <div class="card-head"><h3>เป้าหมายของฉัน</h3><button class="link" id="goalAdd"><i class="fa fa-plus"></i> เพิ่ม</button></div>
      ${list.length ? list.map((g) => {
        const pct = Math.min(100, (Number(g.saved_amount) / Number(g.target_amount)) * 100);
        return `<div class="bud" data-goal="${g.id}">
          <div class="bud-top">
            <span class="bud-name">${g.icon} ${MJ.esc(g.title)}${g.is_done ? ' ✅' : ''}</span>
            <span>${MJ.fmtBaht(g.saved_amount)} <span class="muted tiny">/ ${MJ.fmtMoney(g.target_amount)}</span></span>
          </div>
          <div class="bar"><i style="width:${pct}%;background:${g.color}"></i></div>
          <div class="bud-foot">
            <span>${g.is_done ? 'ถึงเป้าแล้ว! 🎉' : `เหลืออีก ${MJ.fmtBaht(Number(g.target_amount) - Number(g.saved_amount))}`}</span>
            <span>${g.due_date ? 'ภายใน ' + MJ.dayLabel(g.due_date) : Math.round(pct) + '%'}</span>
          </div>
        </div>`;
      }).join('') : `<div class="empty"><span class="big">🎯</span>ยังไม่มีเป้าหมาย<br>
        <button class="btn btn-soft btn-sm mt" id="goalAdd2">ตั้งเป้าหมายแรก</button></div>`}
    </div>`;

  const add = () => MJ.plans.openGoalSheet(null);
  MJ.$('#goalAdd', body).onclick = add;
  if (MJ.$('#goalAdd2', body)) MJ.$('#goalAdd2', body).onclick = add;
  body.querySelectorAll('[data-goal]').forEach((el) => el.onclick = () =>
    MJ.plans.openGoalSheet(MJ.goals.list.find((g) => g.id === el.dataset.goal)));
}

function renderDebts(body) {
  const list = MJ.debts.list;
  const owedToMe = list.filter((d) => d.direction === 'owed_to_me' && !d.is_settled)
    .reduce((a, d) => a + (Number(d.amount) - Number(d.paid_amount)), 0);
  const iOwe = list.filter((d) => d.direction === 'i_owe' && !d.is_settled)
    .reduce((a, d) => a + (Number(d.amount) - Number(d.paid_amount)), 0);

  body.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">คนอื่นติดเรา</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(owedToMe)}</div></div>
      <div class="stat"><div class="k">เราติดคนอื่น</div><div class="v" style="color:var(--out)">${MJ.fmtBaht(iOwe)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>รายการหนี้</h3><button class="link" id="debtAdd"><i class="fa fa-plus"></i> เพิ่ม</button></div>
      ${list.length ? list.map((d) => {
        const left = Number(d.amount) - Number(d.paid_amount);
        return `<div class="list-item ${d.is_settled ? 'muted' : ''}" data-debt="${d.id}">
          <span class="ic" style="background:${MJ.hex2rgba(d.direction === 'i_owe' ? '#E3556F' : '#2FA36B', .16)}">
            <i class="fa ${d.direction === 'i_owe' ? 'fa-arrow-up' : 'fa-arrow-down'}"></i></span>
          <span class="tx2"><b>${MJ.esc(MJ.fixThai(d.person))}${d.is_settled ? ' ✅' : ''}</b>
            <small>${d.direction === 'i_owe' ? 'เราติดเขา' : 'เขาติดเรา'}${d.due_date ? ' • ครบ ' + MJ.dayLabel(d.due_date) : ''}</small></span>
          <span class="tx-amt ${d.direction === 'i_owe' ? 'out' : 'in'}">${MJ.fmtBaht(d.is_settled ? d.amount : left)}</span>
        </div>`;
      }).join('') : `<div class="empty"><span class="big">🤝</span>ยังไม่มีรายการหนี้<br>
        <button class="btn btn-soft btn-sm mt" id="debtAdd2">บันทึกหนี้/ให้ยืม</button></div>`}
    </div>`;

  const add = () => MJ.plans.openDebtSheet(null);
  MJ.$('#debtAdd', body).onclick = add;
  if (MJ.$('#debtAdd2', body)) MJ.$('#debtAdd2', body).onclick = add;
  body.querySelectorAll('[data-debt]').forEach((el) => el.onclick = () =>
    MJ.plans.openDebtSheet(MJ.debts.list.find((d) => d.id === el.dataset.debt)));
}

/* ---------------------- แผงเป้าหมาย ---------------------- */
MJ.plans.openGoalSheet = function (goal) {
  const isNew = !goal;
  const g = goal || { title: '', target_amount: '', saved_amount: 0, icon: '🎯', color: '#3EA96B', due_date: '' };
  const ICONS = ['🎯','✈️','💻','🏠','🚗','📱','🎓','💍','🐻'];

  MJ.sheet.open(isNew ? 'ตั้งเป้าหมายใหม่' : 'แก้ไขเป้าหมาย', `
    <label class="field"><span>อยากเก็บเงินไปทำอะไร</span>
      <input type="text" id="glTitle" value="${MJ.esc(g.title)}" placeholder="เช่น เที่ยวญี่ปุ่น, ซื้อโน้ตบุ๊ก"></label>
    <div class="field"><span>ไอคอน</span>
      <div class="chips" id="glIcons">${ICONS.map((i) =>
        `<button class="chip ${i === g.icon ? 'active' : ''}" data-icon="${i}" style="font-size:18px">${i}</button>`).join('')}</div>
    </div>
    <div class="row">
      <label class="field"><span>เป้าหมาย (บาท)</span>
        <input type="number" step="1" inputmode="decimal" id="glTarget" value="${g.target_amount}"></label>
      <label class="field"><span>ภายในวันที่</span>
        <input type="date" id="glDue" value="${g.due_date ? String(g.due_date).slice(0, 10) : ''}"></label>
    </div>
    ${isNew ? '' : `<label class="field"><span>เก็บได้แล้ว</span>
      <input type="number" step="1" inputmode="decimal" id="glSaved" value="${g.saved_amount}"></label>`}
    <button class="btn btn-primary btn-block" id="glSave">${isNew ? 'ตั้งเป้าหมาย' : 'บันทึก'}</button>
    ${isNew ? '' : `<button class="btn btn-soft btn-block mt" id="glAdd"><i class="fa fa-plus"></i> หยอดกระปุกเพิ่ม</button>
      <button class="btn btn-danger btn-block mt" id="glDel">ลบเป้าหมาย</button>`}
  `, (body) => {
    let icon = g.icon;
    body.querySelectorAll('#glIcons .chip').forEach((b) => b.onclick = () => {
      icon = b.dataset.icon;
      body.querySelectorAll('#glIcons .chip').forEach((x) => x.classList.toggle('active', x === b));
    });

    MJ.$('#glSave', body).onclick = async () => {
      const target = parseFloat(MJ.$('#glTarget', body).value);
      if (!target || target <= 0) { MJ.toast('ใส่จำนวนเงินเป้าหมายก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.goals.save({
          id: g.id, icon,
          title: MJ.$('#glTitle', body).value,
          target_amount: target,
          saved_amount: MJ.$('#glSaved', body)?.value ?? g.saved_amount,
          due_date: MJ.$('#glDue', body).value || null,
        });
        MJ.sheet.close(); MJ.toast('บันทึกแล้ว 🎯', 'ok'); MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
    if (MJ.$('#glAdd', body)) MJ.$('#glAdd', body).onclick = () => {
      MJ.sheet.open('หยอดกระปุก', `
        <label class="field"><span>หยอดเพิ่มเท่าไหร่</span>
          <input type="number" step="1" inputmode="decimal" id="glAmt" placeholder="0"></label>
        <button class="btn btn-primary btn-block" id="glAmtOk">หยอดเลย</button>`, (b2) => {
        MJ.$('#glAmtOk', b2).onclick = async () => {
          const amt = parseFloat(MJ.$('#glAmt', b2).value);
          if (!amt) return;
          await MJ.goals.addMoney(g, amt);
          MJ.sheet.close(); MJ.buzz(30); MJ.toast('หยอดกระปุกแล้ว 🐷', 'ok'); MJ.render();
        };
      });
    };
    if (MJ.$('#glDel', body)) MJ.$('#glDel', body).onclick = async () => {
      if (!(await MJ.confirm('ลบเป้าหมาย', 'ลบเป้าหมายนี้ใช่ไหม?', 'ลบ'))) return;
      await MJ.goals.remove(g.id);
      MJ.sheet.close(); MJ.toast('ลบแล้ว', 'ok'); MJ.render();
    };
  });
};

/* ---------------------- แผงหนี้ ---------------------- */
MJ.plans.openDebtSheet = function (debt) {
  const isNew = !debt;
  const d = debt || { person: '', direction: 'owed_to_me', amount: '', paid_amount: 0, due_date: '', note: '' };

  MJ.sheet.open(isNew ? 'บันทึกหนี้/ให้ยืม' : 'แก้ไขรายการหนี้', `
    <div class="seg" id="dbDir">
      <button class="seg-btn ${d.direction === 'owed_to_me' ? 'active' : ''}" data-dir="owed_to_me">เขาติดเรา</button>
      <button class="seg-btn ${d.direction === 'i_owe' ? 'active' : ''}" data-dir="i_owe">เราติดเขา</button>
    </div>
    <label class="field"><span>ใคร</span>
      <input type="text" id="dbPerson" value="${MJ.esc(d.person)}" placeholder="ชื่อคน/ร้าน"></label>
    <div class="row">
      <label class="field"><span>จำนวนเงิน</span>
        <input type="number" step="0.01" inputmode="decimal" id="dbAmount" value="${d.amount}"></label>
      <label class="field"><span>ครบกำหนด</span>
        <input type="date" id="dbDue" value="${d.due_date ? String(d.due_date).slice(0, 10) : ''}"></label>
    </div>
    <label class="field"><span>บันทึกช่วยจำ</span>
      <input type="text" id="dbNote" value="${MJ.esc(d.note || '')}"></label>
    ${isNew ? '' : `<p class="tiny muted">คืนแล้ว ${MJ.fmtBaht(d.paid_amount)} จาก ${MJ.fmtBaht(d.amount)}</p>`}
    <button class="btn btn-primary btn-block mt" id="dbSave">${isNew ? 'บันทึก' : 'บันทึกการแก้ไข'}</button>
    ${isNew ? '' : `<button class="btn btn-soft btn-block mt" id="dbPay">บันทึกการจ่ายคืน</button>
      <button class="btn btn-danger btn-block mt" id="dbDel">ลบรายการ</button>`}
  `, (body) => {
    let dir = d.direction;
    MJ.segInit(MJ.$('#dbDir', body), (b) => { dir = b.dataset.dir; });

    MJ.$('#dbSave', body).onclick = async () => {
      const amount = parseFloat(MJ.$('#dbAmount', body).value);
      if (!amount || amount <= 0) { MJ.toast('ใส่จำนวนเงินก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.debts.save({
          id: d.id, direction: dir, amount,
          person: MJ.$('#dbPerson', body).value,
          due_date: MJ.$('#dbDue', body).value || null,
          note: MJ.$('#dbNote', body).value.trim() || null,
          paid_amount: d.paid_amount,
        });
        MJ.sheet.close(); MJ.toast('บันทึกแล้ว 🤝', 'ok'); MJ.render();
      } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
    if (MJ.$('#dbPay', body)) MJ.$('#dbPay', body).onclick = () => {
      const left = Number(d.amount) - Number(d.paid_amount);
      MJ.sheet.open('บันทึกการจ่ายคืน', `
        <label class="field"><span>จ่ายคืนเท่าไหร่ (เหลือ ${MJ.fmtBaht(left)})</span>
          <input type="number" step="0.01" inputmode="decimal" id="dbPayAmt" value="${left}"></label>
        <div class="list-item"><span class="ic"><i class="fa fa-check"></i></span>
          <span class="tx2"><b>บันทึกเป็นรายการด้วย</b><small>ให้ยอดเงินในแอปตรงกับความจริง</small></span>
          <div class="switch on" id="dbPayRec"><i></i></div></div>
        <button class="btn btn-primary btn-block mt" id="dbPayOk">บันทึก</button>`, (b2) => {
        let rec = true;
        MJ.$('#dbPayRec', b2).onclick = (e) => { rec = !rec; e.currentTarget.classList.toggle('on', rec); };
        MJ.$('#dbPayOk', b2).onclick = async () => {
          const amt = parseFloat(MJ.$('#dbPayAmt', b2).value);
          if (!amt) return;
          MJ.loading(true, 'กำลังบันทึก…');
          try {
            await MJ.debts.pay(d, amt, rec);
            MJ.sheet.close(); MJ.buzz(30); MJ.toast('บันทึกแล้ว', 'ok'); MJ.render();
          } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
          finally { MJ.loading(false); }
        };
      });
    };
    if (MJ.$('#dbDel', body)) MJ.$('#dbDel', body).onclick = async () => {
      if (!(await MJ.confirm('ลบรายการหนี้', 'ลบรายการนี้ใช่ไหม?', 'ลบ'))) return;
      await MJ.debts.remove(d.id);
      MJ.sheet.close(); MJ.toast('ลบแล้ว', 'ok'); MJ.render();
    };
  });
};
