/* ===================================================================
   63-analysis.js — หน้าวิเคราะห์: กราฟหมวด รายวัน แนวโน้ม เทียบเดือนก่อน
   =================================================================== */
MJ.analysis = { type: 'expense', prevCache: {}, view: 'month', yearData: null, year: new Date().getFullYear() };

MJ.routes.analysis = (view) => {
  view.innerHTML = `
    <div class="seg" id="anView">
      <button class="seg-btn ${MJ.analysis.view === 'month' ? 'active' : ''}" data-v="month"><i class="fa fa-chart-pie"></i> รายเดือน</button>
      <button class="seg-btn ${MJ.analysis.view === 'year' ? 'active' : ''}" data-v="year"><i class="fa fa-chart-bar"></i> รายปี</button>
    </div>
    <div id="anBody"></div>`;
  MJ.segInit(MJ.$('#anView', view), (b) => { MJ.analysis.view = b.dataset.v; MJ.render(); });
  const body = MJ.$('#anBody', view);
  if (MJ.analysis.view === 'year') return renderYear(body);
  renderMonth(body);
};

function renderMonth(view) {
  const type = MJ.analysis.type;
  const s = MJ.data.summary();
  const cats = MJ.data.byCategory(type);
  const total = type === 'expense' ? s.expense : s.income;
  const expSeries = MJ.data.dailySeries('expense');
  const incSeries = MJ.data.dailySeries('income');
  const days = expSeries.length;

  // วันที่ใช้จ่ายหนักสุด
  let maxDay = 0, maxVal = 0;
  expSeries.forEach((v, i) => { if (v > maxVal) { maxVal = v; maxDay = i + 1; } });

  // แยกตามวันในสัปดาห์
  const weekday = new Array(7).fill(0);
  MJ.state.transactions.filter((t) => t.type === 'expense')
    .forEach((t) => { weekday[new Date(t.transaction_date).getDay()] += Number(t.amount); });
  const wkMax = Math.max(1, ...weekday);

  // ร้าน/ผู้รับเงินยอดฮิต
  const payees = new Map();
  MJ.state.transactions.filter((t) => t.type === 'expense' && t.payee_name).forEach((t) => {
    const k = MJ.fixThai(t.payee_name);
    payees.set(k, (payees.get(k) || 0) + Number(t.amount));
  });
  const topPayees = Array.from(payees.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  view.innerHTML = `
    <div class="seg" id="anType">
      <button class="seg-btn ${type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> รายจ่าย</button>
      <button class="seg-btn ${type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> รายรับ</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>สัดส่วนตามหมวด</h3><span class="badge">${cats.length} หมวด</span></div>
      ${MJ.charts.donut(cats, { centerTop: type === 'expense' ? 'จ่ายไป' : 'รับมา', centerMain: MJ.fmtBaht(total) })}
      ${MJ.charts.legend(cats, total)}
    </div>

    <div class="card">
      <div class="card-head"><h3>รายวันตลอดเดือน</h3>
        <span class="tiny muted">🟥 จ่าย 🟩 รับ</span></div>
      ${MJ.charts.bars(expSeries, incSeries, { h: 140 })}
      <div class="stat-grid mt">
        <div class="stat"><div class="k">จ่ายหนักสุดวันที่</div><div class="v">${maxVal ? `${maxDay} (${MJ.fmtBaht(maxVal)})` : '-'}</div></div>
        <div class="stat"><div class="k">วันที่ไม่ได้ใช้เงิน</div><div class="v">${expSeries.filter((v) => v === 0).length} วัน</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>ยอดสะสมทั้งเดือน</h3></div>
      ${MJ.charts.line(type === 'expense' ? expSeries : incSeries, type === 'expense' ? 'var(--out)' : 'var(--in)')}
      <div class="bud-foot"><span>วันที่ 1</span><span>วันที่ ${days}</span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>ใช้เงินวันไหนมากสุด</h3></div>
      ${['อา','จ','อ','พ','พฤ','ศ','ส'].map((d, i) => `
        <div class="bud">
          <div class="bud-top"><span class="bud-name">${d}</span><span>${MJ.fmtBaht(weekday[i])}</span></div>
          <div class="bar"><i style="width:${(weekday[i] / wkMax) * 100}%;background:var(--honey)"></i></div>
        </div>`).join('')}
    </div>

    ${topPayees.length ? `<div class="card">
      <div class="card-head"><h3>จ่ายให้ใครบ่อยสุด</h3></div>
      ${topPayees.map(([n, v]) => `<div class="list-item"><span class="ic">🏪</span>
        <span class="tx2"><b>${MJ.esc(n)}</b></span>
        <span class="tx-amt out">${MJ.fmtBaht(v)}</span></div>`).join('')}
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h3>เทียบกับเดือนก่อน</h3></div>
      <div id="cmpBox"><div class="empty tiny">กำลังคำนวณ…</div></div>
    </div>

    <button class="btn btn-primary btn-block" id="anShare">
      <i class="fa fa-send"></i> ทำรูปสรุปไว้แชร์อวดเพื่อน</button>
    <div style="height:10px"></div>`;

  MJ.segInit(MJ.$('#anType', view), (b) => {
    MJ.analysis.type = b.dataset.type; MJ.render();
  });

  MJ.$('#anShare', view).onclick = () => MJ.share.open();
  renderCompare(MJ.$('#cmpBox', view));
}

/* ============================ สรุปรายปี ============================ */
async function renderYear(view) {
  const year = MJ.analysis.year;
  view.innerHTML = `
    <div class="card">
      <div class="card-head">
        <button class="icon-btn" id="yPrev"><i class="fa fa-chev-l"></i></button>
        <h3>ปี ${year + 543}</h3>
        <button class="icon-btn" id="yNext" ${year >= new Date().getFullYear() ? 'style="opacity:.3"' : ''}>
          <i class="fa fa-chev-r"></i></button>
      </div>
      <div id="yBody"><div class="empty tiny">กำลังโหลด…</div></div>
    </div>`;
  MJ.$('#yPrev', view).onclick = () => { MJ.analysis.year--; MJ.render(); };
  MJ.$('#yNext', view).onclick = () => {
    if (MJ.analysis.year < new Date().getFullYear()) { MJ.analysis.year++; MJ.render(); }
  };

  const { data, error } = await MJ.sb.rpc('yearly_stats', { p_year: year });
  const box = MJ.$('#yBody', view);
  if (error || !data) { box.innerHTML = '<div class="empty tiny">โหลดข้อมูลไม่สำเร็จ</div>'; return; }

  const income = data.map((r) => Number(r.income));
  const expense = data.map((r) => Number(r.expense));
  const totalIn = income.reduce((a, b) => a + b, 0);
  const totalOut = expense.reduce((a, b) => a + b, 0);
  const maxV = Math.max(1, ...income, ...expense);
  const best = data.reduce((a, r) => (Number(r.expense) < Number(a.expense) && Number(r.tx_count) > 0 ? r : a),
    data.find((r) => Number(r.tx_count) > 0) || data[0]);
  const worst = data.reduce((a, r) => (Number(r.expense) > Number(a.expense) ? r : a), data[0]);

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">รายรับทั้งปี</div><div class="v" style="color:var(--in)">${MJ.fmtBaht(totalIn)}</div></div>
      <div class="stat"><div class="k">รายจ่ายทั้งปี</div><div class="v" style="color:var(--out)">${MJ.fmtBaht(totalOut)}</div></div>
    </div>
    <div class="year-chart">
      ${data.map((r, i) => {
        const hIn = (income[i] / maxV) * 100, hOut = (expense[i] / maxV) * 100;
        return `<div class="year-col" title="${MJ.TH_MONTHS[i]} รับ ${MJ.fmtBaht(income[i])} จ่าย ${MJ.fmtBaht(expense[i])}">
          <div class="year-bars">
            <i class="in" style="height:${hIn}%"></i>
            <i class="out" style="height:${hOut}%"></i>
          </div>
          <span>${MJ.TH_MONTHS[i].replace('.', '')}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="hr"></div>
    <div class="stat-grid">
      <div class="stat"><div class="k">คงเหลือทั้งปี</div>
        <div class="v" style="color:${totalIn - totalOut >= 0 ? 'var(--in)' : 'var(--out)'}">${MJ.fmtBaht(totalIn - totalOut)}</div></div>
      <div class="stat"><div class="k">เฉลี่ยจ่าย/เดือน</div><div class="v">${MJ.fmtBaht(totalOut / 12)}</div></div>
    </div>
    <div class="list-item"><span class="ic"><i class="fa fa-arrow-up"></i></span>
      <span class="tx2"><b>${MJ.TH_MONTHS_FULL[(worst?.m || 1) - 1]}</b><small>เดือนที่ใช้เยอะสุด</small></span>
      <span class="tx-amt out">${MJ.fmtBaht(worst?.expense || 0)}</span></div>
    <div class="list-item"><span class="ic"><i class="fa fa-arrow-down"></i></span>
      <span class="tx2"><b>${MJ.TH_MONTHS_FULL[(best?.m || 1) - 1]}</b><small>เดือนที่ประหยัดสุด</small></span>
      <span class="tx-amt in">${MJ.fmtBaht(best?.expense || 0)}</span></div>`;
}

async function renderCompare(box) {
  const cur = MJ.data.summary();
  const prevMonth = new Date(MJ.state.month.getFullYear(), MJ.state.month.getMonth() - 1, 1);
  const key = MJ.isoDate(prevMonth).slice(0, 7);
  let prev = MJ.analysis.prevCache[key];

  if (!prev) {
    const { data } = await MJ.sb.from('transactions').select('amount, type')
      .gte('transaction_date', MJ.startOfMonth(prevMonth).toISOString())
      .lte('transaction_date', MJ.endOfMonth(prevMonth).toISOString());
    prev = { income: 0, expense: 0 };
    (data || []).forEach((t) => { prev[t.type] += Number(t.amount); });
    MJ.analysis.prevCache[key] = prev;
  }

  const diff = cur.expense - prev.expense;
  const pct = prev.expense ? Math.round((diff / prev.expense) * 100) : null;
  box.innerHTML = `
    <div class="stat-grid mb">
      <div class="stat"><div class="k">${MJ.monthLabel(prevMonth)} จ่าย</div><div class="v">${MJ.fmtBaht(prev.expense)}</div></div>
      <div class="stat"><div class="k">${MJ.monthLabel(MJ.state.month)} จ่าย</div><div class="v">${MJ.fmtBaht(cur.expense)}</div></div>
    </div>
    <p class="center ${diff > 0 ? 'tx-amt out' : 'tx-amt in'}" style="font-size:15px">
      ${prev.expense === 0 ? 'เดือนก่อนยังไม่มีข้อมูลให้เทียบ 🐻'
        : (diff > 0 ? `ใช้มากขึ้น ${MJ.fmtBaht(diff)}${pct !== null ? ` (+${pct}%)` : ''} 🫣`
                    : `ประหยัดขึ้น ${MJ.fmtBaht(-diff)}${pct !== null ? ` (${pct}%)` : ''} เก่งมาก! 🎉`)}
    </p>`;
}
