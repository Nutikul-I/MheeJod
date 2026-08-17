/* ===================================================================
   40-slip.js — อ่านสลิป: QR ในเครื่อง -> OCR (Tesseract.js / PaddleOCR) -> เดาหมวด
   ลำดับการทำงาน
     1) สแกน Mini QR บนสลิป (jsQR) เอา "รหัสอ้างอิง" ไว้กันบันทึกซ้ำ
     2) OCR ข้อความบนสลิปเพื่อหา ยอดเงิน / วันที่ / ชื่อผู้รับ
        - ค่าเริ่มต้น: Tesseract.js (ทำงานในเบราว์เซอร์ ฟรี ไม่ต้องมี key)
        - ถ้าตั้ง PaddleOCR endpoint ไว้ในหน้าตั้งค่า จะเรียกใช้ตัวนั้นแทน (แม่นกว่า)
     3) รวมผล -> ร่างรายการให้ผู้ใช้ยืนยัน
   =================================================================== */
MJ.slip = (() => {

  /* ------------------------- โหลดรูปเข้า canvas ------------------------- */
  async function toImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }

  function drawScaled(img, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas: cv, ctx, w, h };
  }

  /* ------------------------- 1) สแกน QR ------------------------- */
  async function scanQR(img) {
    const tries = [1400, 900, 2000];
    for (const size of tries) {
      const { ctx, w, h } = drawScaled(img, size);
      const data = ctx.getImageData(0, 0, w, h);
      const code = window.jsQR ? window.jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' }) : null;
      if (code?.data) return code.data;

      // ลองเฉพาะครึ่งล่าง (Mini QR มักอยู่มุมล่าง)
      const halfH = Math.floor(h / 2);
      const half = ctx.getImageData(0, halfH, w, h - halfH);
      const code2 = window.jsQR ? window.jsQR(half.data, w, h - halfH, { inversionAttempts: 'attemptBoth' }) : null;
      if (code2?.data) return code2.data;
    }
    return null;
  }

  /* ------------------------- ถอด EMVCo TLV ------------------------- */
  function parseTLV(payload) {
    const out = {};
    let i = 0;
    while (i + 4 <= payload.length) {
      const tag = payload.slice(i, i + 2);
      const len = parseInt(payload.slice(i + 2, i + 4), 10);
      if (!/^\d{2}$/.test(tag) || Number.isNaN(len)) break;
      const value = payload.slice(i + 4, i + 4 + len);
      if (value.length < len) break;
      out[tag] = value;
      i += 4 + len;
    }
    return out;
  }

  /**
   * ดึงรหัสอ้างอิงจาก payload ของ Mini QR
   * ใช้ payload ดิบเป็นกุญแจกันซ้ำเสมอ (ไม่ขึ้นกับว่าถอดโครงสร้างได้ไหม)
   */
  function parseSlipPayload(payload) {
    const res = { raw: payload, reference: payload.trim(), fields: {}, bank: null };
    if (!/^\d{2}\d{2}/.test(payload)) return res;
    const tlv = parseTLV(payload);
    res.fields = tlv;
    // ฟิลด์ย่อยที่มักเก็บ transaction ref (ตัวอักษร+ตัวเลข ยาว 15-30)
    const candidates = Object.values(tlv).filter((v) => /^[A-Za-z0-9]{12,40}$/.test(v));
    if (candidates.length) res.reference = candidates.sort((a, b) => b.length - a.length)[0];
    // รหัสธนาคาร 3 หลักมักอยู่ในฟิลด์ย่อยของ tag 01
    const m = payload.match(/\b(002|004|006|011|014|022|025|030|033|034|065|066|067|069|070|071|073)\d{9,}/);
    if (m) res.bank = BANKS[m[1]] || null;
    return res;
  }

  const BANKS = {
    '002':'ธ.กรุงเทพ','004':'ธ.กสิกรไทย','006':'ธ.กรุงไทย','011':'ธ.ทหารไทยธนชาต','014':'ธ.ไทยพาณิชย์',
    '022':'ธ.ซีไอเอ็มบี','025':'ธ.กรุงศรีอยุธยา','030':'ธ.ออมสิน','033':'ธ.อาคารสงเคราะห์','034':'ธ.ก.ส.',
    '065':'ธ.ธนชาต','066':'ธ.อิสลาม','067':'ธ.ทิสโก้','069':'ธ.เกียรตินาคินภัทร','070':'ธ.ไอซีบีซี',
    '071':'ธ.ไทยเครดิต','073':'ธ.แลนด์ แอนด์ เฮ้าส์',
  };

  /* ------------------------- 2) OCR ------------------------- */
  let tesseractWorker = null;

  async function ensureTesseract(onProgress) {
    if (tesseractWorker) return tesseractWorker;
    if (!window.Tesseract) {
      onProgress && onProgress('กำลังโหลดตัวอ่านข้อความ…');
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
        s.onload = res; s.onerror = () => rej(new Error('โหลดตัวอ่านข้อความไม่สำเร็จ'));
        document.head.appendChild(s);
      });
    }
    onProgress && onProgress('กำลังเตรียมภาษาไทย… (ครั้งแรกใช้เวลาสักครู่)');
    tesseractWorker = await window.Tesseract.createWorker(['tha', 'eng'], 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    });
    return tesseractWorker;
  }

  async function ocrLocal(img, onProgress) {
    const worker = await ensureTesseract(onProgress);
    onProgress && onProgress('กำลังอ่านตัวหนังสือบนสลิป…');
    const { canvas } = drawScaled(img, 1600);
    const { data } = await worker.recognize(canvas);
    return data?.text || '';
  }

  /**
   * ส่งรูปให้ PaddleOCR service
   * เซิร์ฟเวอร์ฟรี (เช่น Hugging Face Space) จะหลับเมื่อไม่มีคนใช้
   * ถ้าเจอ 502/503/504 จะรอแล้วลองใหม่ ระหว่างนั้นบอกผู้ใช้ว่ากำลังปลุกเซิร์ฟเวอร์
   */
  async function ocrRemote(endpoint, file, onProgress) {
    const url = endpoint.replace(/\/$/, '') + '/ocr';
    const attempts = 8;
    for (let i = 0; i < attempts; i++) {
      onProgress && onProgress(i === 0 ? 'กำลังส่งสลิปให้ PaddleOCR…'
        : `กำลังปลุกเซิร์ฟเวอร์ OCR… (${i}/${attempts - 1})`);
      let res;
      try {
        const fd = new FormData();
        fd.append('file', file, file.name || 'slip.jpg');
        res = await fetch(url, { method: 'POST', body: fd });
      } catch (err) {
        if (i === attempts - 1) throw new Error('ต่อเซิร์ฟเวอร์ OCR ไม่ได้');
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      if (res.ok) {
        const json = await res.json();
        if (typeof json.text === 'string') return json.text;
        if (Array.isArray(json.lines)) return json.lines.map((l) => (typeof l === 'string' ? l : l.text)).join('\n');
        return JSON.stringify(json);
      }
      // กำลังตื่น/บูตอยู่ — รอแล้วลองใหม่
      if ([408, 429, 500, 502, 503, 504].includes(res.status) && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      throw new Error('PaddleOCR ตอบกลับผิดพลาด (' + res.status + ')');
    }
    throw new Error('เซิร์ฟเวอร์ OCR ไม่ตอบสนอง');
  }

  /* ------------------------- แกะข้อมูลจากข้อความ OCR ------------------------- */
  /* ---------- เดือนไทย/อังกฤษ ทั้งแบบย่อและเต็ม ---------- */
  const THAI_MONTHS = [
    ['มกราคม', 'มค'], ['กุมภาพันธ์', 'กพ'], ['มีนาคม', 'มีค'], ['เมษายน', 'เมย'],
    ['พฤษภาคม', 'พค'], ['มิถุนายน', 'มิย'], ['กรกฎาคม', 'กค'], ['สิงหาคม', 'สค'],
    ['กันยายน', 'กย'], ['ตุลาคม', 'ตค'], ['พฤศจิกายน', 'พย'], ['ธันวาคม', 'ธค'],
  ];
  const EN_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  /** แปลงปีให้เป็น ค.ศ. (รับได้ทั้ง 68 / 2568 / 25 / 2025) */
  function normalizeYear(y) {
    y = parseInt(y, 10);
    if (Number.isNaN(y)) return null;
    if (y < 100) y += (y >= 50 ? 2500 : 2000);   // 68 -> 2568, 25 -> 2025
    if (y > 2400) y -= 543;                       // พ.ศ. -> ค.ศ.
    return y;
  }

  /** หาเดือนจากคำ (ไทยเต็ม/ไทยย่อ/อังกฤษ) */
  function monthFromWord(word) {
    const w = String(word).replace(/[.\s]/g, '').toLowerCase();
    for (let i = 0; i < THAI_MONTHS.length; i++) {
      const [full, abbr] = THAI_MONTHS[i];
      if (w === full || w === abbr || full.startsWith(w) && w.length >= 3) return i;
    }
    const en = EN_MONTHS.indexOf(w.slice(0, 3));
    if (en > -1) return en;
    return null;
  }

  /**
   * อ่านวันที่จากข้อความสลิป รองรับ
   *   12 ส.ค. 68 / 12 สิงหาคม 2568 / 12 Aug 2025 / 12/08/2568 / 2025-08-12 / 12-08-68
   * และเวลา 14:35 / 14.35 น. / 14:35:02
   */
  function parseDateFromText(flat) {
    let d = null;

    // 1) วัน + ชื่อเดือน + ปี(อาจไม่มี)
    const named = flat.match(/(\d{1,2})\s*(ม\.?ค\.?|มกราคม|ก\.?พ\.?|กุมภาพันธ์|มี\.?ค\.?|มีนาคม|เม\.?ย\.?|เมษายน|พ\.?ค\.?|พฤษภาคม|มิ\.?ย\.?|มิถุนายน|ก\.?ค\.?|กรกฎาคม|ส\.?ค\.?|สิงหาคม|ก\.?ย\.?|กันยายน|ต\.?ค\.?|ตุลาคม|พ\.?ย\.?|พฤศจิกายน|ธ\.?ค\.?|ธันวาคม|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\.?\s*(\d{2,4})?/i);
    if (named) {
      const mon = monthFromWord(named[2]);
      const year = named[3] ? normalizeYear(named[3]) : new Date().getFullYear();
      if (mon != null && year) d = new Date(year, mon, parseInt(named[1], 10));
    }

    // 2) รูปแบบ ปี-เดือน-วัน (2025-08-12 / 2568/08/12)
    if (!d) {
      const ymd = flat.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
      if (ymd) {
        const year = normalizeYear(ymd[1]);
        d = new Date(year, parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
      }
    }

    // 3) รูปแบบ วัน/เดือน/ปี (12/08/68, 12-08-2568)
    if (!d) {
      const dmy = flat.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (dmy) {
        const year = normalizeYear(dmy[3]);
        let day = parseInt(dmy[1], 10), mon = parseInt(dmy[2], 10);
        if (mon > 12 && day <= 12) { const t = day; day = mon; mon = t; }  // เผื่อสลับ MM/DD
        d = new Date(year, mon - 1, day);
      }
    }

    if (!d || isNaN(d.getTime())) return null;
    // ถ้าวันที่ไม่มีจริง (เช่น 30 ก.พ.) JS จะเลื่อนเดือนให้ — ถือว่าอ่านผิด
    const dayWanted = parseInt((named || flat.match(/(\d{1,2})[\/\-.]/) || [])[1], 10);
    if (dayWanted && d.getDate() !== dayWanted && !flat.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)) return null;

    // เวลา: เอาตัวที่ติดคำว่า "น." ก่อน ไม่งั้นเอาแบบ hh:mm ทั่วไป
    const tWithNa = flat.match(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*น\.?/);
    const tPlain  = flat.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?=\s|$)/);
    const tm = tWithNa || tPlain;
    if (tm && Number(tm[1]) < 24 && Number(tm[2]) < 60) {
      d.setHours(Number(tm[1]), Number(tm[2]), Number(tm[3] || 0), 0);
    } else {
      d.setHours(12, 0, 0, 0);   // ไม่รู้เวลา ใช้เที่ยงกันเพี้ยนข้ามวันจาก timezone
    }

    // สลิปไม่ควรเป็นอนาคตเกิน 1 วัน — ถ้าเพี้ยนให้ถือว่าอ่านผิด
    if (d.getTime() > Date.now() + 86400000) return null;
    return d;
  }

  /** สลิปหลายธนาคารฝังวันที่ไว้ต้นรหัสอ้างอิง เช่น 20250812xxxxxxx */
  function parseDateFromRef(ref) {
    if (!ref) return null;
    const m = String(ref).match(/(20\d{2}|2[45]\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    if (!m) return null;
    const year = normalizeYear(m[1]);
    const d = new Date(year, parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0);
    if (isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000) return null;
    return d;
  }

  function extractFromText(text) {
    const out = { amount: null, date: null, payee: null, reference: null, lines: [] };
    if (!text) return out;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    out.lines = lines;
    const flat = lines.join(' ');

    // ---- ยอดเงิน: ตัวเลขที่มีทศนิยม 2 ตำแหน่ง หรืออยู่หลังคำว่า "จำนวน/ยอด"
    const labeled = flat.match(/(?:จำนวน(?:เงิน)?|ยอดเงิน|ยอด|amount|total)\s*:?\s*([\d,]+\.?\d{0,2})/i);
    if (labeled) out.amount = parseFloat(labeled[1].replace(/,/g, ''));
    if (!out.amount) {
      const cands = [...flat.matchAll(/([\d]{1,3}(?:,[\d]{3})*|\d+)\.(\d{2})(?!\d)/g)]
        .map((m) => parseFloat((m[1] + '.' + m[2]).replace(/,/g, '')))
        .filter((n) => n > 0 && n < 10000000);
      if (cands.length) out.amount = Math.max(...cands);
    }
    if (!out.amount) {
      const baht = flat.match(/([\d,]+)\s*(?:บาท|THB|฿)/i);
      if (baht) out.amount = parseFloat(baht[1].replace(/,/g, ''));
    }

    // ---- วันที่และเวลา
    out.date = parseDateFromText(flat);

    // ---- ชื่อผู้รับเงิน: บรรทัดหลังคำว่า "ไปยัง/ถึง/ผู้รับ" หรือบรรทัดที่มี บจก./บมจ./ร้าน
    const idxTo = lines.findIndex((l) => /(ไปยัง|ถึง|ผู้รับ|to\b|received)/i.test(l));
    if (idxTo > -1) {
      const same = lines[idxTo].replace(/.*(ไปยัง|ถึง|ผู้รับ|to|received)\s*:?\s*/i, '').trim();
      out.payee = same.length > 2 ? same : (lines[idxTo + 1] || null);
    }
    if (!out.payee) {
      const biz = lines.find((l) => /(บจก|บมจ|บริษัท|ห้างหุ้นส่วน|ร้าน|จำกัด|co\.,?\s*ltd)/i.test(l));
      if (biz) out.payee = biz.trim();
    }
    if (out.payee) out.payee = out.payee.replace(/\s{2,}/g, ' ').replace(/^[:\-–]\s*/, '').slice(0, 80);

    // ---- เลขอ้างอิงในข้อความ
    const ref = flat.match(/(?:เลขที่รายการ|รหัสอ้างอิง|อ้างอิง|ref(?:erence)?(?:\s*no)?)\s*:?\s*([A-Za-z0-9]{8,40})/i);
    if (ref) out.reference = ref[1];
    return out;
  }

  /* ------------------------- 3) รวมผลเป็นร่างรายการ ------------------------- */
  async function analyze(file, onProgress) {
    const img = await toImage(file);

    onProgress && onProgress('กำลังสแกน QR บนสลิป…');
    let qr = null, slipInfo = null;
    try { qr = await scanQR(img); } catch (e) { /* ไม่มี QR ก็ไม่เป็นไร */ }
    if (qr) slipInfo = parseSlipPayload(qr);

    let text = '';
    const endpoint = MJ.state.profile?.ocr_endpoint;
    try {
      if (endpoint) text = await ocrRemote(endpoint, file, onProgress);
      else text = await ocrLocal(img, onProgress);
    } catch (err) {
      if (endpoint) {
        MJ.toast('PaddleOCR ใช้ไม่ได้ สลับไปอ่านในเครื่อง', 'err');
        try { text = await ocrLocal(img, onProgress); } catch (e2) { text = ''; }
      }
    }

    const info = extractFromText(text);
    const payee = info.payee || slipInfo?.bank || null;

    // วันที่: ข้อความบนสลิปมาก่อน ถ้าอ่านไม่ได้ลองถอดจากรหัสอ้างอิง สุดท้ายค่อยใช้วันนี้
    const slipDate = info.date
      || parseDateFromRef(slipInfo?.reference)
      || parseDateFromRef(info.reference)
      || null;

    // เดาหมวดจากชื่อร้าน + ข้อความทั้งหมด
    let categoryId = payee ? await MJ.data.matchMerchant(payee) : null;
    let category = categoryId ? MJ.data.catById(categoryId) : null;
    if (!category) {
      const guess = MJ.nlp.parse(((payee || '') + ' ' + (info.lines.slice(0, 6).join(' ') || '')) + ' ' + (info.amount || ''));
      category = guess?.category || null;
    }

    return {
      amount: info.amount,
      type: 'expense',
      category_id: category?.id || null,
      category,
      note: payee ? `โอนให้ ${payee}` : 'จ่ายผ่านสลิป',
      payee_name: payee,
      transaction_date: slipDate || new Date(),
      dateFromSlip: !!slipDate,
      slip_reference: slipInfo?.reference || info.reference || null,
      source: 'slip',
      raw_input: (qr ? 'QR: ' + qr + '\n' : '') + text.slice(0, 2000),
      hasQR: !!qr,
      ocrText: text,
    };
  }

  return { analyze, scanQR, parseSlipPayload, extractFromText, parseTLV, ensureTesseract,
           parseDateFromText, parseDateFromRef };
})();
