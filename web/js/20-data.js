/* ===================================================================
   20-data.js — ชั้นข้อมูล: โหลด/บันทึก/ลบ + สรุปยอด + อัปโหลดสลิป
   =================================================================== */
MJ.data = {
  /* ---------------------- โหลดข้อมูลทั้งหมดของเดือน ---------------------- */
  async loadAll() {
    const uid = MJ.state.user.id;

    const [profile, cats, accounts] = await Promise.all([
      MJ.sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      MJ.sb.from('categories').select('*').eq('user_id', uid).eq('is_archived', false)
        .order('type').order('sort_order').order('name'),
      MJ.sb.from('accounts').select('*').eq('user_id', uid).eq('is_archived', false)
        .order('sort_order').order('name'),
    ]);

    if (profile.data) MJ.state.profile = profile.data;
    else {
      // เผื่อ trigger ไม่ทำงาน (เช่นผู้ใช้ที่มีอยู่ก่อน) สร้าง profile ให้เอง
      const { data } = await MJ.sb.from('profiles')
        .insert({ id: uid, email: MJ.state.user.email, display_name: MJ.state.user.email.split('@')[0] })
        .select().maybeSingle();
      MJ.state.profile = data || { id: uid, display_name: 'หมีน้อย', theme: 'auto' };
    }
    MJ.state.categories = cats.data || [];
    MJ.state.accounts = accounts.data || [];
    if (!MJ.state.accounts.length) {
      // ผู้ใช้เก่าที่ยังไม่มีกระเป๋า สร้างให้อัตโนมัติ
      await MJ.sb.from('accounts').insert([
        { user_id: uid, name: 'เงินสด', type: 'cash', icon: '👛', color: '#F2B23E', is_default: true, sort_order: 1 },
        { user_id: uid, name: 'ธนาคาร', type: 'bank', icon: '🏦', color: '#4A9DF2', sort_order: 2 },
      ]);
      const { data } = await MJ.sb.from('accounts').select('*').eq('user_id', uid).order('sort_order');
      MJ.state.accounts = data || [];
    }

    await Promise.all([this.loadMonth(), this.loadRecurring(), this.loadBalances()]);
  },

  async loadMonth() {
    const from = MJ.startOfMonth(MJ.state.month), to = MJ.endOfMonth(MJ.state.month);
    const { data, error } = await MJ.sb.from('transactions')
      .select('*')
      .gte('transaction_date', from.toISOString())
      .lte('transaction_date', to.toISOString())
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { MJ.toast('โหลดรายการไม่สำเร็จ', 'err'); return; }
    MJ.state.transactions = data || [];
    if (MJ.plan) await MJ.plan.load();
  },

  async loadAllAccounts() {
    const { data } = await MJ.sb.from('accounts').select('*')
      .eq('user_id', MJ.state.user.id).eq('is_archived', false).order('sort_order').order('name');
    MJ.state.accounts = data || [];
    await this.loadBalances();
    return MJ.state.accounts;
  },

  async loadBalances() {
    const { data } = await MJ.sb.rpc('account_balances');
    MJ.state.balances = {};
    (data || []).forEach((r) => { MJ.state.balances[r.account_id] = Number(r.balance); });
    return MJ.state.balances;
  },

  accountById(id) { return (MJ.state.accounts || []).find((a) => a.id === id) || null; },
  defaultAccount() {
    const list = MJ.state.accounts || [];
    return list.find((a) => a.is_default) || list[0] || null;
  },

  /**
   * กระเป๋าที่ควรใช้กับสลิปโอนเงิน — เงินจากสลิปมาจากบัญชีธนาคาร ไม่ใช่เงินสด
   * ถ้าอ่านชื่อธนาคารจาก QR ได้ จะจับคู่กับชื่อกระเป๋าให้ก่อน (เช่น "ธ.กสิกรไทย" -> กระเป๋า "กสิกร")
   */
  bankAccount(bankHint) {
    const list = (MJ.state.accounts || []).filter((a) => !a.is_archived);
    if (!list.length) return null;
    if (bankHint) {
      const words = String(bankHint).replace(/^ธ\.?/, '').replace(/ธนาคาร/g, '').trim();
      const hit = list.find((a) => words && (a.name.includes(words) || words.includes(a.name)));
      if (hit) return hit;
    }
    return list.find((a) => a.type === 'bank')
      || list.find((a) => a.type === 'credit' || a.type === 'savings' || a.type === 'ewallet')
      || this.defaultAccount();
  },

  async loadRecurring() {
    const { data } = await MJ.sb.from('recurring_transactions').select('*').order('next_run_date');
    MJ.state.recurring = data || [];
  },

  /* ---------------------- ประมวลผลรายการประจำ ---------------------- */
  async runRecurring() {
    try {
      const { data, error } = await MJ.sb.rpc('process_recurring', { p_user: MJ.state.user.id });
      if (error) return 0;
      if (data > 0) {
        await this.loadMonth();
        MJ.toast(`บันทึกรายการประจำให้แล้ว ${data} รายการ 🐻`, 'ok');
      }
      return data || 0;
    } catch (e) { return 0; }
  },

  /* ---------------------- CRUD transactions ---------------------- */
  async addTransaction(tx) {
    const payload = {
      user_id: MJ.state.user.id,
      category_id: tx.category_id || null,
      account_id: tx.account_id !== undefined ? tx.account_id : (this.defaultAccount()?.id || null),
      to_account_id: tx.to_account_id || null,
      kind: tx.kind || 'normal',
      tags: tx.tags || [],
      amount: Number(tx.amount),
      type: tx.type,
      note: tx.note ? MJ.fixThai(tx.note) : null,
      transaction_date: (tx.transaction_date instanceof Date ? tx.transaction_date : new Date(tx.transaction_date || Date.now())).toISOString(),
      receipt_image_url: tx.receipt_image_url || null,
      slip_reference: tx.slip_reference || null,
      image_hash: tx.image_hash || null,
      payee_name: tx.payee_name ? MJ.fixThai(tx.payee_name) : null,
      source: tx.source || 'manual',
      raw_input: tx.raw_input || null,
    };
    let data, error;
    if (!navigator.onLine) {
      // ออฟไลน์: เก็บเข้าคิวไว้ก่อน แล้วแสดงผลทันที
      return MJ.queue.push('insert', payload);
    }
    ({ data, error } = await MJ.sb.from('transactions').insert(payload).select().maybeSingle());
    if (error) {
      if (/duplicate key|transactions_user_slip_key/i.test(error.message)) {
        const e = new Error('สลิปนี้ถูกบันทึกไปแล้ว');
        e.duplicate = true; throw e;
      }
      if (/fetch|network|Failed to send/i.test(error.message || '')) return MJ.queue.push('insert', payload);
      throw error;
    }
    // จำร้าน/ผู้รับโอน เพื่อเดาหมวดครั้งหน้า
    if (tx.payee_name && tx.category_id) this.rememberMerchant(tx.payee_name, tx.category_id);
    if (payload.image_hash) this.rememberHash(payload.image_hash);
    const d = new Date(data.transaction_date);
    if (d >= MJ.startOfMonth(MJ.state.month) && d <= MJ.endOfMonth(MJ.state.month)) {
      MJ.state.transactions.unshift(data);
      MJ.state.transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    }
    return data;
  },

  async updateTransaction(id, patch) {
    const { data, error } = await MJ.sb.from('transactions').update(patch).eq('id', id).select().maybeSingle();
    if (error) throw error;
    const i = MJ.state.transactions.findIndex((t) => t.id === id);
    if (i > -1) MJ.state.transactions[i] = data;
    return data;
  },

  async deleteTransaction(id, opts) {
    const snapshot = MJ.state.transactions.find((t) => t.id === id) || null;
    const { error } = await MJ.sb.from('transactions').delete().eq('id', id);
    if (error) throw error;
    MJ.state.transactions = MJ.state.transactions.filter((t) => t.id !== id);

    // ลบไฟล์สลิปทิ้งด้วย ไม่ให้ค้างกินพื้นที่ (เว้นตอนที่ยังอาจกดเลิกทำ)
    if (snapshot?.receipt_image_url && !opts?.keepFile) {
      MJ.sb.storage.from('receipts').remove([snapshot.receipt_image_url]).catch(() => {});
    }
    return snapshot;
  },

  /** เอารายการที่เพิ่งลบกลับคืน (ใช้กับปุ่มเลิกทำ) */
  async restoreTransaction(snap) {
    if (!snap) return null;
    const { id, created_at, updated_at, ...rest } = snap;
    const { data, error } = await MJ.sb.from('transactions').insert(rest).select().maybeSingle();
    if (error) throw error;
    MJ.state.transactions.push(data);
    MJ.state.transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    return data;
  },

  /** ลบหลายรายการพร้อมกัน */
  async deleteMany(ids) {
    const snaps = MJ.state.transactions.filter((t) => ids.includes(t.id));
    const { error } = await MJ.sb.from('transactions').delete().in('id', ids);
    if (error) throw error;
    MJ.state.transactions = MJ.state.transactions.filter((t) => !ids.includes(t.id));
    const files = snaps.map((t) => t.receipt_image_url).filter(Boolean);
    if (files.length) MJ.sb.storage.from('receipts').remove(files).catch(() => {});
    return snaps;
  },

  /** เปลี่ยนหมวดหลายรายการพร้อมกัน */
  async setCategoryMany(ids, categoryId) {
    const { error } = await MJ.sb.from('transactions').update({ category_id: categoryId }).in('id', ids);
    if (error) throw error;
    MJ.state.transactions.forEach((t) => { if (ids.includes(t.id)) t.category_id = categoryId; });
  },

  /** ค้นหาข้ามทุกเดือน */
  async searchAll(q, opts) {
    const o = Object.assign({ limit: 200 }, opts || {});
    let query = MJ.sb.from('transactions').select('*')
      .order('transaction_date', { ascending: false }).limit(o.limit);
    if (o.from) query = query.gte('transaction_date', new Date(o.from).toISOString());
    if (o.to) query = query.lte('transaction_date', new Date(o.to + 'T23:59:59').toISOString());
    if (o.type && o.type !== 'all') query = query.eq('type', o.type);
    if (o.category && o.category !== 'all') query = query.eq('category_id', o.category);
    if (o.account && o.account !== 'all') query = query.eq('account_id', o.account);
    if (q) {
      const like = `%${q}%`;
      query = query.or(`note.ilike.${like},payee_name.ilike.${like}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /* ---------------------- CRUD categories ---------------------- */
  async saveCategory(cat) {
    const payload = {
      user_id: MJ.state.user.id,
      name: cat.name.trim(),
      type: cat.type,
      icon: cat.icon || '🐻',
      color: cat.color || '#F2B23E',
      budget_limit: cat.budget_limit === '' || cat.budget_limit == null ? null : Number(cat.budget_limit),
      keywords: cat.keywords || [],
    };
    const q = cat.id
      ? MJ.sb.from('categories').update(payload).eq('id', cat.id)
      : MJ.sb.from('categories').insert(payload);
    const { data, error } = await q.select().maybeSingle();
    if (error) throw error;
    const i = MJ.state.categories.findIndex((c) => c.id === data.id);
    if (i > -1) MJ.state.categories[i] = data; else MJ.state.categories.push(data);
    return data;
  },

  async archiveCategory(id) {
    const { error } = await MJ.sb.from('categories').update({ is_archived: true }).eq('id', id);
    if (error) throw error;
    MJ.state.categories = MJ.state.categories.filter((c) => c.id !== id);
  },

  /* ---------------------- CRUD recurring ---------------------- */
  async saveRecurring(r) {
    const payload = {
      user_id: MJ.state.user.id,
      category_id: r.category_id || null,
      amount: Number(r.amount),
      type: r.type,
      note: r.note || null,
      frequency: r.frequency,
      next_run_date: r.next_run_date,
      is_active: r.is_active !== false,
    };
    const q = r.id
      ? MJ.sb.from('recurring_transactions').update(payload).eq('id', r.id)
      : MJ.sb.from('recurring_transactions').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await this.loadRecurring();
  },

  async deleteRecurring(id) {
    await MJ.sb.from('recurring_transactions').delete().eq('id', id);
    await this.loadRecurring();
  },

  /* ---------------------- profile ---------------------- */
  async saveProfile(patch) {
    const { data, error } = await MJ.sb.from('profiles').update(patch).eq('id', MJ.state.user.id).select().maybeSingle();
    if (error) throw error;
    MJ.state.profile = data;
    return data;
  },

  /* ---------------------- merchant rules ---------------------- */
  async rememberMerchant(payee, categoryId) {
    const key = String(payee).trim().toLowerCase().slice(0, 60);
    if (!key) return;
    try {
      await MJ.sb.from('merchant_rules')
        .upsert({ user_id: MJ.state.user.id, keyword: key, category_id: categoryId },
                { onConflict: 'user_id,keyword' });
    } catch (e) { /* ไม่สำคัญพอที่จะรบกวนผู้ใช้ */ }
  },

  async matchMerchant(payee) {
    if (!payee) return null;
    const key = String(payee).trim().toLowerCase();
    const { data } = await MJ.sb.from('merchant_rules').select('keyword, category_id');
    if (!data) return null;
    const hit = data.find((r) => key.includes(r.keyword) || r.keyword.includes(key));
    return hit ? hit.category_id : null;
  },

  /* ---------------------- ย่อรูปก่อนอัปโหลด ---------------------- */
  /**
   * อ่านสลิปเสร็จแล้วไม่ต้องเก็บภาพความละเอียดเต็ม — ย่อเหลือด้านยาว 1080px
   * คุณภาพ 0.72 พออ่านตัวเลขด้วยตาได้ ไฟล์เล็กลงราว 5-10 เท่า ประหยัดพื้นที่และเน็ต
   */
  async compressImage(file, maxSide, quality) {
    if (!file || !/^image\//.test(file.type)) return file;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      URL.revokeObjectURL(url);

      const side = maxSide || 1080;
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 400 * 1024) return file;   // เล็กอยู่แล้ว

      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cv.width, cv.height);

      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality || 0.72));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], (file.name || 'slip').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) {
      return file;   // ย่อไม่ได้ก็อัปโหลดต้นฉบับ
    }
  },

  /* ---------------------- ลายนิ้วมือของไฟล์รูป ---------------------- */
  HASH_KEY: 'mj-img-hashes',

  /** SHA-256 ของไฟล์ ใช้บอกว่ารูปนี้เคยอัปโหลดไปแล้วหรือยัง */
  async hashFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
  },

  localHashes() {
    try { return new Set(JSON.parse(localStorage.getItem(this.HASH_KEY) || '[]')); }
    catch (e) { return new Set(); }
  },
  rememberHash(hash) {
    if (!hash) return;
    const set = this.localHashes();
    set.add(hash);
    try { localStorage.setItem(this.HASH_KEY, JSON.stringify([...set].slice(-400))); } catch (e) {}
  },

  /** เช็กทีเดียวหลายรูปว่ารูปไหนเคยอัปโหลดแล้วบ้าง -> คืน Set ของ hash ที่เคยส่ง */
  async findUploadedHashes(hashes) {
    const list = hashes.filter(Boolean);
    if (!list.length) return new Set();
    const local = this.localHashes();
    const known = new Set(list.filter((h) => local.has(h)));
    try {
      const { data } = await MJ.sb.from('transactions').select('image_hash').in('image_hash', list);
      (data || []).forEach((r) => { known.add(r.image_hash); this.rememberHash(r.image_hash); });
    } catch (e) { /* ออฟไลน์ก็ใช้ที่จำไว้ในเครื่อง */ }
    return known;
  },

  /** ย่อรูปเป็น data URL ขนาดเล็กไว้โชว์ในแชท (อยู่รอดแม้ re-render หรือปิดแอป) */
  async thumbnail(file, maxSide, quality) {
    const W = maxSide || 300, q = quality || 0.62;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      URL.revokeObjectURL(url);
      if (!img.width || !img.height) return null;

      // ครอปเป็นสัดส่วน 3:4 จากส่วนบนของสลิป (ที่มีชื่อ/ยอด) ให้เต็มกรอบไม่มีขอบขาว
      const H = Math.round(W * 4 / 3);
      const srcRatio = img.width / img.height, dstRatio = 3 / 4;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (srcRatio > dstRatio) {            // ภาพกว้างเกิน -> ตัดด้านข้าง
        sw = img.height * dstRatio;
        sx = (img.width - sw) / 2;
      } else {                              // ภาพสูงเกิน -> ตัดด้านล่าง (เก็บส่วนบนไว้)
        sh = img.width / dstRatio;
        sy = Math.min((img.height - sh) / 2, img.height * 0.06);
      }

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      const dataUrl = cv.toDataURL('image/jpeg', q);
      return dataUrl && dataUrl.length > 200 ? dataUrl : null;
    } catch (e) { return null; }
  },

  /* ---------------------- อัปโหลดสลิปขึ้น Storage ---------------------- */
  async uploadReceipt(rawFile) {
    const file = await this.compressImage(rawFile);
    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${MJ.state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await MJ.sb.storage.from('receipts').upload(path, file, {
      contentType: file.type || 'image/jpeg', upsert: false,
    });
    if (error) throw error;
    return path;
  },

  async receiptUrl(path) {
    if (!path) return null;
    const { data } = await MJ.sb.storage.from('receipts').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  },

  /* ---------------------- สรุปยอด ---------------------- */
  summary(list) {
    const txs = (list || MJ.state.transactions).filter((t) => t.kind !== 'transfer');
    let income = 0, expense = 0;
    txs.forEach((t) => { if (t.type === 'income') income += Number(t.amount); else expense += Number(t.amount); });
    return { income, expense, balance: income - expense, count: txs.length };
  },

  byCategory(type, list) {
    const txs = (list || MJ.state.transactions).filter((t) => t.type === type && t.kind !== 'transfer');
    const map = new Map();
    txs.forEach((t) => {
      const key = t.category_id || 'none';
      const cur = map.get(key) || { total: 0, count: 0 };
      cur.total += Number(t.amount); cur.count++;
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => {
      const c = MJ.state.categories.find((x) => x.id === id);
      return {
        id, total: v.total, count: v.count,
        name: c?.name || 'ไม่ระบุหมวด', icon: c?.icon || '❓', color: c?.color || '#9AA0A6',
        budget: c?.budget_limit ? Number(c.budget_limit) : null,
      };
    }).sort((a, b) => b.total - a.total);
  },

  dailySeries(type) {
    const days = MJ.endOfMonth(MJ.state.month).getDate();
    const arr = new Array(days).fill(0);
    MJ.state.transactions.filter((t) => t.type === type && t.kind !== 'transfer').forEach((t) => {
      const d = new Date(t.transaction_date);
      if (d.getMonth() === MJ.state.month.getMonth()) arr[d.getDate() - 1] += Number(t.amount);
    });
    return arr;
  },

  catById(id) { return MJ.state.categories.find((c) => c.id === id) || null; },
};
