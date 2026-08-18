/* ===================================================================
   67-share.js — สร้างรูปสรุปประจำเดือนไว้แชร์อวดเพื่อน
   วาดด้วย canvas ทั้งหมด (ไม่ต้องพึ่งไลบรารีภายนอก) แล้วแชร์/ดาวน์โหลด
   =================================================================== */
MJ.share = {
  W: 1080,
  H: 1350,

  /** สร้างรูปสรุปของเดือนที่กำลังดู -> คืน canvas */
  async buildCanvas(opts) {
    const o = Object.assign({ hideAmounts: false }, opts || {});
    const cv = document.createElement('canvas');
    cv.width = this.W; cv.height = this.H;
    const g = cv.getContext('2d');
    const s = MJ.data.summary();
    const cats = MJ.data.byCategory('expense').slice(0, 5);
    const totalExpense = s.expense || 1;
    const days = MJ.endOfMonth(MJ.state.month).getDate();
    const series = MJ.data.dailySeries('expense');
    const noSpendDays = series.filter((v) => v === 0).length;

    try { await document.fonts.ready; } catch (e) { /* ใช้ฟอนต์สำรอง */ }
    const F = (size, weight) => `${weight || 400} ${size}px "FC Iconic", "Noto Sans Thai", sans-serif`;
    const money = (n) => o.hideAmounts ? '••••' : '฿' + MJ.fmtMoney(n);

    /* ---------- พื้นหลัง ---------- */
    const bg = g.createLinearGradient(0, 0, this.W, this.H);
    bg.addColorStop(0, '#FFF9F2');
    bg.addColorStop(1, '#FDEBD3');
    g.fillStyle = bg;
    g.fillRect(0, 0, this.W, this.H);

    // วงกลมน้ำผึ้งจาง ๆ
    g.globalAlpha = 0.5;
    [[900, 120, 220, '#F2B23E'], [120, 1180, 260, '#8B5E3C'], [980, 1000, 140, '#F2724A']]
      .forEach(([x, y, r, c]) => {
        const rad = g.createRadialGradient(x, y, 0, x, y, r);
        rad.addColorStop(0, c + '55'); rad.addColorStop(1, c + '00');
        g.fillStyle = rad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      });
    g.globalAlpha = 1;

    /* ---------- หัวเรื่อง ---------- */
    g.textAlign = 'left';
    g.font = '64px system-ui';
    g.fillText('🐻', 72, 132);
    g.fillStyle = '#2C2622';
    g.font = F(44, 700);
    g.fillText('หมีจด', 152, 118);
    g.fillStyle = '#A2968C';
    g.font = F(26, 400);
    g.fillText('สรุปการเงินของฉัน', 152, 152);

    g.textAlign = 'right';
    g.fillStyle = '#8B5E3C';
    g.font = F(34, 700);
    g.fillText(MJ.monthLabelFull(MJ.state.month), this.W - 72, 132);

    /* ---------- การ์ดยอดคงเหลือ ---------- */
    const cardY = 208, cardH = 300;
    const cg = g.createLinearGradient(72, cardY, this.W - 72, cardY + cardH);
    cg.addColorStop(0, '#A87A55'); cg.addColorStop(1, '#6B462B');
    this.roundRect(g, 72, cardY, this.W - 144, cardH, 48);
    g.fillStyle = cg; g.fill();

    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,246,233,.8)';
    g.font = F(28, 400);
    g.fillText('คงเหลือเดือนนี้', 124, cardY + 78);

    g.fillStyle = '#FFF6E9';
    g.font = F(96, 800);
    g.fillText(money(s.balance), 124, cardY + 176);

    // กล่องรายรับ/รายจ่าย
    const boxW = (this.W - 144 - 52 - 52 - 24) / 2;
    [['รายรับ', s.income, '#B9F5D2'], ['รายจ่าย', s.expense, '#FFC7D2']].forEach(([label, val, color], i) => {
      const x = 124 + i * (boxW + 24);
      this.roundRect(g, x, cardY + 200, boxW, 72, 24);
      g.fillStyle = 'rgba(255,255,255,.16)'; g.fill();
      g.fillStyle = 'rgba(255,246,233,.75)';
      g.font = F(22, 400);
      g.fillText(label, x + 24, cardY + 230);
      g.fillStyle = color;
      g.font = F(32, 700);
      g.fillText(money(val), x + 24, cardY + 262);
    });

    /* ---------- หมวดที่ใช้มากสุด (ตำแหน่งคงที่ กันล้นขอบ) ---------- */
    const top = cats.slice(0, 4);
    g.fillStyle = '#2C2622';
    g.font = F(34, 700);
    g.fillText('ใช้ไปกับอะไรบ้าง', 72, 578);

    if (top.length) {
      top.forEach((c, i) => {
        const y = 640 + i * 74;
        const pct = Math.round((c.total / totalExpense) * 100);

        g.font = '32px system-ui';
        g.fillText(c.icon || '•', 74, y + 2);

        g.fillStyle = '#2C2622';
        g.font = F(28, 600);
        g.fillText(this.clip(g, c.name, 360), 126, y);

        g.textAlign = 'right';
        g.fillStyle = '#6E645C';
        g.font = F(26, 600);
        g.fillText(`${money(c.total)} · ${pct}%`, this.W - 72, y);
        g.textAlign = 'left';

        const barW = this.W - 144;
        this.roundRect(g, 72, y + 16, barW, 14, 7);
        g.fillStyle = '#EFE3D3'; g.fill();
        this.roundRect(g, 72, y + 16, Math.max(14, barW * (c.total / totalExpense)), 14, 7);
        g.fillStyle = c.color || '#F2B23E'; g.fill();
      });
    } else {
      g.fillStyle = '#A2968C'; g.font = F(28, 400);
      g.fillText('เดือนนี้ยังไม่มีรายจ่าย', 72, 650);
    }

    /* ---------- กราฟรายวัน ---------- */
    g.fillStyle = '#2C2622';
    g.font = F(34, 700);
    g.fillText('จ่ายรายวัน', 72, 972);

    const chartY = 1000, chartH = 130, chartW = this.W - 144;
    const maxV = Math.max(1, ...series);
    const bw = chartW / days;
    series.forEach((v, i) => {
      const h = (v / maxV) * chartH;
      if (h <= 0) return;
      this.roundRect(g, 72 + i * bw + bw * 0.18, chartY + chartH - h, bw * 0.64, h, Math.min(6, bw * 0.32));
      g.fillStyle = '#E3556F'; g.fill();
    });
    g.strokeStyle = '#E6D8C6'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(72, chartY + chartH); g.lineTo(this.W - 72, chartY + chartH); g.stroke();

    /* ---------- สถิติสนุก ๆ ---------- */
    const statY = 1178;
    const stats = [
      ['วันที่ไม่ได้ใช้เงิน', `${noSpendDays} วัน`],
      ['จำนวนรายการ', `${s.count} รายการ`],
      ['เฉลี่ยต่อวัน', money(Math.round(s.expense / days))],
    ];
    const sw = (this.W - 144 - 32) / 3;
    stats.forEach(([k, v], i) => {
      const x = 72 + i * (sw + 16);
      this.roundRect(g, x, statY, sw, 104, 28);
      g.fillStyle = '#FFFFFF'; g.fill();
      g.textAlign = 'center';
      g.fillStyle = '#A2968C'; g.font = F(21, 400);
      g.fillText(k, x + sw / 2, statY + 42);
      g.fillStyle = '#2C2622'; g.font = F(30, 700);
      g.fillText(v, x + sw / 2, statY + 80);
      g.textAlign = 'left';
    });

    /* ---------- ท้ายรูป ---------- */
    g.textAlign = 'center';
    g.fillStyle = '#A2968C';
    g.font = F(24, 400);
    g.fillText('จดด้วยหมีจด · nutikul-i.github.io/MheeJod', this.W / 2, this.H - 40);

    return cv;
  },

  /* ---------- ตัวช่วยวาด ---------- */
  roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  },
  clip(g, text, maxW) {
    let t = String(text);
    if (g.measureText(t).width <= maxW) return t;
    while (t.length > 3 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  },

  /* ---------- แผงแชร์ ---------- */
  open() {
    MJ.sheet.open('แชร์สรุปเดือนนี้', `
      <div class="share-preview"><canvas id="shareCanvas"></canvas></div>
      <div class="list-item">
        <span class="ic"><i class="fa fa-eye"></i></span>
        <span class="tx2"><b>ซ่อนจำนวนเงิน</b><small>อวดสัดส่วนได้โดยไม่บอกยอดจริง</small></span>
        <div class="switch" id="shHide"><i></i></div>
      </div>
      <button class="btn btn-primary btn-block mt" id="shShare"><i class="fa fa-send"></i> แชร์รูปนี้</button>
      <button class="btn btn-soft btn-block mt" id="shSave"><i class="fa fa-download"></i> บันทึกลงเครื่อง</button>
    `, async (body) => {
      let hide = false;
      const target = MJ.$('#shareCanvas', body);

      const draw = async () => {
        MJ.loading(true, 'กำลังวาดรูปสรุป…');
        const cv = await this.buildCanvas({ hideAmounts: hide });
        target.width = cv.width; target.height = cv.height;
        target.getContext('2d').drawImage(cv, 0, 0);
        MJ.loading(false);
        return cv;
      };
      await draw();

      MJ.$('#shHide', body).onclick = async (e) => {
        hide = !hide;
        e.currentTarget.classList.toggle('on', hide);
        await draw();
      };

      const toBlob = () => new Promise((res) => target.toBlob(res, 'image/png', 0.95));

      MJ.$('#shShare', body).onclick = async () => {
        const blob = await toBlob();
        const file = new File([blob], `หมีจด-${MJ.isoDate(MJ.state.month).slice(0, 7)}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'สรุปการเงินของฉัน',
              text: `สรุป ${MJ.monthLabelFull(MJ.state.month)} จากหมีจด 🐻`,
            });
          } catch (e) { /* ผู้ใช้กดยกเลิก */ }
        } else {
          this.download(blob);
          MJ.toast('เครื่องนี้แชร์ตรงไม่ได้ บันทึกรูปให้แทนแล้ว', 'ok');
        }
      };

      MJ.$('#shSave', body).onclick = async () => this.download(await toBlob());
    });
  },

  download(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `หมีจด-${MJ.isoDate(MJ.state.month).slice(0, 7)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    MJ.toast('บันทึกรูปแล้ว 🖼️', 'ok');
  },
};
