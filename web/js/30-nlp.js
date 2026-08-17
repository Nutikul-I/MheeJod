/* ===================================================================
   30-nlp.js — ตัวแยกข้อความภาษาไทยแบบ rule-based (ทำงานในเครื่อง ไม่ต้องมี API key)
   ตัวอย่างที่รองรับ:
     "กินกาแฟ 80"                  -> จ่าย 80 หมวดอาหาร
     "รับค่าขนม 100"                -> รับ 100 หมวดได้รับโอน
     "เมื่อวาน ค่าไฟ 1,250 บาท"      -> จ่าย 1250 เมื่อวาน หมวดบิล
     "เงินเดือนเข้า 25000"           -> รับ 25000 หมวดเงินเดือน
     "ค่าแท็กซี่ สองร้อยห้าสิบ"       -> จ่าย 250 หมวดเดินทาง
   =================================================================== */
MJ.nlp = (() => {
  const INCOME_WORDS = ['รับ','ได้รับ','ได้','เงินเข้า','โอนเข้า','เข้าบัญชี','เงินเดือน','salary','โบนัส','ขายได้','ขาย','รายรับ','คืนเงิน','refund','ดอกเบี้ย','ปันผล','อั่งเปา','ค่าจ้าง','ค่าคอม'];
  const EXPENSE_WORDS = ['จ่าย','ซื้อ','กิน','ค่า','เสีย','โอนให้','ผ่อน','เติม','ชอป','ช้อป','รายจ่าย','หมดไป','เติมเงิน'];

  const THAI_NUM = { 'ศูนย์':0,'หนึ่ง':1,'เอ็ด':1,'สอง':2,'ยี่':2,'สาม':3,'สี่':4,'ห้า':5,'หก':6,'เจ็ด':7,'แปด':8,'เก้า':9 };
  const THAI_UNIT = { 'สิบ':10,'ร้อย':100,'พัน':1000,'หมื่น':10000,'แสน':100000,'ล้าน':1000000 };

  /** แปลงเลขไทยเป็นตัวเลข เช่น "สองร้อยห้าสิบ" -> 250 */
  function thaiWordsToNumber(text) {
    const re = /(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน)+/g;
    const m = text.match(re);
    if (!m) return null;
    const chunk = m.sort((a, b) => b.length - a.length)[0];
    if (chunk.length < 3) return null;
    let total = 0, current = 0, i = 0;
    while (i < chunk.length) {
      let matched = false;
      for (const w of Object.keys(THAI_UNIT).sort((a, b) => b.length - a.length)) {
        if (chunk.startsWith(w, i)) {
          const u = THAI_UNIT[w];
          if (u === 1000000) { total = (total + (current || 1)) * u; current = 0; }
          else { current = (current || 1) * u; total += current; current = 0; }
          i += w.length; matched = true; break;
        }
      }
      if (matched) continue;
      for (const w of Object.keys(THAI_NUM).sort((a, b) => b.length - a.length)) {
        if (chunk.startsWith(w, i)) { current = THAI_NUM[w]; i += w.length; matched = true; break; }
      }
      if (!matched) { i++; continue; }
      // ถ้าตัวถัดไปไม่ใช่หน่วย ให้บวกทันที
      const rest = chunk.slice(i);
      const nextIsUnit = Object.keys(THAI_UNIT).some((u) => rest.startsWith(u));
      if (!nextIsUnit) { total += current; current = 0; }
    }
    total += current;
    return total > 0 ? total : null;
  }

  /** ดึงจำนวนเงิน */
  function extractAmount(text) {
    let t = text.replace(/,/g, '');
    // "50 บาท 25 สตางค์" / "1.5k" / "2พัน"
    const kMatch = t.match(/(\d+(?:\.\d+)?)\s*(k|K|พัน)\b/);
    if (kMatch) return { amount: parseFloat(kMatch[1]) * 1000, matched: kMatch[0] };
    const mMatch = t.match(/(\d+(?:\.\d+)?)\s*(หมื่น)/);
    if (mMatch) return { amount: parseFloat(mMatch[1]) * 10000, matched: mMatch[0] };
    const numbers = [...t.matchAll(/(\d+(?:\.\d{1,2})?)/g)];
    if (numbers.length) {
      // เลือกตัวที่ติดคำว่า "บาท" ก่อน ไม่งั้นเอาตัวที่ใหญ่สุด
      const withBaht = numbers.find((n) => /^\s*(บาท|฿|thb)/i.test(t.slice(n.index + n[0].length)));
      const pick = withBaht || numbers.sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))[0];
      return { amount: parseFloat(pick[1]), matched: pick[0] };
    }
    const th = thaiWordsToNumber(t);
    if (th) return { amount: th, matched: null };
    return { amount: null, matched: null };
  }

  /** เดาว่าเป็นรายรับหรือรายจ่าย */
  function detectType(text) {
    const t = text.toLowerCase();
    let score = 0;
    INCOME_WORDS.forEach((w) => { if (t.includes(w)) score += (w.length > 2 ? 2 : 1); });
    EXPENSE_WORDS.forEach((w) => { if (t.includes(w)) score -= (w.length > 2 ? 2 : 1); });
    // "รับ" นำหน้าประโยคน้ำหนักมาก, "ค่า..." มักเป็นรายจ่าย
    if (/^(รับ|ได้)/.test(text.trim())) score += 2;
    if (/^ค่า/.test(text.trim())) score -= 2;
    return score > 0 ? 'income' : 'expense';
  }

  /** เดาวันที่จากคำบอกเวลา */
  function detectDate(text) {
    const now = new Date();
    let d = new Date(now);
    let matched = null;

    if (/เมื่อวานซืน|วานซืน/.test(text)) { d.setDate(now.getDate() - 2); matched = 'เมื่อวานซืน'; }
    else if (/เมื่อวาน|มื้อวาน/.test(text)) { d.setDate(now.getDate() - 1); matched = 'เมื่อวาน'; }
    else if (/วันนี้/.test(text)) { matched = 'วันนี้'; }
    else if (/พรุ่งนี้/.test(text)) { d.setDate(now.getDate() + 1); matched = 'พรุ่งนี้'; }
    else {
      const ago = text.match(/(\d+)\s*วันก่อน/);
      if (ago) { d.setDate(now.getDate() - parseInt(ago[1], 10)); matched = ago[0]; }
      else {
        const dm = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
        if (dm) {
          let year = dm[3] ? parseInt(dm[3], 10) : now.getFullYear();
          if (year > 2400) year -= 543;
          if (year < 100) year += 2000;
          d = new Date(year, parseInt(dm[2], 10) - 1, parseInt(dm[1], 10), now.getHours(), now.getMinutes());
          matched = dm[0];
        }
      }
    }
    // เวลา เช่น "ตอน 18:30"
    const tm = text.match(/\b(\d{1,2})[:.](\d{2})\s*(น\.?)?/);
    if (tm && Number(tm[1]) < 24) { d.setHours(Number(tm[1]), Number(tm[2]), 0, 0); matched = (matched || '') + ' ' + tm[0]; }
    return { date: d, matched };
  }

  /** เดาหมวดจาก keywords ของหมวด + ชื่อหมวด */
  function detectCategory(text, type) {
    const t = text.toLowerCase();
    const cats = MJ.state.categories.filter((c) => c.type === type);
    let best = null, bestScore = 0;
    cats.forEach((c) => {
      let score = 0;
      if (t.includes(String(c.name).toLowerCase())) score += 5;
      (c.keywords || []).forEach((k) => {
        const kw = String(k).toLowerCase();
        if (kw && t.includes(kw)) score = Math.max(score, kw.length >= 4 ? 4 : 3);
      });
      if (score > bestScore) { bestScore = score; best = c; }
    });
    if (best) return best;
    return cats.find((c) => c.name === 'อื่น ๆ') || cats[0] || null;
  }

  /** ตัดคำที่ใช้แล้วออก เหลือเป็นโน้ต */
  function extractNote(text, amountMatched, dateMatched) {
    let s = ' ' + text + ' ';
    if (amountMatched) s = s.replace(amountMatched, ' ');
    if (dateMatched) dateMatched.split(' ').filter(Boolean).forEach((m) => { s = s.replace(m, ' '); });
    s = s.replace(/[\d,]+(\.\d+)?/g, ' ')
         .replace(/บาท|฿|thb|ตอน|เมื่อ|จำนวน|ราคา|ทั้งหมด|รวม/gi, ' ')
         .replace(/\s+/g, ' ').trim();
    return s || null;
  }

  return {
    /** วิเคราะห์ข้อความ -> ร่างรายการ */
    parse(text) {
      const raw = String(text || '').trim();
      if (!raw) return null;
      const { amount, matched } = extractAmount(raw);
      const type = detectType(raw);
      const { date, matched: dateMatched } = detectDate(raw);
      const cat = detectCategory(raw, type);
      const note = extractNote(raw, matched, dateMatched);
      return {
        amount,
        type,
        category_id: cat?.id || null,
        category: cat,
        note: note || (cat ? cat.name : null),
        transaction_date: date,
        source: 'text',
        raw_input: raw,
        confidence: amount ? (cat ? 'high' : 'medium') : 'low',
      };
    },

    /** สรุปเป็นประโยคให้ผู้ใช้ยืนยัน */
    describe(d) {
      if (!d) return '';
      const kind = d.type === 'income' ? 'รายรับ' : 'รายจ่าย';
      const when = MJ.sameDay(new Date(d.transaction_date), new Date())
        ? 'วันนี้' : MJ.dayLabel(d.transaction_date);
      return `${kind} ${MJ.fmtBaht(d.amount)} • ${d.category?.icon || ''} ${d.category?.name || 'ไม่ระบุหมวด'} • ${when}\n"${d.note || '-'}"`;
    },
    thaiWordsToNumber,
  };
})();
