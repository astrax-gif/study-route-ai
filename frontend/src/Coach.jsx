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
      setMsg(`Could not start the coach: ${e.message}. Try again in a moment.`);
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
      setMsg("Audio is unavailable right now. The written brief and quiz still work.");
    }
  }

  const questions = quiz ? quiz.questions : [];
  const score = questions.filter((q, i) => answers[i] === q.answer_index).length;

  return (
    <section className="sheet space-y-4 p-5">
      <div>
        <h2 className="font-display text-xl font-bold">Audio coach</h2>
        <p className="text-sm text-ink-soft">
          A short spoken brief and a three-question quiz for the day you pick.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">
          Day
          <select
            className="field mt-1 block w-auto pr-6"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            {days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={loading} onClick={start}>
          {loading ? "Preparing" : "Get today's brief + quiz"}
        </button>
      </div>

      {loading && <div className="indet max-w-sm" role="status" aria-label="Preparing" />}

      {msg && (
        <div role="alert" className="border-l-4 border-l-pen bg-paper p-2 text-sm text-pen">
          {msg}
        </div>
      )}

      {quiz && (
        <div className="space-y-4">
          <p className="max-w-[65ch] border-l-4 border-l-sky pl-4 leading-relaxed">
            {quiz.briefing}
          </p>
          <button className="btn btn-ghost" onClick={listen}>
            ▶ Listen to the brief
          </button>
          {audioUrl && <audio controls autoPlay src={audioUrl} className="w-full" />}

          {questions.map((q, i) => {
            const picked = answers[i] !== undefined;
            return (
              <div key={i} className="space-y-2 border-t border-rule pt-4">
                <p className="font-semibold">
                  {i + 1}. {q.question}
                </p>
                <div className="grid gap-2">
                  {q.options.map((opt, j) => {
                    const correct = j === q.answer_index;
                    const mine = answers[i] === j;
                    let cls = "border-rule hover:border-ink";
                    let mark = String.fromCharCode(65 + j);
                    if (picked && correct) {
                      cls = "border-mint bg-mint/25";
                      mark = "✓";
                    } else if (picked && mine) {
                      cls = "border-pen bg-pen/10";
                      mark = "✕";
                    }
                    return (
                      <button
                        key={j}
                        disabled={picked}
                        onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                        className={`flex items-center gap-3 rounded-md border-2 px-3 py-2 text-left ${cls}`}
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-semibold">
                          {mark}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {picked && <p className="text-sm text-ink-soft">{q.explanation}</p>}
              </div>
            );
          })}

          {questions.length > 0 && Object.keys(answers).length === questions.length && (
            <p className="font-display text-xl font-bold">
              Score: {score} of {questions.length}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
