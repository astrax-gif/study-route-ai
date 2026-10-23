from datetime import timedelta

from icalendar import Calendar, Event

from app.schemas import Task


def tasks_to_ics(tasks: list[Task]) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//Study Route AI//EN")
    cal.add("version", "2.0")
    for t in tasks:
        ev = Event()
        ev.add("summary", f"[{t.course}] {t.title} ({t.hours}h)")
        ev.add("dtstart", t.day)                       # a date, not a time = all-day event
        ev.add("dtend", t.day + timedelta(days=1))
        ev.add("uid", f"{t.day}-{t.course}-{t.title}@studyroute".replace(" ", "_"))
        cal.add_component(ev)
    return cal.to_ical()