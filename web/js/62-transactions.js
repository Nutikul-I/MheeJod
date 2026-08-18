/* ===================================================================
   62-transactions.js — รายการย้อนหลัง ค้นหา แก้ไข ลบ และส่งออก Excel
   =================================================================== */
MJ.tx = {
  filter: { type: 'all', q: '', category: 'all' },

  /** แถวรายการหนึ่งบรรทัด */
  row(t) {
    const c = MJ.data.catById(t.category_id);
    const color = c?.color || '#9AA0A6';
    const badges = [
      t.source === 'slip' ? '🧾' : '', t.source === 'voice' ? '🎤' : '',
      t.source === 'recurring' ? '🔁' : '', t.receipt_image_url ? '📎' : '',
    ].filter(Boolean).join(' ');
    return `<div class="tx" data-tx="${t.id}">
      <span class="tx-ico" style="background:${MJ.hex2rgba(color, .18)}">${c?.icon || '❓'}</span>
      <span class="tx-main">
        <span class="tx-title">${MJ.esc(MJ.fixThai(t.note || c?.name || 'รายการ'))}</span>
        <span class="tx-sub">${MJ.esc(c?.name || 'ไม่ระบุหมวด')} • ${MJ.timeLabel(t.transaction_date)} ${badges}</span>
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
        if (!(await MJ.confirm('ลบรายการ', 'ลบรายการนี้ถาวรใช่ไหม?', 'ลบเลย'))) return;
        MJ.loading(true, 'กำลังลบ…');
        try { await MJ.data.deleteTransaction(t.id); MJ.toast('ลบแล้ว', 'ok'); MJ.sheet.close(); MJ.render(); }
        catch (e) { MJ.toast('ลบไม่สำเร็จ', 'err'); }
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

/* ============================ หน้าแสดงรายการ ============================ */
MJ.routes.transactions = (view) => {
  const f = MJ.tx.filter;
  const list = MJ.tx.filtered();
  const s = MJ.data.summary(list);
  const groups = MJ.tx.groupByDay(list);

  view.innerHTML = `
    <div class="search">
      <i class="fa fa-search muted"></i>
      <input id="txSearch" placeholder="ค้นหารายการ ร้านค้า หรือจำนวนเงิน" value="${MJ.esc(f.q)}">
      ${f.q ? '<button class="icon-btn" id="clearQ"><i class="fa fa-xmark"></i></button>' : ''}
    </div>
    <div class="chips">
      <button class="chip ${f.type === 'all' ? 'active' : ''}" data-f="all">ทั้งหมด</button>
      <button class="chip ${f.type === 'expense' ? 'active' : ''}" data-f="expense">รายจ่าย</button>
      <button class="chip ${f.type === 'income' ? 'active' : ''}" data-f="income">รายรับ</button>
      <button class="chip" id="btnExport"><i class="fa fa-excel"></i> Excel</button>
    </div>
    <div class="stat-grid mb">
      <div class="stat"><div class="k">รายรับ</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(s.income)}</div></div>
      <div class="stat"><div class="k">รายจ่าย</div><div class="v" style="color:var(--out)">${MJ.fmtBaht(s.expense)}</div></div>
    </div>
    <div class="card">
      ${groups.length ? groups.map(([day, items]) => {
        const dsum = items.reduce((a, t) => a + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
        return `<div class="day-head"><span>${MJ.dayLabel(day)}</span>
          <span class="${dsum >= 0 ? 'tx-amt in' : 'tx-amt out'}">${dsum >= 0 ? '+' : '−'}${MJ.fmtMoney(Math.abs(dsum))}</span></div>
          ${items.map((t) => MJ.tx.row(t)).join('')}`;
      }).join('') : `<div class="empty"><span class="big">🔍</span>ไม่พบรายการที่ค้นหา</div>`}
    </div>
    <p class="center tiny muted">ทั้งหมด ${list.length} รายการใน ${MJ.monthLabelFull(MJ.state.month)}</p>
    <div style="height:10px"></div>`;

  const input = MJ.$('#txSearch', view);
  let t0;
  input.oninput = () => { clearTimeout(t0); t0 = setTimeout(() => { MJ.tx.filter.q = input.value; MJ.render(); MJ.$('#txSearch').focus(); }, 350); };
  if (MJ.$('#clearQ', view)) MJ.$('#clearQ', view).onclick = () => { MJ.tx.filter.q = ''; MJ.render(); };
  view.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { MJ.tx.filter.type = b.dataset.f; MJ.render(); });
  MJ.$('#btnExport', view).onclick = () => MJ.tx.exportExcel(list);
  MJ.tx.bindRows(view);
};
