import { useState } from "react";
import Coach from "./Coach";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const COLORS = [
  "border-indigo-500 bg-indigo-50",
  "border-cyan-500 bg-cyan-50",
  "border-emerald-500 bg-emerald-50",
  "border-amber-500 bg-amber-50",
  "border-rose-500 bg-rose-50",
  "border-violet-500 bg-violet-50",
];
const colorFor = (course, list) =>
  COLORS[Math.max(0, list.indexOf(course)) % COLORS.length];

const todayISO = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

const taskKey = (t) => `${t.day}|${t.course}|${t.title}`;
const STEPS = [
  ["upload", "1. Upload"],
  ["review", "2. Review"],
  ["plan", "3. Plan"],
];

const Spinner = ({ text }) => (
  <div className="flex items-center gap-3 text-indigo-700">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
    <span>{text}</span>
  </div>
);

export default function App() {
  const [step, setStep] = useState("upload");
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [startDate, setStartDate] = useState("2026-10-26");
  const [hours, setHours] = useState(2);
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState([]);
  const [plan, setPlan] = useState(null);
  const [planStart, setPlanStart] = useState("2026-10-26");
  const [done, setDone] = useState({});
  const [replanFrom, setReplanFrom] = useState(todayISO());
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function extract() {
    if (!files.length) return setMessage("Choose at least one PDF or slide deck first.");
    setLoading(true);
    setMessage("");
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      form.append("start_date", startDate);
      const res = await fetch(`${API}/extract`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setItems(data.items);
      setErrors(data.errors);
      setStep("review");
    } catch (e) {
      setMessage(`Could not extract: ${e.message}. Is the backend running?`);
    }
    setLoading(false);
  }

  function updateItem(i, field, value) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i ? { ...it, [field]: value, needs_review: false } : it
      )
    );
  }

  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const body = (start, its) =>
    JSON.stringify({ items: its, start_date: start, hours_per_day: Number(hours) });

  async function requestPlan(start, its) {
    const res = await fetch(`${API}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(start, its),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return res.json();
  }

  async function makePlan() {
    setLoading(true);
    setMessage("");
    try {
      setPlan(await requestPlan(startDate, items));
      setPlanStart(startDate);
      setDone({});
      setNotice("");
      setStep("plan");
    } catch (e) {
      setMessage(`Could not build plan: ${e.message}`);
    }
    setLoading(false);
  }

  async function replan() {
    if (!plan) return;
    const doneHours = {};
    plan.tasks.forEach((t) => {
      if (done[taskKey(t)]) {
        const k = `${t.course}|${t.title}`;
        doneHours[k] = (doneHours[k] || 0) + t.hours;
      }
    });
    const remaining = items
      .map((it) => ({
        ...it,
        est_hours:
          Math.round((it.est_hours - (doneHours[`${it.course}|${it.title}`] || 0)) * 100) / 100,
      }))
      .filter((it) => it.est_hours > 0.01);
    setLoading(true);
    setMessage("");
    try {
      const newPlan = await requestPlan(replanFrom, remaining);
      setItems(remaining);
      setPlan(newPlan);
      setPlanStart(replanFrom);
      setDone({});
      setNotice(`Re-planned from ${replanFrom}. ${remaining.length} item(s) of work left.`);
    } catch (e) {
      setMessage(`Could not re-plan: ${e.message}`);
    }
    setLoading(false);
  }

  async function downloadIcs() {
    const res = await fetch(`${API}/export.ics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(planStart, items),
    });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-plan.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  const byDay = plan
    ? plan.tasks.reduce((acc, t) => ((acc[t.day] ||= []).push(t), acc), {})
    : {};
  const courses = plan ? [...new Set(plan.tasks.map((t) => t.course))] : [];
  const doneCount = Object.values(done).filter(Boolean).length;
  const totalCount = plan ? plan.tasks.length : 0;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const today = todayISO();

  const input = "w-full rounded border border-slate-300 px-2 py-1";
  const button =
    "rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50";
  const card = "rounded-2xl bg-white p-6 shadow-lg";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-gradient-to-r from-indigo-700 via-blue-600 to-cyan-600 px-6 py-8 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-extrabold tracking-tight">Study Route AI</h1>
          <p className="opacity-90">The AI reads. The code plans. You study.</p>
          <div className="mt-5 flex gap-2">
            {STEPS.map(([id, label]) => (
              <div
                key={id}
                className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                  step === id ? "bg-white text-indigo-700" : "bg-white/20 text-white"
                }`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        {message && <div className="rounded-lg bg-red-100 p-3 text-red-800">{message}</div>}

        {step === "upload" && (
          <section className={`${card} space-y-5`}>
            <h2 className="text-xl font-bold">Upload your syllabi</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                setFiles([...e.dataTransfer.files].filter((f) => /\.(pdf|pptx)$/i.test(f.name)));
              }}
              className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
                drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300"
              }`}
            >
              <p className="text-4xl">📄</p>
              <p className="font-semibold">Drag your syllabus PDFs or slide decks here</p>
              <label className="cursor-pointer text-indigo-600 underline">
                or browse files
                <input
                  type="file"
                  accept=".pdf,.pptx"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles([...e.target.files])}
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 text-sm text-slate-600">
                  {files.map((f) => (
                    <li key={f.name}>✓ {f.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm font-medium">
                Term start date
                <input type="date" className={input} value={startDate}
                  onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Study hours per day
                <input type="number" min="0.5" step="0.5" className={input} value={hours}
                  onChange={(e) => setHours(e.target.value)} />
              </label>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              🔒 Privacy: your files are used only to build your plan. Course text is sent to an
              AI provider to read it and to a voice provider for audio. You can delete your data at any time.
            </p>
            {loading ? (
              <Spinner text="Reading your files... this can take up to a minute" />
            ) : (
              <button className={button} onClick={extract}>Extract deadlines</button>
            )}
          </section>
        )}

        {step === "review" && (
          <section className={`${card} space-y-4`}>
            <h2 className="text-xl font-bold">Check and correct</h2>
            <p className="text-sm text-slate-500">
              Yellow rows need your attention. Items with no date cannot be scheduled.
            </p>
            {errors.map((e, i) => (
              <div key={i} className="rounded bg-red-100 p-2 text-sm text-red-800">{e}</div>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th>Course</th><th>Title</th><th>Due</th><th>Weight %</th><th>Hours</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className={it.needs_review ? "bg-yellow-100" : ""}>
                      <td className="p-1">{it.course}</td>
                      <td className="p-1"><input className={input} value={it.title}
                        onChange={(e) => updateItem(i, "title", e.target.value)} /></td>
                      <td className="p-1"><input type="date" className={input} value={it.due_date || ""}
                        onChange={(e) => updateItem(i, "due_date", e.target.value || null)} /></td>
                      <td className="p-1"><input type="number" className={input} value={it.grade_weight}
                        onChange={(e) => updateItem(i, "grade_weight", Number(e.target.value))} /></td>
                      <td className="p-1"><input type="number" className={input} value={it.est_hours}
                        onChange={(e) => updateItem(i, "est_hours", Number(e.target.value))} /></td>
                      <td className="p-1"><button onClick={() => removeItem(i)} title="Remove">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-lg border px-4 py-2" onClick={() => setStep("upload")}>Back</button>
              {loading ? <Spinner text="Planning..." /> : (
                <button className={button} onClick={makePlan}>Build my plan</button>
              )}
            </div>
          </section>
        )}

        {step === "plan" && plan && (
          <section className="space-y-4">
            <div className={`${card} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Your daily plan</h2>
                <div className="flex gap-3">
                  <button className="rounded-lg border px-4 py-2" onClick={() => setStep("review")}>Edit items</button>
                  <button className={button} onClick={downloadIcs}>Download .ics</button>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>{doneCount} of {totalCount} tasks done</span><span>{pct}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {courses.map((c) => (
                  <span key={c} className={`rounded-full border-l-4 px-3 py-1 ${colorFor(c, courses)}`}>{c}</span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <b>Fell behind?</b>
              <p className="text-sm text-slate-600">
                Tick what you finished, pick the day you are restarting from, and the plan is rebuilt around the work that is left.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm">Re-plan from
                  <input type="date" className={input} value={replanFrom}
                    onChange={(e) => setReplanFrom(e.target.value)} />
                </label>
                {loading ? <Spinner text="Re-planning..." /> : (
                  <button className={button} onClick={replan}>I missed a day: re-plan</button>
                )}
              </div>
              {notice && <p className="mt-3 text-sm font-semibold text-indigo-700">{notice}</p>}
            </div>

            <Coach key={planStart + plan.tasks.length} tasks={plan.tasks} />

            {plan.at_risk.length > 0 && (
              <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
                <b className="text-red-700">⚠ At risk: not enough time before the deadline</b>
                <ul className="list-disc pl-6 text-sm">
                  {plan.at_risk.map((r, i) => (
                    <li key={i}>{r.course}: {r.title} (due {r.due_date}), {r.hours_unscheduled}h unscheduled</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.unscheduled.length > 0 && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-sm">
                <b>No date, so not scheduled:</b>{" "}
                {plan.unscheduled.map((u) => `${u.course}: ${u.title}`).join(", ")}
              </div>
            )}

            {Object.entries(byDay).map(([day, tasks]) => (
              <div key={day} className={`${card} ${day === today ? "ring-2 ring-indigo-500" : ""}`}>
                <h3 className="font-bold text-indigo-700">
                  {day} {day === today && <span className="ml-2 rounded bg-indigo-600 px-2 py-0.5 text-xs text-white">TODAY</span>}
                </h3>
                {tasks.map((t) => (
                  <label key={taskKey(t)}
                    className={`mt-2 flex items-center gap-3 rounded-lg border-l-4 p-2 ${colorFor(t.course, courses)}`}>
                    <input type="checkbox" checked={!!done[taskKey(t)]}
                      onChange={(e) => setDone((d) => ({ ...d, [taskKey(t)]: e.target.checked }))} />
                    <span className={done[taskKey(t)] ? "text-slate-400 line-through" : ""}>
                      <b>{t.course}</b>: {t.title}
                    </span>
                    <span className="ml-auto text-sm text-slate-500">{t.hours}h</span>
                  </label>
                ))}
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}