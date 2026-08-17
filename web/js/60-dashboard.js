/* ===================================================================
   60-dashboard.js — หน้าภาพรวม
   =================================================================== */
MJ.routes.dashboard = (view) => {
  const s = MJ.data.summary();
  const expenseCats = MJ.data.byCategory('expense');
  const withBudget = expenseCats.filter((c) => c.budget);
  const budgetTotal = withBudget.reduce((a, c) => a + c.budget, 0);
  const budgetUsed = withBudget.reduce((a, c) => a + c.total, 0);
  const recent = MJ.state.transactions.slice(0, 6);
  const now = new Date();
  const isCurrentMonth = now.getMonth() === MJ.state.month.getMonth() && now.getFullYear() === MJ.state.month.getFullYear();
  const daysLeft = isCurrentMonth ? MJ.endOfMonth(now).getDate() - now.getDate() : 0;
  const avgPerDay = s.expense / (isCurrentMonth ? now.getDate() : MJ.endOfMonth(MJ.state.month).getDate());

  const upcoming = MJ.state.recurring
    .filter((r) => r.is_active)
    .sort((a, b) => new Date(a.next_run_date) - new Date(b.next_run_date))
    .slice(0, 2);

  view.innerHTML = `
    <div class="balance">
      <div class="lbl">คงเหลือใน ${MJ.monthLabelFull(MJ.state.month)}</div>
      <div class="amt" id="balAmt">${MJ.fmtBaht(s.balance)}</div>
      <div class="grid">
        <div class="box in"><span class="tiny">รายรับ</span><b>${MJ.fmtBaht(s.income)}</b></div>
        <div class="box out"><span class="tiny">รายจ่าย</span><b>${MJ.fmtBaht(s.expense)}</b></div>
      </div>
    </div>

    <div class="chips">
      <button class="chip" data-quick="พิมพ์">✏️ พิมพ์จด</button>
      <button class="chip" data-quick="เสียง">🎤 พูดจด</button>
      <button class="chip" data-quick="สลิป">🧾 ถ่ายสลิป</button>
      <button class="chip" data-quick="ฟอร์ม">⌨️ กรอกเอง</button>
    </div>

    ${isCurrentMonth ? `
    <div class="stat-grid mb">
      <div class="stat"><div class="k">จ่ายเฉลี่ยต่อวัน</div><div class="v">${MJ.fmtBaht(avgPerDay)}</div></div>
      <div class="stat"><div class="k">เหลืออีก</div><div class="v">${daysLeft} วัน</div></div>
    </div>` : ''}

    <div class="card">
      <div class="card-head">
        <h3>งบประมาณเดือนนี้</h3>
        <button class="link" data-go="budget">ตั้งงบ ›</button>
      </div>
      ${budgetTotal ? `
        <div class="bud">
          <div class="bud-top"><span class="bud-name">🍯 งบรวม</span>
            <span>${MJ.fmtBaht(budgetUsed)} <span class="muted tiny">/ ${MJ.fmtMoney(budgetTotal)}</span></span></div>
          <div class="bar"><i style="width:${Math.min(100, (budgetUsed / budgetTotal) * 100)}%;
            background:${budgetUsed > budgetTotal ? 'var(--out)' : 'linear-gradient(90deg,var(--honey),var(--honey-d))'}"></i></div>
          <div class="bud-foot"><span>${budgetUsed > budgetTotal
            ? `เกินงบ ${MJ.fmtBaht(budgetUsed - budgetTotal)}`
            : `ใช้ได้อีก ${MJ.fmtBaht(budgetTotal - budgetUsed)}`}</span>
            <span>${Math.round((budgetUsed / budgetTotal) * 100)}%</span></div>
        </div>
        <div class="hr"></div>
        ${withBudget.slice(0, 4).map((c) => MJ.charts.budgetBar(c)).join('')}
      ` : `<div class="empty"><span class="big">🍯</span>ยังไม่ได้ตั้งงบเลย<br>
            <button class="btn btn-soft btn-sm mt" data-go="budget">ตั้งงบรายหมวด</button></div>`}
    </div>

    <div class="card">
      <div class="card-head">
        <h3>รายจ่ายตามหมวด</h3>
        <button class="link" data-go="analysis">ดูกราฟ ›</button>
      </div>
      ${expenseCats.length ? `
        ${MJ.charts.donut(expenseCats.slice(0, 8), {
          centerTop: 'จ่ายไป', centerMain: MJ.fmtBaht(s.expense),
        })}
        ${MJ.charts.legend(expenseCats.slice(0, 5), s.expense)}
      ` : `<div class="empty"><span class="big">🐻</span>เดือนนี้ยังไม่มีรายจ่าย</div>`}
    </div>

    ${upcoming.length ? `
    <div class="card">
      <div class="card-head"><h3>รายการประจำที่จะถึง</h3><button class="link" data-go="settings">จัดการ ›</button></div>
      ${upcoming.map((r) => {
        const c = MJ.data.catById(r.category_id);
        return `<div class="list-item">
          <span class="ic">${c?.icon || '🔁'}</span>
          <span class="tx2"><b>${MJ.esc(r.note || c?.name || 'รายการประจำ')}</b>
            <small>ครั้งถัดไป ${MJ.dayLabel(r.next_run_date)}</small></span>
          <span class="tx-amt ${r.type === 'income' ? 'in' : 'out'}">${r.type === 'income' ? '+' : '−'}${MJ.fmtMoney(r.amount)}</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h3>รายการล่าสุด</h3><button class="link" data-go="transactions">ดูทั้งหมด ›</button></div>
      ${recent.length ? recent.map((t) => MJ.tx.row(t)).join('')
        : `<div class="empty"><span class="big">📒</span>ยังไม่มีรายการในเดือนนี้<br>
           <button class="btn btn-primary btn-sm mt" data-go="add">เริ่มจดเลย</button></div>`}
    </div>
  `;

  MJ.countUp(MJ.$('#balAmt', view), s.balance);
  view.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => MJ.go(b.dataset.go));
  view.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => {
    const map = {
      'พิมพ์': { tab: 'chat' },
      'เสียง': { tab: 'chat', action: 'voice' },
      'สลิป': { tab: 'chat', action: 'slip' },
      'ฟอร์ม': { tab: 'form' },
    };
    MJ.go('add', map[b.dataset.quick]);
  });
  MJ.tx.bindRows(view);
};
