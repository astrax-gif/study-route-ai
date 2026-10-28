from datetime import date
from typing import Optional

from pydantic import BaseModel


class Item(BaseModel):
    course: str
    title: str
    type: str                              # "assignment" | "exam" | "reading" | "quiz"
    due_date: Optional[date] = None
    relative_date: Optional[str] = None    # e.g. "Week 7", resolved later
    grade_weight: float = 0                # percent of final grade
    est_hours: float = 2
    topics: list[str] = []                 # chapters or weekly topics, from the syllabus only
    needs_review: bool = False


class PlanRequest(BaseModel):
    items: list[Item]
    start_date: date
    hours_per_day: float


class Task(BaseModel):
    day: date
    course: str
    title: str
    hours: float
    type: str = ""
    topics: list[str] = []