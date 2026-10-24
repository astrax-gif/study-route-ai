import time
from datetime import date
from pathlib import Path

from app.extract import extract_items, pdf_to_text

START = date(2026, 10, 26)
D = date

# (title keyword, expected due date or None, expected weight)
EXPECTED = {
    "MKT101_Introduction_to_Marketing.pdf": [
        ("quiz", D(2026, 11, 6), 5), ("proposal", D(2026, 11, 13), 10),
        ("case study", D(2026, 11, 27), 15), ("midterm", D(2026, 12, 1), 20),
        ("presentation", D(2026, 12, 11), 15), ("final exam", D(2027, 1, 12), 35),
    ],
    "CS201_Data_Structures.pdf": [
        ("lab 1", D(2026, 11, 9), 5), ("lab 2", D(2026, 11, 23), 5),
        ("assignment 1", D(2026, 11, 30), 10), ("midterm", D(2026, 12, 14), 25),
        ("assignment 2", D(2027, 1, 4), 15), ("project", D(2027, 1, 18), 15),
        ("final exam", D(2027, 2, 1), 25),
    ],
    "STA110_Business_Statistics.pdf": [
        ("homework", D(2026, 11, 6), 3), ("homework", D(2026, 11, 20), 3),
        ("homework", D(2026, 12, 4), 3), ("homework", D(2026, 12, 18), 3),
        ("midterm", D(2026, 12, 3), 30), ("report", D(2026, 12, 17), 20),
        ("participation", None, 10), ("final exam", D(2027, 1, 14), 28),
    ],
}

folder = Path(__file__).parent / "sample_syllabi"
total_ok = total_fields = 0

for name, expected in EXPECTED.items():
    path = folder / name
    if not path.exists():
        print(f"\n{name}: FILE NOT FOUND in {folder}")
        continue
    t0 = time.time()
    try:
        text = pdf_to_text(path.read_bytes())
        items = extract_items(text, path.stem.replace("_", " "), START)
    except Exception as e:
        print(f"\n{name}: FAILED ({type(e).__name__})")
        total_fields += len(expected) * 2
        continue
    secs = time.time() - t0

    ok = 0
    print(f"\n=== {name} ({secs:.1f}s, {len(items)} rows extracted) ===")
    for kw, exp_date, exp_w in expected:
        cands = [i for i in items if kw in i.title.lower()]
        if not cands:
            print(f"  MISSING  {kw}")
            continue
        cand = next((c for c in cands if c.due_date == exp_date), cands[0])
        date_ok = cand.due_date == exp_date
        weight_ok = abs(cand.grade_weight - exp_w) < 0.01
        ok += date_ok + weight_ok
        flag = "ok " if date_ok and weight_ok else "BAD"
        print(f"  {flag} {cand.title[:32]:32} date {cand.due_date} (want {exp_date}) "
              f"weight {cand.grade_weight:g} (want {exp_w})")
    total_ok += ok
    total_fields += len(expected) * 2
    print(f"  score: {ok}/{len(expected) * 2} fields")

if total_fields:
    print(f"\nOVERALL: {total_ok}/{total_fields} = {100 * total_ok / total_fields:.0f}%")