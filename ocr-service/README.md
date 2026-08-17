---
title: MheeJod OCR
emoji: 🐻
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: PaddleOCR PP-OCRv5 อ่านสลิปภาษาไทยให้แอปหมีจด
---

# 🐻 MheeJod OCR

PaddleOCR **PP-OCRv5** ภาษาไทย ให้แอป [หมีจด](https://nutikul-i.github.io/MheeJod/) เรียกใช้อ่านสลิป

## API

| เส้นทาง | ทำอะไร |
|---|---|
| `GET /health` | เช็กสถานะ |
| `GET /` | หน้าทดสอบ ลากรูปสลิปมาวางได้ |
| `POST /ocr` | multipart field `file` → `{"text","lines","ms"}` |

```bash
curl -F "file=@slip.jpg" https://<space>.hf.space/ocr
```

## ใช้กับแอปหมีจด
เปิดแอป → **ตั้งค่า → อ่านสลิป → ใส่ URL** ของ Space นี้ → กด "ทดสอบการเชื่อมต่อ" → บันทึก

> Space ฟรีจะหลับเมื่อไม่มีคนใช้ ครั้งแรกหลังหลับจะช้าราว 30-60 วินาที แอปหมีจดจะรอและลองใหม่ให้อัตโนมัติ

## รันในเครื่องแทน
```bash
docker compose up -d --build     # เปิดที่ http://localhost:8000
```
