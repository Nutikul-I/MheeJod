FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# โหลดโมเดลไทยไว้ล่วงหน้า ตอนรันครั้งแรกจะได้ไม่ช้า
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='th', show_log=False)"

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
