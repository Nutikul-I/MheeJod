"""
PaddleOCR service (PP-OCRv5 ภาษาไทย) สำหรับหมีจด
รันได้ทั้งบน Hugging Face Space (พอร์ต 7860) และในเครื่องด้วย Docker

เส้นทาง:
  GET  /health -> {"ok": true, ...}
  GET  /        -> หน้าเว็บทดสอบเล็ก ๆ (ลากรูปสลิปมาวางได้)
  POST /ocr     -> multipart form field ชื่อ "file" (รูปสลิป)
                   ตอบกลับ {"text": "...", "lines": [{"text","score"}], "ms": 123}
"""
import io
import os
import time

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from PIL import Image, ImageOps
from paddleocr import PaddleOCR

APP_VERSION = "2.0"
LANG = os.getenv("OCR_LANG", "th")

app = FastAPI(title="MheeJod OCR", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOW_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# โหลดโมเดลครั้งเดียวตอนสตาร์ท
# ปิดโมดูลที่ไม่จำเป็นกับสลิป (จัดหน้าเอกสาร/คลี่ภาพ) เพื่อให้เบาและเร็ว
_ocr = PaddleOCR(
    lang=LANG,
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=True,
)


@app.get("/health")
def health():
    return {"ok": True, "engine": "paddleocr", "model": "PP-OCRv5", "lang": LANG, "version": APP_VERSION}


@app.get("/", response_class=HTMLResponse)
def index():
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>MheeJod OCR</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6}}
pre{{background:#f4f4f4;padding:12px;border-radius:10px;white-space:pre-wrap}}</style></head>
<body><h1>🐻 MheeJod OCR</h1>
<p>PaddleOCR PP-OCRv5 ภาษา <b>{LANG}</b> — พร้อมใช้งาน</p>
<p>เอา URL ของหน้านี้ไปใส่ในแอปหมีจด: <b>ตั้งค่า → อ่านสลิป</b></p>
<input type="file" id="f" accept="image/*"><pre id="out">เลือกรูปสลิปเพื่อทดสอบ</pre>
<script>
document.getElementById('f').onchange = async (e) => {{
  const fd = new FormData(); fd.append('file', e.target.files[0]);
  document.getElementById('out').textContent = 'กำลังอ่าน…';
  const r = await fetch('ocr', {{ method:'POST', body: fd }});
  const j = await r.json();
  document.getElementById('out').textContent = j.text || JSON.stringify(j);
}};
</script></body></html>"""


@app.post("/ocr")
async def read_slip(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="ต้องเป็นไฟล์รูปภาพ")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ไฟล์ใหญ่เกิน 10MB")

    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="เปิดไฟล์รูปไม่ได้")

    # ย่อด้านยาวสุดไม่เกิน 1600px เพื่อความเร็ว
    img.thumbnail((1600, 1600))

    started = time.time()
    result = _ocr.predict(np.array(img))

    lines = []
    for page in result or []:
        texts = page.get("rec_texts", [])
        scores = page.get("rec_scores", [])
        boxes = page.get("rec_polys", page.get("dt_polys", []))
        for i, text in enumerate(texts):
            top = float(min(p[1] for p in boxes[i])) if i < len(boxes) else float(i)
            lines.append({
                "text": text,
                "score": float(scores[i]) if i < len(scores) else None,
                "top": top,
            })

    lines.sort(key=lambda x: x["top"])
    return {
        "text": "\n".join(l["text"] for l in lines),
        "lines": lines,
        "ms": int((time.time() - started) * 1000),
    }
