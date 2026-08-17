/* ===================================================================
   50-charts.js — กราฟ SVG เขียนเอง (ไม่พึ่งไลบรารีภายนอก)
   =================================================================== */
MJ.charts = {
  /** โดนัทสัดส่วนตามหมวด */
  donut(items, opts) {
    const o = Object.assign({ size: 190, thickness: 26, centerTop: '', centerMain: '' }, opts || {});
    const total = items.reduce((s, i) => s + i.total, 0);
    const r = (o.size - o.thickness) / 2, cx = o.size / 2, cy = o.size / 2;
    const C = 2 * Math.PI * r;
    if (!total) {
      return `<svg viewBox="0 0 ${o.size} ${o.size}" width="100%" style="max-width:${o.size}px">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${o.thickness}"/>
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="var(--ink-3)" font-size="13">ยังไม่มีข้อมูล</text></svg>`;
    }
    let offset = 0;
    const arcs = items.map((i) => {
      const frac = i.total / total;
      const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
      const seg = `<circle class="seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i.color}"
        stroke-width="${o.thickness}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * C).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"
        style="--arc-len:${C.toFixed(0)};animation-delay:${(offset * .5).toFixed(2)}s"><title>${MJ.esc(i.name)} ${MJ.fmtBaht(i.total)}</title></circle>`;
      offset += frac;
      return seg;
    }).join('');
    return `<svg class="chart-donut" viewBox="0 0 ${o.size} ${o.size}" width="100%" style="max-width:${o.size}px">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${o.thickness}"/>
      ${arcs}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="var(--ink-3)" font-size="12">${MJ.esc(o.centerTop)}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--ink)" font-size="19" font-weight="700">${MJ.esc(o.centerMain)}</text>
    </svg>`;
  },

  /** แท่งรายวัน (รายจ่าย/รายรับซ้อนกัน) */
  bars(expense, income, opts) {
    const o = Object.assign({ h: 130 }, opts || {});
    const n = expense.length;
    const max = Math.max(1, ...expense, ...(income || []));
    const w = 100 / n;
    const today = new Date();
    const isThisMonth = today.getMonth() === MJ.state.month.getMonth() && today.getFullYear() === MJ.state.month.getFullYear();
    let bars = '';
    for (let i = 0; i < n; i++) {
      const eh = (expense[i] / max) * 100;
      const ih = income ? (income[i] / max) * 100 : 0;
      const x = i * w;
      const isToday = isThisMonth && today.getDate() === i + 1;
      if (ih > 0) bars += `<rect style="animation-delay:${(i * .012).toFixed(3)}s" x="${x + w * 0.12}" y="${100 - ih}" width="${w * 0.34}" height="${ih}"
        rx="1.2" fill="var(--in)" opacity=".85"><title>${i + 1}: รับ ${MJ.fmtBaht(income[i])}</title></rect>`;
      if (eh > 0) bars += `<rect style="animation-delay:${(i * .012).toFixed(3)}s" x="${x + w * (ih > 0 ? 0.52 : 0.22)}" y="${100 - eh}" width="${w * (ih > 0 ? 0.34 : 0.56)}" height="${eh}"
        rx="1.2" fill="${isToday ? 'var(--honey)' : 'var(--out)'}"><title>${i + 1}: จ่าย ${MJ.fmtBaht(expense[i])}</title></rect>`;
    }
    const labels = [1, Math.ceil(n / 2), n].map((d) =>
      `<text x="${((d - 0.5) / n) * 100}" y="118" text-anchor="middle" fill="var(--ink-3)" font-size="7">${d}</text>`).join('');
    return `<svg class="chart-bars" viewBox="0 0 100 122" width="100%" height="${o.h}" preserveAspectRatio="none"
      style="overflow:visible">${bars}
      <line x1="0" y1="100" x2="100" y2="100" stroke="var(--line)" stroke-width=".6"/>${labels}</svg>`;
  },

  /** เส้นแนวโน้มยอดสะสม */
  line(values, color) {
    const n = values.length;
    if (!n) return '';
    let acc = 0;
    const cum = values.map((v) => (acc += v));
    const max = Math.max(1, ...cum);
    const pts = cum.map((v, i) => `${(i / (n - 1 || 1)) * 100},${100 - (v / max) * 92}`).join(' ');
    const area = `0,100 ${pts} 100,100`;
    const c = color || 'var(--honey)';
    return `<svg viewBox="0 0 100 100" width="100%" height="120" preserveAspectRatio="none">
      <polygon points="${area}" fill="${c}" opacity=".14"/>
      <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  },

  legend(items, total) {
    if (!items.length) return '<p class="empty tiny">ยังไม่มีรายการในเดือนนี้</p>';
    return `<div class="legend">${items.map((i) => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${i.color}"></span>
        <span class="nm">${i.icon || ''} ${MJ.esc(i.name)}</span>
        <span class="vl">${MJ.fmtBaht(i.total)}</span>
        <span class="pc">${total ? Math.round((i.total / total) * 100) : 0}%</span>
      </div>`).join('')}</div>`;
  },

  /** แถบงบประมาณ */
  budgetBar(item) {
    const used = item.total, limit = item.budget;
    const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    const over = limit && used > limit;
    const color = over ? 'var(--out)' : (pct > 80 ? 'var(--warn)' : item.color);
    return `<div class="bud">
      <div class="bud-top">
        <span class="bud-name">${item.icon || ''} ${MJ.esc(item.name)}</span>
        <span class="${over ? 'tx-amt out' : ''}">${MJ.fmtBaht(used)}${limit ? ` <span class="muted tiny">/ ${MJ.fmtMoney(limit)}</span>` : ''}</span>
      </div>
      <div class="bar"><i style="width:${limit ? pct : 0}%;background:${color}"></i></div>
      <div class="bud-foot">
        <span>${limit ? (over ? `เกินงบ ${MJ.fmtBaht(used - limit)} 🐻💦` : `เหลือ ${MJ.fmtBaht(limit - used)}`) : 'ยังไม่ตั้งงบ'}</span>
        <span>${item.count} รายการ</span>
      </div>
    </div>`;
  },
};
