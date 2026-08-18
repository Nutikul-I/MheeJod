/* ===================================================================
   62-transactions.js — รายการย้อนหลัง ค้นหา แก้ไข ลบ และส่งออก Excel
   =================================================================== */
MJ.tx = {
  filter: { type: 'all', q: '', category: 'all', account: 'all', scope: 'month', from: '', to: '' },
  limit: 50,              // แสดงทีละ 50 รายการ กดโหลดเพิ่มได้
  selectMode: false,
  selected: new Set(),
  searchResults: null,    // ผลค้นหาข้ามเดือน

  /** แถวรายการ — 2 บรรทัดเสมอ
   *  บรรทัดบน: ชื่อรายการ
   *  บรรทัดล่าง: เวลา + ป้ายหมวดหมู่ + ไอคอนสลิป (เฉพาะที่มีไฟล์แนบ)  */
  row(t) {
    const c = MJ.data.catById(t.category_id);
    const color = c?.color || '#9AA0A6';
    const marks = [
      t.receipt_image_url ? '<i class="fa fa-receipt" title="มีรูปสลิปแนบ"></i>' : '',
      t.source === 'voice' ? '<i class="fa fa-mic" title="จดด้วยเสียง"></i>' : '',
      t.source === 'recurring' ? '<i class="fa fa-repeat" title="รายการประจำ"></i>' : '',
    ].filter(Boolean).join('');
    return `<div class="tx" data-tx="${t.id}">
      <span class="tx-ico" style="background:${MJ.hex2rgba(color, .18)}">${c?.icon || '❓'}</span>
      <span class="tx-main">
        <span class="tx-title">${MJ.esc(MJ.fixThai(t.note || c?.name || 'รายการ'))}</span>
        <span class="tx-sub">
          <span class="tx-time">${MJ.timeLabel(t.transaction_date)}</span>
          <span class="tx-badge" style="background:${MJ.hex2rgba(color, .16)};color:${color}">${MJ.esc(c?.name || 'ไม่ระบุหมวด')}</span>
          ${marks ? `<span class="tx-marks">${marks}</span>` : ''}
        </span>
      </span>
      <span class="tx-amt ${t.type === 'income' ? 'in' : 'out'}">${t.type === 'income' ? '+' : '−'}${MJ.fmtMoney(t.amount)}</span>
    </div>`;
  },

  bindRows(root) {
    root.querySelectorAll('[data-tx]').forEach((el) => {
      el.onclick = () => {
        const t = MJ.state.transactions.find((x) => x.id === el.dataset.tx);
        if (t) MJ.tx.openDetail(t);
      };
    });
  },

  /** จัดกลุ่มตามวัน */
  groupByDay(list) {
    const groups = new Map();
    list.forEach((t) => {
      const key = MJ.isoDate(new Date(t.transaction_date));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    return Array.from(groups.entries());
  },

  filtered() {
    const f = MJ.tx.filter;
    const q = f.q.trim().toLowerCase();
    return MJ.state.transactions.filter((t) => {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.category !== 'all' && t.category_id !== f.category) return false;
      if (q) {
        const c = MJ.data.catById(t.category_id);
        const hay = MJ.fixThai(`${t.note || ''} ${t.payee_name || ''} ${c?.name || ''} ${t.amount}`).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  /* ---------------------- Sheet รายละเอียด/แก้ไข ---------------------- */
  openDetail(t) {
    const c = MJ.data.catById(t.category_id);
    MJ.sheet.open('รายละเอียด', `
      <div class="center mb">
        <div class="tx-ico" style="margin:0 auto 8px;width:56px;height:56px;font-size:26px;border-radius:20px;background:${MJ.hex2rgba(c?.color || '#9AA0A6', .18)}">${c?.icon || '❓'}</div>
        <div class="tx-amt ${t.type === 'income' ? 'in' : 'out'}" style="font-size:30px">
          ${t.type === 'income' ? '+' : '−'}${MJ.fmtBaht(t.amount)}</div>
        <div class="muted tiny">${MJ.dayLabel(t.transaction_date)} ${MJ.timeLabel(t.transaction_date)}</div>
      </div>
      <div id="receiptBox"></div>
      <div class="card">
        <div class="list-item"><span class="ic"><i class="fa fa-tag"></i></span><span class="tx2"><b>${MJ.esc(c?.name || 'ไม่ระบุหมวด')}</b><small>หมวดหมู่</small></span></div>
        ${(() => { const a = MJ.data.accountById(t.account_id); return a ? `<div class="list-item"><span class="ic">${a.icon}</span>
          <span class="tx2"><b>${MJ.esc(a.name)}</b><small>กระเป๋าเงิน</small></span></div>` : ''; })()}
        <div class="list-item"><span class="ic"><i class="fa fa-pen"></i></span><span class="tx2"><b>${MJ.esc(MJ.fixThai(t.note || '-'))}</b><small>บันทึกช่วยจำ</small></span></div>
        ${t.payee_name ? `<div class="list-item"><span class="ic"><i class="fa fa-store"></i></span><span class="tx2"><b>${MJ.esc(MJ.fixThai(t.payee_name))}</b><small>ผู้รับเงิน</small></span></div>` : ''}
        ${t.slip_reference ? `<div class="list-item"><span class="ic"><i class="fa fa-tag"></i></span><span class="tx2"><b style="word-break:break-all;font-size:12px">${MJ.esc(t.slip_reference.slice(0, 60))}</b><small>รหัสอ้างอิงสลิป</small></span></div>` : ''}
        <div class="list-item"><span class="ic"><i class="fa fa-download"></i></span><span class="tx2"><b>${({ manual:'กรอกเอง', text:'พิมพ์จด', voice:'พูดจด', slip:'สลิป', recurring:'รายการประจำ', import:'นำเข้า' })[t.source] || t.source}</b><small>ที่มา</small></span></div>
      </div>
      <button class="btn btn-soft btn-block" id="txEdit">แก้ไขรายการ</button>
      <button class="btn btn-danger btn-block mt" id="txDel">ลบรายการนี้</button>
    `, async (body) => {
      MJ.$('#txEdit', body).onclick = () => MJ.tx.openEdit(t);
      MJ.$('#txDel', body).onclick = async () => {
        if (!(await MJ.confirm('ลบรายการ', 'ลบรายการนี้ใช่ไหม? (กดเลิกทำได้ทันทีหลังลบ)', 'ลบเลย'))) return;
        MJ.loading(true, 'กำลังลบ…');
        try {
          const snap = await MJ.data.deleteTransaction(t.id, { keepFile: true });
          MJ.sheet.close();
          MJ.render();
          MJ.toastUndo('ลบแล้ว', async () => {
            await MJ.data.restoreTransaction(snap);
            MJ.toast('คืนรายการให้แล้ว 🐻', 'ok');
            MJ.render();
          });
          // ครบเวลาเลิกทำแล้วค่อยลบไฟล์สลิปจริง
          if (snap?.receipt_image_url) {
            setTimeout(async () => {
              const still = MJ.state.transactions.some((x) => x.receipt_image_url === snap.receipt_image_url);
              if (!still) MJ.sb.storage.from('receipts').remove([snap.receipt_image_url]).catch(() => {});
            }, 8000);
          }
        } catch (e) { MJ.toast('ลบไม่สำเร็จ', 'err'); }
        finally { MJ.loading(false); }
      };
      if (t.receipt_image_url) {
        const url = await MJ.data.receiptUrl(t.receipt_image_url);
        if (url) MJ.$('#receiptBox', body).innerHTML = `<img class="slip-preview" src="${url}" alt="สลิป">`;
      }
    });
  },

  openEdit(t) {
    const cats = MJ.state.categories;
    MJ.sheet.open('แก้ไขรายการ', `
      <div class="seg" id="eType">
        <button class="seg-btn ${t.type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> รายจ่าย</button>
        <button class="seg-btn ${t.type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> รายรับ</button>
      </div>
      <label class="field"><span>จำนวนเงิน</span>
        <input type="number" step="0.01" inputmode="decimal" id="eAmount" value="${t.amount}"></label>
      <label class="field"><span>หมวดหมู่</span><select id="eCat">
        ${cats.filter((c) => c.type === t.type).map((c) => `<option value="${c.id}" ${c.id === t.category_id ? 'selected' : ''}>${c.icon} ${MJ.esc(c.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>บันทึกช่วยจำ</span><input type="text" id="eNote" value="${MJ.esc(t.note || '')}"></label>
      <label class="field"><span>วันและเวลา</span><input type="datetime-local" id="eDate" value="${MJ.isoLocal(new Date(t.transaction_date))}"></label>
      <button class="btn btn-primary btn-block" id="eSave">บันทึกการแก้ไข</button>
    `, (body) => {
      let type = t.type;
      MJ.segInit(MJ.$('#eType', body), (b) => {
        type = b.dataset.type;
        body.querySelectorAll('#eType .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        MJ.$('#eCat', body).innerHTML = cats.filter((c) => c.type === type)
          .map((c) => `<option value="${c.id}">${c.icon} ${MJ.esc(c.name)}</option>`).join('');
      });
      MJ.$('#eSave', body).onclick = async () => {
        MJ.loading(true, 'กำลังบันทึก…');
        try {
          await MJ.data.updateTransaction(t.id, {
            amount: parseFloat(MJ.$('#eAmount', body).value),
            type,
            category_id: MJ.$('#eCat', body).value || null,
            note: MJ.$('#eNote', body).value.trim() || null,
            transaction_date: new Date(MJ.$('#eDate', body).value).toISOString(),
          });
          MJ.sheet.close(); MJ.toast('แก้ไขแล้ว', 'ok'); MJ.render();
        } catch (e) { MJ.toast('บันทึกไม่สำเร็จ', 'err'); }
        finally { MJ.loading(false); }
      };
    });
  },

  /* ---------------------- ส่งออก Excel ---------------------- */
  exportExcel(list, filename) {
    const rows = list.map((t) => {
      const c = MJ.data.catById(t.category_id);
      const d = new Date(t.transaction_date);
      return {
        'วันที่': MJ.isoDate(d),
        'เวลา': MJ.timeLabel(d).replace(' น.', ''),
        'ประเภท': t.type === 'income' ? 'รายรับ' : 'รายจ่าย',
        'หมวดหมู่': c?.name || 'ไม่ระบุ',
        'กระเป๋าเงิน': MJ.data.accountById(t.account_id)?.name || '',
        'รายละเอียด': MJ.fixThai(t.note || ''),
        'ผู้รับเงิน/ร้านค้า': MJ.fixThai(t.payee_name || ''),
        'จำนวนเงิน': Number(t.amount),
        'ที่มา': ({ manual:'กรอกเอง', text:'พิมพ์', voice:'เสียง', slip:'สลิป', recurring:'รายการประจำ' })[t.source] || t.source,
        'รหัสอ้างอิงสลิป': t.slip_reference || '',
      };
    });
    const s = MJ.data.summary(list);
    rows.push({}, {
      'วันที่': 'สรุป', 'ประเภท': 'รายรับรวม', 'จำนวนเงิน': s.income,
    }, { 'ประเภท': 'รายจ่ายรวม', 'จำนวนเงิน': s.expense },
       { 'ประเภท': 'คงเหลือ', 'จำนวนเงิน': s.balance });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 9 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 13 }, { wch: 12 }, { wch: 26 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'รายการ');
    XLSX.writeFile(wb, filename || `หมีจด-${MJ.isoDate(MJ.state.month).slice(0, 7)}.xlsx`);
    MJ.toast('ดาวน์โหลดไฟล์แล้ว 📄', 'ok');
  },
};

/** แท็บสลับ รายการ | ปฏิทิน (ใช้ร่วมกันสองหน้า) */
MJ.listTabs = (active) => `
  <div class="seg" id="listTabs">
    <button class="seg-btn ${active === 'transactions' ? 'active' : ''}" data-route="transactions"><i class="fa fa-list"></i> รายการ</button>
    <button class="seg-btn ${active === 'calendar' ? 'active' : ''}" data-route="calendar"><i class="fa fa-calendar"></i> ปฏิทิน</button>
  </div>`;
MJ.bindListTabs = (view) => MJ.segInit(MJ.$('#listTabs', view), (b) => MJ.go(b.dataset.route));

/* ============================ หน้าแสดงรายการ ============================ */
MJ.routes.transactions = (view) => {
  const f = MJ.tx.filter;
  const searching = f.scope === 'all' && MJ.tx.searchResults;
  const list = searching ? MJ.tx.searchResults : MJ.tx.filtered();
  const shown = list.slice(0, MJ.tx.limit);
  const s = MJ.data.summary(list);
  const groups = MJ.tx.groupByDay(shown);
  const cats = MJ.state.categories;
  const accounts = MJ.state.accounts || [];

  view.innerHTML = `
    ${MJ.listTabs('transactions')}
    <div class="search">
      <i class="fa fa-search muted"></i>
      <input id="txSearch" placeholder="ค้นหารายการ ร้านค้า หรือจำนวนเงิน" value="${MJ.esc(f.q)}">
      ${f.q ? '<button class="icon-btn" id="clearQ"><i class="fa fa-xmark"></i></button>' : ''}
      <button class="icon-btn" id="btnFilter" title="ตัวกรอง"><i class="fa fa-filter"></i></button>
    </div>

    <div class="chips">
      <button class="chip ${f.scope === 'month' ? 'active' : ''}" data-scope="month">เดือนนี้</button>
      <button class="chip ${f.scope === 'all' ? 'active' : ''}" data-scope="all">ทุกเดือน</button>
      <button class="chip ${f.type === 'all' ? 'active' : ''}" data-f="all">ทั้งหมด</button>
      <button class="chip ${f.type === 'expense' ? 'active' : ''}" data-f="expense">รายจ่าย</button>
      <button class="chip ${f.type === 'income' ? 'active' : ''}" data-f="income">รายรับ</button>
      <button class="chip" id="btnSelect">${MJ.tx.selectMode ? 'ยกเลิกเลือก' : '☑︎ เลือกหลายรายการ'}</button>
      <button class="chip" id="btnExport"><i class="fa fa-excel"></i> Excel</button>
    </div>

    ${(f.category !== 'all' || f.account !== 'all' || f.from || f.to) ? `<div class="chips">
      ${f.category !== 'all' ? `<button class="chip active" data-clear="category">หมวด: ${MJ.esc(cats.find((c) => c.id === f.category)?.name || '-')} ✕</button>` : ''}
      ${f.account !== 'all' ? `<button class="chip active" data-clear="account">กระเป๋า: ${MJ.esc(accounts.find((a) => a.id === f.account)?.name || '-')} ✕</button>` : ''}
      ${f.from ? `<button class="chip active" data-clear="from">ตั้งแต่ ${f.from} ✕</button>` : ''}
      ${f.to ? `<button class="chip active" data-clear="to">ถึง ${f.to} ✕</button>` : ''}
    </div>` : ''}

    <div class="stat-grid">
      <div class="stat"><div class="k">รายรับ</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(s.income)}</div></div>
      <div class="stat"><div class="k">รายจ่าย</div><div class="v" style="color:var(--out)">${MJ.fmtBaht(s.expense)}</div></div>
    </div>

    <div class="card">
      ${groups.length ? groups.map(([day, items]) => {
        const dsum = items.filter((t) => t.kind !== 'transfer')
          .reduce((a, t) => a + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
        return `<div class="day-head"><span>${MJ.dayLabel(day)}</span>
          <span class="${dsum >= 0 ? 'tx-amt in' : 'tx-amt out'}">${dsum >= 0 ? '+' : '−'}${MJ.fmtMoney(Math.abs(dsum))}</span></div>
          ${items.map((t) => MJ.tx.row(t)).join('')}`;
      }).join('') : `<div class="empty"><span class="big">🔍</span>ไม่พบรายการที่ค้นหา</div>`}
    </div>

    ${list.length > MJ.tx.limit ? `<button class="btn btn-soft btn-block" id="btnMore">
      โหลดเพิ่ม (เหลืออีก ${list.length - MJ.tx.limit} รายการ)</button>` : ''}
    <p class="center tiny muted mt">${searching ? `พบ ${list.length} รายการจากทุกเดือน`
      : `ทั้งหมด ${list.length} รายการใน ${MJ.monthLabelFull(MJ.state.month)}`}</p>
    <div style="height:10px"></div>`;

  MJ.bindListTabs(view);

  /* ---------- ค้นหา ---------- */
  const input = MJ.$('#txSearch', view);
  let t0;
  input.oninput = () => {
    clearTimeout(t0);
    t0 = setTimeout(async () => {
      MJ.tx.filter.q = input.value;
      if (MJ.tx.filter.scope === 'all') await MJ.tx.runSearch();
      MJ.render();
      const el = MJ.$('#txSearch');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 380);
  };
  if (MJ.$('#clearQ', view)) MJ.$('#clearQ', view).onclick = async () => {
    MJ.tx.filter.q = '';
    if (MJ.tx.filter.scope === 'all') await MJ.tx.runSearch();
    MJ.render();
  };
  MJ.$('#btnFilter', view).onclick = () => MJ.tx.openFilterSheet();

  view.querySelectorAll('[data-scope]').forEach((b) => b.onclick = async () => {
    MJ.tx.filter.scope = b.dataset.scope;
    MJ.tx.limit = 50;
    if (b.dataset.scope === 'all') { MJ.loading(true, 'กำลังค้นทุกเดือน…'); await MJ.tx.runSearch(); MJ.loading(false); }
    else MJ.tx.searchResults = null;
    MJ.render();
  });
  view.querySelectorAll('[data-f]').forEach((b) => b.onclick = async () => {
    MJ.tx.filter.type = b.dataset.f;
    if (MJ.tx.filter.scope === 'all') await MJ.tx.runSearch();
    MJ.render();
  });
  view.querySelectorAll('[data-clear]').forEach((b) => b.onclick = async () => {
    MJ.tx.filter[b.dataset.clear] = b.dataset.clear === 'category' || b.dataset.clear === 'account' ? 'all' : '';
    if (MJ.tx.filter.scope === 'all') await MJ.tx.runSearch();
    MJ.render();
  });

  MJ.$('#btnExport', view).onclick = () => MJ.tx.exportExcel(list);
  if (MJ.$('#btnMore', view)) MJ.$('#btnMore', view).onclick = () => { MJ.tx.limit += 50; MJ.render(); };

  /* ---------- โหมดเลือกหลายรายการ ---------- */
  MJ.$('#btnSelect', view).onclick = () => {
    MJ.tx.selectMode = !MJ.tx.selectMode;
    MJ.tx.selected.clear();
    MJ.render();
  };
  if (MJ.tx.selectMode) MJ.tx.bindSelect(view);
  else MJ.tx.bindRows(view);
};

/* ---------------------- ค้นหาข้ามเดือน ---------------------- */
MJ.tx.runSearch = async function () {
  const f = MJ.tx.filter;
  try {
    MJ.tx.searchResults = await MJ.data.searchAll(f.q.trim(), {
      type: f.type, category: f.category, account: f.account,
      from: f.from || null, to: f.to || null, limit: 500,
    });
  } catch (e) {
    MJ.toast('ค้นหาไม่สำเร็จ', 'err');
    MJ.tx.searchResults = [];
  }
};

/* ---------------------- ตัวกรองละเอียด ---------------------- */
MJ.tx.openFilterSheet = function () {
  const f = MJ.tx.filter;
  const cats = MJ.state.categories, accounts = MJ.state.accounts || [];
  MJ.sheet.open('ตัวกรอง', `
    <label class="field"><span>หมวดหมู่</span><select id="ftCat">
      <option value="all">ทุกหมวด</option>
      ${cats.map((c) => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${c.icon} ${MJ.esc(c.name)}</option>`).join('')}
    </select></label>
    <label class="field"><span>กระเป๋าเงิน</span><select id="ftAcc">
      <option value="all">ทุกกระเป๋า</option>
      ${accounts.map((a) => `<option value="${a.id}" ${f.account === a.id ? 'selected' : ''}>${a.icon} ${MJ.esc(a.name)}</option>`).join('')}
    </select></label>
    <div class="row">
      <label class="field"><span>ตั้งแต่วันที่</span><input type="date" id="ftFrom" value="${f.from}"></label>
      <label class="field"><span>ถึงวันที่</span><input type="date" id="ftTo" value="${f.to}"></label>
    </div>
    <p class="tiny muted mb">กำหนดช่วงวันที่แล้วระบบจะค้นทุกเดือนให้อัตโนมัติ</p>
    <button class="btn btn-primary btn-block" id="ftApply">ใช้ตัวกรอง</button>
    <button class="btn btn-ghost btn-block" id="ftReset">ล้างตัวกรอง</button>
  `, (body) => {
    MJ.$('#ftApply', body).onclick = async () => {
      f.category = MJ.$('#ftCat', body).value;
      f.account = MJ.$('#ftAcc', body).value;
      f.from = MJ.$('#ftFrom', body).value;
      f.to = MJ.$('#ftTo', body).value;
      if (f.from || f.to) f.scope = 'all';
      MJ.tx.limit = 50;
      MJ.loading(true, 'กำลังกรอง…');
      if (f.scope === 'all') await MJ.tx.runSearch();
      MJ.loading(false);
      MJ.sheet.close(); MJ.render();
    };
    MJ.$('#ftReset', body).onclick = async () => {
      Object.assign(f, { type: 'all', q: '', category: 'all', account: 'all', scope: 'month', from: '', to: '' });
      MJ.tx.searchResults = null;
      MJ.sheet.close(); MJ.render();
    };
  });
};

/* ---------------------- เลือกหลายรายการ ---------------------- */
MJ.tx.bindSelect = function (view) {
  view.querySelectorAll('[data-tx]').forEach((el) => {
    el.classList.add('selectable');
    el.classList.toggle('picked', MJ.tx.selected.has(el.dataset.tx));
    el.onclick = () => {
      const id = el.dataset.tx;
      if (MJ.tx.selected.has(id)) MJ.tx.selected.delete(id); else MJ.tx.selected.add(id);
      el.classList.toggle('picked', MJ.tx.selected.has(id));
      MJ.buzz(6);
      drawBar();
    };
  });

  const drawBar = () => {
    let bar = MJ.$('#bulkBar');
    if (!MJ.tx.selected.size) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulkBar';
      bar.className = 'bulk-bar';
      document.body.appendChild(bar);
    }
    const sum = MJ.state.transactions.filter((t) => MJ.tx.selected.has(t.id))
      .reduce((a, t) => a + Number(t.amount), 0);
    bar.innerHTML = `
      <span>เลือก ${MJ.tx.selected.size} รายการ · ${MJ.fmtBaht(sum)}</span>
      <button class="btn btn-soft btn-sm" id="bulkCat"><i class="fa fa-tag"></i> เปลี่ยนหมวด</button>
      <button class="btn btn-danger btn-sm" id="bulkDel"><i class="fa fa-trash"></i> ลบ</button>`;

    MJ.$('#bulkCat', bar).onclick = () => {
      const cats = MJ.state.categories;
      MJ.sheet.open('เปลี่ยนหมวดของรายการที่เลือก', `
        <label class="field"><span>ย้ายไปหมวด</span><select id="bkCat">
          ${cats.map((c) => `<option value="${c.id}">${c.icon} ${MJ.esc(c.name)} (${c.type === 'income' ? 'รายรับ' : 'รายจ่าย'})</option>`).join('')}
        </select></label>
        <button class="btn btn-primary btn-block" id="bkOk">ย้าย ${MJ.tx.selected.size} รายการ</button>`, (b2) => {
        MJ.$('#bkOk', b2).onclick = async () => {
          MJ.loading(true, 'กำลังย้าย…');
          try {
            await MJ.data.setCategoryMany([...MJ.tx.selected], MJ.$('#bkCat', b2).value);
            MJ.tx.selected.clear();
            MJ.sheet.close(); MJ.toast('ย้ายหมวดแล้ว', 'ok'); MJ.render();
          } catch (e) { MJ.toast('ย้ายไม่สำเร็จ', 'err'); }
          finally { MJ.loading(false); }
        };
      });
    };
    MJ.$('#bulkDel', bar).onclick = async () => {
      const n = MJ.tx.selected.size;
      if (!(await MJ.confirm('ลบหลายรายการ', `ลบ ${n} รายการที่เลือกใช่ไหม?`, 'ลบทั้งหมด'))) return;
      MJ.loading(true, 'กำลังลบ…');
      try {
        const snaps = await MJ.data.deleteMany([...MJ.tx.selected]);
        MJ.tx.selected.clear();
        MJ.render();
        MJ.toastUndo(`ลบแล้ว ${n} รายการ`, async () => {
          for (const s of snaps) await MJ.data.restoreTransaction(s);
          MJ.toast('คืนรายการให้แล้ว', 'ok');
          MJ.render();
        });
      } catch (e) { MJ.toast('ลบไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
  };
  drawBar();
};
