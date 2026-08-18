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
      <button class="chip" data-quick="พิมพ์"><i class="fa fa-comment"></i> จดเร็ว</button>
      <button class="chip" data-quick="เสียง"><i class="fa fa-mic"></i> พูดจด</button>
      <button class="chip" data-quick="สลิป"><i class="fa fa-images"></i> สลิป</button>
      <button class="chip" data-quick="ฟอร์ม"><i class="fa fa-keyboard"></i> กรอกเอง</button>
      <button class="chip" id="chipShare"><i class="fa fa-send"></i> แชร์สรุป</button>
    </div>

    ${isCurrentMonth ? `
    <div class="stat-grid mb">
      <div class="stat"><div class="k">จ่ายเฉลี่ยต่อวัน</div><div class="v">${MJ.fmtBaht(avgPerDay)}</div></div>
      <div class="stat"><div class="k">เหลืออีก</div><div class="v">${daysLeft} วัน</div></div>
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h3>กระเป๋าเงิน</h3><button class="link" data-go="accounts">จัดการ ›</button></div>
      ${(MJ.state.accounts || []).length ? `
        <div class="acc-strip">
          ${(MJ.state.accounts || []).slice(0, 4).map((a) => {
            const b = (MJ.state.balances || {})[a.id] ?? Number(a.opening_balance);
            return `<button class="acc-chip" data-go="accounts">
              <span class="ic" style="background:${MJ.hex2rgba(a.color, .18)}">${a.icon}</span>
              <b>${MJ.esc(a.name)}</b>
              <em class="${b < 0 ? 'out' : ''}">${MJ.fmtBaht(b)}</em>
            </button>`;
          }).join('')}
        </div>` : '<div class="empty tiny">ยังไม่มีกระเป๋า</div>'}
    </div>

    ${(() => {
      const goals = (MJ.goals?.list || []).filter((g) => !g.is_done).slice(0, 2);
      const debts = (MJ.debts?.list || []).filter((d) => !d.is_settled);
      const owed = debts.filter((d) => d.direction === 'owed_to_me').reduce((a, d) => a + (Number(d.amount) - Number(d.paid_amount)), 0);
      const owe = debts.filter((d) => d.direction === 'i_owe').reduce((a, d) => a + (Number(d.amount) - Number(d.paid_amount)), 0);
      if (!goals.length && !debts.length) return '';
      return `<div class="card">
        <div class="card-head"><h3>แผนการเงิน</h3><button class="link" data-go="plans">ดูทั้งหมด ›</button></div>
        ${goals.map((g) => {
          const pct = Math.min(100, (Number(g.saved_amount) / Number(g.target_amount)) * 100);
          return `<div class="bud">
            <div class="bud-top"><span class="bud-name">${g.icon} ${MJ.esc(g.title)}</span>
              <span>${MJ.fmtBaht(g.saved_amount)} <span class="muted tiny">/ ${MJ.fmtMoney(g.target_amount)}</span></span></div>
            <div class="bar"><i style="width:${pct}%;background:${g.color}"></i></div>
          </div>`;
        }).join('')}
        ${debts.length ? `<div class="stat-grid mt">
          <div class="stat"><div class="k">คนอื่นติดเรา</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(owed)}</div></div>
          <div class="stat"><div class="k">เราติดคนอื่น</div><div class="v" style="color:var(--out)">${MJ.fmtBaht(owe)}</div></div>
        </div>` : ''}
      </div>`;
    })()}

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
  const share = MJ.$('#chipShare', view);
  if (share) share.onclick = () => MJ.share.open();
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
