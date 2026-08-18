-- =====================================================================
-- ชุดใหญ่: กระเป๋าเงิน, เป้าหมายออม, หนี้/ให้ยืม, แท็ก, นัดแบบซ้ำ,
--          เตือนใกล้เกินงบ, สรุปรายสัปดาห์, รายงานรายปี, รวมหมวด
-- =====================================================================

/* ---------------------- 1) กระเป๋าเงิน / บัญชี ---------------------- */
do $$ begin
  create type public.account_type as enum ('cash','bank','credit','ewallet','savings');
exception when duplicate_object then null; end $$;

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  type            public.account_type not null default 'cash',
  icon            text not null default '👛',
  color           text not null default '#8B5E3C',
  opening_balance numeric(14,2) not null default 0,
  credit_limit    numeric(14,2),
  is_default      boolean not null default false,
  is_archived     boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts (user_id);
create unique index if not exists accounts_user_name_key on public.accounts (user_id, name);

alter table public.accounts enable row level security;
drop policy if exists "own accounts" on public.accounts;
create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ---------------------- 2) ต่อยอดตาราง transactions ---------------------- */
alter table public.transactions
  add column if not exists account_id    uuid references public.accounts(id) on delete set null,
  add column if not exists to_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists kind          text not null default 'normal',
  add column if not exists tags          text[] not null default '{}';

do $$ begin
  alter table public.transactions
    add constraint transactions_kind_check check (kind in ('normal','transfer'));
exception when duplicate_object then null; end $$;

create index if not exists transactions_account_idx on public.transactions (user_id, account_id);
create index if not exists transactions_kind_idx on public.transactions (user_id, kind);

/* ---------------------- 3) เป้าหมายเก็บเงิน ---------------------- */
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount  numeric(14,2) not null default 0,
  icon          text not null default '🎯',
  color         text not null default '#3EA96B',
  due_date      date,
  is_done       boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.goals enable row level security;
drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ---------------------- 4) หนี้ / ให้ยืม ---------------------- */
create table if not exists public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  person      text not null,
  direction   text not null check (direction in ('owed_to_me','i_owe')),
  amount      numeric(14,2) not null check (amount > 0),
  paid_amount numeric(14,2) not null default 0,
  due_date    date,
  note        text,
  is_settled  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists debts_user_idx on public.debts (user_id, is_settled);
alter table public.debts enable row level security;
drop policy if exists "own debts" on public.debts;
create policy "own debts" on public.debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ---------------------- 5) นัดล่วงหน้าแบบซ้ำ ---------------------- */
alter table public.planned_items
  add column if not exists repeat_freq text not null default 'none';
do $$ begin
  alter table public.planned_items
    add constraint planned_repeat_check check (repeat_freq in ('none','weekly','monthly','yearly'));
exception when duplicate_object then null; end $$;

/* ---------------------- 6) ตั้งค่าเตือนงบ / สรุปรายสัปดาห์ ---------------------- */
alter table public.profiles
  add column if not exists budget_alert_pct int not null default 80,
  add column if not exists weekly_summary   boolean not null default true,
  add column if not exists last_weekly_on   date;

create table if not exists public.budget_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  period      date not null,
  pct         int not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists budget_alerts_key
  on public.budget_alerts (user_id, category_id, period, pct);
alter table public.budget_alerts enable row level security;
drop policy if exists "own budget alerts" on public.budget_alerts;
create policy "own budget alerts" on public.budget_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ---------------------- 7) ยอดคงเหลือรายกระเป๋า ---------------------- */
create or replace function public.account_balances()
returns table (account_id uuid, balance numeric, tx_count bigint)
language sql stable security invoker set search_path = public as $$
  select a.id,
         a.opening_balance
           + coalesce((select sum(case when t.type = 'income' then t.amount else -t.amount end)
                       from public.transactions t
                       where t.account_id = a.id and t.user_id = a.user_id), 0)
           + coalesce((select sum(t.amount) from public.transactions t
                       where t.to_account_id = a.id and t.user_id = a.user_id and t.kind = 'transfer'), 0),
         coalesce((select count(*) from public.transactions t
                   where (t.account_id = a.id or t.to_account_id = a.id) and t.user_id = a.user_id), 0)
  from public.accounts a
  where a.user_id = auth.uid() and not a.is_archived;
$$;
grant execute on function public.account_balances() to authenticated;

/* ---------------------- 8) สรุปรายปี ---------------------- */
create or replace function public.yearly_stats(p_year int)
returns table (m int, income numeric, expense numeric, tx_count bigint)
language sql stable security invoker set search_path = public as $$
  select gs.m::int,
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
         count(t.id)
  from generate_series(1, 12) as gs(m)
  left join public.transactions t
    on t.user_id = auth.uid()
   and t.kind = 'normal'
   and extract(year from t.transaction_date) = p_year
   and extract(month from t.transaction_date) = gs.m
  group by gs.m
  order by gs.m;
$$;
grant execute on function public.yearly_stats(int) to authenticated;

/* ---------------------- 9) รวมหมวดหมู่ ---------------------- */
create or replace function public.merge_category(p_from uuid, p_to uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.transactions set category_id = p_to
  where category_id = p_from and user_id = auth.uid();
  get diagnostics n = row_count;

  update public.planned_items set category_id = p_to where category_id = p_from and user_id = auth.uid();
  update public.recurring_transactions set category_id = p_to where category_id = p_from and user_id = auth.uid();
  update public.merchant_rules set category_id = p_to where category_id = p_from and user_id = auth.uid();
  update public.categories set is_archived = true where id = p_from and user_id = auth.uid();
  return n;
end $$;
grant execute on function public.merge_category(uuid, uuid) to authenticated;

/* ---------------------- 10) กระเป๋าเริ่มต้นให้ผู้ใช้ ---------------------- */
create or replace function public.seed_default_accounts(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.accounts (user_id, name, type, icon, color, is_default, sort_order)
  values
    (p_user, 'เงินสด',   'cash', '👛', '#F2B23E', true,  1),
    (p_user, 'ธนาคาร',   'bank', '🏦', '#4A9DF2', false, 2)
  on conflict (user_id, name) do nothing;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,'หมีน้อย'), '@', 1)))
  on conflict (id) do nothing;
  perform public.seed_default_categories(new.id);
  perform public.seed_default_accounts(new.id);
  return new;
end $$;

do $$
declare r record;
begin
  for r in select id from auth.users loop
    perform public.seed_default_accounts(r.id);
  end loop;
end $$;

/* ---------------------- 11) งบที่ใกล้เต็ม (ให้ Edge Function เรียก) ---------------------- */
create or replace function public.due_budget_alerts()
returns table (
  user_id     uuid,
  category_id uuid,
  cat_name    text,
  used        numeric,
  budget      numeric,
  pct         int,
  period      date,
  endpoint    text,
  p256dh      text,
  auth        text
) language sql security definer set search_path = public as $$
  with base as (
    select p.id as uid,
           p.budget_alert_pct,
           date_trunc('month', now() at time zone coalesce(p.timezone,'Asia/Bangkok'))::date as period,
           c.id as cat_id, c.name as cat_name, c.budget_limit,
           coalesce((select sum(t.amount) from public.transactions t
                     where t.user_id = p.id and t.category_id = c.id
                       and t.type = 'expense' and t.kind = 'normal'
                       and t.transaction_date >= date_trunc('month', now() at time zone coalesce(p.timezone,'Asia/Bangkok'))
                    ), 0) as used
    from public.profiles p
    join public.categories c on c.user_id = p.id and c.budget_limit is not null and not c.is_archived
  ), calc as (
    select *, floor(used / nullif(budget_limit,0) * 100)::int as used_pct from base
  )
  select c.uid, c.cat_id, c.cat_name, c.used, c.budget_limit,
         case when c.used_pct >= 100 then 100 else c.budget_alert_pct end,
         c.period, s.endpoint, s.p256dh, s.auth
  from calc c
  join public.push_subscriptions s on s.user_id = c.uid and s.fail_count < 5
  where c.used_pct >= least(c.budget_alert_pct, 100)
    and not exists (
      select 1 from public.budget_alerts a
      where a.user_id = c.uid and a.category_id = c.cat_id and a.period = c.period
        and a.pct = (case when c.used_pct >= 100 then 100 else c.budget_alert_pct end)
    );
$$;
revoke all on function public.due_budget_alerts() from public, anon, authenticated;

create or replace function public.log_budget_alert(p_user uuid, p_cat uuid, p_period date, p_pct int)
returns void language sql security definer set search_path = public as $$
  insert into public.budget_alerts (user_id, category_id, period, pct)
  values (p_user, p_cat, p_period, p_pct)
  on conflict do nothing;
$$;
revoke all on function public.log_budget_alert(uuid, uuid, date, int) from public, anon, authenticated;

/* ---------------------- 12) สรุปรายสัปดาห์ (จันทร์เช้า) ---------------------- */
create or replace function public.due_weekly_summary()
returns table (
  user_id      uuid,
  display_name text,
  income       numeric,
  expense      numeric,
  tx_count     bigint,
  top_cat      text,
  local_date   date,
  endpoint     text,
  p256dh       text,
  auth         text
) language sql security definer set search_path = public as $$
  with u as (
    select p.id, p.display_name, p.timezone,
           (now() at time zone coalesce(p.timezone,'Asia/Bangkok'))::date as local_date,
           (now() at time zone coalesce(p.timezone,'Asia/Bangkok'))::time as local_time
    from public.profiles p
    where p.weekly_summary
      and extract(dow from (now() at time zone coalesce(p.timezone,'Asia/Bangkok'))) = 1
      and (p.last_weekly_on is null
           or p.last_weekly_on < (now() at time zone coalesce(p.timezone,'Asia/Bangkok'))::date)
      and (now() at time zone coalesce(p.timezone,'Asia/Bangkok'))::time
            between time '08:00' and time '11:00'
  )
  select u.id, u.display_name,
         coalesce(sum(t.amount) filter (where t.type='income'), 0),
         coalesce(sum(t.amount) filter (where t.type='expense'), 0),
         count(t.id),
         (select c.name from public.transactions t2
            join public.categories c on c.id = t2.category_id
           where t2.user_id = u.id and t2.type='expense' and t2.kind='normal'
             and t2.transaction_date >= (u.local_date - 7)
           group by c.name order by sum(t2.amount) desc limit 1),
         u.local_date, s.endpoint, s.p256dh, s.auth
  from u
  join public.push_subscriptions s on s.user_id = u.id and s.fail_count < 5
  left join public.transactions t on t.user_id = u.id and t.kind='normal'
       and t.transaction_date >= (u.local_date - 7)
  group by u.id, u.display_name, u.local_date, s.endpoint, s.p256dh, s.auth;
$$;
revoke all on function public.due_weekly_summary() from public, anon, authenticated;

create or replace function public.mark_weekly_sent(p_user uuid, p_date date)
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_weekly_on = p_date where id = p_user;
$$;
revoke all on function public.mark_weekly_sent(uuid, date) from public, anon, authenticated;

/* ---------------------- 13) นัดซ้ำ: สร้างรอบถัดไปเมื่อทำเสร็จ ---------------------- */
create or replace function public.roll_planned(p_item uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare it public.planned_items; nid uuid;
begin
  select * into it from public.planned_items where id = p_item and user_id = auth.uid();
  if not found or it.repeat_freq = 'none' then return null; end if;

  insert into public.planned_items (user_id, title, amount, type, category_id, due_date, note, repeat_freq)
  values (it.user_id, it.title, it.amount, it.type, it.category_id,
          case it.repeat_freq
            when 'weekly'  then it.due_date + interval '1 week'
            when 'monthly' then it.due_date + interval '1 month'
            when 'yearly'  then it.due_date + interval '1 year'
          end::date,
          it.note, it.repeat_freq)
  returning id into nid;
  return nid;
end $$;
grant execute on function public.roll_planned(uuid) to authenticated;
