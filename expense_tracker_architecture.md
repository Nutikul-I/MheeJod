# โครงสร้างโครงการแอปพลิเคชันจดบันทึกรายรับ-รายจ่าย (Web App / PWA)
**ทดแทนการใช้ LINE OA เปลี่ยนเป็น Web App ที่สามารถ Add to Home Screen บน iPhone ได้ และใช้ Supabase เป็น Backend**

## 1. ภาพรวมของเทคโนโลยี (Tech Stack)
* **Frontend:** Next.js (React) หรือ Vue/Nuxt.js รองรับการทำ PWA (Progressive Web App) เพื่อให้ติดตั้งลงหน้าจอโฮมของ iPhone ได้เหมือนแอปพลิเคชัน
* **Backend & Database:** Supabase (PostgreSQL Database, Authentication, Storage, Edge Functions)
* **AI & OCR:** 
  * ใช้ AI API (เช่น Gemini API หรือ OpenAI) สำหรับวิเคราะห์ข้อความแชท (NLP)
  * ใช้ Google Cloud Vision หรือ OCR API สำหรับอ่านสลิปและใบเสร็จ
* **Voice to Text:** Web Speech API (รองรับในเบราว์เซอร์)
* **Push Notifications:** Web Push API สำหรับแจ้งเตือน (เตือนจดประจำวัน)

---

## 2. โครงสร้างฐานข้อมูล (Database Schema - Supabase PostgreSQL)

### 2.1 Table: `users`
เก็บข้อมูลผู้ใช้งานและการตั้งค่า
* `id` (UUID, Primary Key)
* `email` (String)
* `display_name` (String)
* `avatar_url` (String)
* `reminder_time` (Time) - เวลาแจ้งเตือนประจำวัน
* `created_at` (Timestamp)

### 2.2 Table: `categories`
เก็บหมวดหมู่ที่ผู้ใช้สามารถปรับแต่งเองได้
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key -> users.id)
* `name` (String) - เช่น อาหาร, เดินทาง, ชอปปิ้ง
* `type` (Enum: 'income', 'expense')
* `budget_limit` (Decimal) - งบประมาณที่ตั้งไว้สำหรับหมวดนี้
* `icon` (String)
* `color` (String)

### 2.3 Table: `transactions`
เก็บประวัติรายรับ-รายจ่าย
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key -> users.id)
* `category_id` (UUID, Foreign Key -> categories.id)
* `amount` (Decimal)
* `type` (Enum: 'income', 'expense')
* `note` (String) - คำอธิบาย (เช่น "กินกาแฟ", "รับค่าขนม")
* `transaction_date` (Timestamp)
* `receipt_image_url` (String, Nullable) - รูปลิงก์จาก Supabase Storage

### 2.4 Table: `recurring_transactions`
เก็บข้อมูลรายการที่ต้องจดอัตโนมัติ (Subscriptions)
* `id` (UUID, Primary Key)
* `user_id` (UUID)
* `category_id` (UUID)
* `amount` (Decimal)
* `note` (String)
* `frequency` (Enum: 'daily', 'weekly', 'monthly', 'yearly')
* `next_run_date` (Date)
* `is_active` (Boolean)

---

## 3. โครงสร้างฟังก์ชันการทำงาน (Features & Workflows)

### 3.1 ระบบจดบันทึกแบบแชท (Smart Text Input)
* **Flow:** ผู้ใช้พิมพ์ "รับค่าขนม 100" หรือ "กินกาแฟ 80" -> Frontend ส่งข้อความไปที่ Backend (หรือเรียก LLM API) -> ระบบสกัดข้อมูล (Intent, Amount, Category) -> สรุปข้อมูลให้ผู้ใช้กดยืนยัน -> บันทึกลงฐานข้อมูล

### 3.2 ระบบอ่านสลิปและใบเสร็จ (OCR Image Upload)
* **Flow:** ผู้ใช้ถ่ายรูป/อัปโหลดสลิป -> ไฟล์ถูกอัปโหลดขึ้น Supabase Storage -> Trigger ส่งภาพให้ AI/OCR วิเคราะห์ -> AI แยกแยะว่าเป็น "เงินเข้า" หรือ "เงินออก" ยอดเงินเท่าไหร่ วันที่เวลาใด -> แสดงหน้าต่าง Pre-fill ให้ผู้ใช้ตรวจสอบและแก้ไขก่อนกด "บันทึก"

### 3.3 ระบบสั่งการด้วยเสียง (Voice Input)
* **Flow:** ผู้ใช้กดปุ่มไมค์ใน Web App -> Web Speech API ถอดเสียงเป็นข้อความ (Speech-to-Text) -> ส่งข้อความที่ได้เข้าสู่ระบบ Smart Text Input (ข้อ 3.1) ทันที

### 3.4 ระบบจัดการหมวดหมู่และงบประมาณ (Budgeting)
* **Flow:** ดึงข้อมูลจากตาราง `categories` มาแสดงผลแบบ Dashboard พร้อมแถบ Progress Bar เทียบกับรายการ `transactions` ในเดือนปัจจุบัน (อ้างอิงดีไซน์ป้านวล)

### 3.5 ระบบสรุปและวิเคราะห์ (Dashboard & Analytics)
* **Flow:** ใช้ SQL Query ใน Supabase (หรือเขียนเป็น View) เพื่อคำนวณ ยอดรวมรายรับ, ยอดรวมรายจ่าย, ยอดคงเหลือ, และแยกรายจ่ายตามหมวดหมู่ แสดงผลเป็นกราฟ (เช่น Chart.js หรือ Recharts)

### 3.6 ระบบจดบันทึกอัตโนมัติ (Recurring / Subscriptions)
* **Flow:** ใช้ Vercel Cron Jobs หรือ Supabase pg_cron ตรวจสอบตาราง `recurring_transactions` ทุกวัน หาก `next_run_date` ตรงกับวันนี้ จะทำการ Insert ลงตาราง `transactions` อัตโนมัติ

### 3.7 ระบบส่งออกข้อมูล Excel (Export Data)
* **Flow:** ผู้ใช้เลือกช่วงเดือน -> Frontend ดึงข้อมูลจาก Supabase -> ใช้ไลบรารีอย่าง `xlsx` (SheetJS) แปลง JSON เป็นไฟล์ `.xlsx` แล้วบังคับดาวน์โหลดลงเครื่อง

### 3.8 ระบบแจ้งเตือนประจำวัน (Daily Reminder)
* **Flow:** เนื่องจากเป็น PWA บน iOS (เวอร์ชัน 16.4+) รองรับ Web Push Notifications แล้ว สามารถรัน Cron Job ส่งแจ้งเตือนตามเวลา `reminder_time` ของผู้ใช้ได้

---

## 4. โครงสร้างไฟล์ในโปรเจกต์ (Next.js App Router Structure)

```text
/
├── public/                 # เก็บไฟล์ assets, รูปภาพ, รูปไอคอน PWA และ manifest.json
│   ├── manifest.json       # ไฟล์กำหนดค่า PWA ให้ติดตั้งบนมือถือได้
│   └── icons/
├── src/
│   ├── app/
│   │   ├── (auth)/         # หน้า Login/Register
│   │   ├── dashboard/      # หน้าแรก (สรุปยอดเงิน คงเหลือ)
│   │   ├── add/            # หน้าหลักสำหรับเพิ่มรายการ (พิมพ์, เสียง, อัปโหลดสลิป)
│   │   ├── analysis/       # หน้าวิเคราะห์ (กราฟ, สถิติ)
│   │   ├── budget/         # หน้าตั้งค่าหมวดหมู่และงบประมาณ
│   │   ├── transactions/   # หน้ารายการย้อนหลัง (และปุ่ม Export Excel)
│   │   └── settings/       # หน้าตั้งค่า (รายการประจำ, แจ้งเตือน)
│   ├── components/         # UI Components (ปุ่ม, การ์ด, กราฟ, Modal)
│   ├── lib/                
│   │   ├── supabase.js     # โค้ดเชื่อมต่อ Supabase Client
│   │   └── ai.js           # โค้ดเชื่อมต่อ AI/OCR สำหรับแยกข้อมูลแชท/สลิป
│   ├── utils/              # ฟังก์ชันตัวช่วยต่างๆ (เช่น รูปแบบวันที่, แปลงตัวเลข)
│   └── styles/             # ไฟล์ CSS (Tailwind)
├── .env.local              # เก็บ API Keys (Supabase, OpenAI/Gemini)
├── next.config.js          # ตั้งค่า Next.js และ PWA plugin (เช่น next-pwa)
└── package.json
```

---

## 5. ขั้นตอนการทำงาน (Roadmap)
1. **Phase 1: Setup & Database** - สร้างโปรเจกต์ Next.js + PWA, ตั้งค่าโปรเจกต์ใน Supabase, สร้างตารางข้อมูล
2. **Phase 2: Core Functions** - ทำระบบ Login, ระบบบันทึกรายรับ-รายจ่ายพื้นฐาน (Manual), ตั้งหมวดหมู่และงบ
3. **Phase 3: AI & OCR** - เชื่อมต่อ API เพื่อทำระบบวิเคราะห์ข้อความ (พิมพ์/เสียง) และระบบอ่านสลิป
4. **Phase 4: Analytics & Export** - ทำหน้าสรุปผล, กราฟวิเคราะห์, และฟังก์ชัน Export Excel
5. **Phase 5: Automation & Notifications** - ตั้งค่า Cron Jobs สำหรับรายการจดประจำ และระบบแจ้งเตือน PWA
6. **Phase 6: UI/UX Refinement** - ปรับแต่งหน้าตาแอปให้ใช้งานง่ายด้วยมือเดียวบน iPhone (Mobile-first design)

---

## 6. ส่วนเสริม: ระบบอ่านสลิปในเครื่อง (Auto E-Slip Scanner สไตล์เหมียวจด)
เนื่องจากข้อจำกัดของ Web App (PWA) บนระบบปฏิบัติการ iOS (iPhone) ที่ไม่สามารถแอบสแกนรูปภาพในอัลบั้มพื้นหลัง (Background Gallery Scan) ได้เหมือนแอป Native การออกแบบระบบให้มีประสบการณ์การใช้งานใกล้เคียงกับ "เหมียวจด" มากที่สุด จะใช้สถาปัตยกรรมดังนี้:

### 6.1 การรับรูปสลิปเข้าสู่ระบบ (Input Methods)
เพื่อให้ผู้ใช้ไม่ต้องเปิดแอปสลับไปมา เราจะใช้ฟีเจอร์ **Web Share Target API**
* **Flow การใช้งาน:** เมื่อผู้ใช้โอนเงินเสร็จในแอปธนาคาร -> กดปุ่ม "แชร์ (Share)" สลิป -> เลือกไอคอนแอป PWA ของเราจากเมนูแชร์ของ iOS -> PWA จะถูกเปิดขึ้นมาและรับไฟล์รูปภาพสลิปนั้นเข้าสู่ระบบทันที
* **การตั้งค่า:** เพิ่ม `share_target` ในไฟล์ `manifest.json` เพื่อให้ PWA สามารถลงทะเบียนเป็นแอปที่รับไฟล์รูปภาพได้

### 6.2 การประมวลผลอ่านสลิป (Local QR & OCR Processing)
เพื่อความรวดเร็วและประหยัดค่า API เราจะพยายามประมวลผลฝั่ง Client (เบราว์เซอร์ของผู้ใช้) ให้ได้มากที่สุดก่อนส่งไป Backend
* **Flow การทำงาน:**
  1. **สแกน QR Code ฝั่ง Client:** ทันทีที่แอปได้รับรูป ระบบจะใช้ไลบรารี JavaScript (เช่น `jsQR` หรือ `html5-qrcode`) อ่าน Mini QR Code บน e-Slip
  2. **ถอดรหัสข้อมูล:** นำข้อมูลจาก QR (ซึ่งมักจะเก็บรหัสอ้างอิงธนาคาร, วันที่, ยอดเงิน) มาตรวจสอบ
  3. **ถ้าไม่มี QR Code หรือต้องการข้อมูลชื่อร้านค้า (OCR):** หากอ่าน QR ไม่ได้ จะส่งรูปภาพไปที่ Edge Function ใน Supabase เพื่อเรียกใช้ AI OCR (เช่น Google Cloud Vision หรือ Gemini API) ดึงข้อความ ชื่อผู้รับเงิน และยอดเงิน

### 6.3 การจัดหมวดหมู่อัตโนมัติและป้องกันการบันทึกซ้ำ (Smart Categorization & Anti-Duplicate)
* **ป้องกันการจดซ้ำ:** นำรหัสอ้างอิงสลิป (Reference Number) ไปเช็คในฐานข้อมูล หากซ้ำจะแจ้งเตือนผู้ใช้ทันทีว่า "รายการนี้ถูกบันทึกแล้ว"
* **แยกหมวดหมู่อัตโนมัติ:** นำชื่อผู้รับโอน (Payee Name) ไปประมวลผล ตัวอย่างเช่น:
  * โอนให้ "บจก. ซีพี ออลล์" -> ระบบเลือกหมวด "ชอปปิ้ง/อาหาร" ให้ทันที
  * โอนให้ "บมจ. การไฟฟ้านครหลวง" -> ระบบเลือกหมวด "ค่าใช้จ่ายประจำ/ค่าน้ำค่าไฟ" ให้ทันที
* **หน้าจอยืนยัน:** แสดงป๊อปอัปให้ผู้ใช้เห็นว่าระบบอ่านได้ "จ่ายเงินให้ร้าน A จำนวน 100 บาท หมวดอาหาร" ผู้ใช้สามารถกดตกลงเพื่อบันทึก หรือแก้ไขได้ทันที

### 6.4 การปรับแก้โครงสร้างฐานข้อมูล (Database Schema Update)
ต้องเพิ่มฟิลด์ใน Table `transactions` เพื่อรองรับระบบนี้:
* `slip_reference` (String, Unique) - เก็บรหัสอ้างอิงบนสลิปเพื่อเช็คซ้ำ
* `payee_name` (String, Nullable) - ชื่อผู้รับเงิน/ร้านค้า ที่อ่านได้จากสลิป