from datetime import date
from pathlib import Path

from fastapi import File, Form, UploadFile

from app.extract import extract_items, pdf_to_text
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Study Route AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}
@app.post("/extract")
async def extract(files: list[UploadFile] = File(...), start_date: date = Form(...)):
    all_items, errors = [], []
    for f in files:
        course = Path(f.filename).stem
        text = pdf_to_text(await f.read())
        if not text:
            errors.append(f"{f.filename}: no text found (scanned PDF? OCR not supported yet)")
            continue
        try:
            items = extract_items(text, course, start_date)
            all_items.extend(i.model_dump(mode="json") for i in items)
        except Exception as e:
            errors.append(f"{f.filename}: {e}")
    return {"items": all_items, "errors": errors}