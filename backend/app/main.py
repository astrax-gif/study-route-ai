from datetime import date
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.extract import extract_items, pdf_to_text
from app.ics import tasks_to_ics
from app.scheduler import build_plan
from app.schemas import PlanRequest, Task

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
        except httpx.HTTPStatusError as e:
            errors.append(
                f"{f.filename}: AI service error {e.response.status_code}. "
                "Check LLM_MODEL and LLM_API_KEY in .env"
            )
        except Exception as e:
            errors.append(f"{f.filename}: {e}")
    return {"items": all_items, "errors": errors}


@app.post("/plan")
def plan(req: PlanRequest):
    return build_plan(req.items, req.start_date, req.hours_per_day)


@app.post("/export.ics")
def export_ics(req: PlanRequest):
    result = build_plan(req.items, req.start_date, req.hours_per_day)
    tasks = [Task(**t) for t in result["tasks"]]
    return Response(
        content=tasks_to_ics(tasks),
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=study-plan.ics"},
    )