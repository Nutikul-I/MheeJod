# PaddleOCR PP-OCRv5 (ภาษาไทย) — ใช้ได้ทั้ง Hugging Face Space และ Docker ในเครื่อง
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 ccache \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Space รันคอนเทนเนอร์ด้วย user id 1000 — ต้องมีโฟลเดอร์ที่เขียนได้
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR $HOME/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ดาวน์โหลดโมเดลไทยไว้ตอน build จะได้ไม่ช้าตอนเรียกครั้งแรก
RUN python -c "\
from paddleocr import PaddleOCR; \
import numpy as np; \
o = PaddleOCR(lang='th', use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=True); \
o.predict(np.full((64, 240, 3), 255, dtype='uint8')); \
print('โหลดโมเดลเรียบร้อย')"

COPY --chown=user main.py .

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
