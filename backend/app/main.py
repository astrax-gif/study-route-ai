from datetime import date
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.extract import extract_items, pdf_to_text
from app.ics import tasks_to_ics
from app.quiz import make_quiz
from app.scheduler import build_plan
from app.schemas import PlanRequest, Task
from app.tts import speak

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
            code = e.response.status_code
            hint = (
                "The AI service is busy. Wait a minute and try again."
                if code in (429, 503)
                else "Check LLM_MODEL and LLM_API_KEY in .env"
            )
            errors.append(f"{f.filename}: AI service error {code}. {hint}")
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


class QuizRequest(BaseModel):
    tasks: list[Task]


class SpeakRequest(BaseModel):
    text: str


@app.post("/quiz")
def quiz(req: QuizRequest):
    return make_quiz([t.model_dump(mode="json") for t in req.tasks])


@app.post("/audio")
def audio(req: SpeakRequest):
    try:
        path = speak(req.text)
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Voice service error {e.response.status_code}")
    except Exception as e:
        raise HTTPException(500, str(e))
    return FileResponse(path, media_type="audio/wav")