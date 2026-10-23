from datetime import date

from app.schemas import Item
from app.scheduler import build_plan

D = date(2026, 9, 1)


def make(title, due, weight=10, hours=2, course="C1"):
    return Item(course=course, title=title, type="assignment",
                due_date=due, grade_weight=weight, est_hours=hours)


def test_work_fits_and_nothing_after_deadline():
    plan = build_plan([make("Essay", date(2026, 9, 4), hours=2)], D, 1)
    assert sum(t["hours"] for t in plan["tasks"]) == 2
    assert plan["at_risk"] == []
    assert all(t["day"] <= "2026-09-04" for t in plan["tasks"])


def test_overloaded_is_flagged_at_risk():
    plan = build_plan([make("Exam", date(2026, 9, 2), hours=10)], D, 2)
    assert plan["at_risk"][0]["hours_unscheduled"] == 6


def test_heavier_grade_goes_first():
    items = [make("Small", date(2026, 9, 10), weight=5), make("Big", date(2026, 9, 10), weight=40)]
    plan = build_plan(items, D, 1)
    assert plan["tasks"][0]["title"] == "Big"


def test_undated_items_are_reported():
    plan = build_plan([Item(course="C", title="Mystery", type="reading")], D, 2)
    assert plan["tasks"] == []
    assert plan["unscheduled"][0]["title"] == "Mystery"