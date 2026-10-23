import { useState } from "react";

const API = "http://127.0.0.1:8000";

export default function App() {
  const [step, setStep] = useState("upload");
  const [files, setFiles] = useState([]);
  const [startDate, setStartDate] = useState("2026-10-26");
  const [hours, setHours] = useState(2);
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function extract() {
    if (!files.length) return setMessage("Choose at least one PDF first.");
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

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const body = () =>
    JSON.stringify({
      items,
      start_date: startDate,
      hours_per_day: Number(hours),
    });

  async function makePlan() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body(),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setPlan(await res.json());
      setStep("plan");
    } catch (e) {
      setMessage(`Could not build plan: ${e.message}`);
    }
    setLoading(false);
  }

  async function downloadIcs() {
    const res = await fetch(`${API}/export.ics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-plan.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  const byDay = plan
    ? plan.tasks.reduce((acc, t) => {
        (acc[t.day] ||= []).push(t);
        return acc;
      }, {})
    : {};

  const input = "rounded border border-slate-300 px-2 py-1 w-full";
  const button =
    "rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-gradient-to-r from-indigo-700 to-cyan-600 p-6 text-white">
        <h1 className="text-3xl font-extrabold">Study Route AI</h1>
        <p className="opacity-90">Syllabi in. A daily plan out.</p>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        {message && (
          <div className="rounded bg-red-100 p-3 text-red-800">{message}</div>
        )}

        {step === "upload" && (
          <section className="space-y-4 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">1. Upload your syllabi</h2>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setFiles([...e.target.files])}
            />
            <div className="grid grid-cols-2 gap-4">
              <label>
                Term start date
                <input
                  type="date"
                  className={input}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label>
                Study hours per day
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  className={input}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
            </div>
            <p className="text-sm text-slate-500">
              Privacy: your files are used only to build your plan. Course text
              is sent to an AI provider to read it. You can delete your data at
              any time.
            </p>
            <button className={button} disabled={loading} onClick={extract}>
              {loading ? "Reading your syllabi..." : "Extract deadlines"}
            </button>
          </section>
        )}

        {step === "review" && (
          <section className="space-y-4 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">2. Check and correct</h2>
            <p className="text-sm text-slate-500">
              Yellow rows need your attention. Items with no date cannot be
              scheduled.
            </p>
            {errors.map((e, i) => (
              <div key={i} className="rounded bg-red-100 p-2 text-sm text-red-800">
                {e}
              </div>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th>Course</th><th>Title</th><th>Due</th>
                    <th>Weight %</th><th>Hours</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className={it.needs_review ? "bg-yellow-100" : ""}>
                      <td className="p-1">{it.course}</td>
                      <td className="p-1">
                        <input className={input} value={it.title}
                          onChange={(e) => updateItem(i, "title", e.target.value)} />
                      </td>
                      <td className="p-1">
                        <input type="date" className={input} value={it.due_date || ""}
                          onChange={(e) => updateItem(i, "due_date", e.target.value || null)} />
                      </td>
                      <td className="p-1">
                        <input type="number" className={input} value={it.grade_weight}
                          onChange={(e) => updateItem(i, "grade_weight", Number(e.target.value))} />
                      </td>
                      <td className="p-1">
                        <input type="number" className={input} value={it.est_hours}
                          onChange={(e) => updateItem(i, "est_hours", Number(e.target.value))} />
                      </td>
                      <td className="p-1">
                        <button onClick={() => removeItem(i)} title="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button className="rounded-lg border px-4 py-2" onClick={() => setStep("upload")}>
                Back
              </button>
              <button className={button} disabled={loading} onClick={makePlan}>
                {loading ? "Planning..." : "Build my plan"}
              </button>
            </div>
          </section>
        )}

        {step === "plan" && plan && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">3. Your daily plan</h2>
              <div className="flex gap-3">
                <button className="rounded-lg border px-4 py-2" onClick={() => setStep("review")}>
                  Edit items
                </button>
                <button className={button} onClick={downloadIcs}>
                  Download .ics
                </button>
              </div>
            </div>

            {plan.at_risk.length > 0 && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4">
                <b className="text-red-700">At risk: not enough time before the deadline</b>
                <ul className="list-disc pl-6 text-sm">
                  {plan.at_risk.map((r, i) => (
                    <li key={i}>
                      {r.course}: {r.title} (due {r.due_date}), {r.hours_unscheduled}h
                      unscheduled
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.unscheduled.length > 0 && (
              <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm">
                <b>No date, so not scheduled:</b>{" "}
                {plan.unscheduled.map((u) => `${u.course}: ${u.title}`).join(", ")}
              </div>
            )}

            {Object.entries(byDay).map(([day, tasks]) => (
              <div key={day} className="rounded-xl bg-white p-4 shadow">
                <h3 className="font-bold text-indigo-700">{day}</h3>
                {tasks.map((t, i) => (
                  <label key={i} className="flex items-center gap-3 py-1">
                    <input type="checkbox" />
                    <span>
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