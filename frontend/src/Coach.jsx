import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Coach({ tasks }) {
  const days = [...new Set(tasks.map((t) => t.day))];
  const [day, setDay] = useState(days[0] || "");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  if (!days.length) return null;

  async function start() {
    setLoading(true);
    setMsg("");
    setQuiz(null);
    setAnswers({});
    setAudioUrl(null);
    try {
      const res = await fetch(`${API}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasks.filter((t) => t.day === day) }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setQuiz(await res.json());
    } catch (e) {
      setMsg(`Could not start the coach: ${e.message}`);
    }
    setLoading(false);
  }

  async function listen() {
    setMsg("");
    try {
      const res = await fetch(`${API}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quiz.briefing }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setAudioUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      setMsg("Audio is unavailable right now. The text version still works.");
    }
  }

  const questions = quiz ? quiz.questions : [];
  const score = questions.filter((q, i) => answers[i] === q.answer_index).length;

  return (
    <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <b>🎧 Audio coach</b>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Day
          <select
            className="block rounded border border-slate-300 px-2 py-1"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            {days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button
          className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
          disabled={loading}
          onClick={start}
        >
          {loading ? "Preparing..." : "Get today's brief + quiz"}
        </button>
      </div>

      {msg && <div className="rounded bg-red-100 p-2 text-sm text-red-800">{msg}</div>}

      {quiz && (
        <div className="space-y-3">
          <p className="rounded bg-white p-3">{quiz.briefing}</p>
          <button
            className="rounded-lg border border-cyan-700 px-3 py-1 text-cyan-800"
            onClick={listen}
          >
            ▶ Listen to the brief
          </button>
          {audioUrl && <audio controls autoPlay src={audioUrl} className="w-full" />}

          {questions.map((q, i) => (
            <div key={i} className="rounded bg-white p-3">
              <p className="font-semibold">
                {i + 1}. {q.question}
              </p>
              <div className="mt-2 grid gap-2">
                {q.options.map((opt, j) => {
                  const picked = answers[i] !== undefined;
                  let style = "border-slate-300 hover:bg-slate-50";
                  if (picked && j === q.answer_index) style = "border-green-500 bg-green-100";
                  else if (picked && answers[i] === j) style = "border-red-400 bg-red-100";
                  return (
                    <button
                      key={j}
                      disabled={picked}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                      className={`rounded border px-3 py-2 text-left ${style}`}
                    >
                                            {picked && j === q.answer_index ? "✓ " : ""}{opt}
                    </button>
                  );
                })}
              </div>
              {answers[i] !== undefined && (
                <p className="mt-2 text-sm text-slate-600">{q.explanation}</p>
              )}
            </div>
          ))}
          {questions.length > 0 && Object.keys(answers).length === questions.length && (
            <p className="font-bold text-cyan-800">
              Score: {score} / {questions.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}