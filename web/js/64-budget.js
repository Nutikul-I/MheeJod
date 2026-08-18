/* ===================================================================
   64-budget.js — จัดการหมวดหมู่และงบประมาณ
   =================================================================== */
MJ.budget = { type: 'expense' };

const ICON_CHOICES = ['🍜','☕','🍔','🛒','🚕','⛽','🚌','🏠','💡','💧','📱','💊','🏥','👕','🎮','🎬','✈️','🐶','🎁','📚','💰','💼','🏦','🍯','🐻','🧾','🎓','💇','🏋️','🍺'];
const COLOR_CHOICES = ['#F2724A','#F2B23E','#3EA96B','#4A9DF2','#B36AE2','#E2607A','#5BC0A5','#8B5E3C','#2E8B9E','#C6A15B','#7FB93E','#9AA0A6'];

MJ.routes.budget = (view) => {
  const type = MJ.budget.type;
  const stats = MJ.data.byCategory(type);
  const cats = MJ.state.categories.filter((c) => c.type === type);
  const statOf = (id) => stats.find((s) => s.id === id) || { total: 0, count: 0 };
  const totalBudget = cats.reduce((a, c) => a + (Number(c.budget_limit) || 0), 0);
  const totalUsed = stats.reduce((a, s) => a + s.total, 0);

  view.innerHTML = `
    <div class="seg" id="budType">
      <button class="seg-btn ${type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> หมวดรายจ่าย</button>
      <button class="seg-btn ${type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> หมวดรายรับ</button>
    </div>

    ${type === 'expense' ? `<div class="card">
      <div class="card-head"><h3>งบรวมเดือนนี้</h3><span class="badge">${MJ.monthLabel(MJ.state.month)}</span></div>
      <div class="bud">
        <div class="bud-top"><span class="bud-name">🍯 ทั้งหมด</span>
          <span>${MJ.fmtBaht(totalUsed)} <span class="muted tiny">/ ${MJ.fmtMoney(totalBudget)}</span></span></div>
        <div class="bar"><i style="width:${totalBudget ? Math.min(100, (totalUsed / totalBudget) * 100) : 0}%;
          background:${totalUsed > totalBudget && totalBudget ? 'var(--out)' : 'linear-gradient(90deg,var(--honey),var(--honey-d))'}"></i></div>
        <div class="bud-foot"><span>${totalBudget ? (totalUsed > totalBudget
          ? `เกินงบ ${MJ.fmtBaht(totalUsed - totalBudget)}` : `เหลือ ${MJ.fmtBaht(totalBudget - totalUsed)}`) : 'ยังไม่ตั้งงบ'}</span>
          <span>${cats.length} หมวด</span></div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h3>หมวดหมู่</h3><button class="link" id="addCat">+ เพิ่มหมวด</button></div>
      ${cats.length ? cats.map((c) => {
        const st = statOf(c.id);
        return `<div class="list-item" data-cat="${c.id}">
          <span class="ic" style="background:${MJ.hex2rgba(c.color, .18)}">${c.icon}</span>
          <span class="tx2"><b>${MJ.esc(c.name)}</b>
            <small>${c.budget_limit ? `งบ ${MJ.fmtBaht(c.budget_limit)} • ใช้ไป ${MJ.fmtBaht(st.total)}` : `ใช้ไป ${MJ.fmtBaht(st.total)} • ยังไม่ตั้งงบ`}</small></span>
          <span class="tiny muted">แก้ไข ›</span>
        </div>`;
      }).join('') : '<div class="empty tiny">ยังไม่มีหมวดในกลุ่มนี้</div>'}
    </div>

    ${type === 'expense' && stats.some((s) => s.budget) ? `<div class="card">
      <div class="card-head"><h3>ความคืบหน้ารายหมวด</h3></div>
      ${stats.filter((s) => s.budget).map((s) => MJ.charts.budgetBar(s)).join('')}
    </div>` : ''}
    <div style="height:10px"></div>`;

  MJ.segInit(MJ.$('#budType', view), (b) => { MJ.budget.type = b.dataset.type; MJ.render(); });
  MJ.$('#addCat', view).onclick = () => MJ.budget.openEditor(null);
  view.querySelectorAll('[data-cat]').forEach((el) => el.onclick = () => {
    MJ.budget.openEditor(MJ.data.catById(el.dataset.cat));
  });
};

MJ.budget.openEditor = function (cat) {
  const isNew = !cat;
  const c = cat || { name: '', type: MJ.budget.type, icon: '🐻', color: '#F2B23E', budget_limit: '', keywords: [] };

  MJ.sheet.open(isNew ? 'เพิ่มหมวดใหม่' : 'แก้ไขหมวด', `
    <label class="field"><span>ชื่อหมวด</span>
      <input type="text" id="cName" value="${MJ.esc(c.name)}" placeholder="เช่น ค่ากาแฟ"></label>
    <div class="seg" id="cType">
      <button class="seg-btn ${c.type === 'expense' ? 'active' : ''}" data-type="expense">รายจ่าย</button>
      <button class="seg-btn ${c.type === 'income' ? 'active' : ''}" data-type="income">รายรับ</button>
    </div>
    <div class="field"><span>ไอคอน</span>
      <div class="chips" id="cIcons">${ICON_CHOICES.map((i) => `
        <button class="chip ${i === c.icon ? 'active' : ''}" data-icon="${i}" style="font-size:19px;padding:7px 11px">${i}</button>`).join('')}</div>
    </div>
    <div class="field"><span>สี</span>
      <div class="chips" id="cColors">${COLOR_CHOICES.map((col) => `
        <button class="chip" data-color="${col}" style="background:${col};width:34px;height:34px;padding:0;border-radius:12px;
          ${col === c.color ? 'outline:3px solid var(--ink);outline-offset:2px' : ''}"></button>`).join('')}</div>
    </div>
    <label class="field"><span>งบต่อเดือน (บาท) — เว้นว่างถ้าไม่ตั้ง</span>
      <input type="number" step="1" inputmode="decimal" id="cBudget" value="${c.budget_limit ?? ''}" placeholder="เช่น 3000"></label>
    <label class="field"><span>คำที่ใช้จับหมวดอัตโนมัติ (คั่นด้วยจุลภาค)</span>
      <input type="text" id="cKeywords" value="${MJ.esc((c.keywords || []).join(', '))}" placeholder="กาแฟ, cafe, ลาเต้"></label>
    <button class="btn btn-primary btn-block" id="cSave">${isNew ? 'เพิ่มหมวด' : 'บันทึก'}</button>
    ${isNew ? '' : '<button class="btn btn-danger btn-block mt" id="cDel">ลบหมวดนี้</button>'}
  `, (body) => {
    let type = c.type, icon = c.icon, color = c.color;
    MJ.segInit(MJ.$('#cType', body), (b) => {
      type = b.dataset.type;
      body.querySelectorAll('#cType .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    });
    body.querySelectorAll('#cIcons .chip').forEach((b) => b.onclick = () => {
      icon = b.dataset.icon;
      body.querySelectorAll('#cIcons .chip').forEach((x) => x.classList.toggle('active', x === b));
    });
    body.querySelectorAll('#cColors .chip').forEach((b) => b.onclick = () => {
      color = b.dataset.color;
      body.querySelectorAll('#cColors .chip').forEach((x) => x.style.outline = x === b ? '3px solid var(--ink)' : '');
    });

    MJ.$('#cSave', body).onclick = async () => {
      const name = MJ.$('#cName', body).value.trim();
      if (!name) { MJ.toast('ตั้งชื่อหมวดก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        await MJ.data.saveCategory({
          id: c.id, name, type, icon, color,
          budget_limit: MJ.$('#cBudget', body).value,
          keywords: MJ.$('#cKeywords', body).value.split(',').map((s) => s.trim()).filter(Boolean),
        });
        MJ.sheet.close(); MJ.toast('บันทึกแล้ว 🐻', 'ok'); MJ.render();
      } catch (e) {
        MJ.toast(/duplicate/i.test(e.message) ? 'มีหมวดชื่อนี้อยู่แล้ว' : 'บันทึกไม่สำเร็จ', 'err');
      } finally { MJ.loading(false); }
    };

    if (MJ.$('#cDel', body)) MJ.$('#cDel', body).onclick = async () => {
      if (!(await MJ.confirm('ลบหมวด', 'รายการเดิมจะยังอยู่แต่จะไม่มีหมวด ยืนยันไหม?', 'ลบหมวด'))) return;
      MJ.loading(true, 'กำลังลบ…');
      try { await MJ.data.archiveCategory(c.id); MJ.sheet.close(); MJ.toast('ลบแล้ว', 'ok'); MJ.render(); }
      catch (e) { MJ.toast('ลบไม่สำเร็จ', 'err'); }
      finally { MJ.loading(false); }
    };
  });
};
