# PaddleOCR service (ตัวเลือกเสริม)

แอปหมีจดอ่านสลิปได้เองในเบราว์เซอร์อยู่แล้ว (QR + Tesseract.js)
ตัวนี้ไว้ใช้เมื่ออยากได้ความแม่นยำสูงขึ้นกับภาษาไทย

## รัน
```bash
cd ocr-service
docker compose up -d --build     # ครั้งแรกใช้เวลา 5-10 นาที (ดาวน์โหลดโมเดล)
curl http://localhost:8000/health
```

จากนั้นในแอป: **ตั้งค่า → อ่านสลิป → ใส่ URL** เช่น `http://localhost:8000`
(ถ้าเปิดแอปจากมือถือ ต้องใช้ IP ของเครื่องที่รัน เช่น `http://192.168.1.20:8000`
และเว็บแอปที่เป็น https จะเรียก http ไม่ได้ ต้องทำ https ให้ service ด้วย เช่นผ่าน Cloudflare Tunnel)

## ทดสอบด้วย curl
```bash
curl -F "file=@slip.jpg" http://localhost:8000/ocr
```
