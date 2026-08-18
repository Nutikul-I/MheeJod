-- =====================================================================
-- รายการล่วงหน้า (นัดจ่าย/นัดรับ) + แจ้งเตือนเมื่อถึงวัน
-- =====================================================================

create table if not exists public.planned_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  amount       numeric(14,2) not null check (amount > 0),
  type         public.tx_type not null default 'expense',
  category_id  uuid references public.categories(id) on delete set null,
  due_date     date not null,
  note         text,
  is_done      boolean not null default false,
  done_tx_id   uuid references public.transactions(id) on delete set null,
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists planned_user_due_idx on public.planned_items (user_id, due_date);
create index if not exists planned_pending_idx on public.planned_items (due_date) where not is_done;

alter table public.planned_items enable row level security;
drop policy if exists "own planned" on public.planned_items;
create policy "own planned" on public.planned_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- รายการล่วงหน้าที่ถึงกำหนดแล้ว (ตามเขตเวลาผู้ใช้) พร้อมอุปกรณ์ที่รับ push
-- ---------------------------------------------------------------------
create or replace function public.due_planned()
returns table (
  item_id    uuid,
  user_id    uuid,
  title      text,
  amount     numeric,
  type       public.tx_type,
  due_date   date,
  endpoint   text,
  p256dh     text,
  auth       text
) language sql security definer set search_path = public as $$
  select i.id, i.user_id, i.title, i.amount, i.type, i.due_date,
         s.endpoint, s.p256dh, s.auth
  from public.planned_items i
  join public.profiles p on p.id = i.user_id
  join public.push_subscriptions s on s.user_id = i.user_id and s.fail_count < 5
  where not i.is_done
    and i.notified_at is null
    and i.due_date <= (now() at time zone coalesce(p.timezone, 'Asia/Bangkok'))::date;
$$;
revoke all on function public.due_planned() from public, anon, authenticated;

create or replace function public.mark_planned_notified(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.planned_items set notified_at = now() where id = any(p_ids);
$$;
revoke all on function public.mark_planned_notified(uuid[]) from public, anon, authenticated;
