/* ===================================================================
   71-import.js — นำเข้ารายการจากไฟล์ CSV / Excel
   รองรับไฟล์จากแอปอื่นหรือ statement ธนาคาร โดยให้ผู้ใช้จับคู่คอลัมน์เอง
   =================================================================== */
MJ.importer = {
  rows: [],
  headers: [],

  open() {
    MJ.sheet.open('นำเข้าข้อมูล', `
      <p class="tiny muted mb">รองรับไฟล์ .csv .xlsx .xls — ต้องมีอย่างน้อย <b>วันที่</b> กับ <b>จำนวนเงิน</b>
        ระบบจะให้จับคู่คอลัมน์เองในขั้นถัดไป</p>
      <button class="btn btn-primary btn-block" id="imPick"><i class="fa fa-download"></i> เลือกไฟล์</button>
      <input type="file" id="imFile" accept=".csv,.xlsx,.xls,text/csv" hidden>
      <div class="hr"></div>
      <p class="tiny muted">เคล็ดลับ: ส่งออกจากหมีจดเป็น Excel ก่อน แล้วเปิดดูหัวคอลัมน์ตัวอย่างได้</p>
    `, (body) => {
      const file = MJ.$('#imFile', body);
      MJ.$('#imPick', body).onclick = () => file.click();
      file.onchange = (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) this.read(f);
      };
    });
  },

  async read(file) {
    MJ.loading(true, 'กำลังอ่านไฟล์…');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rows.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      this.rows = rows;
      this.headers = Object.keys(rows[0]);
      MJ.loading(false);
      this.openMapping();
    } catch (err) {
      MJ.loading(false);
      MJ.toast('อ่านไฟล์ไม่สำเร็จ: ' + (err.message || err), 'err');
    }
  },

  guess(names) {
    return this.headers.find((h) => names.some((n) => h.toLowerCase().includes(n))) || '';
  },

  openMapping() {
    const opts = (sel) => `<option value="">— ไม่ใช้ —</option>` +
      this.headers.map((h) => `<option value="${MJ.esc(h)}" ${h === sel ? 'selected' : ''}>${MJ.esc(h)}</option>`).join('');
    const cats = MJ.state.categories;
    const accounts = MJ.state.accounts || [];

    MJ.sheet.open(`จับคู่คอลัมน์ (${this.rows.length} แถว)`, `
      <div class="row">
        <label class="field"><span>วันที่ *</span><select id="mpDate">${opts(this.guess(['วันที่', 'date', 'time']))}</select></label>
        <label class="field"><span>จำนวนเงิน *</span><select id="mpAmount">${opts(this.guess(['จำนวน', 'amount', 'ยอด', 'value']))}</select></label>
      </div>
      <div class="row">
        <label class="field"><span>รายละเอียด</span><select id="mpNote">${opts(this.guess(['รายละเอียด', 'note', 'desc', 'memo', 'ราย']))}</select></label>
        <label class="field"><span>หมวดหมู่</span><select id="mpCat">${opts(this.guess(['หมวด', 'category', 'type']))}</select></label>
      </div>
      <label class="field"><span>คอลัมน์บอกรายรับ/รายจ่าย (ถ้ามี)</span><select id="mpType">${opts(this.guess(['ประเภท', 'type', 'kind']))}</select></label>
      <p class="tiny muted mb">ถ้าไม่มีคอลัมน์ประเภท ระบบจะถือว่า <b>ยอดติดลบ = รายจ่าย</b> และ <b>ยอดบวก = รายรับ</b></p>
      <label class="field"><span>ลงกระเป๋า</span><select id="mpAcc">
        ${accounts.map((a) => `<option value="${a.id}">${a.icon} ${MJ.esc(a.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>หมวดสำรอง (ถ้าจับคู่หมวดไม่ได้)</span><select id="mpFallback">
        ${cats.filter((c) => c.type === 'expense').map((c) => `<option value="${c.id}">${c.icon} ${MJ.esc(c.name)}</option>`).join('')}
      </select></label>
      <div id="mpPreview" class="tiny muted mb"></div>
      <button class="btn btn-primary btn-block" id="mpGo">ตรวจตัวอย่างแล้วนำเข้า</button>
    `, (body) => {
      const preview = () => {
        const map = this.readMap(body);
        if (!map.date || !map.amount) {
          MJ.$('#mpPreview', body).innerHTML = '<b>ยังต้องเลือกคอลัมน์วันที่และจำนวนเงิน</b>';
          return null;
        }
        const parsed = this.parse(map).slice(0, 3);
        MJ.$('#mpPreview', body).innerHTML = '<b>ตัวอย่าง 3 แถวแรก</b><br>' + parsed.map((r) =>
          `${MJ.isoDate(r.transaction_date)} · ${r.type === 'income' ? 'รับ' : 'จ่าย'} ${MJ.fmtBaht(r.amount)} · ${MJ.esc(r.note || '-')}`
        ).join('<br>');
        return map;
      };
      body.querySelectorAll('select').forEach((sel) => sel.onchange = preview);
      preview();

      MJ.$('#mpGo', body).onclick = async () => {
        const map = preview();
        if (!map) { MJ.toast('เลือกคอลัมน์วันที่และจำนวนเงินก่อน', 'err'); return; }
        const items = this.parse(map);
        if (!items.length) { MJ.toast('ไม่พบแถวที่นำเข้าได้', 'err'); return; }
        if (!(await MJ.confirm('นำเข้าข้อมูล', `จะเพิ่ม ${items.length} รายการเข้าบัญชีของคุณ ยืนยันไหม?`, 'นำเข้าเลย'))) return;

        MJ.loading(true, 'กำลังนำเข้า…');
        let ok = 0, fail = 0;
        for (let i = 0; i < items.length; i += 100) {
          const chunk = items.slice(i, i + 100).map((r) => Object.assign({ user_id: MJ.state.user.id }, r, {
            transaction_date: r.transaction_date.toISOString(),
          }));
          MJ.loading(true, `กำลังนำเข้า ${Math.min(i + 100, items.length)}/${items.length}…`);
          const { error } = await MJ.sb.from('transactions').insert(chunk);
          if (error) fail += chunk.length; else ok += chunk.length;
        }
        await MJ.data.loadMonth();
        await MJ.data.loadBalances();
        MJ.loading(false);
        MJ.sheet.close();
        MJ.toast(`นำเข้าแล้ว ${ok} รายการ${fail ? ` (พลาด ${fail})` : ''} 🐻`, ok ? 'ok' : 'err');
        MJ.render();
      };
    });
  },

  readMap(body) {
    return {
      date: MJ.$('#mpDate', body).value,
      amount: MJ.$('#mpAmount', body).value,
      note: MJ.$('#mpNote', body).value,
      cat: MJ.$('#mpCat', body).value,
      type: MJ.$('#mpType', body).value,
      account: MJ.$('#mpAcc', body).value,
      fallback: MJ.$('#mpFallback', body).value,
    };
  },

  /** แปลงแถวในไฟล์เป็นรายการพร้อมบันทึก */
  parse(map) {
    const cats = MJ.state.categories;
    const out = [];
    for (const row of this.rows) {
      const rawDate = row[map.date];
      const d = this.toDate(rawDate);
      if (!d) continue;

      const rawAmt = String(row[map.amount] ?? '').replace(/[฿,\s]/g, '');
      let amount = parseFloat(rawAmt);
      if (!amount || Number.isNaN(amount)) continue;

      let type = amount < 0 ? 'expense' : 'income';
      if (map.type) {
        const v = String(row[map.type] || '').toLowerCase();
        if (/จ่าย|expense|debit|ออก|withdraw/.test(v)) type = 'expense';
        else if (/รับ|income|credit|เข้า|deposit/.test(v)) type = 'income';
      } else if (amount > 0 && !/รับ|income/.test(String(row[map.note] || ''))) {
        // ไม่มีคอลัมน์ประเภทและยอดเป็นบวก ให้ถือว่าเป็นรายจ่าย (พบบ่อยสุดในไฟล์ทั่วไป)
        type = 'expense';
      }
      amount = Math.abs(amount);

      const note = map.note ? MJ.fixThai(String(row[map.note] || '')) : null;
      let categoryId = map.fallback;
      if (map.cat) {
        const name = String(row[map.cat] || '').trim().toLowerCase();
        const hit = cats.find((c) => c.type === type && c.name.toLowerCase() === name)
          || cats.find((c) => c.type === type && name && c.name.toLowerCase().includes(name));
        if (hit) categoryId = hit.id;
        else {
          const guess = MJ.nlp.parse(`${note || ''} ${amount}`);
          if (guess?.category && guess.category.type === type) categoryId = guess.category.id;
        }
      }
      if (type === 'income') {
        const inc = cats.find((c) => c.id === categoryId && c.type === 'income');
        if (!inc) categoryId = cats.find((c) => c.type === 'income')?.id || null;
      }

      out.push({
        category_id: categoryId || null,
        account_id: map.account || null,
        amount, type,
        note: note || null,
        transaction_date: d,
        source: 'import',
        kind: 'normal',
      });
    }
    return out;
  },

  toDate(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v)) return v;
    const str = String(v).trim();
    // 2026-08-17 / 17/08/2569 / 17-08-26
    const iso = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return new Date(+iso[1] > 2400 ? +iso[1] - 543 : +iso[1], +iso[2] - 1, +iso[3], 12);
    const dmy = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmy) {
      let y = +dmy[3];
      if (y < 100) y += y >= 50 ? 2500 : 2000;
      if (y > 2400) y -= 543;
      return new Date(y, +dmy[2] - 1, +dmy[1], 12);
    }
    const d = new Date(str);
    return isNaN(d) ? null : d;
  },
};
