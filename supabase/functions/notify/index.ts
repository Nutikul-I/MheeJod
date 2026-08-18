/**
 * Edge Function: notify
 * ส่ง Web Push เตือน "อย่าลืมจด" ให้ผู้ใช้ที่ถึงเวลาเตือนของตัวเอง
 *
 * เรียกโดย pg_cron ทุก 10 นาที (ดูท้ายไฟล์ migration) หรือเรียกเองเพื่อทดสอบ:
 *   curl -X POST https://<ref>.supabase.co/functions/v1/notify \
 *        -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
 *
 * ทดสอบยิงหาตัวเองทันที (ข้ามการเช็กเวลา):
 *   POST body {"test_user_id":"<uuid>"}
 */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const money = (n: number) =>
  "฿" + Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });

function buildMessage(row: { display_name?: string; spent_today: number; tx_today: number }) {
  const name = row.display_name || "หมีน้อย";
  if (!row.tx_today) {
    return {
      title: "หมีจดเตือนแล้วนะ 🐻",
      body: `${name} วันนี้ยังไม่ได้จดอะไรเลย มาจดกันหน่อย!`,
    };
  }
  return {
    title: "สรุปวันนี้ 🍯",
    body: `จดไปแล้ว ${row.tx_today} รายการ ใช้ไป ${money(row.spent_today)} — มีอะไรตกหล่นไหม?`,
  };
}

Deno.serve(async (req) => {
  let testUserId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      testUserId = body?.test_user_id ?? null;
    }
  } catch { /* ไม่มี body ก็ทำงานปกติ */ }

  let rows: any[] = [];

  if (testUserId) {
    const { data: subs } = await db.from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id").eq("user_id", testUserId);
    const { data: profile } = await db.from("profiles")
      .select("display_name").eq("id", testUserId).maybeSingle();
    rows = (subs ?? []).map((s) => ({
      ...s, display_name: profile?.display_name, spent_today: 0, tx_today: 0,
      local_date: new Date().toISOString().slice(0, 10),
    }));
  } else {
    const { data, error } = await db.rpc("due_reminders", { p_window_minutes: 15 });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "content-type": "application/json" },
      });
    }
    rows = data ?? [];
  }

  let sent = 0, failed = 0, dropped = 0;
  const remindedUsers = new Map<string, string>();

  for (const row of rows) {
    const msg = buildMessage(row);
    const payload = JSON.stringify({
      title: msg.title,
      body: msg.body,
      url: "/MheeJod/#add",
      tag: "mheejod-daily",
    });
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      sent++;
      if (row.user_id && row.local_date) remindedUsers.set(row.user_id, row.local_date);
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        // อุปกรณ์ถอนการติดตั้ง/ล้างสิทธิ์แล้ว — เอา endpoint ออก
        await db.rpc("drop_push_endpoint", { p_endpoint: row.endpoint });
        dropped++;
      } else {
        await db.from("push_subscriptions")
          .update({ fail_count: (row.fail_count ?? 0) + 1 })
          .eq("endpoint", row.endpoint);
        failed++;
      }
    }
  }

  // กันเตือนซ้ำในวันเดียวกัน
  if (!testUserId) {
    for (const [userId, date] of remindedUsers) {
      await db.rpc("mark_reminded", { p_user: userId, p_date: date });
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: rows.length, sent, failed, dropped }), {
    headers: { "content-type": "application/json" },
  });
});
