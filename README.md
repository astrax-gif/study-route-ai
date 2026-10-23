# <p align="center">Study Route AI 🚀</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active_Prototype-3b82f6?style=for-the-badge&logo=rocket" alt="Status">
  <img src="https://img.shields.io/badge/Hackathon-hackCBS_9.0-6366f1?style=for-the-badge" alt="Hackathon">
  <img src="https://img.shields.io/badge/Python-FastAPI-10b981?style=for-the-badge&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/React-TailwindCSS-06b6d4?style=for-the-badge&logo=tailwindcss" alt="React">
</p>

---

## 💡 Overview
**Study Route AI** transforms unstructured, multi-page syllabus PDFs into a structured, zero-hallucination daily micro-learning schedule. It combines deterministic Python scheduling logic with automated JSON ingestion and an interactive audio coach.

---

## ✨ Core Features & Architecture
📄 Syllabus PDF ──> 🔄 Ingestion & JSON Validation ──> ⚡ Deterministic Scheduler ──> 🎧 Audio Coach (smallest.ai)
1. **Automated Syllabus Ingestion:** Extracts raw PDF text into machine-readable JSON validated against a strict schema, featuring an interactive review-and-correct table to catch errors before planning.
2. **Deterministic Scheduler:** Pure Python logic that prioritizes tasks by deadlines and grade weight, featuring an interactive **"I missed a day"** dynamic re-planning button that instantly recalculates your workload.
3. **Interactive Audio Coach:** Delivers daily briefings and quizzes via pre-cached `smallest.ai` text-to-speech for on-the-go commute learning.
4. **Calendar Export:** Instantly generates `.ics` calendar files for seamless sync with Google Calendar or Apple Calendar.

---

## 🧰 Tech Stack
* **Frontend:** React, Tailwind CSS (featuring modern dark-mode glassmorphic styling and smooth fade-in animations)
* **Backend:** Python, FastAPI, asynchronous file processing (`pypdf`)
* **AI & Audio:** LLM APIs for structured JSON extraction, `smallest.ai` TTS API
* **Export:** ICS calendar synchronization

---

## ⚙️ Quick Start (Local Setup)

### 1. Clone the repository
```bash
git clone [https://github.com/your-username/study-route-ai.git](https://github.com/your-username/study-route-ai.git)
cd study-route-ai
