/* ===================================================================
   61-add.js — หน้าจดรายการ: พิมพ์ / พูด / สลิป / กรอกเอง
   =================================================================== */
MJ.add = {
  tab: 'text',
  chat: [],          // {who:'bot'|'me', text}
  recognizer: null,
  recording: false,
  form: { amount: '', type: 'expense', category_id: null, date: null, note: '' },
};

MJ.routes.add = (view) => {
  const p = MJ.state.routeParams || {};
  if (p.tab) { MJ.add.tab = p.tab; MJ.state.routeParams = {}; }
  if (!MJ.add.chat.length) {
    MJ.add.chat = [{ who: 'bot', text: 'สวัสดี! พิมพ์บอกหมีได้เลย เช่น "กินกาแฟ 80" หรือ "รับค่าขนม 100" 🐻' }];
  }

  view.innerHTML = `
    <div class="seg" id="addTabs">
      <button class="seg-btn" data-tab="text">✏️ พิมพ์</button>
      <button class="seg-btn" data-tab="voice">🎤 พูด</button>
      <button class="seg-btn" data-tab="slip">🧾 สลิป</button>
      <button class="seg-btn" data-tab="form">⌨️ กรอกเอง</button>
    </div>
    <div id="addBody"></div>`;

  view.querySelectorAll('#addTabs .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === MJ.add.tab);
    b.onclick = () => { MJ.add.tab = b.dataset.tab; MJ.render(); };
  });

  const body = MJ.$('#addBody', view);
  ({ text: renderChat, voice: renderVoice, slip: renderSlip, form: renderForm }[MJ.add.tab] || renderChat)(body);
};

/* ============================ โหมดพิมพ์ (แชท) ============================ */
function renderChat(body, opts) {
  const voiceMode = opts?.voice;
  body.innerHTML = `
    <div class="chat" id="chatBox">
      ${MJ.add.chat.map((m) => `<div class="bubble ${m.who}">${MJ.esc(m.text)}</div>`).join('')}
    </div>
    <div class="chips" id="samples">
      <button class="chip" data-s="กินข้าวเที่ยง 60">กินข้าวเที่ยง 60</button>
      <button class="chip" data-s="ค่าแท็กซี่ 120">ค่าแท็กซี่ 120</button>
      <button class="chip" data-s="รับเงินเดือน 25000">รับเงินเดือน 25000</button>
      <button class="chip" data-s="เมื่อวาน ค่าไฟ 850">เมื่อวาน ค่าไฟ 850</button>
    </div>
    <div class="composer">
      <textarea id="chatInput" rows="1" placeholder="${voiceMode ? 'กดไมค์แล้วพูดได้เลย…' : 'เช่น กินกาแฟ 80'}"></textarea>
      <button class="rnd" id="btnMic" title="พูด">🎤</button>
      <button class="rnd send" id="btnSend" title="ส่ง">➤</button>
    </div>`;

  const input = MJ.$('#chatInput', body);
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; };
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  MJ.$('#btnSend', body).onclick = submit;
  MJ.$('#btnMic', body).onclick = () => MJ.add.toggleVoice(input);
  body.querySelectorAll('#samples .chip').forEach((c) => c.onclick = () => { input.value = c.dataset.s; submit(); });

  const box = MJ.$('#chatBox', body);
  box.scrollTop = box.scrollHeight;
  if (voiceMode) setTimeout(() => MJ.add.toggleVoice(input), 300);

  function push(who, text) {
    MJ.add.chat.push({ who, text });
    const el = document.createElement('div');
    el.className = 'bubble ' + who;
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto';
    push('me', text);
    const draft = MJ.nlp.parse(text);
    if (!draft || !draft.amount) {
      push('bot', 'หมีหาจำนวนเงินไม่เจอ ลองใส่ตัวเลขด้วยนะ เช่น "กินข้าว 80" 🐻');
      return;
    }
    push('bot', 'เข้าใจแล้ว!\n' + MJ.nlp.describe(draft));
    MJ.add.openDraftSheet(draft, { quickSave: true });
  }
}

/* ============================ โหมดพูด ============================ */
function renderVoice(body) {
  const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  if (!supported) {
    body.innerHTML = `<div class="card"><div class="empty"><span class="big">🎤</span>
      เบราว์เซอร์นี้ยังไม่รองรับการพูดจด<br><span class="tiny">ลองใช้ Safari บน iPhone หรือ Chrome บน Android</span><br>
      <button class="btn btn-soft btn-sm mt" id="toText">พิมพ์แทน</button></div></div>`;
    MJ.$('#toText', body).onclick = () => { MJ.add.tab = 'text'; MJ.render(); };
    return;
  }
  body.innerHTML = `<div class="card center">
      <p class="muted tiny mb">กดปุ่มแล้วพูด เช่น “กินข้าวเที่ยงหกสิบบาท”</p>
      <button class="fab" id="bigMic" style="margin:6px auto 12px;width:88px;height:88px;border-radius:32px;font-size:38px">🎤</button>
      <div class="muted tiny" id="voiceHint">แตะเพื่อเริ่มพูด</div>
    </div>
    <div id="voiceChat"></div>`;
  renderChat(MJ.$('#voiceChat', body), { voice: false });
  const input = MJ.$('#chatInput', body);
  MJ.$('#bigMic', body).onclick = () => MJ.add.toggleVoice(input, MJ.$('#voiceHint', body), MJ.$('#bigMic', body));
}

MJ.add.toggleVoice = function (input, hintEl, micEl) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { MJ.toast('เบราว์เซอร์นี้ไม่รองรับการพูด', 'err'); return; }
  if (MJ.add.recording) { try { MJ.add.recognizer.stop(); } catch (e) {} return; }

  const rec = new SR();
  rec.lang = 'th-TH';
  rec.interimResults = true;
  rec.continuous = false;
  MJ.add.recognizer = rec;
  MJ.add.recording = true;
  MJ.buzz(20);
  if (hintEl) hintEl.textContent = 'กำลังฟัง… พูดได้เลย';
  if (micEl) micEl.classList.add('rec');
  MJ.$$('#btnMic').forEach((b) => b.classList.add('rec'));

  rec.onresult = (e) => {
    const txt = Array.from(e.results).map((r) => r[0].transcript).join('');
    if (input) { input.value = txt; input.dispatchEvent(new Event('input')); }
    if (hintEl) hintEl.textContent = '“' + txt + '”';
  };
  rec.onerror = (e) => {
    MJ.toast(e.error === 'not-allowed' ? 'ไม่ได้รับอนุญาตให้ใช้ไมค์' : 'ฟังไม่ชัด ลองใหม่อีกที', 'err');
  };
  rec.onend = () => {
    MJ.add.recording = false;
    if (micEl) micEl.classList.remove('rec');
    MJ.$$('#btnMic').forEach((b) => b.classList.remove('rec'));
    if (hintEl) hintEl.textContent = 'แตะเพื่อพูดอีกครั้ง';
    const txt = input?.value.trim();
    if (txt) {
      const draft = MJ.nlp.parse(txt);
      draft && (draft.source = 'voice');
      if (draft?.amount) { input.value = ''; MJ.add.openDraftSheet(draft, { quickSave: true }); }
      else MJ.toast('ไม่เจอจำนวนเงิน ลองพูดใหม่พร้อมตัวเลข', 'err');
    }
  };
  try { rec.start(); } catch (e) { MJ.add.recording = false; }
};

/* ============================ โหมดสลิป ============================ */
function renderSlip(body) {
  body.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>อ่านสลิปอัตโนมัติ</h3>
        <span class="badge">${MJ.state.profile?.ocr_endpoint ? 'PaddleOCR' : 'อ่านในเครื่อง'}</span></div>
      <p class="muted tiny mb">สแกน QR บนสลิปเพื่อกันบันทึกซ้ำ แล้วอ่านยอดเงิน/วันที่/ชื่อร้านให้อัตโนมัติ</p>
      <div class="row">
        <button class="btn btn-primary" id="btnCam">📸 ถ่ายสลิป</button>
        <button class="btn btn-soft" id="btnPick">🖼️ เลือกรูป</button>
      </div>
      <input type="file" id="slipCam" accept="image/*" capture="environment" hidden>
      <input type="file" id="slipPick" accept="image/*" hidden multiple>
      <div id="slipResult" class="mt"></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>สลิปที่บันทึกไว้เดือนนี้</h3></div>
      ${(() => {
        const withSlip = MJ.state.transactions.filter((t) => t.slip_reference || t.receipt_image_url);
        return withSlip.length ? withSlip.slice(0, 8).map((t) => MJ.tx.row(t)).join('')
          : '<div class="empty tiny">ยังไม่มีสลิปที่บันทึก</div>';
      })()}
    </div>`;

  MJ.$('#btnCam', body).onclick = () => MJ.$('#slipCam', body).click();
  MJ.$('#btnPick', body).onclick = () => MJ.$('#slipPick', body).click();
  const handle = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    files.forEach((f, i) => setTimeout(() => MJ.add.processSlip(f), i * 200));
  };
  MJ.$('#slipCam', body).onchange = handle;
  MJ.$('#slipPick', body).onchange = handle;
  MJ.tx.bindRows(body);
}

MJ.add.processSlip = async function (file) {
  MJ.loading(true, 'กำลังเปิดสลิป…');
  try {
    const draft = await MJ.slip.analyze(file, (msg) => MJ.loading(true, msg));
    draft.file = file;
    MJ.loading(false);

    if (draft.slip_reference) {
      const { data: dup } = await MJ.sb.from('transactions').select('id, amount, transaction_date')
        .eq('slip_reference', draft.slip_reference).maybeSingle();
      if (dup) {
        MJ.toast('สลิปนี้บันทึกไปแล้วเมื่อ ' + MJ.dayLabel(dup.transaction_date), 'err');
        return;
      }
    }
    if (!draft.amount) MJ.toast('อ่านยอดเงินไม่ชัด ใส่เองได้เลยนะ', 'err');
    MJ.add.openDraftSheet(draft, { slip: true });
  } catch (err) {
    MJ.loading(false);
    MJ.toast('อ่านสลิปไม่สำเร็จ: ' + (err.message || err), 'err');
  }
};

/* ============================ โหมดกรอกเอง (แป้นตัวเลข) ============================ */
function renderForm(body) {
  const f = MJ.add.form;
  if (!f.date) f.date = new Date();
  if (!f.category_id) {
    const first = MJ.state.categories.find((c) => c.type === f.type);
    f.category_id = first?.id || null;
  }
  const cats = MJ.state.categories.filter((c) => c.type === f.type);

  body.innerHTML = `
    <div class="seg" id="typeSeg">
      <button class="seg-btn ${f.type === 'expense' ? 'active' : ''}" data-type="expense">💸 รายจ่าย</button>
      <button class="seg-btn ${f.type === 'income' ? 'active' : ''}" data-type="income">💰 รายรับ</button>
    </div>
    <div class="card">
      <div class="amount-display"><b id="amtView">${f.amount || '0'}</b><span>บาท</span></div>
      <div class="keypad" id="keypad">
        ${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>หมวดหมู่</h3><button class="link" data-go="budget">จัดการ ›</button></div>
      <div class="cat-grid" id="catGrid">
        ${cats.map((c) => `<button class="cat-pick ${c.id === f.category_id ? 'active' : ''}" data-cat="${c.id}">
          <span class="ic" style="background:${MJ.hex2rgba(c.color, .18)}">${c.icon}</span>${MJ.esc(c.name)}</button>`).join('')}
      </div>
    </div>
    <div class="card">
      <label class="field"><span>บันทึกช่วยจำ</span>
        <input type="text" id="fNote" value="${MJ.esc(f.note)}" placeholder="เช่น กาแฟร้านประจำ"></label>
      <label class="field"><span>วันและเวลา</span>
        <input type="datetime-local" id="fDate" value="${MJ.isoLocal(f.date)}"></label>
    </div>
    <button class="btn btn-primary btn-block" id="fSave">บันทึกรายการ</button>
    <div style="height:14px"></div>`;

  body.querySelectorAll('#typeSeg .seg-btn').forEach((b) => b.onclick = () => {
    f.type = b.dataset.type; f.category_id = null; renderForm(body);
  });
  body.querySelectorAll('#keypad button').forEach((b) => b.onclick = () => {
    const k = b.dataset.k;
    MJ.buzz(8);
    if (k === '⌫') f.amount = f.amount.slice(0, -1);
    else if (k === '.') { if (!f.amount.includes('.')) f.amount = (f.amount || '0') + '.'; }
    else if (/\.\d\d$/.test(f.amount)) return;
    else f.amount = (f.amount === '0' ? '' : f.amount) + k;
    MJ.$('#amtView', body).textContent = f.amount || '0';
  });
  body.querySelectorAll('#catGrid .cat-pick').forEach((b) => b.onclick = () => {
    f.category_id = b.dataset.cat;
    body.querySelectorAll('#catGrid .cat-pick').forEach((x) => x.classList.toggle('active', x === b));
  });
  body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => MJ.go(b.dataset.go));

  MJ.$('#fSave', body).onclick = async () => {
    const amount = parseFloat(f.amount);
    if (!amount || amount <= 0) { MJ.toast('ใส่จำนวนเงินก่อนนะ', 'err'); return; }
    MJ.loading(true, 'กำลังบันทึก…');
    try {
      await MJ.data.addTransaction({
        amount, type: f.type, category_id: f.category_id,
        note: MJ.$('#fNote', body).value.trim() || null,
        transaction_date: new Date(MJ.$('#fDate', body).value),
        source: 'manual',
      });
      MJ.add.form = { amount: '', type: f.type, category_id: f.category_id, date: new Date(), note: '' };
      MJ.buzz(30);
      MJ.toast('บันทึกแล้ว 🐻', 'ok');
      MJ.go('dashboard');
    } catch (err) {
      MJ.toast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'err');
    } finally { MJ.loading(false); }
  };
}

/* ============================ Sheet ยืนยันร่างรายการ ============================ */
MJ.add.openDraftSheet = function (draft, opts) {
  opts = opts || {};
  const cats = MJ.state.categories;
  const catOptions = (type) => cats.filter((c) => c.type === type)
    .map((c) => `<option value="${c.id}" ${c.id === draft.category_id ? 'selected' : ''}>${c.icon} ${MJ.esc(c.name)}</option>`).join('');

  MJ.sheet.open(opts.slip ? 'ตรวจสอบสลิป' : 'ยืนยันรายการ', `
    ${draft.file ? '<img class="slip-preview" id="slipImg" alt="สลิป">' : ''}
    ${opts.slip ? `<p class="tiny muted mb">${draft.hasQR ? '✅ อ่าน QR สำเร็จ — กันบันทึกซ้ำให้แล้ว' : '⚠️ ไม่พบ QR บนสลิป ตรวจตัวเลขอีกครั้งนะ'}</p>` : ''}
    <div class="seg" id="dType">
      <button class="seg-btn ${draft.type === 'expense' ? 'active' : ''}" data-type="expense">💸 รายจ่าย</button>
      <button class="seg-btn ${draft.type === 'income' ? 'active' : ''}" data-type="income">💰 รายรับ</button>
    </div>
    <label class="field"><span>จำนวนเงิน (บาท)</span>
      <input type="number" inputmode="decimal" step="0.01" id="dAmount" value="${draft.amount ?? ''}" placeholder="0.00"></label>
    <label class="field"><span>หมวดหมู่</span>
      <select id="dCat">${catOptions(draft.type)}</select></label>
    <label class="field"><span>บันทึกช่วยจำ</span>
      <input type="text" id="dNote" value="${MJ.esc(draft.note || '')}"></label>
    ${draft.payee_name ? `<label class="field"><span>ผู้รับเงิน / ร้านค้า</span>
      <input type="text" id="dPayee" value="${MJ.esc(draft.payee_name)}"></label>` : ''}
    <label class="field"><span>วันและเวลา</span>
      <input type="datetime-local" id="dDate" value="${MJ.isoLocal(new Date(draft.transaction_date))}"></label>
    ${draft.ocrText ? `<details class="mb"><summary class="tiny muted">ดูข้อความที่อ่านได้จากสลิป</summary>
      <pre class="tiny muted" style="white-space:pre-wrap;max-height:150px;overflow:auto">${MJ.esc(draft.ocrText.slice(0, 1200))}</pre></details>` : ''}
    <button class="btn btn-primary btn-block" id="dSave">บันทึกเลย</button>
    <button class="btn btn-ghost btn-block" id="dCancel">ยกเลิก</button>
  `, (bodyEl) => {
    if (draft.file) {
      const url = URL.createObjectURL(draft.file);
      MJ.$('#slipImg', bodyEl).src = url;
    }
    bodyEl.querySelectorAll('#dType .seg-btn').forEach((b) => b.onclick = () => {
      draft.type = b.dataset.type;
      bodyEl.querySelectorAll('#dType .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      draft.category_id = null;
      MJ.$('#dCat', bodyEl).innerHTML = cats.filter((c) => c.type === draft.type)
        .map((c) => `<option value="${c.id}">${c.icon} ${MJ.esc(c.name)}</option>`).join('');
    });

    MJ.$('#dCancel', bodyEl).onclick = () => MJ.sheet.close();
    MJ.$('#dSave', bodyEl).onclick = async () => {
      const amount = parseFloat(MJ.$('#dAmount', bodyEl).value);
      if (!amount || amount <= 0) { MJ.toast('ใส่จำนวนเงินก่อนนะ', 'err'); return; }
      MJ.loading(true, 'กำลังบันทึก…');
      try {
        let receiptPath = null;
        if (draft.file) {
          try { receiptPath = await MJ.data.uploadReceipt(draft.file); }
          catch (e) { MJ.toast('อัปโหลดรูปสลิปไม่สำเร็จ แต่บันทึกรายการให้แล้ว', 'err'); }
        }
        await MJ.data.addTransaction({
          amount,
          type: draft.type,
          category_id: MJ.$('#dCat', bodyEl).value || null,
          note: MJ.$('#dNote', bodyEl).value.trim() || null,
          payee_name: MJ.$('#dPayee', bodyEl)?.value.trim() || draft.payee_name || null,
          transaction_date: new Date(MJ.$('#dDate', bodyEl).value),
          slip_reference: draft.slip_reference || null,
          receipt_image_url: receiptPath,
          source: draft.source || 'text',
          raw_input: draft.raw_input || null,
        });
        MJ.buzz(30);
        MJ.sheet.close();
        MJ.toast('บันทึกแล้ว 🐻', 'ok');
        if (MJ.add.tab === 'text' || MJ.add.tab === 'voice') {
          MJ.add.chat.push({ who: 'bot', text: 'บันทึกให้แล้วนะ! 🍯 จดต่อได้เลย' });
        }
        MJ.render();
      } catch (err) {
        MJ.toast(err.duplicate ? 'สลิปนี้ถูกบันทึกไปแล้ว' : ('บันทึกไม่สำเร็จ: ' + (err.message || err)), 'err');
      } finally { MJ.loading(false); }
    };
  });
};
