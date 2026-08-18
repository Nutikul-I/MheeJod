/* ===================================================================
   10-auth.js — สมัคร / เข้าสู่ระบบ / ลิงก์เวทมนตร์
   =================================================================== */
MJ.auth = {
  mode: 'signin',

  mount() {
    const note = MJ.$('#authNote');

    MJ.segInit(MJ.$('#authTabs'), (btn) => {
      {
        MJ.auth.mode = btn.dataset.mode;
        const up = MJ.auth.mode === 'signup';
        MJ.$('#nameField').hidden = !up;
        MJ.$('#authSubmit').textContent = up ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
        MJ.$('#authPassword').autocomplete = up ? 'new-password' : 'current-password';
        note.textContent = '';
      };
    });

    MJ.$('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const email = MJ.$('#authEmail').value.trim();
      const password = MJ.$('#authPassword').value;
      const name = MJ.$('#authName').value.trim();
      note.className = 'auth-note';
      note.textContent = '';
      MJ.loading(true, MJ.auth.mode === 'signup' ? 'กำลังสมัคร…' : 'กำลังเข้าสู่ระบบ…');
      try {
        if (MJ.auth.mode === 'signup') {
          const { data, error } = await MJ.sb.auth.signUp({
            email, password,
            options: { data: { display_name: name || email.split('@')[0] } },
          });
          if (error) throw error;
          if (!data.session) {
            note.className = 'auth-note ok';
            note.textContent = 'สมัครเรียบร้อย! เช็กอีเมลเพื่อยืนยันก่อนเข้าใช้งานนะ 🐻';
          }
        } else {
          const { error } = await MJ.sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (err) {
        note.className = 'auth-note err';
        note.textContent = MJ.auth.thaiError(err);
      } finally {
        MJ.loading(false);
      }
    };

    if (MJ.$('#authForgot')) MJ.$('#authForgot').onclick = async () => {
      const email = MJ.$('#authEmail').value.trim();
      if (!email) { note.className = 'auth-note err'; note.textContent = 'ใส่อีเมลก่อนนะ'; return; }
      MJ.loading(true, 'กำลังส่งลิงก์ตั้งรหัสใหม่…');
      const { error } = await MJ.sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.href.split('#')[0] + '#reset',
      });
      MJ.loading(false);
      note.className = 'auth-note ' + (error ? 'err' : 'ok');
      note.textContent = error ? MJ.auth.thaiError(error)
        : 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว เปิดจากเครื่องนี้ได้เลย 🔑';
    };

    MJ.$$('[data-oauth]').forEach((btn) => btn.onclick = async () => {
      const provider = btn.dataset.oauth;
      const { error } = await MJ.sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: location.href.split('#')[0] },
      });
      if (error) {
        note.className = 'auth-note err';
        note.textContent = /provider is not enabled/i.test(error.message)
          ? `ยังไม่ได้เปิดใช้ ${provider === 'google' ? 'Google' : 'Apple'} ใน Supabase (Authentication → Providers)`
          : MJ.auth.thaiError(error);
      }
    });

    MJ.$('#authMagic').onclick = async () => {
      const email = MJ.$('#authEmail').value.trim();
      if (!email) { note.className = 'auth-note err'; note.textContent = 'ใส่อีเมลก่อนนะ'; return; }
      MJ.loading(true, 'กำลังส่งลิงก์…');
      const { error } = await MJ.sb.auth.signInWithOtp({
        email, options: { emailRedirectTo: location.href.split('#')[0] },
      });
      MJ.loading(false);
      note.className = 'auth-note ' + (error ? 'err' : 'ok');
      note.textContent = error ? MJ.auth.thaiError(error) : 'ส่งลิงก์ไปที่อีเมลแล้ว เปิดจากมือถือเครื่องนี้ได้เลย ✉️';
    };
  },

  thaiError(err) {
    const m = String(err?.message || err || '');
    if (/Invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/already registered|User already/i.test(m)) return 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบดู';
    if (/Email not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล เช็กกล่องจดหมายก่อนนะ';
    if (/Password should be at least/i.test(m)) return 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร';
    if (/rate limit|too many/i.test(m)) return 'ลองบ่อยเกินไป พักสักครู่แล้วลองใหม่';
    if (/Failed to fetch|network/i.test(m)) return 'เชื่อมต่อไม่ได้ เช็กอินเทอร์เน็ตก่อนนะ';
    return m || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
  },

  /** ตั้งรหัสผ่านใหม่ (เข้ามาจากลิงก์ในอีเมล) */
  async promptNewPassword() {
    MJ.sheet.open('ตั้งรหัสผ่านใหม่', `
      <label class="field"><span>รหัสผ่านใหม่</span>
        <input type="password" id="npPass" minlength="6" placeholder="อย่างน้อย 6 ตัวอักษร"></label>
      <label class="field"><span>ยืนยันรหัสผ่านใหม่</span>
        <input type="password" id="npPass2" minlength="6"></label>
      <button class="btn btn-primary btn-block" id="npSave">บันทึกรหัสผ่านใหม่</button>`, (body) => {
      MJ.$('#npSave', body).onclick = async () => {
        const a = MJ.$('#npPass', body).value, b = MJ.$('#npPass2', body).value;
        if (a.length < 6) { MJ.toast('รหัสผ่านสั้นเกินไป', 'err'); return; }
        if (a !== b) { MJ.toast('รหัสผ่านสองช่องไม่ตรงกัน', 'err'); return; }
        MJ.loading(true, 'กำลังบันทึก…');
        const { error } = await MJ.sb.auth.updateUser({ password: a });
        MJ.loading(false);
        if (error) { MJ.toast(MJ.auth.thaiError(error), 'err'); return; }
        MJ.sheet.close();
        MJ.toast('เปลี่ยนรหัสผ่านแล้ว 🔑', 'ok');
      };
    });
  },

  async signOut() {
    if (!(await MJ.confirm('ออกจากระบบ', 'ต้องการออกจากระบบใช่ไหม?', 'ออกจากระบบ'))) return;
    await MJ.sb.auth.signOut();
    location.reload();
  },
};
