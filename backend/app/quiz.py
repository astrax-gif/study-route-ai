import json

from app.extract import call_llm

PROMPT = """You are a friendly study coach. The student's tasks for today:
{tasks}

Return ONLY a JSON object, no markdown, with:
  "briefing": 2 or 3 short spoken sentences telling the student what to focus on today (mention course and task names and the total of {total} hours),
  "questions": an array of exactly 3 multiple-choice questions testing basic knowledge of the topics listed in these tasks. Each question has:
     "question": string,
     "options": array of exactly 4 strings,
     "answer_index": number 0 to 3,
     "explanation": one short sentence.
Rules:
- Base every question on the topics listed above. If a task lists no topics, ask a basic question about the course subject named in the task.
- The questions are read aloud, so keep each question under 25 words and each option under 8 words.
- Never use "all of the above" or "none of the above".
- Use simple language. Never invent deadlines."""


def _valid(data: dict) -> bool:
    if not isinstance(data.get("briefing"), str):
        return False
    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        return False
    for q in qs:
        if not (
            isinstance(q, dict)
            and isinstance(q.get("question"), str)
            and isinstance(q.get("options"), list)
            and len(q["options"]) == 4
            and q.get("answer_index") in (0, 1, 2, 3)
        ):
            return False
        q["explanation"] = str(q.get("explanation") or "")
    return True


def _line(t: dict) -> str:
    topics = t.get("topics") or []
    kind = f" [{t['type']}]" if t.get("type") else ""
    extra = f" topics: {', '.join(topics)}" if topics else ""
    return f"- {t['course']}: {t['title']}{kind} ({t['hours']}h){extra}"


def make_quiz(tasks: list[dict]) -> dict:
    lines = "\n".join(_line(t) for t in tasks)
    total = round(sum(t["hours"] for t in tasks), 2)
    prompt = PROMPT.replace("{tasks}", lines).replace("{total}", str(total))
    for _ in range(2):
        try:
            text = call_llm(prompt)
            data = json.loads(text[text.find("{"): text.rfind("}") + 1])
            if _valid(data):
                return data
        except Exception:
            continue
    # Fallback so the text and audio briefing still work without the AI
    names = ", ".join(f"{t['title']} for {t['course']}" for t in tasks)
    return {"briefing": f"Today you have {len(tasks)} tasks: {names}. That is {total} hours in total.",
            "questions": []}