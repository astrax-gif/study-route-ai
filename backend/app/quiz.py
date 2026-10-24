import json

from app.extract import call_llm

PROMPT = """You are a friendly study coach. The student's tasks for today:
{tasks}

Return ONLY a JSON object, no markdown, with:
  "briefing": 2 or 3 short spoken sentences telling the student what to focus on today (mention course and task names and the total of {total} hours),
  "questions": an array of exactly 3 multiple-choice questions testing basic knowledge of the topics in these tasks. Each question has:
     "question": string,
     "options": array of exactly 4 strings,
     "answer_index": number 0 to 3,
     "explanation": one short sentence.
Use simple language. Never invent deadlines."""


def _valid(data: dict) -> bool:
    if not isinstance(data.get("briefing"), str):
        return False
    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        return False
    for q in qs:
        if not (isinstance(q.get("question"), str) and isinstance(q.get("options"), list)
                and len(q["options"]) == 4 and q.get("answer_index") in (0, 1, 2, 3)):
            return False
    return True


def make_quiz(tasks: list[dict]) -> dict:
    lines = "\n".join(f"- {t['course']}: {t['title']} ({t['hours']}h)" for t in tasks)
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