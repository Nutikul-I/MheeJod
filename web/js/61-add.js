/* ===================================================================
   61-add.js — หน้าจดรายการ 2 แท็บ
     1) แชท    — พิมพ์ + พูด + ส่งรูปสลิป รวมอยู่ในช่องเดียว
     2) กรอกเอง — แป้นตัวเลข + เลือกหมวด
   =================================================================== */
MJ.add = {
  tab: 'chat',
  chat: [],          // {who:'bot'|'me', text, img, imgs}
  recognizer: null,
  recording: false,
  form: { amount: '', type: 'expense', category_id: null, date: null, note: '' },
};

/* ---------------------- เก็บแชทย้อนหลังไว้ในเครื่อง ---------------------- */
MJ.add.CHAT_KEY = 'mj-chat';
MJ.add.loadChat = function () {
  try {
    const raw = localStorage.getItem(MJ.add.CHAT_KEY + ':' + (MJ.state.user?.id || 'guest'));
    if (raw) MJ.add.chat = JSON.parse(raw).slice(-60);
  } catch (e) { /* อ่านไม่ได้ก็เริ่มใหม่ */ }
};
MJ.add.saveChat = function () {
  try {
    // รูปเป็น blob: ที่หมดอายุเมื่อปิดหน้า จึงเก็บแค่ข้อความ
    const keep = MJ.add.chat.slice(-60).map((m) => ({
      who: m.who,
      text: m.text || (m.imgs?.length ? `🧾 ส่งสลิป ${m.imgs.length} ใบ` : (m.img ? '🧾 ส่งสลิป' : '')),
      at: m.at || Date.now(),
    })).filter((m) => m.text);
    localStorage.setItem(MJ.add.CHAT_KEY + ':' + (MJ.state.user?.id || 'guest'), JSON.stringify(keep));
  } catch (e) { /* เต็มก็ข้ามไป */ }
};

MJ.routes.add = (view) => {
  const p = MJ.state.routeParams || {};
  if (p.tab) MJ.add.tab = (p.tab === 'form' ? 'form' : 'chat');
  const action = p.action || null;      // 'voice' | 'slip'
  MJ.state.routeParams = {};

  if (!MJ.add.chat.length) MJ.add.loadChat();
  if (!MJ.add.chat.length) {
    MJ.add.chat = [{ who: 'bot', text: 'สวัสดี! บอกหมีได้เลย 🐻\n• พิมพ์ “กินกาแฟ 80”\n• กดไมค์แล้วพูด\n• หรือส่งรูปสลิปมาให้หมีอ่าน' }];
  }

  view.innerHTML = `
    <div class="seg" id="addTabs">
      <button class="seg-btn" data-tab="chat"><i class="fa fa-comment"></i> แชท</button>
      <button class="seg-btn" data-tab="form"><i class="fa fa-keyboard"></i> กรอกเอง</button>
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

/**
 * ปุ่มลัดในหน้าแชท — สร้างจากรายการที่ผู้ใช้จดบ่อยที่สุด (ชื่อ+ยอดเดิม)
 * ถ้ายังไม่มีข้อมูลพอ ค่อยเติมตัวอย่างมาตรฐาน
 */
MJ.add.quickChips = function () {
  const freq = new Map();
  MJ.state.transactions.forEach((t) => {
    const note = MJ.fixThai(t.note || MJ.data.catById(t.category_id)?.name || '');
    if (!note || note.length > 22) return;
    const amt = Math.round(Number(t.amount));
    if (!amt) return;
    const key = `${t.type}|${note}|${amt}`;
    const cur = freq.get(key) || { note, amt, type: t.type, n: 0, last: 0,
      icon: MJ.data.catById(t.category_id)?.icon || '' };
    cur.n++;
    cur.last = Math.max(cur.last, new Date(t.transaction_date).getTime());
    freq.set(key, cur);
  });

  const top = Array.from(freq.values())
    .sort((a, b) => (b.n - a.n) || (b.last - a.last))
    .slice(0, 8)
    .map((x) => ({
      icon: x.icon,
      label: `${x.note} ${MJ.fmtMoney(x.amt)}`,
      text: `${x.type === 'income' ? 'รับ ' : ''}${x.note} ${x.amt}`,
    }));

  if (top.length >= 4) return top;
  const defaults = [
    { icon: '🍜', label: 'ข้าวเที่ยง 60', text: 'ข้าวเที่ยง 60' },
    { icon: '☕', label: 'กาแฟ 60', text: 'กาแฟ 60' },
    { icon: '🚕', label: 'ค่าแท็กซี่ 120', text: 'ค่าแท็กซี่ 120' },
    { icon: '🛒', label: 'ของใช้ 200', text: 'ซื้อของใช้ 200' },
    { icon: '💰', label: 'รับเงินเดือน', text: 'รับเงินเดือน 25000' },
  ];
  const firstWord = (x) => x.label.split(' ')[0];
  return top.concat(defaults.filter((d) => !top.some((t) => firstWord(t) === firstWord(d)))).slice(0, 8);
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
    <div class="chips scroll" id="samples">
      ${MJ.add.quickChips().map((c) => `<button class="chip mini" data-s="${MJ.esc(c.text)}">
        ${c.icon ? `<span class="ic">${c.icon}</span>` : ''}${MJ.esc(c.label)}</button>`).join('')}
    </div>
    <div class="composer">
      <button class="rnd" id="btnSlip" title="ส่งรูปสลิป"><i class="fa fa-images"></i></button>
      <textarea id="chatInput" rows="1" placeholder="พิมพ์ พูด หรือส่งสลิป…"></textarea>
      <button class="rnd" id="btnMic" title="พูด"><i class="fa fa-mic"></i></button>
      <button class="rnd send" id="btnSend" title="ส่ง"><i class="fa fa-send"></i></button>
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
    if (files.length) MJ.add.processSlips(files);
  };
  body.querySelectorAll('#samples .chip').forEach((c) => c.onclick = () => { input.value = c.dataset.s; submitText(); });

  scrollChat(box);
  MJ.add.pushBubble = pushBubble;   // ให้ processSlip เรียกใช้ได้

  if (action === 'voice') setTimeout(() => MJ.add.toggleVoice(input), 350);
  if (action === 'slip') setTimeout(() => fileInput.click(), 250);

  function pushBubble(who, text, img, imgs) {
    const msg = { who, text, img: img || null, imgs: imgs || null, at: Date.now() };
    MJ.add.chat.push(msg);
    if (MJ.add.chat.length > 60) MJ.add.chat.splice(0, MJ.add.chat.length - 60);
    box.insertAdjacentHTML('beforeend', bubbleHTML(msg));
    scrollChat(box);
    MJ.add.saveChat();
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
  // รูปหลายใบ -> เรียงเป็นตารางในบับเบิลเดียว เหมือนส่งอัลบั้มในแชท
  if (m.imgs && m.imgs.length) {
    const cols = m.imgs.length === 1 ? 1 : (m.imgs.length === 2 ? 2 : 3);
    const grid = `<div class="img-grid" style="grid-template-columns:repeat(${cols},1fr)">
      ${m.imgs.map((u, i) => `<img src="${u}" alt="สลิปใบที่ ${i + 1}" loading="lazy">`).join('')}</div>`;
    return `<div class="bubble ${m.who} has-img">${grid}${m.text ? MJ.esc(m.text) : ''}</div>`;
  }
  const img = m.img ? `<img src="${m.img}" alt="สลิป" style="width:100%;border-radius:14px;margin-bottom:${m.text ? '7px' : '0'}">` : '';
  return `<div class="bubble ${m.who} ${m.img ? 'has-img' : ''}">${img}${m.text ? MJ.esc(m.text) : ''}</div>`;
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

/* ============================ สลิปหลายใบพร้อมกัน ============================ */
/**
 * เลือกรูปได้ทีละหลายใบเหมือนแชท:
 *   - รูปขึ้นในแชททันทีทุกใบ
 *   - อ่านทีละใบพร้อมบอกความคืบหน้า
 *   - ใบเดียว -> เปิดหน้ายืนยันแบบเดิม, หลายใบ -> เปิดหน้ารวมให้ตรวจทีเดียวแล้วบันทึกรวด
 */
MJ.add.processSlips = async function (files) {
  if (files.length === 1) return MJ.add.processSlip(files[0]);

  const items = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
  MJ.add.pushBubble && MJ.add.pushBubble('me', '', null, items.map((it) => it.url));
  MJ.add.pushBubble && MJ.add.pushBubble('bot', `ได้รับสลิป ${files.length} ใบ กำลังอ่านให้นะ… 🐻`);

  const drafts = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    MJ.loading(true, `กำลังอ่านสลิปใบที่ ${i + 1}/${items.length}…`);
    try {
      const draft = await MJ.slip.analyze(it.file, (msg) => MJ.loading(true, `(${i + 1}/${items.length}) ${msg}`));
      draft.file = it.file;
      draft.previewUrl = it.url;
      drafts.push(draft);
    } catch (err) {
      drafts.push({ file: it.file, previewUrl: it.url, error: err.message || String(err),
        amount: null, type: 'expense', transaction_date: new Date(), source: 'slip' });
    }
  }
  MJ.loading(false);

  // เช็กสลิปซ้ำทีเดียวทั้งชุด (รวมทั้งซ้ำกันเองในชุดนี้)
  const refs = drafts.map((d) => d.slip_reference).filter(Boolean);
  let existing = new Set();
  if (refs.length) {
    const { data } = await MJ.sb.from('transactions').select('slip_reference').in('slip_reference', refs);
    existing = new Set((data || []).map((r) => r.slip_reference));
  }
  const seen = new Set();
  drafts.forEach((d) => {
    d.duplicate = !!(d.slip_reference && (existing.has(d.slip_reference) || seen.has(d.slip_reference)));
    if (d.slip_reference) seen.add(d.slip_reference);
    d.include = !d.duplicate;
  });

  const dupCount = drafts.filter((d) => d.duplicate).length;
  const readOk = drafts.filter((d) => d.amount).length;
  MJ.add.pushBubble && MJ.add.pushBubble('bot',
    `อ่านเสร็จแล้ว! อ่านยอดได้ ${readOk}/${drafts.length} ใบ`
    + (dupCount ? `\n⚠️ มี ${dupCount} ใบที่เคยบันทึกแล้ว หมีติ๊กออกให้` : '')
    + '\nตรวจดูแล้วกดบันทึกรวดเดียวได้เลย');

  MJ.add.openBatchSheet(drafts);
};

MJ.add.openBatchSheet = function (drafts) {
  const cats = MJ.state.categories;
  const catOptions = (type, selected) => cats.filter((c) => c.type === type)
    .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.icon} ${MJ.esc(c.name)}</option>`).join('');

  const rows = drafts.map((d, i) => `
    <div class="batch-row ${d.include ? '' : 'off'}" data-i="${i}">
      <div class="batch-head">
        <img src="${d.previewUrl}" alt="สลิป ${i + 1}">
        <div class="batch-sum">
          <b>ใบที่ ${i + 1}${d.payee_name ? ' • ' + MJ.esc(d.payee_name) : ''}</b>
          <small>${d.duplicate ? '⚠️ เคยบันทึกแล้ว'
            : (d.error ? '⚠️ อ่านไม่สำเร็จ'
            : `${d.hasQR ? '✅ มี QR' : '⚠️ ไม่พบ QR'} • ${d.dateFromSlip ? 'วันที่จากสลิป' : 'ใช้วันนี้'}`)}</small>
        </div>
        <div class="switch ${d.include ? 'on' : ''}" data-toggle="${i}"><i></i></div>
      </div>
      <div class="batch-fields">
        <div class="row">
          <label class="field"><span>จำนวนเงิน</span>
            <input type="number" step="0.01" inputmode="decimal" data-f="amount" value="${d.amount ?? ''}" placeholder="0.00"></label>
          <label class="field"><span>หมวดหมู่</span>
            <select data-f="category">${catOptions(d.type || 'expense', d.category_id)}</select></label>
        </div>
        <label class="field"><span>วันและเวลา</span>
          <input type="datetime-local" data-f="date" value="${MJ.isoLocal(new Date(d.transaction_date))}"></label>
      </div>
    </div>`).join('');

  MJ.sheet.open(`ตรวจสลิป ${drafts.length} ใบ`, `
    <div id="batchList">${rows}</div>
    <div class="batch-total card">
      <div class="card-head" style="margin:0">
        <h3>รวมที่จะบันทึก</h3>
        <span class="tx-amt out" id="batchTotal">฿0</span>
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="batchSave">บันทึกทั้งหมด</button>
    <button class="btn btn-ghost btn-block" id="batchCancel">ยกเลิก</button>
  `, (body) => {
    const recalc = () => {
      let sum = 0, n = 0;
      drafts.forEach((d, i) => {
        const row = body.querySelector(`.batch-row[data-i="${i}"]`);
        const amt = parseFloat(MJ.$('[data-f="amount"]', row).value);
        if (d.include && amt > 0) { sum += amt; n++; }
      });
      MJ.$('#batchTotal', body).textContent = MJ.fmtBaht(sum);
      MJ.$('#batchSave', body).textContent = n ? `บันทึก ${n} รายการ • ${MJ.fmtBaht(sum)}` : 'ยังไม่ได้เลือกรายการ';
      MJ.$('#batchSave', body).disabled = !n;
      MJ.$('#batchSave', body).style.opacity = n ? '1' : '.5';
    };

    body.querySelectorAll('[data-toggle]').forEach((sw) => sw.onclick = () => {
      const i = +sw.dataset.toggle;
      drafts[i].include = !drafts[i].include;
      sw.classList.toggle('on', drafts[i].include);
      body.querySelector(`.batch-row[data-i="${i}"]`).classList.toggle('off', !drafts[i].include);
      MJ.buzz(8);
      recalc();
    });
    body.querySelectorAll('[data-f="amount"]').forEach((el) => el.oninput = recalc);
    recalc();

    MJ.$('#batchCancel', body).onclick = () => MJ.sheet.close();
    MJ.$('#batchSave', body).onclick = async () => {
      const chosen = drafts.map((d, i) => ({ d, i })).filter(({ d }) => d.include);
      let saved = 0, failed = 0, total = 0;
      for (let k = 0; k < chosen.length; k++) {
        const { d, i } = chosen[k];
        const row = body.querySelector(`.batch-row[data-i="${i}"]`);
        const amount = parseFloat(MJ.$('[data-f="amount"]', row).value);
        if (!amount || amount <= 0) { failed++; continue; }
        MJ.loading(true, `กำลังบันทึก ${k + 1}/${chosen.length}…`);
        try {
          let receiptPath = null;
          try { receiptPath = await MJ.data.uploadReceipt(d.file); } catch (e) { /* ไม่มีรูปก็ยังบันทึกได้ */ }
          await MJ.data.addTransaction({
            amount,
            type: d.type || 'expense',
            category_id: MJ.$('[data-f="category"]', row).value || null,
            note: d.note || (d.payee_name ? `โอนให้ ${d.payee_name}` : 'จ่ายผ่านสลิป'),
            payee_name: d.payee_name || null,
            transaction_date: new Date(MJ.$('[data-f="date"]', row).value),
            slip_reference: d.slip_reference || null,
            receipt_image_url: receiptPath,
            source: 'slip',
            raw_input: d.raw_input || null,
          });
          saved++; total += amount;
        } catch (err) { failed++; }
      }
      MJ.loading(false);
      MJ.sheet.close();
      MJ.buzz(30);
      drafts.forEach((d) => { try { URL.revokeObjectURL(d.previewUrl); } catch (e) {} });
      MJ.toast(`บันทึกแล้ว ${saved} รายการ 🐻`, saved ? 'ok' : 'err');
      MJ.add.chat.push({ who: 'bot',
        text: `บันทึกให้แล้ว ${saved} รายการ รวม ${MJ.fmtBaht(total)} 🍯` + (failed ? `\n(ข้าม ${failed} ใบที่ยอดยังว่างหรือบันทึกไม่สำเร็จ)` : '') });
      MJ.render();
    };
  });
};

/* ============================ สลิปใบเดียว ============================ */
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
      <button class="seg-btn ${f.type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> รายจ่าย</button>
      <button class="seg-btn ${f.type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> รายรับ</button>
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
      <button class="seg-btn ${draft.type === 'expense' ? 'active' : ''}" data-type="expense"><i class="fa fa-arrow-up"></i> รายจ่าย</button>
      <button class="seg-btn ${draft.type === 'income' ? 'active' : ''}" data-type="income"><i class="fa fa-arrow-down"></i> รายรับ</button>
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
