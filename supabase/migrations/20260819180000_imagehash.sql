-- =====================================================================
-- จำ "ลายนิ้วมือ" ของไฟล์รูปที่เคยอัปโหลด เพื่อบอกได้ว่ารูปนี้เคยส่งแล้ว
-- =====================================================================
alter table public.transactions
  add column if not exists image_hash text;

create index if not exists transactions_image_hash_idx
  on public.transactions (user_id, image_hash) where image_hash is not null;
