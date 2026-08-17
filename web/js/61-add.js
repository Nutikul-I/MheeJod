/* ===================================================================
   61-add.js — หน้าจดรายการ 2 แท็บ
     1) แชท    — พิมพ์ + พูด + ส่งรูปสลิป รวมอยู่ในช่องเดียว
     2) กรอกเอง — แป้นตัวเลข + เลือกหมวด
   =================================================================== */
MJ.add = {
  tab: 'chat',
  chat: [],          // {who:'bot'|'me', text, img}
  recognizer: null,
  recording: false,
  form: { amount: '', type: 'expense', category_id: null, date: null, note: '' },
};

MJ.routes.add = (view) => {
  const p = MJ.state.routeParams || {};
  if (p.tab) MJ.add.tab = (p.tab === 'form' ? 'form' : 'chat');
  const action = p.action || null;      // 'voice' | 'slip'
  MJ.state.routeParams = {};

  if (!MJ.add.chat.length) {
    MJ.add.chat = [{ who: 'bot', text: 'สวัสดี! บอกหมีได้เลย 🐻\n• พิมพ์ “กินกาแฟ 80”\n• กดไมค์แล้วพูด\n• หรือส่งรูปสลิปมาให้หมีอ่าน' }];
  }

  view.innerHTML = `
    <div class="seg" id="addTabs">
      <button class="seg-btn" data-tab="chat">💬 แชท</button>
      <button class="seg-btn" data-tab="form">⌨️ กรอกเอง</button>
    </div>
    <div id="addBody"></div>`;

  view.querySelectorAll('#addTabs .seg-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === MJ.add.tab));
  MJ.segInit(MJ.$('#addTabs', view), (b) => { MJ.add.tab = b.dataset.tab; MJ.render(); });

  const body = MJ.$('#addBody', view);
  document.body.classList.toggle('chat-open', MJ.add.tab === 'chat');
  if (MJ.add.tab === 'form') {
    const dock = MJ.$('#composerDock');
    dock.classList.add('hidden'); dock.innerHTML = '';
    renderForm(body);
  } else {
    renderChat(body, action);
  }
};

/* ============================ แท็บแชท ============================ */
function renderChat(body, action) {
  // ข้อความอยู่ในหน้า ส่วนแถบพิมพ์ตรึงติดด้านล่างเหมือนแอปแชท
  body.innerHTML = `
    <div class="chat" id="chatBox">
      ${MJ.add.chat.map(bubbleHTML).join('')}
    </div>`;

  const dock = MJ.$('#composerDock');
  dock.classList.remove('hidden');
  dock.innerHTML = `
    <div class="chips" id="samples" style="max-width:var(--wrap);margin:0 auto 8px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px">
      <button class="chip" data-s="กินข้าวเที่ยง 60">กินข้าวเที่ยง 60</button>
      <button class="chip" data-s="ค่าแท็กซี่ 120">ค่าแท็กซี่ 120</button>
      <button class="chip" data-s="รับเงินเดือน 25000">รับเงินเดือน 25000</button>
      <button class="chip" data-s="เมื่อวาน ค่าไฟ 850">เมื่อวาน ค่าไฟ 850</button>
    </div>
    <div class="composer">
      <button class="rnd" id="btnSlip" title="ส่งรูปสลิป">🧾</button>
      <textarea id="chatInput" rows="1" placeholder="พิมพ์ พูด หรือส่งสลิป…"></textarea>
      <button class="rnd" id="btnMic" title="พูด">🎤</button>
      <button class="rnd send" id="btnSend" title="ส่ง">➤</button>
    </div>
    <input type="file" id="slipFile" accept="image/*" hidden multiple>`;

  const box = MJ.$('#chatBox', body);
  const input = MJ.$('#chatInput', dock);
  const fileInput = MJ.$('#slipFile', dock);
  body = dock;   // ปุ่มทั้งหมดอยู่ใน dock

  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; };
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } };
  MJ.$('#btnSend', body).onclick = submitText;
  MJ.$('#btnMic', body).onclick = () => MJ.add.toggleVoice(input);
  MJ.$('#btnSlip', body).onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    files.forEach((f, i) => setTimeout(() => MJ.add.processSlip(f), i * 250));
  };
  body.querySelectorAll('#samples .chip').forEach((c) => c.onclick = () => { input.value = c.dataset.s; submitText(); });

  scrollChat(box);
  MJ.add.pushBubble = pushBubble;   // ให้ processSlip เรียกใช้ได้

  if (action === 'voice') setTimeout(() => MJ.add.toggleVoice(input), 350);
  if (action === 'slip') setTimeout(() => fileInput.click(), 250);

  function pushBubble(who, text, img) {
    const msg = { who, text, img: img || null };
    MJ.add.chat.push(msg);
    if (MJ.add.chat.length > 40) MJ.add.chat.splice(0, MJ.add.chat.length - 40);
    box.insertAdjacentHTML('beforeend', bubbleHTML(msg));
    scrollChat(box);
    return msg;
  }

  function submitText() {
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto';
    pushBubble('me', text);
    const draft = MJ.nlp.parse(text);
    if (!draft || !draft.amount) {
      pushBubble('bot', 'หมีหาจำนวนเงินไม่เจอ ลองใส่ตัวเลขด้วยนะ เช่น “กินข้าว 80” 🐻');
      return;
    }
    pushBubble('bot', 'เข้าใจแล้ว!\n' + MJ.nlp.describe(draft));
    MJ.add.openDraftSheet(draft);
  }
}

function bubbleHTML(m) {
  const img = m.img ? `<img src="${m.img}" alt="สลิป" style="width:100%;border-radius:12px;margin-bottom:${m.text ? '6px' : '0'}">` : '';
  return `<div class="bubble ${m.who}" ${m.img ? 'style="max-width:66%"' : ''}>${img}${m.text ? MJ.esc(m.text) : ''}</div>`;
}

function scrollChat(box) {
  box.scrollTop = box.scrollHeight;
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
}

/* ============================ พูด (ใช้ในแท็บแชท) ============================ */
MJ.add.toggleVoice = function (input) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { MJ.toast('เบราว์เซอร์นี้ยังไม่รองรับการพูด ลองพิมพ์แทนนะ', 'err'); return; }
  if (MJ.add.recording) { try { MJ.add.recognizer.stop(); } catch (e) {} return; }

  const rec = new SR();
  rec.lang = 'th-TH';
  rec.interimResults = true;
  rec.continuous = false;
  MJ.add.recognizer = rec;
  MJ.add.recording = true;
  MJ.buzz(20);
  MJ.$$('#btnMic').forEach((b) => b.classList.add('rec'));
  if (input) input.placeholder = 'กำลังฟัง… พูดได้เลย';

  rec.onresult = (e) => {
    const txt = Array.from(e.results).map((r) => r[0].transcript).join('');
    if (input) { input.value = txt; input.dispatchEvent(new Event('input')); }
  };
  rec.onerror = (e) => {
    MJ.toast(e.error === 'not-allowed' ? 'ไม่ได้รับอนุญาตให้ใช้ไมค์' : 'ฟังไม่ชัด ลองใหม่อีกที', 'err');
  };
  rec.onend = () => {
    MJ.add.recording = false;
    MJ.$$('#btnMic').forEach((b) => b.classList.remove('rec'));
    if (input) input.placeholder = 'พิมพ์ พูด หรือส่งสลิป…';
    const txt = input?.value.trim();
    if (!txt) return;
    input.value = ''; input.style.height = 'auto';
    MJ.add.pushBubble && MJ.add.pushBubble('me', '🎤 ' + txt);
    const draft = MJ.nlp.parse(txt);
    if (draft) draft.source = 'voice';
    if (draft?.amount) {
      MJ.add.pushBubble && MJ.add.pushBubble('bot', 'เข้าใจแล้ว!\n' + MJ.nlp.describe(draft));
      MJ.add.openDraftSheet(draft);
    } else {
      MJ.add.pushBubble && MJ.add.pushBubble('bot', 'ไม่เจอจำนวนเงิน ลองพูดใหม่พร้อมตัวเลขนะ 🐻');
    }
  };
  try { rec.start(); } catch (e) { MJ.add.recording = false; }
};

/* ============================ สลิป (ใช้ในแท็บแชท) ============================ */
MJ.add.processSlip = async function (file) {
  const url = URL.createObjectURL(file);
  if (MJ.add.pushBubble) MJ.add.pushBubble('me', '', url);
  MJ.loading(true, 'กำลังเปิดสลิป…');
  try {
    const draft = await MJ.slip.analyze(file, (msg) => MJ.loading(true, msg));
    draft.file = file;
    MJ.loading(false);

    if (draft.slip_reference) {
      const { data: dup } = await MJ.sb.from('transactions').select('id, amount, transaction_date')
        .eq('slip_reference', draft.slip_reference).maybeSingle();
      if (dup) {
        const msg = `สลิปนี้บันทึกไปแล้วเมื่อ ${MJ.dayLabel(dup.transaction_date)} (${MJ.fmtBaht(dup.amount)}) 🐻`;
        MJ.add.pushBubble && MJ.add.pushBubble('bot', msg);
        MJ.toast('สลิปซ้ำ ไม่บันทึกซ้ำให้นะ', 'err');
        return;
      }
    }

    const when = draft.dateFromSlip
      ? `${MJ.dayLabel(draft.transaction_date)} ${MJ.timeLabel(draft.transaction_date)} (จากสลิป)`
      : 'อ่านวันที่ไม่ได้ ใช้วันนี้ไปก่อน';
    const summary = draft.amount
      ? `อ่านสลิปได้แล้ว!\n${draft.hasQR ? '✅ มี QR — กันบันทึกซ้ำให้' : '⚠️ ไม่พบ QR บนสลิป'}\n`
        + `${draft.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ${MJ.fmtBaht(draft.amount)}`
        + `${draft.payee_name ? ' • ' + draft.payee_name : ''}\n📅 ${when}`
      : `อ่านยอดเงินไม่ชัด ใส่เองได้เลยนะ 🐻\n📅 ${when}`;
    MJ.add.pushBubble && MJ.add.pushBubble('bot', summary);

    MJ.add.openDraftSheet(draft, { slip: true });
  } catch (err) {
    MJ.loading(false);
    MJ.add.pushBubble && MJ.add.pushBubble('bot', 'อ่านสลิปไม่สำเร็จ: ' + (err.message || err));
    MJ.toast('อ่านสลิปไม่สำเร็จ', 'err');
  }
};

/* ============================ แท็บกรอกเอง ============================ */
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

  MJ.segInit(MJ.$('#typeSeg', body), (b) => {
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
    <label class="field"><span>วันและเวลา${opts.slip ? (draft.dateFromSlip ? ' <span class="badge in">อ่านจากสลิป</span>' : ' <span class="badge out">อ่านไม่ได้ ใช้วันนี้</span>') : ''}</span>
      <input type="datetime-local" id="dDate" value="${MJ.isoLocal(new Date(draft.transaction_date))}"></label>
    ${draft.ocrText ? `<details class="mb"><summary class="tiny muted">ดูข้อความที่อ่านได้จากสลิป</summary>
      <pre class="tiny muted" style="white-space:pre-wrap;max-height:150px;overflow:auto">${MJ.esc(draft.ocrText.slice(0, 1200))}</pre></details>` : ''}
    <button class="btn btn-primary btn-block" id="dSave">บันทึกเลย</button>
    <button class="btn btn-ghost btn-block" id="dCancel">ยกเลิก</button>
  `, (bodyEl) => {
    if (draft.file) MJ.$('#slipImg', bodyEl).src = URL.createObjectURL(draft.file);

    MJ.segInit(MJ.$('#dType', bodyEl), (b) => {
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
        MJ.add.chat.push({ who: 'bot', text: 'บันทึกให้แล้วนะ! 🍯 จดต่อได้เลย' });
        MJ.render();
      } catch (err) {
        MJ.toast(err.duplicate ? 'สลิปนี้ถูกบันทึกไปแล้ว' : ('บันทึกไม่สำเร็จ: ' + (err.message || err)), 'err');
      } finally { MJ.loading(false); }
    };
  });
};
