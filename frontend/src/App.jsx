import { useEffect, useState } from "react";
import Coach from "./Coach";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Each course gets its own highlighter colour (yellow is kept for "check this")
const COURSE_COLORS = ["#ffa6c9", "#86e3bc", "#8cc8ff", "#cdb8ff", "#ffc785", "#d4ea7a"];
const colorFor = (course, list) =>
  COURSE_COLORS[Math.max(0, list.indexOf(course)) % COURSE_COLORS.length];

const todayISO = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

const taskKey = (t) => `${t.day}|${t.course}|${t.title}`;

const fmtDay = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return {
    wd: d.toLocaleDateString("en-GB", { weekday: "short" }),
    dm: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  };
};

const STEPS = [
  ["upload", "Upload"],
  ["review", "Review"],
  ["plan", "Plan"],
];

const ROW = "grid grid-cols-[1.3fr_2fr_1.3fr_0.8fr_0.8fr_2rem] items-center gap-3";

function RouteLine({ step }) {
  const idx = STEPS.findIndex(([id]) => id === step);
  return (
    <ol className="flex items-center" aria-label="Progress">
      {STEPS.map(([id, label], i) => (
        <li key={id} className="flex items-center">
          <span
            aria-current={i === idx ? "step" : undefined}
            className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-bold ${
              i <= idx
                ? "border-ink bg-ink text-white"
                : "border-rule bg-white text-ink-soft"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={`ml-2 text-sm ${
              i === idx ? "font-semibold" : "text-ink-soft"
            }`}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <span
              className={`mx-3 h-0.5 w-6 sm:w-14 ${i < idx ? "bg-ink" : "bg-rule"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function Working({ label, long }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  let msg = label;
  if (long && s >= 8 && s < 25) msg = "Finding deadlines and grade weights";
  if (long && s >= 25) msg = "Still working. Long documents can take up to a minute.";
  return (
    <div role="status" aria-live="polite" className="max-w-sm space-y-2">
      <div className="indet" />
      <p className="text-sm text-ink-soft">
        {msg} <span className="tabular-nums">({s}s)</span>
      </p>
    </div>
  );
}

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

  const addFiles = (list) =>
    setFiles((prev) => {
      const next = [...prev];
      [...list]
        .filter((f) => /\.(pdf|pptx)$/i.test(f.name))
        .forEach((f) => {
          if (!next.some((p) => p.name === f.name)) next.push(f);
        });
      return next;
    });

  async function extract() {
    if (!files.length) return setMessage("Add at least one PDF or slide deck first.");
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
      setMessage(`Could not read your files: ${e.message}. Check that the backend is running, then try again.`);
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

  const renameCourse = (from, to) =>
    setItems((prev) => prev.map((it) => (it.course === from ? { ...it, course: to } : it)));

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
      setMessage(`Could not build the plan: ${e.message}`);
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
          Math.round(
            (it.est_hours - (doneHours[`${it.course}|${it.title}`] || 0)) * 100
          ) / 100,
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
  const courseNames = [...new Set(items.map((it) => it.course))];

  // "session 3 of 12" labels, so repeated days for one item can be told apart
  const partOf = {};
  if (plan) {
    const totals = {};
    const seen = {};
    plan.tasks.forEach((t) => {
      const k = `${t.course}|${t.title}`;
      totals[k] = (totals[k] || 0) + 1;
    });
    plan.tasks.forEach((t) => {
      const k = `${t.course}|${t.title}`;
      seen[k] = (seen[k] || 0) + 1;
      partOf[taskKey(t)] = totals[k] > 1 ? `session ${seen[k]} of ${totals[k]}` : "";
    });
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="6" cy="22" r="3.5" fill="#14213d" />
            <circle cx="22" cy="6" r="3.5" fill="#fff" stroke="#14213d" strokeWidth="2.5" />
            <path
              d="M6 22 C6 12, 22 18, 22 6"
              fill="none"
              stroke="#14213d"
              strokeWidth="2.5"
              strokeDasharray="1 5"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-display text-xl font-bold">Study Route</span>
        </div>
        <RouteLine step={step} />
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 pb-12">
        {message && (
          <div role="alert" className="sheet border-l-4 border-l-pen p-3 text-pen">
            {message}
          </div>
        )}

        {step === "upload" && (
          <div className="grid gap-10 pt-4 lg:grid-cols-[1fr_1.05fr] lg:items-start">
            <div className="space-y-6">
              <h1 className="font-display text-4xl font-bold leading-[1.08] sm:text-5xl">
                Upload your syllabi. Get a plan for today.
              </h1>
              <p className="max-w-[52ch] text-lg leading-relaxed text-ink-soft">
                We read each course outline, pull out every deadline and grade
                weight, and spread the work across the days you have. You check
                everything before it becomes a plan.
              </p>
              <aside className="max-w-[52ch] border-l-4 border-ink pl-4 text-sm leading-relaxed">
                <b>The AI only reads. Plain code plans.</b> The schedule comes
                from a scheduling program, not the AI, so it never invents a due
                date.
              </aside>
            </div>

            <section className="sheet space-y-5 p-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`rounded-md border-2 border-dashed p-8 text-center transition-colors ${
                  drag ? "border-ink bg-sky/30" : "border-ink-soft/40"
                }`}
              >
                <svg width="36" height="36" viewBox="0 0 36 36" className="mx-auto" aria-hidden="true">
                  <path
                    d="M9 4h13l7 7v21H9z"
                    fill="#fff"
                    stroke="#14213d"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path d="M22 4v7h7" fill="none" stroke="#14213d" strokeWidth="2" strokeLinejoin="round" />
                  <rect x="12" y="17" width="14" height="4" fill="#ffe24d" />
                </svg>
                <p className="mt-3 font-semibold">Drop PDFs or slide decks here</p>
                <label className="mt-1 inline-block cursor-pointer underline underline-offset-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
                  or choose files
                  <input
                    type="file"
                    accept=".pdf,.pptx"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li
                      key={f.name}
                      className="flex items-center justify-between rounded bg-paper px-3 py-1.5 text-sm"
                    >
                      <span>✓ {f.name}</span>
                      <button
                        type="button"
                        className="px-2 text-ink-soft hover:text-ink"
                        aria-label={`Remove ${f.name}`}
                        onClick={() =>
                          setFiles((p) => p.filter((x) => x.name !== f.name))
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-5">
                <label className="text-sm font-medium">
                  Term start date
                  <input
                    type="date"
                    className="field mt-1"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span className="mt-1 block text-xs font-normal text-ink-soft">
                    Turns “Week 6” into a real date.
                  </span>
                </label>
                <label className="text-sm font-medium">
                  Study hours per day
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    className="field mt-1"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </label>
              </div>

              <p className="text-xs leading-relaxed text-ink-soft">
                Files are read to build your plan and are not used for training.
                Course text goes to an AI service to read it and to a voice
                service for audio. Extracted deadlines are cached on the server
                so repeat uploads load faster.
              </p>

              {loading ? (
                <Working long label="Reading your files" />
              ) : (
                <button className="btn btn-primary" onClick={extract}>
                  Extract deadlines
                </button>
              )}
            </section>
          </div>
        )}

        {step === "review" && (
          <section className="sheet space-y-5 p-6">
            <div>
              <h1 className="font-display text-3xl font-bold">Check what we found</h1>
              <p className="mt-1 max-w-[60ch] text-ink-soft">
                Highlighted rows are ones we were not sure about, usually because
                the syllabus gave a week instead of a date. Fix anything that
                looks wrong. Items with no date cannot be scheduled.
              </p>
            </div>

            {courseNames.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Course names</p>
                <div className="flex flex-wrap gap-4">
                  {courseNames.map((c, i) => (
                    <input
                      key={i}
                      className="field w-64"
                      aria-label={`Rename course ${c}`}
                      value={c}
                      onChange={(e) => renameCourse(c, e.target.value)}
                    />
                  ))}
                </div>
                <p className="text-xs text-ink-soft">
                  Course names come from the file names. Rename them here and every row follows.
                </p>
              </div>
            )}

            {errors.map((e, i) => (
              <div key={i} role="alert" className="border-l-4 border-l-pen bg-paper p-2 text-sm text-pen">
                {e}
              </div>
            ))}

            {items.length === 0 ? (
              <p className="py-6 text-ink-soft">
                No deadlines found. Go back and add a PDF or slide deck that
                contains selectable text.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className={`${ROW} border-b border-rule pb-2 text-sm font-semibold text-ink-soft`}>
                    <span>Course</span>
                    <span>Title</span>
                    <span>Due</span>
                    <span>Weight %</span>
                    <span>Hours</span>
                    <span />
                  </div>
                  {items.map((it, i) => (
                    <div
                      key={i}
                      className={`${ROW} border-b border-rule/70 px-1 py-1.5 ${
                        it.needs_review ? "mark" : ""
                      }`}
                      style={
                        it.needs_review
                          ? { animationDelay: `${Math.min(i, 12) * 50}ms` }
                          : undefined
                      }
                    >
                      <span className="text-sm">{it.course}</span>
                      <input
                        className="field"
                        aria-label={`Title: ${it.title}`}
                        value={it.title}
                        onChange={(e) => updateItem(i, "title", e.target.value)}
                      />
                      <input
                        type="date"
                        className="field"
                        aria-label={`Due date: ${it.title}`}
                        value={it.due_date || ""}
                        onChange={(e) => updateItem(i, "due_date", e.target.value || null)}
                      />
                      <input
                        type="number"
                        className="field tabular-nums"
                        aria-label={`Weight percent: ${it.title}`}
                        value={it.grade_weight}
                        onChange={(e) => updateItem(i, "grade_weight", Number(e.target.value))}
                      />
                      <input
                        type="number"
                        className="field tabular-nums"
                        aria-label={`Hours: ${it.title}`}
                        value={it.est_hours}
                        onChange={(e) => updateItem(i, "est_hours", Number(e.target.value))}
                      />
                      <button
                        className="text-ink-soft hover:text-pen"
                        aria-label={`Remove ${it.title}`}
                        onClick={() => removeItem(i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-ghost" onClick={() => setStep("upload")}>
                Back
              </button>
              {loading ? (
                <Working label="Building your plan" />
              ) : (
                <button className="btn btn-primary" onClick={makePlan}>
                  Build my plan
                </button>
              )}
            </div>
          </section>
        )}

        {step === "plan" && plan && (
          <div className="space-y-6">
            <section className="sheet space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold">Your plan</h1>
                  <p className="text-ink-soft">
                    {doneCount} of {totalCount} tasks done
                  </p>
                </div>
                <div className="flex gap-3">
                  <button className="btn btn-ghost" onClick={() => setStep("review")}>
                    Edit items
                  </button>
                  <button className="btn btn-primary" onClick={downloadIcs}>
                    Download .ics
                  </button>
                </div>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-rule"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div
                  className="h-full bg-ink transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {courses.map((c) => (
                  <li key={c}>
                    <span className="swipe font-medium" style={{ "--c": colorFor(c, courses) }}>
                      {c}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {plan.at_risk.length > 0 && (
              <section className="sheet border-l-4 border-l-pen p-5">
                <h2 className="font-semibold text-pen">Won't fit before the deadline</h2>
                <p className="text-sm text-ink-soft">
                  Add study hours or move a date, then build the plan again.
                </p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                  {plan.at_risk.map((r, i) => (
                    <li key={i}>
                      {r.course}: {r.title} (due {r.due_date}), {r.hours_unscheduled}h
                      left over
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.unscheduled.length > 0 && (
              <section className="sheet p-4 text-sm">
                <span className="swipe font-semibold" style={{ "--c": "var(--color-hl-yellow)" }}>
                  No date, so left out
                </span>{" "}
                {plan.unscheduled.map((u) => `${u.course}: ${u.title}`).join(", ")}
              </section>
            )}

            <section className="sheet border-l-4 border-l-ink p-5">
              <h2 className="font-display text-xl font-bold">Fell behind?</h2>
              <p className="max-w-[60ch] text-sm text-ink-soft">
                Tick what you finished, pick the day you are restarting from,
                and the plan is rebuilt around the work that is left.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <label className="text-sm font-medium">
                  Re-plan from
                  <input
                    type="date"
                    className="field mt-1 w-auto"
                    value={replanFrom}
                    onChange={(e) => setReplanFrom(e.target.value)}
                  />
                </label>
                {loading ? (
                  <Working label="Re-planning" />
                ) : (
                  <button className="btn btn-primary" onClick={replan}>
                    I missed a day: re-plan
                  </button>
                )}
              </div>
              {notice && <p className="mt-3 text-sm font-semibold">{notice}</p>}
            </section>

            <Coach key={planStart + plan.tasks.length} tasks={plan.tasks} />

            <section className="sheet divide-y divide-rule">
              {Object.entries(byDay).map(([day, tasks]) => {
                const { wd, dm } = fmtDay(day);
                const total = Math.round(tasks.reduce((a, t) => a + t.hours, 0) * 100) / 100;
                return (
                  <div key={day} className="grid gap-3 p-5 sm:grid-cols-[8rem_1fr]">
                    <div>
                      <div className="font-display text-2xl font-bold leading-none">{dm}</div>
                      <div className="mt-1 text-sm text-ink-soft">
                        {wd}, {total}h
                      </div>
                      {day === today && (
                        <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-pen">
                          <span className="h-2 w-2 rounded-full bg-pen" />
                          Today
                        </div>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {tasks.map((t) => (
                        <li key={taskKey(t)}>
                          <label className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-paper">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-ink"
                              checked={!!done[taskKey(t)]}
                              onChange={(e) =>
                                setDone((d) => ({ ...d, [taskKey(t)]: e.target.checked }))
                              }
                            />
                            <span className={done[taskKey(t)] ? "text-ink-soft line-through" : ""}>
                              <span
                                className="swipe font-medium"
                                style={{ "--c": colorFor(t.course, courses) }}
                              >
                                {t.course}
                              </span>{" "}
                              {t.title}
                              {partOf[taskKey(t)] && (
                                <span className="ml-2 text-sm text-ink-soft">
                                  ({partOf[taskKey(t)]})
                                </span>
                              )}
                            </span>
                            <span className="ml-auto text-sm tabular-nums text-ink-soft">
                              {t.hours}h
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-sm text-ink-soft">
        Study Route AI, built for Hack Global.
      </footer>
    </div>
  );
}
