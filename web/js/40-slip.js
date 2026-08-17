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

  /**
   * เพิ่มคอนทราสต์ + ทำเป็นขาวดำก่อนส่งเข้า OCR
   * สลิปหลายธนาคารมีลายน้ำ/พื้นหลังอ่อน ทำให้ตัวเลขจม — ขั้นนี้ช่วยให้อ่านยอดได้ขึ้นชัดเจน
   */
  function boostContrast(canvas, ctx) {
    const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const c = Math.max(0, Math.min(255, (v - 128) * 1.9 + 128));
      d[i] = d[i + 1] = d[i + 2] = c;
    }
    ctx.putImageData(im, 0, 0);
    return canvas;
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
   * ดึงข้อมูลจาก payload ของ Mini QR บนสลิปไทย
   * โครงสร้างจริง (EMVCo TLV ซ้อนกัน) เช่น
   *   0046 00[06]000001 01[03]014 02[25]202608012vWAeIOheGunNmdz2  51[02]TH  91[04]3E89
   *        └─ tag 00 = กลุ่มข้อมูลสลิป: 00=เวอร์ชัน, 01=รหัสธนาคารผู้ส่ง, 02=เลขอ้างอิงรายการ
   * ใช้เลขอ้างอิงเป็นกุญแจกันบันทึกซ้ำ ถ้าถอดไม่ได้ค่อยใช้ payload ดิบ
   */
  function parseSlipPayload(payload) {
    const raw = String(payload || '').trim();
    const res = { raw, reference: raw, fields: {}, inner: {}, bank: null, bankCode: null, version: null };
    if (!/^\d{4}/.test(raw)) return res;

    const tlv = parseTLV(raw);
    res.fields = tlv;

    const inner = parseTLV(tlv['00'] || '');
    res.inner = inner;
    res.version = inner['00'] || null;
    res.bankCode = inner['01'] || null;
    res.bank = res.bankCode ? (BANKS[res.bankCode] || null) : null;

    if (inner['02'] && /^[A-Za-z0-9]{6,}$/.test(inner['02'])) {
      res.reference = inner['02'];
    } else {
      const candidates = Object.values(tlv).concat(Object.values(inner))
        .filter((v) => /^[A-Za-z0-9]{12,40}$/.test(v));
      if (candidates.length) res.reference = candidates.sort((a, b) => b.length - a.length)[0];
    }
    return res;
  }

  const BANKS = {
    '002':'ธ.กรุงเทพ','004':'ธ.กสิกรไทย','006':'ธ.กรุงไทย','011':'ธ.ทหารไทยธนชาต','014':'ธ.ไทยพาณิชย์',
    '017':'ธ.ซิตี้แบงก์','018':'ธ.ซูมิโตโม','020':'ธ.สแตนดาร์ดชาร์เตอร์ด','022':'ธ.ซีไอเอ็มบี',
    '024':'ธ.ยูโอบี','025':'ธ.กรุงศรีอยุธยา','026':'ธ.เมกะสากลพาณิชย์','030':'ธ.ออมสิน',
    '031':'ธ.เอชเอสบีซี','032':'ธ.ดอยซ์แบงก์','033':'ธ.อาคารสงเคราะห์','034':'ธ.ก.ส.',
    '039':'ธ.มิซูโฮ','045':'ธ.บีเอ็นพี พารีบาส์','052':'ธ.แห่งประเทศจีน','066':'ธ.อิสลาม',
    '067':'ธ.ทิสโก้','069':'ธ.เกียรตินาคินภัทร','070':'ธ.ไอซีบีซี','071':'ธ.ไทยเครดิต',
    '073':'ธ.แลนด์ แอนด์ เฮ้าส์','098':'ธ.พัฒนาวิสาหกิจ','099':'ธ.เพื่อการส่งออกและนำเข้า',
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

  async function ocrLocal(img, onProgress, opts) {
    const worker = await ensureTesseract(onProgress);
    onProgress && onProgress(opts?.second ? 'กำลังอ่านซ้ำอีกรอบให้ชัวร์…' : 'กำลังอ่านตัวหนังสือบนสลิป…');
    const { canvas, ctx } = drawScaled(img, 1600);
    if (opts?.boost !== false) boostContrast(canvas, ctx);
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

  /**
   * ถอดวันที่จากรหัสอ้างอิงสลิป รองรับ 2 แบบที่เจอจริง
   *   ก) ฝังวันที่เต็ม   เช่น SCB "202608012vWAeIOheGunNmdz2" -> 2026-08-01
   *   ข) วันที่ N ของปี + เวลา เช่น กสิกร "016225114146BPM01937"
   *      016 | 225 (วันที่ 225 ของปี = 13 ส.ค.) | 114146 (11:41:46)
   */
  function parseDateFromRef(ref) {
    if (!ref) return null;
    const s = String(ref);

    // ก) YYYYMMDD
    const full = s.match(/(20\d{2}|2[45]\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    if (full) {
      const d = new Date(normalizeYear(full[1]), parseInt(full[2], 10) - 1, parseInt(full[3], 10), 12, 0, 0);
      if (!isNaN(d.getTime()) && d.getTime() <= Date.now() + 86400000) return d;
    }

    const now = new Date();
    const buildDoy = (day, hh, mm, ss) => {
      if (!(day >= 1 && day <= 366)) return null;
      let d = new Date(now.getFullYear(), 0, day, hh || 12, mm || 0, ss || 0);
      if (d.getTime() > now.getTime() + 86400000) d = new Date(now.getFullYear() - 1, 0, day, hh || 12, mm || 0, ss || 0);
      return isNaN(d.getTime()) ? null : d;
    };

    // ข) กสิกร K PLUS: 016 + DDD(วันที่ N ของปี) + HHMMSS + ตัวอักษร
    const doyTime = s.match(/^0\d{2}(\d{3})(\d{2})(\d{2})(\d{2})/);
    if (doyTime && +doyTime[2] < 24 && +doyTime[3] < 60 && +doyTime[4] < 60) {
      const d = buildDoy(+doyTime[1], +doyTime[2], +doyTime[3], +doyTime[4]);
      if (d) return d;
    }

    // ค) MAKE by KBank: 046 + DDD แล้วตามด้วยตัวอักษรผสม (ไม่มีเวลา)
    const doyOnly = s.match(/^0\d{2}(\d{3})(?=[A-Za-z0-9])/);
    if (doyOnly) {
      const d = buildDoy(+doyOnly[1]);
      if (d) return d;
    }
    return null;
  }

  /** ทำความสะอาดข้อความจาก OCR ให้เทียบง่ายขึ้น */
  function normalizeText(text) {
    return String(text || '')
      .replace(/ํา/g, 'ำ')                 // "จํานวน" -> "จำนวน"
      .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50))  // เลขไทย -> อารบิก
      .replace(/[​-‍﻿]/g, '')
      .replace(/[ \t]+/g, ' ');
  }

  const FEE_RE = /(ค่าธรรมเนียม|ธรรมเนียม|fee|charge|คงเหลือ|ยอดคงเหลือ|balance)/i;
  const AMOUNT_LABEL_RE = /(จำนวนเงิน|จำนวน|ยอดเงิน|ยอดชำระ|ยอดรวม|ยอด|รวมทั้งสิ้น|amount|total)\s*:?/i;
  const NOT_PAYEE_RE = /(รหัส|เลขที่|หมายเลข|อ้างอิง|บัญชี|account|ref|xxx|สแกน|ตรวจสอบ|ธนาคาร|ธ\.|จำนวน|ค่าธรรมเนียม|บาท|สำเร็จ)/i;

  /** ตัวเลขที่ "หน้าตาเป็นจำนวนเงิน" จริง ๆ คือมีทศนิยม 2 ตำแหน่ง เช่น 160.00 / 49,999.00
   *  OCR มักอ่านลูกน้ำเป็นช่องว่าง ("49 999.00") จึงรับตัวคั่นได้ทั้งสองแบบ */
  function decimalsIn(line) {
    return [...line.matchAll(/(?:^|[^\d.,])(\d{1,3}(?:[,\s]\d{3})+|\d{1,7})\.(\d{2})(?!\d)/g)]
      .map((m) => parseFloat((m[1] + '.' + m[2]).replace(/[,\s]/g, '')))
      .filter((n) => n > 0 && n < 10000000);
  }

  /** เลขจำนวนเต็มที่ตามด้วยหน่วยเงิน เช่น "500 บาท" */
  function bahtIntIn(line) {
    return [...line.matchAll(/(?:^|[^\d.,])(\d{1,3}(?:,\d{3})*|\d{1,7})\s*(?:บาท|THB|฿)/gi)]
      .map((m) => parseFloat(m[1].replace(/,/g, '')))
      .filter((n) => n > 0 && n < 10000000);
  }

  function extractFromText(rawText) {
    const out = { amount: null, date: null, payee: null, reference: null, lines: [] };
    if (!rawText) return out;

    const text = normalizeText(rawText);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    out.lines = lines;
    const flat = lines.join(' ');

    /* ---------- ยอดเงิน ----------
       1) บรรทัดที่มีคำว่า "จำนวน/ยอด" (แต่ไม่ใช่ค่าธรรมเนียม) — ตัวเลขอาจอยู่บรรทัดถัดไป
       2) ถ้าไม่เจอ ใช้ตัวเลขทศนิยม 2 ตำแหน่งที่มากที่สุด โดยข้ามบรรทัดค่าธรรมเนียม/ยอดคงเหลือ  */
    for (let i = 0; i < lines.length && !out.amount; i++) {
      if (FEE_RE.test(lines[i]) || !AMOUNT_LABEL_RE.test(lines[i])) continue;
      const after = lines[i].replace(/^.*?(จำนวนเงิน|จำนวน|ยอดเงิน|ยอดชำระ|ยอดรวม|ยอด|amount|total)\s*:?/i, '');
      const here = decimalsIn(after).concat(bahtIntIn(after));
      if (here.length) { out.amount = Math.max(...here); break; }
      // สลิปหลายแบบวางตัวเลขไว้บรรทัดถัดไป (มองลงไปได้ 3 บรรทัด)
      for (let k = 1; k <= 3 && i + k < lines.length; k++) {
        if (FEE_RE.test(lines[i + k])) break;
        const next = decimalsIn(lines[i + k]).concat(bahtIntIn(lines[i + k]));
        if (next.length) { out.amount = Math.max(...next); break; }
      }
    }
    if (!out.amount) {
      const cands = [];
      lines.forEach((l) => { if (!FEE_RE.test(l)) cands.push(...decimalsIn(l)); });
      if (cands.length) out.amount = Math.max(...cands);
    }
    if (!out.amount) {
      const cands = [];
      lines.forEach((l) => { if (!FEE_RE.test(l)) cands.push(...bahtIntIn(l)); });
      if (cands.length) out.amount = Math.max(...cands);
    }
    // ทางสุดท้าย: เลขจำนวนเต็มบนบรรทัดที่มีคำว่า "จำนวน/ยอด" (รับเฉพาะ >= 10 กันเศษขยะจาก OCR)
    if (!out.amount) {
      for (let i = 0; i < lines.length && !out.amount; i++) {
        if (FEE_RE.test(lines[i]) || !AMOUNT_LABEL_RE.test(lines[i])) continue;
        for (let k = 0; k <= 2 && i + k < lines.length; k++) {
          const l = lines[i + k];
          if (k && FEE_RE.test(l)) break;
          const ints = [...l.matchAll(/(?:^|[^\d.,\-])(\d{1,3}(?:,\d{3})*|\d{2,7})(?![\d.,])/g)]
            .map((m) => parseFloat(m[1].replace(/,/g, '')))
            .filter((n) => n >= 10 && n < 10000000);
          if (ints.length) { out.amount = Math.max(...ints); break; }
        }
      }
    }

    /* ---------- วันที่และเวลา ---------- */
    out.date = parseDateFromText(flat);

    /* ---------- ชื่อผู้รับเงิน/ร้านค้า ---------- */
    const idxTo = lines.findIndex((l) => /(ไปยัง|ถึง|ผู้รับ(เงิน)?|to\b|received)/i.test(l));
    if (idxTo > -1) {
      const same = lines[idxTo].replace(/.*?(ไปยัง|ถึง|ผู้รับเงิน|ผู้รับ|to|received)\s*:?\s*/i, '').trim();
      out.payee = cleanPayee(same) || cleanPayee(lines[idxTo + 1] || '');
    }
    if (!out.payee) {
      const biz = lines.find((l) => /(บจก|บมจ|บริษัท|ห้างหุ้นส่วน|ร้าน(?!ค้า)|จำกัด|co\.,?\s*ltd|company|merchant|shop)/i.test(l)
        && !/รหัสร้านค้า/.test(l));
      if (biz) out.payee = cleanPayee(biz);
    }
    if (!out.payee) {
      /* สลิปกสิกร/MAKE ไม่มีคำว่า "ไปยัง" แต่เรียงเป็น
         ชื่อผู้โอน → ธนาคาร → เลขบัญชีปิดบัง(XXX-X-X9382-X) → ชื่อผู้รับ
         จึงหยิบบรรทัดถัดจากเลขบัญชีปิดบังอันแรก */
      const maskIdx = lines.findIndex((l) => /[Xx%*]{3}[-\s][\dXx%*-]{3,}/.test(l));
      if (maskIdx > -1) {
        for (let i = maskIdx + 1; i < Math.min(lines.length, maskIdx + 4); i++) {
          if (/^(ธ\.|ธนาคาร|prompt|พร้อมเพย์|bank)/i.test(lines[i].trim())) continue;
          const cand = cleanPayee(lines[i]);
          if (cand) { out.payee = cand; break; }
        }
      }
    }
    if (!out.payee) {
      // ชื่อร้านแบบตัวพิมพ์ใหญ่ล้วน เช่น ZENITHLINK / LINE PAY MERCHANT
      const caps = lines.find((l) => /^[A-Z][A-Z\s&.'()\-]{3,34}$/.test(l.trim()) && !/^X+$/i.test(l.trim()));
      if (caps) out.payee = cleanPayee(caps);
    }

    /* ---------- เลขอ้างอิงในข้อความ ---------- */
    const ref = flat.match(/(?:เลขที่รายการ|เลขที่อ้างอิง|รหัสอ้างอิง|อ้างอิง|ref(?:erence)?(?:\s*no)?)\s*:?\s*([A-Za-z0-9]{8,40})/i);
    if (ref) out.reference = ref[1];
    return out;
  }

  function cleanPayee(s) {
    let v = String(s || '')
      .replace(/^\S{1,2}\s+(?=\S{3,})/, '')   // ตัดเศษตัวอักษร/ตัวเลขที่ OCR หลุดมาหน้าแถว
      .replace(/\s{2,}\S{1,3}$/, '')          // และเศษที่หลุดมาท้ายแถว
      .replace(/^[\s:@\-–|>.©®]+/, '')
      .replace(/^(นาย|นาง|นางสาว|น\.ส\.|บจก\.|บมจ\.)\s*/i, (m) => m)   // คงคำนำหน้าไว้
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (v.length < 3 || v.length > 80) return null;
    if (NOT_PAYEE_RE.test(v) && !/(บจก|บมจ|บริษัท|จำกัด|co\.,?\s*ltd|company)/i.test(v)) return null;
    if (/^[A-F0-9]{12,}$/i.test(v)) return null;   // ดูเป็นรหัส ไม่ใช่ชื่อ
    return v;
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

    let info = extractFromText(text);

    // ยังขาดข้อมูลสำคัญ -> อ่านซ้ำจากภาพต้นฉบับ (ไม่เพิ่มคอนทราสต์) แล้วเติมช่องที่ว่าง
    if (!endpoint && (!info.amount || !info.date || !info.payee)) {
      try {
        const text2 = await ocrLocal(img, onProgress, { boost: false, second: true });
        const info2 = extractFromText(text2);
        info = {
          amount: info.amount || info2.amount,
          date: info.date || info2.date,
          payee: info.payee || info2.payee,
          reference: info.reference || info2.reference,
          lines: info.lines.concat(info2.lines),
        };
        text = text + '\n' + text2;
      } catch (e) { /* รอบสองล้มเหลวก็ใช้ผลรอบแรก */ }
    }
    const payee = info.payee || slipInfo?.bank || null;

    // วันที่: รวมสองแหล่ง — รหัสอ้างอิง (แม่นเพราะเป็นโครงสร้าง) กับข้อความ OCR (มีเวลา)
    const refDate = parseDateFromRef(slipInfo?.reference) || parseDateFromRef(info.reference);
    let slipDate = null;
    if (refDate && info.date) {
      const sameDay = refDate.getFullYear() === info.date.getFullYear()
        && refDate.getMonth() === info.date.getMonth()
        && refDate.getDate() === info.date.getDate();
      slipDate = sameDay ? info.date : refDate;   // วันตรงกัน ใช้เวลาจาก OCR
    } else {
      slipDate = refDate || info.date || null;
    }

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
