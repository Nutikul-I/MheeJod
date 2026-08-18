-- =====================================================================
-- เก็บประวัติแชทไว้ในฐานข้อมูล (ซิงก์ข้ามเครื่อง ไม่หายเวลาล้างเบราว์เซอร์)
-- =====================================================================
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  who        text not null check (who in ('me', 'bot')),
  text       text not null default '',
  imgs       text[] not null default '{}',   -- ภาพย่อ (data URL) เก็บเฉพาะรูปเล็ก
  created_at timestamptz not null default now()
);

create index if not exists chat_user_time_idx on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;
drop policy if exists "own chat" on public.chat_messages;
create policy "own chat" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- เก็บแค่ 300 ข้อความล่าสุดต่อคน ตัดส่วนเกินทิ้งอัตโนมัติ
create or replace function public.trim_chat_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.chat_messages
  where user_id = new.user_id
    and id in (
      select id from public.chat_messages
      where user_id = new.user_id
      order by created_at desc
      offset 300
    );
  return null;
end $$;

drop trigger if exists trg_trim_chat on public.chat_messages;
create trigger trg_trim_chat
  after insert on public.chat_messages
  for each row execute function public.trim_chat_history();
