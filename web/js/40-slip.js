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
  const THAI_MONTH_MAP = { 'ม.ค':0,'มค':0,'ก.พ':1,'กพ':1,'มี.ค':2,'มีค':2,'เม.ย':3,'เมย':3,'พ.ค':4,'พค':4,'มิ.ย':5,'มิย':5,
    'ก.ค':6,'กค':6,'ส.ค':7,'สค':7,'ก.ย':8,'กย':8,'ต.ค':9,'ตค':9,'พ.ย':10,'พย':10,'ธ.ค':11,'ธค':11 };

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

    // ---- วันที่
    const dmy = flat.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    const thai = flat.match(/(\d{1,2})\s*(ม\.?ค|ก\.?พ|มี\.?ค|เม\.?ย|พ\.?ค|มิ\.?ย|ก\.?ค|ส\.?ค|ก\.?ย|ต\.?ค|พ\.?ย|ธ\.?ค)\.?\s*(\d{2,4})?/);
    let d = null;
    if (thai) {
      const mon = THAI_MONTH_MAP[thai[2].replace(/\./g, '')] ?? THAI_MONTH_MAP[thai[2]];
      let y = thai[3] ? parseInt(thai[3], 10) : new Date().getFullYear() + 543;
      if (y < 100) y += 2500;
      if (y > 2400) y -= 543;
      if (mon != null) d = new Date(y, mon, parseInt(thai[1], 10));
    } else if (dmy) {
      let y = parseInt(dmy[3], 10);
      if (y < 100) y += (y > 50 ? 2400 : 2000);
      if (y > 2400) y -= 543;
      d = new Date(y, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    }
    const tm = flat.match(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(?:น\.?)?/);
    if (d && tm && Number(tm[1]) < 24) d.setHours(Number(tm[1]), Number(tm[2]));
    if (d && !isNaN(d.getTime())) out.date = d;

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
      transaction_date: info.date || new Date(),
      slip_reference: slipInfo?.reference || info.reference || null,
      source: 'slip',
      raw_input: (qr ? 'QR: ' + qr + '\n' : '') + text.slice(0, 2000),
      hasQR: !!qr,
      ocrText: text,
    };
  }

  return { analyze, scanQR, parseSlipPayload, extractFromText, parseTLV, ensureTesseract };
})();
