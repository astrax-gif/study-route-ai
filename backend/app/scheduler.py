from collections import defaultdict
from datetime import date, timedelta

from app.schemas import Item, Task

CHUNK_HOURS = 1.0  # work is handed out in blocks of up to 1 hour


def priority(item: Item, remaining_hours: float, today: date) -> float:
    """Higher = do sooner. Heavy grade, lots of work left, deadline close."""
    days_left = max((item.due_date - today).days, 1)
    return (item.grade_weight + 1) * remaining_hours / days_left


def build_plan(items: list[Item], start: date, hours_per_day: float) -> dict:
    dated = [(i, it) for i, it in enumerate(items) if it.due_date]
    unscheduled = [it for it in items if not it.due_date]
    remaining = {i: it.est_hours for i, it in dated}
    tasks: list[Task] = []

    if dated:
        last_day = max(it.due_date for _, it in dated)
        day = start
        while day <= last_day:
            capacity = hours_per_day
            per_item: dict[int, float] = defaultdict(float)
            while capacity > 1e-9:
                candidates = [
                    (i, it) for i, it in dated
                    if remaining[i] > 1e-9 and it.due_date >= day
                ]
                if not candidates:
                    break
                i, it = max(candidates, key=lambda c: priority(c[1], remaining[c[0]], day))
                step = min(CHUNK_HOURS, remaining[i], capacity)
                per_item[i] += step
                remaining[i] -= step
                capacity -= step
            for i, hours in per_item.items():
                it = items[i]
                tasks.append(Task(
                    day=day,
                    course=it.course,
                    title=it.title,
                    hours=round(hours, 2),
                    type=it.type,
                    topics=it.topics,
                ))
            day += timedelta(days=1)

    at_risk = [
        {
            "course": it.course,
            "title": it.title,
            "due_date": it.due_date.isoformat(),
            "hours_unscheduled": round(remaining[i], 2),
        }
        for i, it in dated
        if remaining[i] > 1e-9
    ]

    return {
        "tasks": [t.model_dump(mode="json") for t in tasks],
        "at_risk": at_risk,
        "unscheduled": [{"course": it.course, "title": it.title} for it in unscheduled],
    }