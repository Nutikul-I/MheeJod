# 🐻 หมีจด (MheeJod)

เว็บแอป (PWA) จดรายรับ-รายจ่ายภาษาไทย ติดตั้งลงหน้าจอโฮมของ iPhone/Android ได้เหมือนแอปจริง
ใช้ **Supabase** เป็นฐานข้อมูล + ระบบล็อกอิน + ที่เก็บรูปสลิป

> จดได้ 4 แบบ: **พิมพ์** (“กินกาแฟ 80”) • **พูด** • **ถ่ายสลิป** (สแกน QR + OCR) • **กรอกเอง**

---

## ✨ ฟีเจอร์

| กลุ่ม | รายละเอียด |
|---|---|
| จดบันทึก | แชทภาษาไทย, พูดผ่าน Web Speech API, สแกนสลิป, แป้นตัวเลขกรอกเอง |
| อ่านสลิป | สแกน Mini QR ในเครื่อง (jsQR) → กันบันทึกซ้ำอัตโนมัติ, OCR ด้วย Tesseract.js หรือ PaddleOCR ที่รันเอง |
| เดาหมวดอัตโนมัติ | จับจากคำในข้อความ + จำชื่อร้าน/ผู้รับโอนที่เคยเลือกไว้ (`merchant_rules`) |
| งบประมาณ | ตั้งงบรายหมวด แถบความคืบหน้า เตือนเมื่อเกินงบ |
| วิเคราะห์ | โดนัทตามหมวด, แท่งรายวัน, ยอดสะสม, จ่ายวันไหนมากสุด, ร้านที่จ่ายบ่อย, เทียบเดือนก่อน |
| รายการประจำ | Netflix/ค่าเช่า/ค่าเน็ต — เติมให้อัตโนมัติเมื่อถึงกำหนด (`process_recurring`) |
| ส่งออก | Excel (.xlsx) เฉพาะเดือน หรือทั้งหมด |
| กระเป๋าเงิน | แยกเงินสด/ธนาคาร/บัตรเครดิต ดูยอดคงเหลือรายกระเป๋า โอนระหว่างกระเป๋า (ไม่นับเป็นรายรับ-จ่าย) |
| ปฏิทิน | ดูทั้งเดือน + นัดจ่าย/นัดรับล่วงหน้า (ตั้งซ้ำได้) ถึงวันแล้วเตือนทั้งในแอปและ push |
| เป้าหมาย & หนี้ | ตั้งเป้าเก็บเงิน หยอดกระปุก, บันทึกหนี้/ให้ยืม พร้อมบันทึกการจ่ายคืน |
| ค้นหา | ค้นข้ามทุกเดือน กรองตามหมวด/กระเป๋า/ช่วงวันที่, เลือกหลายรายการเพื่อลบหรือย้ายหมวด |
| รายงาน | สรุปรายเดือน + รายปี 12 เดือน, รูปสรุปไว้แชร์อวดเพื่อน (ซ่อนยอดเงินได้) |
| นำเข้า/ส่งออก | นำเข้า CSV/Excel พร้อมจับคู่คอลัมน์เอง, ส่งออก Excel รายเดือนหรือทั้งหมด |
| แจ้งเตือน | Push แม้ปิดแอป: เตือนจดประจำวัน, ใกล้เกินงบ/เกินงบ, นัดถึงกำหนด, สรุปเช้าวันจันทร์ |
| ความปลอดภัย | ล็อกแอปด้วย PIN, เปลี่ยน/รีเซ็ตรหัสผ่าน, เข้าด้วย Google/Apple (ถ้าเปิดใน Supabase) |
| ออฟไลน์ | เน็ตหลุดก็จดได้ เก็บคิวไว้ในเครื่องแล้วส่งขึ้นให้เองเมื่อกลับมาออนไลน์ |
| อื่น ๆ | โหมดมืด, เลิกทำหลังลบ, จดเร็วผ่าน URL `?add=กาแฟ 80` (ใช้กับ iOS Shortcuts), แชร์รูปสลิปเข้าแอปได้ |

---

## 🗂 โครงสร้างโปรเจกต์

```
web/                     ซอร์สโค้ดเว็บ (แก้ไขที่นี่)
├── index.html           โครงหน้า
├── styles.css           ดีไซน์ทั้งหมด
├── sw.js                service worker (แคช + รับสลิปที่แชร์เข้ามา)
├── manifest.webmanifest ตั้งค่า PWA
└── js/
    ├── 00-core.js       ค่าคงที่ สถานะ ตัวช่วย router
    ├── 10-auth.js       สมัคร/เข้าสู่ระบบ
    ├── 20-data.js       ชั้นข้อมูลคุยกับ Supabase
    ├── 30-nlp.js        แยกข้อความไทย → รายการ (rule-based)
    ├── 40-slip.js       QR + OCR + แกะข้อมูลสลิป
    ├── 50-charts.js     กราฟ SVG เขียนเอง
    ├── 60..65           หน้าต่าง ๆ (ภาพรวม/จด/รายการ/วิเคราะห์/งบ/ตั้งค่า)
    └── 99-boot.js       เริ่มระบบ
scripts/
├── gen-icons.mjs        สร้างไอคอนหมี PNG
├── build.mjs            รวมทุกอย่างเป็น dist/index.html ไฟล์เดียว
└── run-sql.mjs          รัน SQL ผ่าน Supabase Management API
supabase/
├── migrations/          สคีมาฐานข้อมูล + RLS + trigger + RPC
└── functions/app/       Edge Function (ใช้เป็น API/health เท่านั้น — ดูหมายเหตุด้านล่าง)
ocr-service/             PaddleOCR + FastAPI + Docker (ตัวเลือกเสริม)
docs/                    ไฟล์เว็บที่ build แล้ว สำหรับ GitHub Pages
```

---

## 🚀 เริ่มใช้งาน

### 1) ตั้งค่า
สร้างไฟล์ `.env` (ไม่ถูก commit):

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PROJECT_REF=<project-ref>
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_ACCESS_TOKEN=sbp_xxx          # ใช้ตอนรัน SQL / deploy function
```

### 2) สร้างฐานข้อมูล
```bash
node scripts/run-sql.mjs supabase/migrations/20260818000000_init.sql
```
หรือ copy ไฟล์ SQL ไปวางใน Dashboard → SQL Editor แล้วกด Run

สร้างให้: ตาราง `profiles / categories / transactions / recurring_transactions / merchant_rules`,
RLS ทุกตาราง, trigger สร้างหมวดหมู่ไทยเริ่มต้นให้ผู้ใช้ใหม่, RPC `process_recurring`, bucket `receipts`

### 3) build + ทดสอบในเครื่อง
```bash
npm run build      # สร้างไอคอน + รวมเป็น dist/index.html
npm run dev        # เปิด http://localhost:4173
```

### 4) ขึ้นเว็บจริง (GitHub Pages)

🌐 **เว็บใช้งานจริง: https://nutikul-i.github.io/MheeJod/**

อัปเดตเว็บหลังแก้โค้ดใน `web/`:
```bash
npm run deploy      # build + copy ลง docs/ + commit + push
```
GitHub Pages ตั้งไว้ที่ **main / docs** แล้ว (repo ต้องเป็น public เพราะแพลนฟรีไม่รองรับ Pages บน repo private)

มี workflow `.github/workflows/deploy.yml` ให้ด้วย (ถ้าอยากให้ build อัตโนมัติ
ตั้ง Source เป็น **GitHub Actions** แล้วใส่ secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`)

---

## ⚠️ ทำไมไม่โฮสต์บน Supabase

Supabase บังคับ `content-type: text/plain` และใส่ `content-security-policy: default-src 'none'; sandbox`
กับทุก response ในโดเมน `*.supabase.co` (ทั้ง Edge Functions และ Storage) เพื่อกันคนเอาไปทำเว็บฟิชชิง
ผลคือหน้า HTML จะไม่ถูก render และสคริปต์ไม่ทำงาน — จึงต้องวางตัวเว็บไว้ที่อื่น (GitHub Pages / Netlify / Cloudflare Pages)
ส่วน **ข้อมูล ล็อกอิน และรูปสลิป ยังอยู่บน Supabase ทั้งหมด**

Edge Function `app` ที่ deploy ไว้ยังใช้ได้ในฐานะ health check:
`https://<ref>.supabase.co/functions/v1/app/health`

---

## 🔐 ตั้งค่า Supabase เพิ่มเติมที่ควรทำ

1. **Authentication → URL Configuration** ใส่ Site URL เป็น URL ของเว็บ (เช่น `https://nutikul-i.github.io/MheeJod/`)
   และเพิ่มใน Redirect URLs ด้วย ไม่งั้นลิงก์ยืนยันอีเมล/ลิงก์เวทมนตร์จะเด้งผิดที่
2. ถ้าไม่อยากยืนยันอีเมลตอนสมัคร: **Authentication → Providers → Email → ปิด "Confirm email"**
3. (ตัวเลือก) เปิด `pg_cron` แล้วรันบล็อกท้ายไฟล์ migration เพื่อให้รายการประจำถูกเติมทุกวัน
   แม้ไม่ได้เปิดแอป (ปกติแอปจะเรียก `process_recurring` ให้ทุกครั้งที่เปิดอยู่แล้ว)

---

## 🧾 OCR แม่นขึ้นด้วย PaddleOCR (ตัวเลือก)

```bash
cd ocr-service && docker compose up -d --build
```
แล้วในแอป: **ตั้งค่า → อ่านสลิป → ใส่ URL** ของ service
ถ้าไม่ตั้ง แอปจะอ่านในเบราว์เซอร์ด้วย Tesseract.js (ฟรี ไม่ต้องมี key)

---

## 📱 ติดตั้งลงมือถือ

* **iPhone**: เปิดใน Safari → ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม”
* **Android**: Chrome → เมนู ⋮ → “ติดตั้งแอป”

ติดตั้งแล้วจะแชร์รูปสลิปจากแอปธนาคารเข้าหมีจดได้โดยตรง (Android รองรับเต็ม, iOS แล้วแต่เวอร์ชัน)
