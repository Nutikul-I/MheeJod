/* ===================================================================
   68-accounts.js — กระเป๋าเงิน/บัญชี + โอนระหว่างกระเป๋า
   =================================================================== */
MJ.accounts = {
  async save(a) {
    const payload = {
      user_id: MJ.state.user.id,
      name: (a.name || '').trim(),
      type: a.type || 'cash',
      icon: a.icon || '👛',
      color: a.color || '#8B5E3C',
      opening_balance: Number(a.opening_balance || 0),
      credit_limit: a.credit_limit === '' || a.credit_limit == null ? null : Number(a.credit_limit),
      sort_order: a.sort_order ?? (MJ.state.accounts.length + 1),
    };
    const q = a.id
      ? MJ.sb.from('accounts').update(payload).eq('id', a.id)
      : MJ.sb.from('accounts').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await MJ.data.loadAllAccounts();
  },

  async archive(id) {
    const { error } = await MJ.sb.from('accounts').update({ is_archived: true }).eq('id', id);
    if (error) throw error;
    await MJ.data.loadAllAccounts();
  },

  async setDefault(id) {
    await MJ.sb.from('accounts').update({ is_default: false }).eq('user_id', MJ.state.user.id);
    await MJ.sb.from('accounts').update({ is_default: true }).eq('id', id);
    await MJ.data.loadAllAccounts();
  },

  /** โอนเงินระหว่างกระเป๋า — เก็บเป็นรายการชนิด transfer (ไม่นับเป็นรายรับ/จ่าย) */
  async transfer({ from, to, amount, note, date }) {
    if (from === to) throw new Error('เลือกกระเป๋าต้นทาง/ปลายทางให้ต่างกัน');
    const a = MJ.data.accountById(from), b = MJ.data.accountById(to);
    return MJ.data.addTransaction({
      amount: Number(amount),
      type: 'expense',
      kind: 'transfer',
      account_id: from,
      to_account_id: to,
      category_id: null,
      note: note || `โอน ${a?.name || ''} → ${b?.name || ''}`,
      transaction_date: date ? new Date(date) : new Date(),
      source: 'manual',
    });
  },
};

MJ.routes.accounts = (view) => {
  const list = MJ.state.accounts || [];
  const bal = MJ.state.balances || {};
  const total = list.reduce((sum, a) => sum + (bal[a.id] ?? Number(a.opening_balance)), 0);
  const TYPE_LABEL = { cash: 'เงินสด', bank: 'ธนาคาร', credit: 'บัตรเครดิต', ewallet: 'วอลเล็ต', savings: 'เงินออม' };

  view.innerHTML = `
    <div class="balance">
      <div class="lbl">เงินรวมทุกกระเป๋า</div>
      <div class="amt" id="accTotal">${MJ.fmtBaht(total)}</div>
      <div class="grid">
        <div class="box"><span class="tiny">จำนวนกระเป๋า</span><b>${list.length}</b></div>
        <div class="box"><span class="tiny">รายการเดือนนี้</span><b>${MJ.state.transactions.length}</b></div>
      </div>
    </div>

    <div class="chips">
      <button class="chip" id="accAdd"><i class="fa fa-plus"></i> เพิ่มกระเป๋า</button>
      <button class="chip" id="accTransfer"><i class="fa fa-rightleft"></i> โอนระหว่างกระเป๋า</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>กระเป๋าของฉัน</h3></div>
      ${list.length ? list.map((a) => {
        const b = bal[a.id] ?? Number(a.opening_balance);
        const isCredit = a.type === 'credit';
        return `<div class="list-item" data-acc="${a.id}">
          <span class="ic" style="background:${MJ.hex2rgba(a.color, .18)}">${a.icon}</span>
          <span class="tx2"><b>${MJ.esc(a.name)}${a.is_default ? ' <span class="badge">หลัก</span>' : ''}</b>
            <small>${TYPE_LABEL[a.type] || a.type}${isCredit && a.credit_limit ? ` • วงเงิน ${MJ.fmtBaht(a.credit_limit)}` : ''}</small></span>
          <span class="tx-amt ${b < 0 ? 'out' : ''}">${MJ.fmtBaht(b)}</span>
        </div>`;
      }).join('') : '<div class="empty tiny">ยังไม่มีกระเป๋า</div>'}
    </div>

    <div class="card">
      <div class="card-head"><h3>โอนล่าสุด</h3></div>
      ${(() => {
        const tr = MJ.state.transactions.filter((t) => t.kind === 'transfer').slice(0, 5);
        return tr.length ? tr.map((t) => {
          const a = MJ.data.accountById(t.account_id), b = MJ.data.accountById(t.to_account_id);
          return `<div class="list-item">
            <span class="ic"><i class="fa fa-rightleft"></i></span>
            <span class="tx2"><b>${MJ.esc(a?.name || '-')} → ${MJ.esc(b?.name || '-')}</b>
              <small>${MJ.dayLabel(t.transaction_date)} ${MJ.timeLabel(t.transaction_date)}</small></span>
            <span class="tx-amt">${MJ.fmtBaht(t.amount)}</span>
          </div>`;
        }).join('') : '<div class="empty tiny">ยังไม่มีการโอนระหว่างกระเป๋า</div>';
      })()}
    </div>`;

  MJ.countUp(MJ.$('#accTotal', view), total);
  MJ.$('#accAdd', view).onclick = () => MJ.accounts.openSheet(null);
  MJ.$('#accTransfer', view).onclick = () => MJ.accounts.openTransferSheet();
  view.querySelectorAll('[data-acc]').forEach((el) => el.onclick = () =>
    MJ.accounts.openSheet(MJ.data.accountById(el.dataset.acc)));
};

MJ.accounts.openSheet = function (acc) {
  const isNew = !acc;
  const a = acc || { name: '', type: 'cash', icon: '👛', color: '#F2B23E', opening_balance: 0, credit_limit: '' };
  const ICONS = ['👛','🏦','💳','📱','🐷','💵','🏧','🎁'];
  const COLORS = ['#F2B23E','#4A9DF2','#E2607A','#3EA96B','#B36AE2','#8B5E3C','#5BC0A5','#F2724A'];
  const TYPES = [['cash','เงินสด'],['bank','ธนาคาร'],['credit','บัตรเครดิต'],['ewallet','วอลเล็ต'],['savings','เงินออม']];

  MJ.sheet.open(isNew ? 'เพิ่มกระเป๋า' : 'แก้ไขกระเป๋า', `
    <label class="field"><span>ชื่อกระเป๋า</span>
      <input type="text" id="acName" value="${MJ.esc(a.name)}" placeholder="เช่น กสิกร, เงินสด, บัตรเครดิต"></label>
    <label class="field"><span>ประเภท</span><select id="acType">
      ${TYPES.map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
    <div class="field"><span>ไอคอน</span>
      <div class="chips" id="acIcons">${ICONS.map((i) =>
        `<button class="chip ${i === a.icon ? 'active' : ''}" data-icon="${i}" style="font-size:18px">${i}</button>`).join('')}</div>
    </div>
    <div class="field"><span>สี</span>
      <div class="chips" id="acColors">${COLORS.map((c) =>
        `<button class="chip" data-color="${c}" style="background:${c};width:32px;height:32px;padding:0;border-radius:11px;
          ${c === a.color ? 'outline:3px solid var(--ink);outline-offset:2px' : ''}"></button>`).join('')}</div>
    </div>
    <div class="row">
      <label class="field"><span>ยอดตั้งต้น</span>
        <input type="number" step="0.01" inputmode="decimal" id="acOpen" value="${a.opening_balance ?? 0}"></label>
      <label class="field"><span>วงเงิน (บัตรเครดิต)</span>
        <input type="number" step="1" inputmode="decimal" id="acLimit" value="${a.credit_limit ?? ''}"></label>
    </div>
    <button class="btn btn-primary btn-block" id="acSave">${isNew ? 'เพิ่มกระเป๋า' : 'บันทึก'}</button>
    ${isNew ? '' : `${a.is_default ? '' : '<button class="btn btn-soft btn-block mt" id="acDefault">ตั้งเป็นกระเป๋าหลัก</button>'}
      <button class="btn btn-danger btn-block mt" id="acDel">เก็บกระเป๋านี้เข้าคลัง</button>`}
  `, (body) => {
    let icon = a.icon, color = a.color;
    body.querySelectorAll('#acIcons .chip').forEach((b) => b.onclick = () => {
      icon = b.dataset.icon;
      body.querySelectorAll('#acIcons .chip').forEach((x) => x.classList.toggle('active', x === b));
    });
    body.querySelectorAll('#acColors .chip').forEach((b) => b.onclick = () => {
      color = b.dataset.color;
      body.querySelectorAll('#acColors .chip').forEach((x) => x.style.outline = x === b ? '3px solid var(--ink)' : '');
    });

    MJ.$('#acSave', body).onclick = async () => {
      const name = MJ.$('#acName', body).value.trim();
      if (!name) { MJ.toast('ตั้งชื่อกระเป๋าก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.accounts.save({
          id: a.id, name, icon, color,
          type: MJ.$('#acType', body).value,
          opening_balance: MJ.$('#acOpen', body).value || 0,
          credit_limit: MJ.$('#acLimit', body).value,
        });
        MJ.sheet.close(); MJ.toast('บันทึกแล้ว 👛', 'ok'); MJ.render();
      } catch (e) {
        MJ.toast(/duplicate/i.test(e.message) ? 'มีกระเป๋าชื่อนี้แล้ว' : 'บันทึกไม่สำเร็จ', 'err');
      } finally { MJ.loading(false); }
    };
    if (MJ.$('#acDefault', body)) MJ.$('#acDefault', body).onclick = async () => {
      await MJ.accounts.setDefault(a.id);
      MJ.sheet.close(); MJ.toast('ตั้งเป็นกระเป๋าหลักแล้ว', 'ok'); MJ.render();
    };
    if (MJ.$('#acDel', body)) MJ.$('#acDel', body).onclick = async () => {
      if (!(await MJ.confirm('เก็บกระเป๋า', 'รายการเดิมยังอยู่ แต่กระเป๋านี้จะไม่แสดงอีก', 'เก็บเข้าคลัง'))) return;
      await MJ.accounts.archive(a.id);
      MJ.sheet.close(); MJ.toast('เก็บแล้ว', 'ok'); MJ.render();
    };
  });
};

MJ.accounts.openTransferSheet = function () {
  const list = MJ.state.accounts || [];
  if (list.length < 2) { MJ.toast('ต้องมีอย่างน้อย 2 กระเป๋าถึงจะโอนได้', 'err'); return; }
  const opts = (sel) => list.map((a) =>
    `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${a.icon} ${MJ.esc(a.name)}</option>`).join('');

  MJ.sheet.open('โอนระหว่างกระเป๋า', `
    <label class="field"><span>จากกระเป๋า</span><select id="trFrom">${opts(list[0].id)}</select></label>
    <label class="field"><span>ไปกระเป๋า</span><select id="trTo">${opts(list[1].id)}</select></label>
    <div class="row">
      <label class="field"><span>จำนวนเงิน</span>
        <input type="number" step="0.01" inputmode="decimal" id="trAmount" placeholder="0.00"></label>
      <label class="field"><span>วันที่</span>
        <input type="datetime-local" id="trDate" value="${MJ.isoLocal(new Date())}"></label>
    </div>
    <label class="field"><span>บันทึกช่วยจำ</span><input type="text" id="trNote" placeholder="เช่น ถอนเงินสด"></label>
    <p class="tiny muted mb">การโอนไม่ถูกนับเป็นรายรับหรือรายจ่าย แค่ย้ายเงินระหว่างกระเป๋า</p>
    <button class="btn btn-primary btn-block" id="trSave">โอนเลย</button>
  `, (body) => {
    MJ.$('#trSave', body).onclick = async () => {
      const amount = parseFloat(MJ.$('#trAmount', body).value);
      if (!amount || amount <= 0) { MJ.toast('ใส่จำนวนเงินก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังโอน…');
      try {
        await MJ.accounts.transfer({
          from: MJ.$('#trFrom', body).value,
          to: MJ.$('#trTo', body).value,
          amount,
          note: MJ.$('#trNote', body).value.trim(),
          date: MJ.$('#trDate', body).value,
        });
        await MJ.data.loadBalances();
        MJ.sheet.close(); MJ.buzz(30); MJ.toast('โอนเรียบร้อย 💸', 'ok'); MJ.render();
      } catch (e) { MJ.toast(e.message || 'โอนไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
  });
};
