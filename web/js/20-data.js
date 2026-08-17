/* ===================================================================
   20-data.js — ชั้นข้อมูล: โหลด/บันทึก/ลบ + สรุปยอด + อัปโหลดสลิป
   =================================================================== */
MJ.data = {
  /* ---------------------- โหลดข้อมูลทั้งหมดของเดือน ---------------------- */
  async loadAll() {
    const uid = MJ.state.user.id;

    const [profile, cats] = await Promise.all([
      MJ.sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      MJ.sb.from('categories').select('*').eq('user_id', uid).eq('is_archived', false)
        .order('type').order('sort_order').order('name'),
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

    await Promise.all([this.loadMonth(), this.loadRecurring()]);
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
      amount: Number(tx.amount),
      type: tx.type,
      note: tx.note || null,
      transaction_date: (tx.transaction_date instanceof Date ? tx.transaction_date : new Date(tx.transaction_date || Date.now())).toISOString(),
      receipt_image_url: tx.receipt_image_url || null,
      slip_reference: tx.slip_reference || null,
      payee_name: tx.payee_name || null,
      source: tx.source || 'manual',
      raw_input: tx.raw_input || null,
    };
    const { data, error } = await MJ.sb.from('transactions').insert(payload).select().maybeSingle();
    if (error) {
      if (/duplicate key|transactions_user_slip_key/i.test(error.message)) {
        const e = new Error('สลิปนี้ถูกบันทึกไปแล้ว');
        e.duplicate = true; throw e;
      }
      throw error;
    }
    // จำร้าน/ผู้รับโอน เพื่อเดาหมวดครั้งหน้า
    if (tx.payee_name && tx.category_id) this.rememberMerchant(tx.payee_name, tx.category_id);
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

  async deleteTransaction(id) {
    const { error } = await MJ.sb.from('transactions').delete().eq('id', id);
    if (error) throw error;
    MJ.state.transactions = MJ.state.transactions.filter((t) => t.id !== id);
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

  /* ---------------------- อัปโหลดสลิปขึ้น Storage ---------------------- */
  async uploadReceipt(file) {
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
    const txs = list || MJ.state.transactions;
    let income = 0, expense = 0;
    txs.forEach((t) => { if (t.type === 'income') income += Number(t.amount); else expense += Number(t.amount); });
    return { income, expense, balance: income - expense, count: txs.length };
  },

  byCategory(type, list) {
    const txs = (list || MJ.state.transactions).filter((t) => t.type === type);
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
    MJ.state.transactions.filter((t) => t.type === type).forEach((t) => {
      const d = new Date(t.transaction_date);
      if (d.getMonth() === MJ.state.month.getMonth()) arr[d.getDate() - 1] += Number(t.amount);
    });
    return arr;
  },

  catById(id) { return MJ.state.categories.find((c) => c.id === id) || null; },
};
