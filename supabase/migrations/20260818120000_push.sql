-- =====================================================================
-- Web Push: เก็บอุปกรณ์ที่สมัครรับการแจ้งเตือน + คิวส่ง
-- =====================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  last_sent_at timestamptz,
  fail_count  int not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- เก็บว่าเตือนวันไหนไปแล้ว กันเตือนซ้ำในวันเดียวกัน
alter table public.profiles
  add column if not exists last_reminded_on date;

-- ---------------------------------------------------------------------
-- ใครถึงเวลาเตือนบ้าง (เทียบตามเขตเวลาของผู้ใช้ และยังไม่ได้เตือนวันนี้)
-- ใช้ service role เรียกผ่าน Edge Function
-- ---------------------------------------------------------------------
create or replace function public.due_reminders(p_window_minutes int default 15)
returns table (
  user_id      uuid,
  display_name text,
  local_date   date,
  endpoint     text,
  p256dh       text,
  auth         text,
  spent_today  numeric,
  tx_today     bigint
) language sql security definer set search_path = public as $$
  with due as (
    select p.id, p.display_name, p.timezone,
           (now() at time zone coalesce(p.timezone, 'Asia/Bangkok'))::date as local_date,
           (now() at time zone coalesce(p.timezone, 'Asia/Bangkok'))::time as local_time
    from public.profiles p
    where p.reminder_time is not null
      and (p.last_reminded_on is null
           or p.last_reminded_on < (now() at time zone coalesce(p.timezone, 'Asia/Bangkok'))::date)
      and (now() at time zone coalesce(p.timezone, 'Asia/Bangkok'))::time
            between p.reminder_time and p.reminder_time + make_interval(mins => p_window_minutes)
  )
  select d.id, d.display_name, d.local_date, s.endpoint, s.p256dh, s.auth,
         coalesce((select sum(t.amount) from public.transactions t
                   where t.user_id = d.id and t.type = 'expense'
                     and (t.transaction_date at time zone coalesce(d.timezone,'Asia/Bangkok'))::date = d.local_date), 0),
         coalesce((select count(*) from public.transactions t
                   where t.user_id = d.id
                     and (t.transaction_date at time zone coalesce(d.timezone,'Asia/Bangkok'))::date = d.local_date), 0)
  from due d
  join public.push_subscriptions s on s.user_id = d.id and s.fail_count < 5;
$$;

revoke all on function public.due_reminders(int) from public, anon, authenticated;

-- ทำเครื่องหมายว่าเตือนแล้ว
create or replace function public.mark_reminded(p_user uuid, p_date date)
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_reminded_on = p_date where id = p_user;
$$;
revoke all on function public.mark_reminded(uuid, date) from public, anon, authenticated;

-- ลบอุปกรณ์ที่ endpoint ตายแล้ว
create or replace function public.drop_push_endpoint(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function public.drop_push_endpoint(text) from public, anon, authenticated;
