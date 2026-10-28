import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const SR =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);
const LETTERS = ["A", "B", "C", "D"];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const LETTER_WORDS = { a: 0, b: 1, be: 1, bee: 1, c: 2, see: 2, sea: 2, d: 3, dee: 3 };
const ORDINALS = { first: 0, second: 1, third: 2, fourth: 3, last: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
const NUMBER_WORDS = { one: 0, two: 1, three: 2, four: 3 };
const CUES = new Set(["option", "answer", "letter", "number", "choice"]);

const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

// Turn what the student said into an option index (0 to 3), or null if unclear
function parseSpoken(heard, options) {
  const words = clean(heard);
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const cued = k > 0 && CUES.has(words[k - 1]);
    if (cued && has(LETTER_WORDS, w)) return LETTER_WORDS[w];
    if (cued && has(NUMBER_WORDS, w)) return NUMBER_WORDS[w];
    if (has(ORDINALS, w)) return ORDINALS[w];
  }
  let best = -1;
  let bestScore = 0;
  let tie = false;
  options.forEach((opt, j) => {
    const s = clean(opt).filter((t) => t.length > 3 && words.includes(t)).length;
    if (s > bestScore) {
      best = j;
      bestScore = s;
      tie = false;
    } else if (s === bestScore && s > 0) tie = true;
  });
  if (best >= 0 && !tie) return best;
  if (words.length <= 2 && has(LETTER_WORDS, words[0])) return LETTER_WORDS[words[0]];
  return null;
}

// One round of listening. Resolves with a list of possible transcripts (empty if nothing heard)
function listenOnce(recRef, onBlocked, ms = 12000) {
  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let done = false;
    let timer;
    const finish = (alts) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        rec.stop();
      } catch {}
      resolve(alts);
    };
    timer = setTimeout(() => finish([]), ms);
    rec.onresult = (e) => finish([...e.results[0]].map((r) => r.transcript));
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onBlocked();
      finish([]);
    };
    rec.onend = () => finish([]);
    recRef.current = { stop: () => finish([]) };
    try {
      rec.start();
    } catch {
      finish([]);
    }
  });
}

export default function Coach({ tasks }) {
  const days = [...new Set(tasks.map((t) => t.day))];
  const [day, setDay] = useState(days[0] || "");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [heard, setHeard] = useState("");
  const [caption, setCaption] = useState("");

  const stopRef = useRef(false);
  const tapRef = useRef(null);
  const recRef = useRef(null);
  const audioRef = useRef(null);
  const qRef = useRef(-1);

  useEffect(() => () => stopSession(), []); // stop talking if the plan changes

  if (!days.length) return null;

  async function loadQuiz() {
    const res = await fetch(`${API}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: tasks.filter((t) => t.day === day) }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    setQuiz(data);
    return data;
  }

  async function start() {
    setLoading(true);
    setMsg("");
    setQuiz(null);
    setAnswers({});
    setAudioUrl(null);
    try {
      await loadQuiz();
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

  // ---------- two-way voice session ----------

  function stopSession() {
    stopRef.current = true;
    if (tapRef.current) tapRef.current(null);
    if (recRef.current) recRef.current.stop();
    const a = audioRef.current;
    if (a) {
      a.pause();
      if (a.onended) a.onended();
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  // Speak text with the server voice; fall back to the browser voice if that fails
  async function say(text) {
    if (stopRef.current) return;
    setPhase("speaking");
    setCaption(text);
    try {
      const res = await fetch(`${API}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("audio");
      const url = URL.createObjectURL(await res.blob());
      await new Promise((resolve) => {
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = resolve;
        a.onerror = resolve;
        a.play().catch(resolve);
      });
      URL.revokeObjectURL(url);
    } catch {
      await new Promise((resolve) => {
        if (stopRef.current || !window.speechSynthesis) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
    }
  }

  // Wait for a spoken answer OR a tap, whichever comes first
  async function getAnswer(q) {
    if (stopRef.current) return null;
    setPhase("listening");
    setHeard("");
    const tap = new Promise((resolve) => {
      tapRef.current = resolve;
    });
    const voice = SR
      ? listenOnce(recRef, () =>
          setMsg("The microphone is blocked. Allow it in the address bar, or tap your answers.")
        ).then((alts) => {
          if (alts.length) setHeard(alts[0]);
          for (const a of alts) {
            const r = parseSpoken(a, q.options);
            if (r !== null) return r;
          }
          return null;
        })
      : new Promise(() => {});
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 20000));
    const result = await Promise.race([tap, voice, timeout]);
    tapRef.current = null;
    if (recRef.current) recRef.current.stop();
    recRef.current = null;
    return result;
  }

  function nextDayText() {
    const nd = days[days.indexOf(day) + 1];
    if (!nd) return "That is the last day of your plan. Well done.";
    const nt = tasks.filter((t) => t.day === nd);
    const names = nt.slice(0, 3).map((t) => `${t.title} for ${t.course}`).join(", ");
    const hrs = Math.round(nt.reduce((a, t) => a + t.hours, 0) * 100) / 100;
    const date = new Date(nd + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
    });
    return `Your next study day is ${date}: ${names}, ${hrs} hours in total.`;
  }

  async function runSession() {
    stopRef.current = false;
    setRunning(true);
    setMsg("");
    setAnswers({});
    setAudioUrl(null);
    setHeard("");
    setCaption("");
    setPhase("loading");
    try {
      const data = await loadQuiz();
      if (stopRef.current) return;
      const qs = data.questions || [];
      let lead = data.briefing + " ";
      if (!qs.length) {
        await say(lead + nextDayText());
        return;
      }
      lead += "Now a quick quiz. Say A, B, C or D. ";
      let score = 0;
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        qRef.current = i;
        const opts = q.options.map((o, j) => `${LETTERS[j]}, ${o}.`).join(" ");
        await say(`${lead}Question ${i + 1}. ${q.question} ${opts}`);
        if (stopRef.current) return;
        let idx = null;
        for (let t = 0; t < 2 && idx === null && !stopRef.current; t++) {
          idx = await getAnswer(q);
          if (idx === null && t === 0 && !stopRef.current) {
            await say("Sorry, I didn't catch that. Say A, B, C or D, or tap an answer.");
          }
        }
        if (stopRef.current) return;
        setAnswers((a) => ({ ...a, [i]: idx === null ? -1 : idx }));
        const right = idx === q.answer_index;
        if (right) score++;
        const ans = `${LETTERS[q.answer_index]}, ${q.options[q.answer_index]}`;
        const verdict =
          idx === null
            ? `Let's move on. The answer was ${ans}. `
            : right
            ? "Correct! "
            : `Not quite. The answer was ${ans}. `;
        lead = verdict + (q.explanation || "") + " ";
      }
      const n = qs.length;
      const closing =
        score === n
          ? "Perfect. You are ready."
          : score >= n / 2
          ? "Good work. Review the ones you missed."
          : "Spend a little extra time on today's topics.";
      await say(`${lead}Your score is ${score} out of ${n}. ${closing} ${nextDayText()}`);
    } catch (e) {
      setMsg(`The voice session stopped: ${e.message}. You can still tap the answers.`);
    } finally {
      setRunning(false);
      setPhase("idle");
      setCaption("");
      qRef.current = -1;
    }
  }

  function pick(i, j) {
    if (running) {
      if (tapRef.current && i === qRef.current) tapRef.current(j);
      return;
    }
    setAnswers((a) => ({ ...a, [i]: j }));
  }

  const questions = quiz ? quiz.questions : [];
  const score = questions.filter((q, i) => answers[i] === q.answer_index).length;

  return (
    <section className="sheet space-y-4 p-5">
      <div>
        <h2 className="font-display text-xl font-bold">Audio coach</h2>
        <p className="text-sm text-ink-soft">
          Start a spoken session: the coach briefs you, asks three questions about
          today's topics, listens to your answers, and tells you your score.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">
          Day
          <select
            className="field mt-1 block w-auto pr-6"
            value={day}
            disabled={running}
            onChange={(e) => setDay(e.target.value)}
          >
            {days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={loading || running} onClick={runSession}>
          🎙 Start voice session
        </button>
        <button className="btn btn-ghost" disabled={loading || running} onClick={start}>
          {loading ? "Preparing" : "Text brief + quiz only"}
        </button>
      </div>

      {!SR && (
        <p className="text-xs text-ink-soft">
          Spoken answers work in Chrome or Edge. In this browser the coach reads
          aloud and you tap your answers.
        </p>
      )}

      {loading && <div className="indet max-w-sm" role="status" aria-label="Preparing" />}

      {running && (
        <div role="status" aria-live="polite" className="space-y-2 rounded-md border-2 border-ink p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                phase === "listening" ? "animate-pulse bg-pen" : "bg-ink"
              }`}
            />
            <span className="text-sm font-semibold">
              {phase === "listening"
                ? "Listening: say A, B, C or D"
                : phase === "speaking"
                ? "Coach is speaking"
                : "Preparing your session"}
            </span>
            {heard && <span className="text-sm text-ink-soft">I heard: "{heard}"</span>}
            <button className="btn btn-ghost ml-auto" onClick={stopSession}>
              Stop
            </button>
          </div>
          {caption && <p className="max-w-[70ch] text-sm leading-relaxed text-ink-soft">{caption}</p>}
        </div>
      )}

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
          {!running && (
            <button className="btn btn-ghost" onClick={listen}>
              ▶ Listen to the brief
            </button>
          )}
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
                        disabled={picked || (running && i !== qRef.current)}
                        onClick={() => pick(i, j)}
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