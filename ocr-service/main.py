"""
PaddleOCR service สำหรับหมีจด (ตัวเลือกเสริม)
- รันเองเมื่อไหร่ก็ได้ แล้วเอา URL ไปใส่ในหน้า "ตั้งค่า > อ่านสลิป" ของแอป
- ถ้าไม่รันตัวนี้ แอปจะอ่านสลิปในเบราว์เซอร์ด้วย Tesseract.js ให้อัตโนมัติ

เส้นทาง:
  GET  /health -> {"ok": true}
  POST /ocr    -> multipart form field ชื่อ "file" (รูปสลิป)
                  ตอบกลับ {"text": "...", "lines": [{"text": ..., "score": ...}]}
"""
import io
import os

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import numpy as np
from paddleocr import PaddleOCR

app = FastAPI(title="MheeJod OCR", version="1.0")

# เปิด CORS ให้เว็บแอปเรียกได้โดยตรง (จำกัด origin ได้ด้วย env ALLOW_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOW_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# โหลดโมเดลครั้งเดียวตอนสตาร์ท (ไทย + อังกฤษ)
ocr = PaddleOCR(use_angle_cls=True, lang="th", show_log=False)


@app.get("/health")
def health():
    return {"ok": True, "engine": "paddleocr", "lang": "th"}


@app.post("/ocr")
async def read_slip(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="ต้องเป็นไฟล์รูปภาพ")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ไฟล์ใหญ่เกิน 10MB")

    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="เปิดไฟล์รูปไม่ได้")

    # ย่อรูปยาวสุดไม่เกิน 1600px เพื่อความเร็ว
    img.thumbnail((1600, 1600))
    result = ocr.ocr(np.array(img), cls=True)

    lines = []
    for page in result or []:
        for item in page or []:
            box, (text, score) = item
            top = min(p[1] for p in box)
            lines.append({"text": text, "score": float(score), "top": float(top)})

    lines.sort(key=lambda x: x["top"])
    return {"text": "\n".join(l["text"] for l in lines), "lines": lines}
