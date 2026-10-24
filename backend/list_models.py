import os

import httpx
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("LLM_API_KEY", "").strip()
base = "https://generativelanguage.googleapis.com/v1beta"

r = httpx.get(f"{base}/models", params={"key": key, "pageSize": 200}, timeout=30)
print("List status:", r.status_code)
names = [
    m["name"].replace("models/", "")
    for m in r.json().get("models", [])
    if "generateContent" in m.get("supportedGenerationMethods", [])
]
bad = ("tts", "image", "live", "audio", "robotics", "computer", "research", "antigravity", "embedding", "transcribe")
names = [n for n in names if n.startswith("gemini") and not any(b in n for b in bad)]
print("Trying", len(names), "models...\n")

for n in names:
    try:
        t = httpx.post(
            f"{base}/models/{n}:generateContent",
            params={"key": key},
            json={"contents": [{"parts": [{"text": "Reply with the word OK"}]}]},
            timeout=40,
        )
        print(("WORKS  " if t.status_code == 200 else f"{t.status_code}     ") + n)
    except Exception as e:
        print("ERROR  " + n, type(e).__name__)