import json
import os
import re
from datetime import date, timedelta
from io import BytesIO

import httpx
from dotenv import load_dotenv
from pydantic import ValidationError
from pypdf import PdfReader

from app.schemas import Item

load_dotenv()

PROMPT = """You extract deadlines from a university syllabus.
Return ONLY a JSON array, no other text and no markdown.
Each element must have exactly these keys:
  "title": string,
  "type": one of "assignment", "exam", "quiz", "reading",
  "due_date": "YYYY-MM-DD" or null,
  "relative_date": text like "Week 7" or null,
  "grade_weight": number (percent of final grade, 0 if unknown),
  "est_hours": number (your estimate of hours of work)
Rules: use null when unknown. NEVER guess a date.

SYLLABUS TEXT:
<<TEXT>>
"""

# Used when no API key is set, so you can test the whole pipeline for free.
MOCK_RESPONSE = json.dumps([
    {"title": "Midterm Exam", "type": "exam", "due_date": None,
     "relative_date": "Week 7", "grade_weight": 30, "est_hours": 10},
    {"title": "Essay 1", "type": "assignment", "due_date": "2026-11-20",
     "relative_date": None, "grade_weight": 15, "est_hours": 6},
])


def pdf_to_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def call_llm(prompt: str) -> str:
    key = os.getenv("LLM_API_KEY")
    if not key:
        return MOCK_RESPONSE
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()

    if provider == "anthropic":
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": os.getenv("LLM_MODEL", "claude-sonnet-4-6"),
                  "max_tokens": 4000,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=90,
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"]

    if provider == "openai":
        r = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=90,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    if provider == "gemini":
        model = os.getenv("LLM_MODEL", "gemini-flash-latest")
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=180,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]

    raise ValueError(f"Unknown LLM_PROVIDER: {provider}")


def parse_json_array(text: str) -> list[dict]:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found")
    rows = json.loads(text[start : end + 1])
    if not isinstance(rows, list):
        raise ValueError("Expected a list")
    return rows


def resolve_relative(item: Item, term_start: date) -> Item:
    """Turn 'Week 7' into a real date and flag it for the student to check."""
    if item.due_date is None and item.relative_date:
        match = re.search(r"week\s*(\d+)", item.relative_date, re.IGNORECASE)
        if match:
            week = int(match.group(1))
            item.due_date = term_start + timedelta(weeks=week - 1)
            item.needs_review = True
    if item.due_date is None:
        item.needs_review = True
    return item


def extract_items(text: str, course: str, term_start: date) -> list[Item]:
    prompt = PROMPT.replace("<<TEXT>>", text[:12000])

    rows = None
    for _attempt in range(2):  # try once, retry once
        try:
            rows = parse_json_array(call_llm(prompt))
            break
        except (ValueError, json.JSONDecodeError):
            continue
    if rows is None:
        raise ValueError("The AI response could not be read as valid JSON")

    items = []
    for row in rows:
        try:
            item = Item(course=course, **row)
        except (ValidationError, TypeError):
            # One bad row must not break the whole sheet
            item = Item(
                course=course,
                title=str(row.get("title", "Unknown item")) if isinstance(row, dict) else "Unknown item",
                type="assignment",
                needs_review=True,
            )
        items.append(resolve_relative(item, term_start))
    return items