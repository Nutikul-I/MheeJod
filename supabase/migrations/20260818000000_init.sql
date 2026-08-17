-- =====================================================================
-- หมีจด (MheeJod) — Expense Tracker PWA
-- Schema: profiles, categories, transactions, recurring, merchant rules
-- Idempotent: ปลอดภัยที่จะรันซ้ำ
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.tx_type as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tx_source as enum ('manual', 'text', 'voice', 'slip', 'recurring', 'import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.recur_freq as enum ('daily', 'weekly', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1) profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  avatar_url    text,
  reminder_time time,
  currency      text not null default 'THB',
  timezone      text not null default 'Asia/Bangkok',
  ocr_endpoint  text,                       -- URL ของ PaddleOCR service (ถ้ามี)
  theme         text not null default 'auto',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) categories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  type         public.tx_type not null default 'expense',
  budget_limit numeric(14,2),
  icon         text not null default '🐻',
  color        text not null default '#F2B23E',
  keywords     text[] not null default '{}',   -- คำที่ใช้จับหมวดอัตโนมัติ
  sort_order   int  not null default 0,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now()
);

create unique index if not exists categories_user_name_type_key
  on public.categories (user_id, name, type);
create index if not exists categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------------
-- 3) transactions
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  category_id       uuid references public.categories(id) on delete set null,
  amount            numeric(14,2) not null check (amount > 0),
  type              public.tx_type not null,
  note              text,
  transaction_date  timestamptz not null default now(),
  receipt_image_url text,
  slip_reference    text,          -- รหัสอ้างอิงสลิป กันบันทึกซ้ำ
  payee_name        text,
  source            public.tx_source not null default 'manual',
  raw_input         text,          -- ข้อความ/ผลอ่านสลิปดิบ เก็บไว้ตรวจย้อนหลัง
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_cat_idx
  on public.transactions (user_id, category_id);
-- กันสลิปซ้ำ (เฉพาะแถวที่มี slip_reference)
create unique index if not exists transactions_user_slip_key
  on public.transactions (user_id, slip_reference)
  where slip_reference is not null;

-- ---------------------------------------------------------------------
-- 4) recurring_transactions
-- ---------------------------------------------------------------------
create table if not exists public.recurring_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete set null,
  amount        numeric(14,2) not null check (amount > 0),
  type          public.tx_type not null default 'expense',
  note          text,
  frequency     public.recur_freq not null default 'monthly',
  next_run_date date not null default current_date,
  is_active     boolean not null default true,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists recurring_user_idx on public.recurring_transactions (user_id);
create index if not exists recurring_due_idx
  on public.recurring_transactions (next_run_date) where is_active;

-- ---------------------------------------------------------------------
-- 5) merchant_rules — จำว่าโอนให้ใคร = หมวดไหน (ระบบเรียนรู้จากผู้ใช้)
-- ---------------------------------------------------------------------
create table if not exists public.merchant_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  keyword     text not null,
  category_id uuid references public.categories(id) on delete cascade,
  hit_count   int not null default 1,
  created_at  timestamptz not null default now()
);

create unique index if not exists merchant_rules_user_keyword_key
  on public.merchant_rules (user_id, lower(keyword));

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_transactions on public.transactions;
create trigger trg_touch_transactions before update on public.transactions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.categories             enable row level security;
alter table public.transactions           enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.merchant_rules         enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own recurring" on public.recurring_transactions;
create policy "own recurring" on public.recurring_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own merchant rules" on public.merchant_rules;
create policy "own merchant rules" on public.merchant_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- ผู้ใช้ใหม่: สร้าง profile + หมวดหมู่เริ่มต้น (ภาษาไทย)
-- ---------------------------------------------------------------------
create or replace function public.seed_default_categories(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, name, type, icon, color, keywords, sort_order)
  values
    (p_user, 'อาหาร',        'expense', '🍜', '#F2724A', array['ข้าว','กิน','อาหาร','กาแฟ','ชา','น้ำ','ขนม','ก๋วยเตี๋ยว','หมูกระทะ','เซเว่น','7-11','cp all','ซีพี ออลล์','lotus','โลตัส','แม็คโคร','food','cafe','starbucks','amazon'], 1),
    (p_user, 'เดินทาง',      'expense', '🚕', '#4A9DF2', array['แท็กซี่','taxi','grab','bolt','วิน','มอเตอร์ไซค์','bts','mrt','รถไฟ','น้ำมัน','ปตท','ptt','บางจาก','shell','ทางด่วน','ค่ารถ','เติมน้ำมัน'], 2),
    (p_user, 'ชอปปิง',       'expense', '🛍️', '#B36AE2', array['ซื้อ','ชอป','shopee','lazada','tiktok','เสื้อ','กางเกง','รองเท้า','เครื่องสำอาง','ห้าง','central','robinson'], 3),
    (p_user, 'บิล/ค่าใช้จ่ายประจำ','expense','🧾','#5BC0A5', array['ค่าไฟ','การไฟฟ้า','ค่าน้ำ','การประปา','ค่าเน็ต','อินเทอร์เน็ต','ค่าโทรศัพท์','ทรู','true','ais','dtac','netflix','spotify','youtube','ค่าเช่า','ค่าห้อง','ผ่อน','ประกัน'], 4),
    (p_user, 'สุขภาพ',       'expense', '💊', '#E2607A', array['หมอ','โรงพยาบาล','คลินิก','ยา','ฟิตเนส','fitness','ทันตกรรม','วัคซีน'], 5),
    (p_user, 'บันเทิง',      'expense', '🎮', '#F2B23E', array['หนัง','เกม','คอนเสิร์ต','เที่ยว','โรงแรม','บาร์','เหล้า','เบียร์','การ์ด','steam'], 6),
    (p_user, 'ครอบครัว',     'expense', '👨‍👩‍👧', '#8B5E3C', array['แม่','พ่อ','ลูก','ค่าเทอม','โรงเรียน','ให้แม่','ให้พ่อ'], 7),
    (p_user, 'อื่น ๆ',        'expense', '🐻', '#9AA0A6', array[]::text[], 99),
    (p_user, 'เงินเดือน',     'income',  '💰', '#3EA96B', array['เงินเดือน','salary','payroll','เงินออก บริษัท'], 1),
    (p_user, 'รายได้เสริม',   'income',  '💼', '#2E8B9E', array['ฟรีแลนซ์','freelance','งานเสริม','ขายของ','ค่าจ้าง'], 2),
    (p_user, 'ได้รับโอน',     'income',  '🎁', '#7FB93E', array['ได้รับ','รับเงิน','โอนเข้า','ค่าขนม','อั่งเปา','คืนเงิน','refund'], 3),
    (p_user, 'อื่น ๆ',        'income',  '🍯', '#C6A15B', array[]::text[], 99)
  on conflict (user_id, name, type) do nothing;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,'หมีน้อย'), '@', 1))
  )
  on conflict (id) do nothing;

  perform public.seed_default_categories(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ให้ผู้ใช้เดิม (ถ้ามี) ได้ profile + หมวดหมู่ด้วย
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(coalesce(u.email,'หมีน้อย'), '@', 1)
from auth.users u
on conflict (id) do nothing;

do $$
declare r record;
begin
  for r in select id from auth.users loop
    perform public.seed_default_categories(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RPC: ประมวลผลรายการประจำที่ถึงกำหนด (เรียกตอนเปิดแอป หรือให้ pg_cron เรียก)
-- ---------------------------------------------------------------------
create or replace function public.process_recurring(p_user uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := coalesce(p_user, auth.uid());
  v_row   record;
  v_count int := 0;
begin
  if v_user is null then
    raise exception 'ต้องระบุผู้ใช้';
  end if;

  for v_row in
    select * from public.recurring_transactions
    where user_id = v_user and is_active and next_run_date <= current_date
    for update
  loop
    -- ไล่เติมย้อนหลังกรณีไม่ได้เปิดแอปหลายวัน (กันวนไม่จบด้วยเพดาน 60 รอบ)
    while v_row.next_run_date <= current_date and v_count < 60 loop
      insert into public.transactions
        (user_id, category_id, amount, type, note, transaction_date, source)
      values
        (v_row.user_id, v_row.category_id, v_row.amount, v_row.type,
         coalesce(v_row.note, 'รายการประจำ'), v_row.next_run_date::timestamptz, 'recurring');

      v_count := v_count + 1;
      v_row.next_run_date := case v_row.frequency
        when 'daily'   then v_row.next_run_date + interval '1 day'
        when 'weekly'  then v_row.next_run_date + interval '1 week'
        when 'monthly' then v_row.next_run_date + interval '1 month'
        when 'yearly'  then v_row.next_run_date + interval '1 year'
      end::date;
    end loop;

    update public.recurring_transactions
      set next_run_date = v_row.next_run_date, last_run_at = now()
      where id = v_row.id;
  end loop;

  return v_count;
end $$;

grant execute on function public.process_recurring(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RPC: สรุปยอดรายเดือน + แยกตามหมวด
-- ---------------------------------------------------------------------
create or replace function public.monthly_stats(p_from date, p_to date)
returns table (
  category_id   uuid,
  category_name text,
  icon          text,
  color         text,
  type          public.tx_type,
  budget_limit  numeric,
  total         numeric,
  tx_count      bigint
) language sql stable security invoker set search_path = public as $$
  select c.id, c.name, c.icon, c.color, c.type, c.budget_limit,
         coalesce(sum(t.amount), 0)::numeric, count(t.id)
  from public.categories c
  left join public.transactions t
    on t.category_id = c.id
   and t.user_id = c.user_id
   and t.transaction_date >= p_from
   and t.transaction_date < (p_to + 1)
  where c.user_id = auth.uid() and not c.is_archived
  group by c.id, c.name, c.icon, c.color, c.type, c.budget_limit
  order by 8 desc;
$$;

grant execute on function public.monthly_stats(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket เก็บสลิป (private, เข้าถึงได้เฉพาะเจ้าของโฟลเดอร์)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts read own"   on storage.objects;
drop policy if exists "receipts write own"  on storage.objects;
drop policy if exists "receipts update own" on storage.objects;
drop policy if exists "receipts delete own" on storage.objects;

create policy "receipts read own" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts write own" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts update own" on storage.objects for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts delete own" on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- (ตัวเลือก) pg_cron รันรายการประจำให้ทุกคนทุกวัน 00:10 UTC+7 = 17:10 UTC
--   เปิดใช้: Dashboard > Database > Extensions > pg_cron แล้วรันบล็อกล่างนี้
-- ---------------------------------------------------------------------
-- create extension if not exists pg_cron with schema extensions;
-- select cron.schedule('mheejod-recurring', '10 17 * * *', $cron$
--   do $inner$
--   declare r record;
--   begin
--     for r in select distinct user_id from public.recurring_transactions where is_active loop
--       perform public.process_recurring(r.user_id);
--     end loop;
--   end $inner$;
-- $cron$);
