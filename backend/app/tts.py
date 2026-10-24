import hashlib
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

CACHE = Path(__file__).resolve().parent.parent / "audio_cache"
CACHE.mkdir(exist_ok=True)


def speak(text: str) -> Path:
    """Return a WAV file for this text. Reuses a cached file if it exists."""
    voice = os.getenv("SMALLEST_VOICE", "magnus")
    name = hashlib.sha256(f"{voice}|{text}".encode()).hexdigest()[:24] + ".wav"
    path = CACHE / name
    if path.exists():
        return path

    key = os.getenv("SMALLEST_API_KEY", "").strip()
    if not key:
        raise ValueError("SMALLEST_API_KEY is missing in .env")

    r = httpx.post(
        "https://api.smallest.ai/waves/v1/tts",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "audio/wav",
        },
        json={
            "text": text,
            "voice_id": voice,
            "sample_rate": 24000,
            "output_format": "wav",
        },
        timeout=60,
    )
    r.raise_for_status()
    path.write_bytes(r.content)
    return path