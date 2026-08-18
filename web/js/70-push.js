/* ===================================================================
   70-push.js — แจ้งเตือนแบบ Push (Web Push + VAPID)
   ทำงานแม้ปิดแอปอยู่ ต่างจากตัวเตือนเดิมที่ทำงานเฉพาะตอนเปิดแอปค้างไว้
   บน iPhone ต้อง "เพิ่มไปยังหน้าจอโฮม" ก่อน แล้วเปิดจากไอคอนแอป (iOS 16.4+)
   =================================================================== */
MJ.push = {
  VAPID_PUBLIC: '__VAPID_PUBLIC_KEY__',

  /** เบราว์เซอร์นี้รองรับ push ไหม */
  supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  /** ต้องติดตั้งลงหน้าจอโฮมก่อนไหม (เฉพาะ iOS) */
  needsInstall() {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    return iOS && !standalone;
  },

  async status() {
    if (!this.supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    } catch (e) { return 'off'; }
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  },

  /** เปิดการแจ้งเตือน: ขอสิทธิ์ -> สมัครกับเบราว์เซอร์ -> เก็บลง Supabase */
  async enable() {
    if (!this.supported()) {
      MJ.toast('เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน', 'err');
      return false;
    }
    if (this.needsInstall()) {
      MJ.toast('บน iPhone ต้องเพิ่มลงหน้าจอโฮมก่อนนะ', 'err');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      MJ.toast(perm === 'denied' ? 'ถูกปิดไว้ในตั้งค่าเบราว์เซอร์' : 'ยังไม่ได้รับอนุญาต', 'err');
      return false;
    }

    MJ.loading(true, 'กำลังเปิดการแจ้งเตือน…');
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC),
        });
      }
      const json = sub.toJSON();
      const { error } = await MJ.sb.from('push_subscriptions').upsert({
        user_id: MJ.state.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
        fail_count: 0,
      }, { onConflict: 'endpoint' });
      if (error) throw error;

      MJ.toast('เปิดแจ้งเตือนแล้ว 🔔', 'ok');
      return true;
    } catch (err) {
      MJ.toast('เปิดแจ้งเตือนไม่สำเร็จ: ' + (err.message || err), 'err');
      return false;
    } finally { MJ.loading(false); }
  },

  /** ปิดการแจ้งเตือนสำหรับอุปกรณ์นี้ */
  async disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await MJ.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      MJ.toast('ปิดแจ้งเตือนของเครื่องนี้แล้ว', 'ok');
      return true;
    } catch (err) {
      MJ.toast('ปิดไม่สำเร็จ: ' + (err.message || err), 'err');
      return false;
    }
  },

  /** ยิงแจ้งเตือนทดสอบมาที่เครื่องนี้ (ผ่าน Edge Function) */
  async test() {
    MJ.loading(true, 'กำลังส่งแจ้งเตือนทดสอบ…');
    try {
      const { data, error } = await MJ.sb.functions.invoke('notify', {
        body: { test_user_id: MJ.state.user.id },
      });
      if (error) throw error;
      MJ.toast(data?.sent ? 'ส่งแล้ว รอสัก 2-3 วินาที 🔔' : 'ยังไม่มีอุปกรณ์ที่เปิดแจ้งเตือน', data?.sent ? 'ok' : 'err');
    } catch (err) {
      MJ.toast('ส่งไม่สำเร็จ: ' + (err.message || err), 'err');
    } finally { MJ.loading(false); }
  },

  /** เช็กตอนเปิดแอป: ถ้าเคยเปิดไว้ ให้ sync ข้อมูล subscription ล่าสุดขึ้นฐานข้อมูล */
  async sync() {
    if (!this.supported() || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const json = sub.toJSON();
      await MJ.sb.from('push_subscriptions').upsert({
        user_id: MJ.state.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
        fail_count: 0,
      }, { onConflict: 'endpoint' });
    } catch (e) { /* ไม่สำคัญพอที่จะรบกวนผู้ใช้ */ }
  },
};
