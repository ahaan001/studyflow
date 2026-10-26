const V = {};

// ---------- shared bits ----------
function itemWhy(it, today) {
  const out = [];
  if (!it) return "";
  if (it.kind !== "review") out.push(chip(it.subjectId));
  if (it.kind === "review") out.push(`<span class="pill info">Spaced review</span>`);
  if (it.kind === "revision") {
    const ex = examOf(it.examId);
    if (ex) out.push(`<span>for ${esc(ex.title)} · ${esc(SF.relDay(ex.date, today))}</span>`);
    if (it.weak) out.push(`<span class="pill crit">Weak topic</span>`);
    else if (it.state === "revise") out.push(`<span class="pill warn">Needs revision</span>`);
    else if (it.state === "ns") out.push(`<span class="pill">Not started</span>`);
  }
  if (it.kind === "step" || it.kind === "task") {
    if (it.kind === "step") {
      const t = taskOf(it.taskId);
      if (t) {
        const n = t.steps.findIndex((x) => x.id === it.stepId) + 1;
        out.push(`<span>${esc(t.title)} · step ${n} of ${t.steps.length}</span>`);
      }
    }
    if (it.overdue) out.push(`<span class="pill crit">Overdue</span>`);
    else out.push(`<span>Due ${esc(relLow(it.realDue || it.due))}</span>`);
    const t = taskOf(it.taskId);
    if (t && Number(t.difficulty) === 3) out.push(`<span class="pill warn">Hard</span>`);
  }
  return out.join("");
}

function radarHTML(P, n) {
  const s = st();
  const keys = Object.keys(P.days).slice(0, n || 14);
  const maxRef = Math.max(60, ...keys.map((k) => Math.max(P.days[k].total, (s.meta.settings.days[SF.wd(k)] || {}).max || 0)));
  const cols = keys.map((k, i) => {
    const d = P.days[k];
    const cfg = s.meta.settings.days[SF.wd(k)] || {};
    const done = i === 0 ? SF.studiedOn(s, k) : 0;
    const L = SF.loadLabel(d.total + done, d.cap, cfg.max, d.crunch);
    const h = Math.min(100, ((d.total + done) / maxRef) * 100);
    const title = `${SF.fmtDay(k)}: ${SF.dur(d.total + done)} of study, ${L.label.toLowerCase()}${d.deadlines ? `, ${plural(d.deadlines, "deadline")}` : ""}`;
    return `<div class="col ${i === 0 ? "today" : ""}" title="${esc(title)}" aria-label="${esc(title)}">
      <div class="dl">${"<i></i>".repeat(Math.min(3, d.deadlines))}</div>
      <div class="well"><div class="fill ${L.key}" style="height:${h}%"></div></div>
      <div class="d"><b>${SF.DAYS[SF.wd(k)][0]}</b>${SF.parse(k).getDate()}</div>
    </div>`;
  });
  return `<div class="radar" role="img" aria-label="Workload for the next ${keys.length} days">${cols.join("")}</div>
    <div class="legend"><span><i style="background:color-mix(in srgb,var(--good) 55%,var(--surface))"></i>Light</span><span><i style="background:var(--good)"></i>Manageable</span><span><i style="background:var(--warn)"></i>Busy</span><span><i style="background:var(--crit)"></i>Heavy</span><span><i style="background:var(--ink);border-radius:99px;width:7px;height:7px"></i>Deadline</span></div>`;
}

function radarAlerts(P) {
  const s = st(), today = P.today;
  const out = [];
  for (const r of P.atRisk) {
    if (r.short < 10) continue;
    const it = r.item;
    const name = it.kind === "step" ? `${it.parent}: ${it.title}` : it.kind === "revision" ? `${it.title} (${it.parent})` : it.title;
    const fix = it.kind === "revision"
      ? "Add study time before the test, or mark topics you already know well as Mastered."
      : it.realDue && it.due < it.realDue ? "Add study time on the days before, or move your personal deadline closer to the real one." : "Add study time on the days before, or start sooner by doing a session ahead of plan.";
    out.push({ kind: "crit", html: `<b>${esc(name)}</b> needs ${SF.dur(r.short)} more than you have before ${esc(SF.fmtDay(it.due))}. ${fix}` });
  }
  const keys = Object.keys(P.days).slice(1, 8);
  for (const k of keys) {
    const d = P.days[k];
    const cfg = s.meta.settings.days[SF.wd(k)] || {};
    if (!d.crunch && d.total >= 0.75 * Math.max(d.cap, cfg.max || 0) && d.deadlines >= 2)
      out.push({ kind: "warn", html: `<b>${esc(SF.fmtDay(k))}</b> is busy: ${SF.dur(d.total)} planned and ${plural(d.deadlines, "deadline")}. Don't skip the sessions before it; that's what keeps it from piling up.` });
  }
  for (const b of P.blocked.slice(0, 3)) {
    const t = taskOf(b.taskId);
    const who = b.blockedBy.map((x) => (t.members || []).find((m) => m.id === x.assignee)).filter(Boolean).map((m) => m.name);
    out.push({ kind: "info", html: `<b>${esc(b.title)}</b> (${esc(t.title)}) is waiting on ${esc(who.join(" and ") || "a teammate")}: ${esc(b.blockedBy.map((x) => x.title).join(", "))}.` });
  }
  return out;
}

function examReadiness(ex, idx) {
  const sub = subjOf(ex.subjectId);
  if (!sub) return { pct: 0, ids: [] };
  const ids = ex.topicIds && ex.topicIds.length ? ex.topicIds : SF.subjectTopics(sub).map((t) => t.id);
  const scores = ids.map((id) => (idx.topicState[id] ? idx.topicState[id].score : 0));
  return { pct: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100 : 0, ids };
}

// ---------- onboarding ----------
const SUBJECT_GROUPS = [
  ["Languages", ["English Language", "English Literature", "Hindi", "German", "Spanish", "Marathi"]],
  ["Maths", ["Integrated Math", "International Math", "Extended Math"]],
  ["Sciences", ["Biology", "Chemistry", "Physics"]],
  ["Humanities", ["History", "Global Perspectives", "Thinking Skills", "Business Studies"]],
  ["Arts and computing", ["Art & Design", "ICT", "Computer Science", "Drama"]],
  ["Clubs, sport and wellbeing", ["Film Club", "Self Defence", "Robotics", "PE", "Student Wellbeing"]],
];
const PRESET_SUBJECTS = SUBJECT_GROUPS.flatMap((g) => g[1]);
function onbState() {
  if (!S.ui.onb) S.ui.onb = { picked: [], confirmed: false, days: JSON.parse(JSON.stringify(SF.defaultSettings().days)), acts: [] };
  return S.ui.onb;
}
V.onboarding = () => {
  const o = onbState();
  const n = o.picked.length;
  const ordered = PRESET_SUBJECTS.filter((x) => o.picked.includes(x));
  const step1 = o.confirmed
    ? `<div class="stack-sm"><div class="between"><h2 class="row-flex">${icon("check")}${plural(n, "subject")} confirmed</h2><button type="button" class="btn sm" data-act="onb-edit-subjects">Change</button></div>
        <p class="muted">${ordered.map(esc).join(", ")}</p></div>`
    : `<div><h2>Which subjects do you take?</h2><p class="muted">Tap every subject and activity on your timetable, then confirm.</p></div>
      ${SUBJECT_GROUPS.map(([g, list]) => `<div class="stack-sm"><div class="eyebrow">${esc(g)}</div><div class="pickchips">${list.map((x) => `<button type="button" data-act="onb-pick" data-name="${esc(x)}" aria-pressed="${o.picked.includes(x)}">${esc(x)}</button>`).join("")}</div></div>`).join("")}
      <div class="between" style="border-top:1px solid var(--line);padding-top:14px"><span class="muted">${n ? `${plural(n, "subject")} selected` : "Nothing selected yet"}</span>
        <button type="button" class="btn primary" data-act="onb-confirm-subjects" ${n ? "" : "disabled"}>${icon("check", "ico-sm")}Confirm subjects</button></div>`;
  const opts = (sel) => [0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((m) => `<option value="${m}" ${Number(sel) === m ? "selected" : ""}>${m ? SF.dur(m) : "Off"}</option>`).join("");
  return `<div class="onb">
    <div class="onb-hero">
      <div class="eyebrow">StudyFlow</div>
      <h1>Your whole school week, planned around your actual life.</h1>
      <p>Tell StudyFlow your subjects and when you can study. Add homework and tests as they come, and it builds a realistic plan each day, finds your weak topics, and re-plans when a day goes sideways.</p>
    </div>
    <div class="panel onb-step"><div class="n">1</div><div class="stack">${step1}</div></div>
    <div class="panel onb-step"><div class="n">2</div><div class="stack">
      <div class="between"><div><h2>When can you study?</h2><p class="muted">Set each day separately. The planner only books time inside these hours, never more than the daily limit.</p></div>
        <button type="button" class="btn sm" data-act="onb-copy-monday">Copy Monday to Tue–Fri</button></div>
      <div class="daygrid">
        <span></span><span class="h">From</span><span class="h">Until</span><span class="h">Most per day</span>
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => { const c = o.days[d]; const off = !Number(c.max); return `<b style="${off ? "color:var(--ink-3)" : ""}">${SF.DAYS[d]}</b>
          <input class="input" type="time" id="onb-${d}-start" data-change="onb-time" data-d="${d}" data-f="start" value="${esc(c.start)}" aria-label="${SF.DAYS_LONG[d]} from" ${off ? "disabled" : ""}>
          <input class="input" type="time" id="onb-${d}-end" data-change="onb-time" data-d="${d}" data-f="end" value="${esc(c.end)}" aria-label="${SF.DAYS_LONG[d]} until" ${off ? "disabled" : ""}>
          <select class="input" id="onb-${d}-max" data-change="onb-time" data-d="${d}" data-f="max" aria-label="${SF.DAYS_LONG[d]} most per day">${opts(c.max)}</select>`; }).join("")}
      </div>
      <p class="tiny faint">Pick "Off" for a day with no study.</p>
    </div></div>
    <div class="panel onb-step"><div class="n">3</div><div class="stack">
      <div><h2>Anything regular after school?</h2><p class="muted">Sport, music, tuition. The planner works around these.</p></div>
      ${o.acts.length ? `<div class="list">${o.acts.map((a, i) => `<div class="li"><div class="li-main"><span class="li-title">${esc(a.name)}</span><span class="li-sub">${a.days.map((d) => SF.DAYS[d]).join(", ")} · ${a.start}–${a.end}</span></div><button type="button" class="btn ghost sm" data-act="onb-del-act" data-i="${i}" aria-label="Remove ${esc(a.name)}">${icon("x")}</button></div>`).join("")}</div>` : ""}
      ${activityForm("onb-act")}
    </div></div>
    <div class="between">
      <button type="button" class="btn ghost" data-act="load-example">Explore with example data first</button>
      <button type="button" class="btn primary" data-act="onb-finish" ${o.confirmed && n ? "" : "disabled"}>${o.confirmed && n ? `Start with ${plural(n, "subject")}` : "Confirm your subjects first"}${icon("arrow")}</button>
    </div>
  </div>`;
};

function activityForm(form, a) {
  a = a || { name: "", days: [], start: "18:00", end: "19:00" };
  return `<form class="stack-sm" data-form="${form}">
    <div class="grid3">
      <label class="field"><span>Activity</span><input class="input" name="name" id="${form}-name" placeholder="e.g. Badminton practice" required value="${esc(a.name)}"></label>
      <label class="field"><span>From</span><input class="input" type="time" name="start" id="${form}-start" value="${a.start}" required></label>
      <label class="field"><span>Until</span><input class="input" type="time" name="end" id="${form}-end" value="${a.end}" required></label>
    </div>
    <div class="between"><div class="daychips" role="group" aria-label="Days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="day" value="${d}" ${a.days.includes(d) ? "checked" : ""}><span>${SF.DAYS[d]}</span></label>`).join("")}</div>
    <button class="btn" type="submit">${icon("plus")}Add activity</button></div>
  </form>`;
}

// ---------- today ----------
V.today = () => {
  const s = st(), today = SF.today(), P = plan(), idx = P.idx;
  const d0 = P.days[today];
  const lay = SF.layoutDay(s, today, d0.alloc, true);
  const cfg = s.meta.settings.days[SF.wd(today)] || {};
  const done = s.log.sessions.filter((x) => x.date === today);
  const studied = done.reduce((a, x) => a + (x.min || 0), 0);
  const hr = SF.now().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const planned = lay.sessions.filter((x) => x.start != null);
  const load = SF.loadLabel(d0.total + studied, d0.cap, cfg.max, d0.crunch);
  let summary;
  if (planned.length) summary = `${plural(planned.length, "session")} · ${SF.dur(d0.total)} planned${studied ? ` · ${SF.dur(studied)} done` : ""}`;
  else if (studied) summary = `${SF.dur(studied)} done today. Nothing else planned.`;
  else if (!cfg.max) summary = `No study time set for ${SF.DAYS_LONG[SF.wd(today)]}s.`;
  else summary = `Nothing planned right now.`;

  const y = SF.addDays(today, -1);
  const pl = s.meta.planLog[y];
  let moved = 0;
  if (pl) {
    const doneKeys = new Set(s.log.sessions.filter((x) => x.date === y).map((x) => x.key));
    const live = new Set(P.items.map((i) => i.key));
    moved = pl.filter((p) => !doneKeys.has(p.key) && live.has(p.key) && !p.key.startsWith("v:")).length;
  }

  const rows = [];
  for (const d of done) {
    const end = SF.toMin(d.at);
    rows.push({ type: "done", start: end - (d.min || 0), d });
  }
  for (const a of SF.activitiesOn(s, today)) rows.push({ type: "act", start: SF.toMin(a.start), a });
  planned.forEach((x, i) => rows.push({ type: "plan", start: x.start, x, i }));
  rows.sort((a, b) => a.start - b.start || (a.type === "done" ? -1 : 1));

  const rowHTML = rows.map((r) => {
    if (r.type === "done") {
      return `<div class="sess done"><div class="time">${SF.fromMin(Math.max(0, r.start))}<small>${SF.dur(r.d.min)}</small></div><div><div class="t">${esc(r.d.title)}</div><div class="why">${chip(r.d.subjectId)}<span class="pill good">${icon("check", "ico-sm")}Done</span></div></div><div></div></div>`;
    }
    if (r.type === "act") {
      return `<div class="sess activity"><div class="time">${esc(r.a.start)}<small>until ${esc(r.a.end)}</small></div><div><div class="t">${esc(r.a.name)}</div><div class="why"><span class="tag">Activity</span></div></div><div></div></div>`;
    }
    const x = r.x, it = x.item;
    const menuOpen = S.ui.menu === "s" + r.i;
    const isReview = it.kind === "review";
    return `<div class="sess"><div class="time">${SF.fromMin(x.start)}<small>${SF.dur(x.min)}</small></div>
      <div><div class="t">${esc(it.kind === "step" ? it.title : it.title)}</div><div class="why">${itemWhy(it, today)}</div></div>
      <div class="acts">
        ${isReview ? `<button type="button" class="btn sm primary" data-act="start-review">${icon("play", "ico-sm")}Review</button>` : `<button type="button" class="btn sm primary" data-act="focus" data-key="${esc(x.key)}" data-min="${x.min}">${icon("play", "ico-sm")}Start</button>
        <button type="button" class="btn sm" data-act="done-sess" data-key="${esc(x.key)}" data-min="${x.min}" aria-label="Mark done without the timer" title="Mark done">${icon("check", "ico-sm")}</button>`}
        <div class="menu-wrap"><button type="button" class="btn sm ghost" data-act="menu" data-menu="s${r.i}" aria-label="More options" aria-expanded="${menuOpen}">${icon("more")}</button>
        ${menuOpen ? `<div class="menu" role="menu">
          <button type="button" role="menuitem" data-act="defer" data-key="${esc(x.key)}" data-days="1">Move to tomorrow</button>
          <button type="button" role="menuitem" data-act="defer-pick" data-key="${esc(x.key)}">Move to another day…</button>
          ${it.taskId ? `<button type="button" role="menuitem" data-act="open-task" data-id="${esc(it.taskId)}">Open assignment</button>` : ""}
          ${it.topicId ? `<button type="button" role="menuitem" data-act="open-topic" data-id="${esc(it.topicId)}">Open topic</button>` : ""}
        </div>` : ""}</div>
      </div></div>`;
  }).join("");

  const dueN = SF.dueReviews(s, today).length;
  const reviewPlanned = planned.some((x) => x.item.kind === "review");
  let ahead = "";
  if (!planned.length && SF.hasData(s)) {
    const nextDay = Object.keys(P.days).slice(1).find((k) => P.days[k].alloc.length);
    if (nextDay) {
      const list = P.days[nextDay].alloc.filter((a) => a.item.kind !== "review").slice(0, 3);
      if (list.length) ahead = `<div class="stack-sm" style="margin-top:8px"><div class="between"><h3>Get ahead</h3><span class="small muted">From ${esc(SF.fmtDay(nextDay))}'s plan</span></div>
        <div>${list.map((a) => `<div class="sess"><div class="time">${SF.DAYS[SF.wd(nextDay)]}<small>${SF.dur(a.min)}</small></div><div><div class="t">${esc(a.item.title)}</div><div class="why">${itemWhy(a.item, today)}</div></div>
          <div class="acts"><button type="button" class="btn sm" data-act="focus" data-key="${esc(a.key)}" data-min="${Math.min(a.min, s.meta.settings.session || 40)}">${icon("play", "ico-sm")}Start now</button></div></div>`).join("")}</div></div>`;
    }
  }
  const reviewLine = dueN && !reviewPlanned ? `<div class="alert info" style="margin-top:12px">${icon("revision")}<div class="grow">${plural(dueN, "review question")} due. Five minutes now keeps them from piling up.</div><button type="button" class="btn sm primary" data-act="start-review">Review</button></div>` : "";
  const windowOver = cfg.max && d0.cap === 0 && SF.nowMin() >= SF.toMin(cfg.end) - 10;
  const empty = !rows.length
    ? `<div class="empty"><h3>${!cfg.max ? "Day off" : windowOver && SF.hasData(s) ? "That's it for today" : "Your plan is clear"}</h3><p>${!cfg.max ? `You haven't set study time for ${SF.DAYS_LONG[SF.wd(today)]}s.` : windowOver && SF.hasData(s) ? `Your study time ended at ${esc(cfg.end)}. Tomorrow's plan is ready, or get ahead below.` : "Add homework, a test or a project in the bar at the top and the planner will fit it in."}</p>${!cfg.max ? `<button type="button" class="btn" data-act="go" data-view="settings">${icon("gear")}Study time settings</button>` : ""}</div>`
    : "";

  // week ahead
  const wk = Object.keys(P.days).slice(1, 7).map((k) => {
    const d = P.days[k];
    const seen = new Set();
    const chips = d.alloc.filter((a) => { const t = a.item.kind === "step" ? a.item.taskId : a.item.key; if (seen.has(t)) return false; seen.add(t); return true; })
      .map((a) => { const sub = subjOf(a.item.subjectId); const name = a.item.kind === "step" ? a.item.parent : a.item.title; return `<span class="chip" data-sc="${sub ? sub.color : ""}" title="${esc(name)}">${esc(name.length > 34 ? name.slice(0, 32) + "…" : name)}</span>`; }).join("");
    return `<div class="wd"><div><b>${SF.DAYS[SF.wd(k)]}</b> <span class="muted small">${SF.parse(k).getDate()} ${SF.MONTHS[SF.parse(k).getMonth()]}</span></div><div class="chips">${chips || `<span class="faint small">Free</span>`}</div><div class="mono small" style="text-align:right">${d.total ? SF.dur(d.total) : "–"}</div></div>`;
  }).join("");

  // side: exams
  const exams = s.exams.filter((e) => !e.done && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 4);
  const examsHTML = exams.length ? exams.map((e) => {
    const n = SF.diff(today, e.date);
    const r = examReadiness(e, idx);
    const keys = P.items.filter((i) => i.examId === e.id);
    const left = keys.reduce((a, i) => a + i.remaining, 0);
    return `<div class="count-row"><div class="countdown ${n <= 3 ? "soon" : ""}"><b>${n === 0 ? "0" : n}</b><span>${n === 0 ? "Today" : n === 1 ? "Day" : "Days"}</span></div>
      <div class="stack-sm" style="gap:4px;min-width:0"><button type="button" class="li-title" style="background:none;border:0;padding:0;text-align:left" data-act="go" data-view="revision" data-tab="exams">${esc(e.title)}</button>
      <div class="li-sub">${chip(e.subjectId)}<span>${SF.fmtDay(e.date)}</span></div>
      <div class="row-flex"><div class="bar thin grow" aria-hidden="true"><i style="width:${r.pct}%;background:${r.pct >= 70 ? "var(--good)" : r.pct >= 45 ? "var(--warn)" : "var(--crit)"}"></i></div><span class="small mono">${pct(r.pct)} ready</span></div>
      <div class="tiny muted">${!r.ids.length ? `No topics yet. Add ${esc((subjOf(e.subjectId) || { name: "its" }).name)} topics so revision gets planned.` : left ? `${SF.dur(left)} of revision still to do` : "Revision done. Keep reviewing cards."}</div></div></div>`;
  }).join("") : `<p class="muted small">No tests coming up. Add one in the bar above, like <span class="mono">bio test fri</span>.</p>`;

  const alerts = radarAlerts(P);
  const dueSoon = s.tasks.filter((t) => !t.completedAt && SF.diff(today, t.due) <= 7).sort((a, b) => (a.due < b.due ? -1 : 1));
  const dueHTML = dueSoon.length ? `<div class="list">${dueSoon.map((t) => {
    const prog = taskProgress(t);
    const ready = prog.left <= 0;
    return `<div class="li click" data-act="open-task" data-id="${esc(t.id)}"><div class="li-main"><span class="li-title">${esc(t.title)}</span><span class="li-sub">${chip(t.subjectId)}<span>${t.due < today ? `<span class="pill crit">Overdue</span>` : "Due " + esc(relLow(t.due))}</span></span></div>
      <div class="li-side">${ready ? `<button type="button" class="btn sm hi" data-act="complete-task" data-id="${esc(t.id)}">Hand in</button>` : `<span class="small mono">${prog.label}</span>`}</div></div>`;
  }).join("")}</div>` : `<p class="muted small">Nothing due this week.</p>`;

  return `<div class="page-head"><div><div class="eyebrow">${esc(SF.fmtLong(today))}</div><h1>${greet}${s.meta.name ? ", " + esc(s.meta.name) : ""}</h1><p class="sub">${summary}</p></div>
    ${d0.total || studied ? `<span class="pill loadpill ${{ light: "good", ok: "good", busy: "warn", heavy: "crit", free: "" }[load.key]}">${load.label} day</span>` : ""}</div>
    <div class="today-grid">
      <div class="stack" style="gap:20px">
        ${!s.tasks.length && !s.exams.length ? gettingStarted() : ""}
        <section class="panel" aria-labelledby="plan-h">
          <div class="panel-head"><h2 id="plan-h">Today's plan</h2>${d0.cap === 0 && cfg.max && !planned.length && studied < (cfg.max || 0) ? `<span class="small muted">Study window is over for today</span>` : ""}</div>
          ${moved ? `<div class="alert info" style="margin-bottom:14px">${icon("info")}<div>${plural(moved, "session")} you didn't get to yesterday ${moved === 1 ? "is" : "are"} back in your plan. Nothing is lost, the rest of the week shifted to fit.</div></div>` : ""}
          ${stripHTML(lay, done)}
          <div>${rowHTML}${rows.length ? "" : empty}</div>${reviewLine}${ahead}
        </section>
        <section class="panel" aria-labelledby="wk-h"><div class="panel-head"><h2 id="wk-h">Rest of the week</h2><span class="small muted">Updates whenever you add or finish something</span></div><div class="week">${wk}</div></section>
      </div>
      <div class="today-side">
        <section class="panel" aria-labelledby="ex-h"><div class="panel-head"><h3 id="ex-h">${icon("target")}Tests coming up</h3></div>${examsHTML}</section>
        <section class="panel" aria-labelledby="rd-h"><div class="panel-head"><h3 id="rd-h">${icon("calendar")}Next 2 weeks</h3></div>${radarHTML(P)}
          ${alerts.length ? `<div class="stack-sm" style="margin-top:14px">${alerts.map((a) => `<div class="alert ${a.kind}">${icon(a.kind === "info" ? "lock" : "alert")}<div>${a.html}</div></div>`).join("")}</div>` : `<p class="small muted" style="margin-top:12px">No crunches ahead. Every deadline fits in your study time.</p>`}
        </section>
        <section class="panel" aria-labelledby="ds-h"><div class="panel-head"><h3 id="ds-h">${icon("assignments")}Due this week</h3></div>${dueHTML}</section>
      </div>
    </div>`;
};

function gettingStarted() {
  const s = st();
  const hasTopics = s.subjects.some((x) => SF.subjectTopics(x).length);
  const steps = [
    [hasTopics, "Add topics to your subjects", "Paste your syllabus so the weakness map and exam revision know what to cover.", `<button type="button" class="btn sm" data-act="go" data-view="subjects">Open subjects</button>`],
    [s.tasks.length > 0, "Add this week's homework", `Type it in the bar at the top, like <span class="mono">maths ex 4.2 fri 30m</span>.`, `<button type="button" class="btn sm" data-act="focus-qc" data-text="maths ex 4.2 fri 30m">Try it</button>`],
    [s.exams.length > 0, "Add your next test", `Same bar: <span class="mono">bio test thu</span>. Revision gets planned for you.`, `<button type="button" class="btn sm" data-act="focus-qc" data-text="bio test thu">Try it</button>`],
  ];
  return `<section class="panel"><div class="panel-head"><h2>Get started</h2><span class="small muted">${steps.filter((x) => x[0]).length} of 3 done</span></div>
    ${steps.map(([done, t, d, btn], i) => `<div class="count-row" style="grid-template-columns:40px minmax(0,1fr) auto"><span class="num-badge" style="${done ? "background:var(--good);color:#fff" : ""}">${done ? icon("check", "ico-sm") : i + 1}</span><div><b>${t}</b><div class="small muted">${d}</div></div>${done ? "" : btn}</div>`).join("")}</section>`;
}

function stripHTML(lay, done) {
  const [ws, we] = lay.win;
  if (!(we > ws)) return "";
  let start = ws, end = we;
  for (const d of done) start = Math.min(start, SF.toMin(d.at) - (d.min || 0));
  start = Math.floor(start / 60) * 60;
  end = Math.ceil(end / 60) * 60;
  if (end - start < 60) end = start + 60;
  const span = end - start;
  const L = (m) => `${(((m - start) / span) * 100).toFixed(2)}%`;
  const Wd = (a, b) => `${((Math.max(0, Math.min(b, end) - Math.max(a, start)) / span) * 100).toFixed(2)}%`;
  const now = SF.nowMin();
  let h = `<div class="strip-wrap"><div class="strip" role="img" aria-label="Today from ${SF.fromMin(start)} to ${SF.fromMin(end)}">`;
  if (now > start) h += `<div class="past" style="width:${Wd(start, Math.min(now, end))}"></div>`;
  for (const a of lay.acts) h += `<div class="act" style="left:${L(Math.max(start, SF.toMin(a.start)))};width:${Wd(SF.toMin(a.start), SF.toMin(a.end))}"><span>${esc(a.name)}</span></div>`;
  for (const d of done) {
    const e = SF.toMin(d.at), b = e - (d.min || 0);
    const sub = subjOf(d.subjectId);
    h += `<div class="blk done" data-sc="${sub ? sub.color : ""}" style="left:${L(Math.max(start, b))};width:${Wd(b, e)}"></div>`;
  }
  for (const x of lay.sessions) {
    if (x.start == null) continue;
    const sub = subjOf(x.item.subjectId);
    h += `<div class="blk" data-sc="${sub ? sub.color : ""}" style="left:${L(x.start)};width:${Wd(x.start, x.end)}" title="${esc(x.item.title)}"><span>${esc(x.item.title)}</span></div>`;
  }
  if (now >= start && now <= end) h += `<div class="now" style="left:${L(now)}"></div>`;
  h += `</div><div class="ticks" aria-hidden="true">`;
  const stepH = span > 8 * 60 ? 120 : 60;
  let ti = 0;
  for (let m = start; m <= end; m += stepH, ti++) h += `<span class="${ti % 2 && m !== end ? "minor" : ""}" style="left:${L(m)}">${SF.fromMin(m)}</span>`;
  return h + `</div></div>`;
}

function taskProgress(t) {
  if (t.steps && t.steps.length) {
    const tot = t.steps.reduce((a, x) => a + (Number(x.min) || 0), 0);
    const dn = t.steps.reduce((a, x) => a + (x.done ? Number(x.min) || 0 : Math.min(Number(x.min) || 0, Number(x.doneMin) || 0)), 0);
    const nd = t.steps.filter((x) => x.done).length;
    return { frac: tot ? dn / tot : nd / t.steps.length, label: `${nd}/${t.steps.length} steps`, left: t.steps.filter((x) => !x.done).length };
  }
  const est = Number(t.estimate) || 0, dn = Number(t.done) || 0;
  return { frac: est ? Math.min(1, dn / est) : 0, label: `${SF.dur(Math.min(dn, est))} of ${SF.dur(est)}`, left: Math.max(0, est - dn) };
}

// ---------- subjects ----------
V.subjects = () => {
  const s = st(), P = plan(), idx = P.idx, today = SF.today();
  if (!s.subjects.length) return `<div class="page-head"><div><h1>Subjects</h1></div></div><div class="panel empty"><h3>No subjects yet</h3><p>Add the subjects you take to start tracking topics and grades.</p><button type="button" class="btn primary" data-act="add-subject">${icon("plus")}Add subject</button></div>`;
  const cards = s.subjects.map((sub) => {
    const g = SF.gradeSummary(s, sub.id);
    const topics = SF.subjectTopics(sub);
    const counts = { mastered: 0, good: 0, learning: 0, revise: 0, weak: 0, ns: 0 };
    topics.forEach((t) => counts[idx.topicState[t.id].state]++);
    const nextEx = s.exams.filter((e) => e.subjectId === sub.id && !e.done && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    const nextT = s.tasks.filter((t) => t.subjectId === sub.id && !t.completedAt).sort((a, b) => (a.due < b.due ? -1 : 1))[0];
    const seg = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<i class="s-${k}" style="width:${(n / topics.length) * 100}%" title="${SF.STATE_LABEL[k]}: ${n}"></i>`).join("");
    return `<button type="button" class="subj-card" data-sc="${esc(sub.color)}" data-act="open-subject" data-id="${esc(sub.id)}">
      <div class="sname"><span class="swatch"></span><h3>${esc(sub.name)}</h3></div>
      <div class="grade"><b>${g.avg == null ? "–" : Math.round(g.avg) + "%"}</b><span class="muted small">${g.target ? `target ${g.target}%` : "no target set"}</span>${g.verdict ? `<span class="pill ${{ secured: "good", realistic: "good", open: "info", stretch: "warn", hard: "crit", impossible: "crit" }[g.verdict.key]}">${g.verdict.label}</span>` : ""}</div>
      <div class="stack-sm" style="gap:6px"><div class="bar" aria-hidden="true">${seg || ""}</div><div class="meta"><span>${counts.mastered + counts.good} of ${topics.length} topics understood</span>${counts.weak ? `<span style="color:var(--crit);font-weight:700">${counts.weak} weak</span>` : ""}</div></div>
      <div class="meta"><span>${nextEx ? `${icon("target", "ico-sm")} ${esc(nextEx.title.replace(sub.name, "").trim() || "Test")} ${esc(relLow(nextEx.date))}` : nextT ? `Next: ${esc(nextT.title.length > 30 ? nextT.title.slice(0, 28) + "…" : nextT.title)}` : "Nothing due"}</span></div>
    </button>`;
  }).join("");
  return `<div class="page-head"><div><h1>Subjects</h1><p class="sub">Syllabus, grades, notes and how to study each one.</p></div><button type="button" class="btn primary" data-act="add-subject">${icon("plus")}Add subject</button></div>
    <div class="subj-grid">${cards}</div>`;
};

V.subject = () => {
  const s = st(), sub = subjOf(S.ui.subject);
  if (!sub) return V.subjects();
  const tab = S.ui.tab.subject || "topics";
  const P = plan(), idx = P.idx;
  const topics = SF.subjectTopics(sub);
  const nRes = s.resources.filter((r) => r.subjectId === sub.id).length;
  const nA = s.assessments.filter((a) => a.subjectId === sub.id).length;
  const tabs = [["topics", "Topics", topics.length], ["grades", "Grades", nA], ["notes", "Notes and links", nRes], ["study", "How to study", null]];
  let body = "";
  if (tab === "topics") body = subjectTopicsHTML(sub, idx);
  if (tab === "grades") body = subjectGradesHTML(sub);
  if (tab === "notes") body = subjectNotesHTML(sub);
  if (tab === "study") body = subjectStudyHTML(sub, idx);
  return `<button type="button" class="back" data-act="go" data-view="subjects">${icon("back", "ico-sm")}All subjects</button>
    <div class="page-head" style="margin-top:0"><div class="subj-hero" data-sc="${esc(sub.color)}"><span class="swatch"></span><div><h1>${esc(sub.name)}</h1><p class="sub">${esc(SF.KINDS[sub.kind] || "Other")}</p></div></div>
      <div class="row-flex"><button type="button" class="btn" data-act="edit-subject" data-id="${esc(sub.id)}">${icon("edit", "ico-sm")}Edit</button></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-act="tab" data-scope="subject" data-tab="${k}">${l}${n != null ? `<span class="count">${n}</span>` : ""}</button>`).join("")}</div>
    ${body}`;
};

function topicStateTag(ts) {
  const cls = { mastered: "good", good: "good", revise: "warn", learning: "info", weak: "crit", ns: "" }[ts.state];
  return `<span class="pill ${cls}">${SF.STATE_LABEL[ts.state]}</span>`;
}

function subjectTopicsHTML(sub, idx) {
  const s = st();
  const chapters = sub.chapters.map((ch) => {
    const rows = ch.topics.map((t) => {
      const ts = idx.topicState[t.id];
      const nc = s.cards.filter((c) => c.topicId === t.id).length;
      const nm = s.mistakes.filter((m) => m.topicId === t.id && !m.resolved).length;
      return `<div class="topic"><div class="tn"><button type="button" data-act="open-topic" data-id="${esc(t.id)}">${esc(t.name)}</button>${topicStateTag(ts)}${nc ? `<span class="tag">${plural(nc, "card")}</span>` : ""}${nm ? `<span class="tag" style="color:var(--crit)">${plural(nm, "mistake")}</span>` : ""}</div>
        <div class="tc">
          <select class="input sm" style="width:auto" id="ts-${esc(t.id)}" data-change="topic-status" data-id="${esc(t.id)}" aria-label="Status of ${esc(t.name)}">${Object.entries(SF.STATUS).map(([k, l]) => `<option value="${k}" ${(t.status || "ns") === k ? "selected" : ""}>${l}</option>`).join("")}</select>
          <span class="conf" role="group" aria-label="Confidence in ${esc(t.name)}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="${(t.confidence || 0) >= v ? "on" : ""}" data-act="topic-conf" data-id="${esc(t.id)}" data-v="${v}" aria-label="Confidence ${v} of 5" title="Confidence ${v}/5"></button>`).join("")}</span>
        </div></div>`;
    }).join("");
    return `<div class="chapter"><div class="chapter-head"><h3>${esc(ch.name)}</h3><div class="row-flex"><button type="button" class="btn ghost xs" data-act="edit-chapter" data-id="${esc(ch.id)}">${icon("edit", "ico-sm")}Rename</button></div></div>
      ${rows || `<p class="small muted">No topics yet.</p>`}
      <form class="addline" data-form="add-topic" data-ch="${esc(ch.id)}"><input class="input sm" id="at-${esc(ch.id)}" name="name" placeholder="Add a topic to ${esc(ch.name)}" autocomplete="off" aria-label="New topic in ${esc(ch.name)}"><button class="btn sm" type="submit">${icon("plus", "ico-sm")}Add</button></form></div>`;
  }).join("");
  return `<section class="panel"><div class="panel-head"><div><h2>Syllabus</h2><p class="small muted">Set a status and how confident you feel. The weakness map and the revision planner use both.</p></div>
    <div class="row-flex"><button type="button" class="btn sm" data-act="bulk-topics" data-id="${esc(sub.id)}">Paste a topic list</button><button type="button" class="btn sm" data-act="add-chapter" data-id="${esc(sub.id)}">${icon("plus", "ico-sm")}Chapter</button></div></div>
    ${chapters || `<div class="empty"><h3>No chapters yet</h3><p>Paste your syllabus or add chapters one by one.</p><button type="button" class="btn primary" data-act="bulk-topics" data-id="${esc(sub.id)}">Paste a topic list</button></div>`}</section>`;
}

function subjectGradesHTML(sub) {
  const s = st();
  const g = SF.gradeSummary(s, sub.id);
  const rows = g.list.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((a) => {
    const up = a.status === "upcoming";
    const p = !up && a.max ? (a.score / a.max) * 100 : null;
    return `<tr><td><b>${esc(a.title)}</b></td><td class="muted small">${a.date ? SF.fmtDay(a.date) : "–"}</td>
      <td class="num mono">${up ? `<span class="pill">Upcoming</span>` : `${esc(a.score)}/${esc(a.max)}`}</td><td class="num mono">${p == null ? "" : Math.round(p) + "%"}</td>
      <td class="num mono">${g.anyW ? (Number(a.weight) || 0) + "%" : "equal"}</td>
      <td class="num"><button type="button" class="btn ghost xs" data-act="edit-assessment" data-id="${esc(a.id)}" aria-label="Edit ${esc(a.title)}">${icon("edit", "ico-sm")}</button></td></tr>`;
  }).join("");
  const vcls = g.verdict ? { secured: "good", realistic: "good", open: "info", stretch: "warn", hard: "crit", impossible: "crit" }[g.verdict.key] : "";
  let explain = "";
  if (g.target == null) explain = "Set a target to see what you need on the remaining assessments.";
  else if (!g.upcoming.length) explain = g.avg == null ? "Add assessments to calculate your grade." : `All assessments are marked. Your final weighted grade is ${pct(g.avg)}.`;
  else if (g.verdict.key === "secured") explain = `You've already secured ${g.target}%, even with zero on the remaining ${g.anyW ? g.wUp + "%" : "assessments"}.`;
  else if (g.verdict.key === "impossible") explain = `${g.target}% is no longer reachable under these weightings. The most you can finish with is ${pct(g.maxPossible)}, so a new target around ${Math.floor(g.maxPossible)}% keeps it realistic.`;
  else explain = `To finish on ${g.target}%, you need an average of ${pct(g.needed)} across the remaining ${g.anyW ? g.wUp + "% of the grade" : plural(g.upcoming.length, "assessment")}.${g.avg != null ? ` You're averaging ${pct(g.avg)} so far, so that's ${{ realistic: "realistic", stretch: "a stretch", hard: "very hard", open: "doable" }[g.verdict.key] || g.verdict.label.toLowerCase()}.` : ""}`;
  return `<div class="stack" style="gap:20px">
    <section class="panel"><div class="panel-head"><h2>Target calculator</h2>
      <label class="row-flex small"><span class="label">Target</span><input class="input sm mono" style="width:84px" type="number" min="0" max="100" id="tg-${esc(sub.id)}" data-change="subject-target" data-id="${esc(sub.id)}" value="${g.target ?? ""}" aria-label="Target grade percent"><span>%</span></label></div>
      <div class="calc">
        <div class="stat"><span>Current weighted grade</span><b>${pct(g.avg)}</b></div>
        <div class="stat hl"><span>Needed on what's left</span><b>${g.needed == null ? "–" : g.needed <= 0 ? "0%" : pct(g.needed)}</b></div>
        <div class="stat"><span>Best possible finish</span><b>${g.maxPossible == null ? pct(g.avg) : pct(g.maxPossible)}</b></div>
        <div class="stat"><span>Since last assessment</span><b>${g.delta == null ? "–" : (g.delta >= 0 ? "+" : "") + Math.round(g.delta) + "%"}</b></div>
      </div>
      <div class="row-flex" style="margin-top:14px">${g.verdict ? `<span class="pill ${vcls}">${g.verdict.label}</span>` : ""}<p class="muted">${explain}</p></div>
      ${g.anyW && g.weightSum !== 100 ? `<p class="small" style="margin-top:8px;color:var(--warn)">Weights add up to ${g.weightSum}%, not 100%. The calculator treats them as the whole grade; check them against your course outline.</p>` : ""}
    </section>
    <section class="panel"><div class="panel-head"><h2>Assessments</h2><button type="button" class="btn sm primary" data-act="add-assessment" data-id="${esc(sub.id)}">${icon("plus", "ico-sm")}Add assessment</button></div>
      ${rows ? `<div class="tablewrap"><table class="gtable"><thead><tr><th>Assessment</th><th>Date</th><th class="num">Mark</th><th class="num">%</th><th class="num">Weight</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty"><p>Add marked and upcoming assessments with their weightings. The calculator uses real weightings, not a plain average.</p></div>`}
    </section></div>`;
}

function subjectNotesHTML(sub) {
  const s = st();
  const list = s.resources.filter((r) => r.subjectId === sub.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<section class="panel"><div class="panel-head"><h2>Notes and links</h2><div class="row-flex"><button type="button" class="btn sm" data-act="add-resource" data-id="${esc(sub.id)}" data-kind="link">${icon("link", "ico-sm")}Add link</button><button type="button" class="btn sm primary" data-act="add-resource" data-id="${esc(sub.id)}" data-kind="note">${icon("note", "ico-sm")}Add note</button></div></div>
    ${list.length ? `<div class="list">${list.map((r) => resRow(r)).join("")}</div>` : `<div class="empty"><p>Keep class notes, worksheet text and useful links here, tagged by topic. Search finds them alongside your mistakes and flashcards, and Claude can turn a note into practice questions.</p></div>`}</section>`;
}
function resRow(r) {
  const t = r.topicId ? topicOf(r.topicId) : null;
  return `<div class="li click" data-act="open-resource" data-id="${esc(r.id)}">${icon(r.kind === "link" ? "link" : "note")}<div class="li-main"><span class="li-title">${esc(r.title)}</span><span class="li-sub">${t ? `<span>${esc(t.topic.name)}</span>` : ""}<span class="faint">${r.kind === "link" ? esc(r.url) : esc((r.body || "").slice(0, 90))}${r.kind !== "link" && (r.body || "").length > 90 ? "…" : ""}</span></span></div></div>`;
}

function subjectStudyHTML(sub, idx) {
  const m = SF.METHODS[sub.kind] || SF.METHODS.other;
  const order = { weak: 0, revise: 1, learning: 2, ns: 3, good: 4, mastered: 5 };
  const topics = SF.subjectTopics(sub).slice().sort((a, b) => order[idx.topicState[a.id].state] - order[idx.topicState[b.id].state]);
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Best way to learn ${esc(SF.KINDS[sub.kind] || "this")}</div><h2 style="margin-top:4px">${esc(m.how)}</h2></div></div>
    <p class="muted" style="margin-bottom:12px">What to do next for each topic, weakest first:</p>
    ${topics.length ? `<div class="list">${topics.map((t) => `<div class="li click" data-act="open-topic" data-id="${esc(t.id)}"><div class="li-main"><span class="li-title">${esc(t.name)}</span><span class="li-sub">${esc(SF.nextActivity(sub, idx.topicState[t.id]))}</span></div><div class="li-side">${topicStateTag(idx.topicState[t.id])}</div></div>`).join("")}</div>` : `<p class="muted">Add topics to get recommendations.</p>`}
    <p class="tiny faint" style="margin-top:14px">Change the subject type in Edit if these suggestions don't fit.</p></section>`;
}

// ---------- revision ----------
V.revision = () => {
  if (S.rev) return reviewSessionHTML();
  const s = st(), today = SF.today();
  const tab = S.ui.tab.revision || "review";
  const due = SF.dueReviews(s, today);
  const P = plan();
  const tabs = [["review", "Review", due.length], ["map", "Weakness map", null], ["exams", "Exams", s.exams.filter((e) => !e.done && e.date >= today).length], ["mistakes", "Mistakes", s.mistakes.filter((m) => !m.resolved).length], ["cards", "Flashcards", s.cards.length]];
  let body = "";
  if (tab === "review") body = revReviewHTML(due, P);
  if (tab === "map") body = revMapHTML(P.idx);
  if (tab === "exams") body = revExamsHTML(P);
  if (tab === "mistakes") body = revMistakesHTML();
  if (tab === "cards") body = revCardsHTML();
  return `<div class="page-head"><div><h1>Revision</h1><p class="sub">Spaced review, your weak spots, and exam prep that feeds the planner.</p></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-act="tab" data-scope="revision" data-tab="${k}">${l}${n != null ? `<span class="count">${n}</span>` : ""}</button>`).join("")}</div>${body}`;
};

function revReviewHTML(due, P) {
  const s = st();
  const bySub = {};
  for (const d of due) (bySub[d.ref.subjectId] = bySub[d.ref.subjectId] || []).push(d);
  const cards = due.filter((d) => d.type === "card").length, mis = due.length - cards;
  const forgot = s.cards.filter((c) => (c.lapses || 0) >= 3);
  const exams = s.exams.filter((e) => !e.done && e.date >= SF.today());
  return `<div class="today-grid">
    <div class="stack" style="gap:20px">
      <section class="panel"><div class="panel-head"><div><h2>${due.length ? `${plural(due.length, "question")} due` : "All caught up"}</h2><p class="muted small">${due.length ? `${plural(cards, "flashcard")} and ${plural(mis, "past mistake")}. Each one comes back just before you'd forget it.` : "Nothing is due. Add flashcards or log mistakes and they'll show up here on schedule."}</p></div>
        ${due.length ? `<button type="button" class="btn primary" data-act="start-review">${icon("play", "ico-sm")}Start review</button>` : ""}</div>
        ${Object.keys(bySub).length ? `<div class="list">${Object.entries(bySub).map(([sid, arr]) => `<div class="li"><div class="li-main">${chip(sid)}</div><div class="li-side"><span class="small mono">${arr.length} due</span><button type="button" class="btn sm" data-act="start-review" data-subject="${esc(sid)}">Just this</button></div></div>`).join("")}</div>` : ""}
      </section>
      ${forgot.length ? `<section class="panel"><div class="panel-head"><div><h3>${icon("alert")}Keeps slipping</h3><p class="small muted">You've forgotten these 3 times or more. Re-reading the same card won't fix it; try a fresh explanation and a different question.</p></div></div>
        <div class="list">${forgot.map((c) => `<div class="li"><div class="li-main"><span class="li-title">${esc(c.front)}</span><span class="li-sub">${chip(c.subjectId)}<span>Forgotten ${c.lapses}×</span></span></div><div class="li-side">${AI.on() ? `<button type="button" class="btn sm ai" data-act="ai-explain-card" data-id="${esc(c.id)}">${icon("ai", "ico-sm")}Explain differently</button>` : ""}</div></div>`).join("")}</div></section>` : ""}
    </div>
    <div class="today-side">
      <section class="panel"><div class="panel-head"><h3>${icon("target")}Mistake test</h3></div><p class="small muted" style="margin-bottom:12px">Before an exam, retry every unfixed mistake from that subject. Your own mistakes become the revision syllabus.</p>
        <form class="stack-sm" data-form="mistake-test"><select class="input" name="subject" id="mt-subject" aria-label="Subject for the mistake test"><option value="">All subjects</option>${exams.length ? `<optgroup label="Upcoming exams">${exams.map((e) => `<option value="exam:${esc(e.id)}">${esc(e.title)}</option>`).join("")}</optgroup>` : ""}<optgroup label="Subjects">${s.subjects.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</optgroup></select>
        <button class="btn" type="submit" ${s.mistakes.some((m) => !m.resolved) ? "" : "disabled"}>Start mistake test</button></form></section>
      <section class="panel"><div class="panel-head"><h3>${icon("revision")}Practise one topic</h3></div><p class="small muted" style="margin-bottom:12px">Every card and unfixed mistake for a topic, due or not.</p>
        <form class="stack-sm" data-form="topic-practice"><select class="input" name="topic" id="tp-topic" aria-label="Topic">${s.subjects.map((x) => `<optgroup label="${esc(x.name)}">${SF.subjectTopics(x).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>`).join("")}</select>
        <div class="row-flex"><button class="btn" type="submit">Practise</button>${AI.on() ? `<button type="button" class="btn ai" data-act="ai-questions-from-select">${icon("ai", "ico-sm")}Make questions</button>` : ""}</div></form></section>
    </div></div>`;
}

function reviewSessionHTML() {
  const r = S.rev;
  if (r.i >= r.queue.length) return reviewSummaryHTML();
  const q = r.queue[r.i];
  const item = q.type === "card" ? cardOf(q.id) : mistakeOf(q.id);
  if (!item) {
    r.i++;
    return reviewSessionHTML();
  }
  const front = q.type === "card" ? item.front : item.question;
  const back = q.type === "card" ? item.back : item.correct;
  const t = item.topicId ? topicOf(item.topicId) : null;
  const iv = (rt) => SF.nextInterval(item.box, rt).days;
  const ivLabel = (d) => (d <= 1 ? "1 day" : d < 30 ? `${d} days` : `${Math.round(d / 30)} mo`);
  return `<div class="review">
    <div class="rprog"><button type="button" class="btn ghost sm" data-act="end-review">${icon("x", "ico-sm")}End</button><div class="bar"><i style="width:${(r.i / r.queue.length) * 100}%"></i></div><span class="mono small">${r.i + 1} / ${r.queue.length}</span></div>
    <div class="qcard">
      <div class="row-flex">${chip(item.subjectId)}${t ? `<span class="small muted">${esc(t.topic.name)}</span>` : ""}${q.type === "mistake" ? `<span class="pill crit">Past mistake</span>` : ""}${(item.lapses || 0) >= 3 ? `<span class="pill warn">Keeps slipping</span>` : ""}</div>
      <div class="q">${esc(front)}</div>
      ${!r.revealed ? `<label class="field"><span>Your answer (optional, helps Claude check it)</span><textarea class="input" id="rev-typed" data-input="rev-typed" placeholder="Answer from memory before you look">${esc(r.typed || "")}</textarea></label>
        <div class="row-flex"><button type="button" class="btn primary" data-act="rev-show" autofocus>Show answer <span class="tag" style="background:transparent;color:inherit">Space</span></button></div>`
      : `${r.typed ? `<div class="mine"><span class="eyebrow">You wrote</span><div>${esc(r.typed)}</div></div>` : ""}
        <div class="a"><span class="eyebrow" style="color:var(--good)">Answer</span><div>${esc(back)}</div>${q.type === "mistake" && item.why ? `<div class="small muted" style="margin-top:8px">Last time: ${esc(item.why)} (${esc(item.type || "")})</div>` : ""}</div>
        ${r.check ? `<div class="feedback ${esc(r.check.verdict)}"><b>${{ correct: "Correct", partly: "Partly right", incorrect: "Not quite" }[r.check.verdict] || "Checked"}.</b> ${esc(r.check.feedback || "")}</div>` : ""}
        ${r.typed && !r.check && AI.on() ? `<div><button type="button" class="btn sm ai" data-act="ai-check" ${r.checking ? "disabled" : ""}>${r.checking ? `<span class="spin"></span>Checking…` : `${icon("ai", "ico-sm")}Check my answer`}</button></div>` : ""}
        <div><p class="small muted" style="margin-bottom:8px">How well did you know it?</p>
        <div class="rate"><button type="button" class="again" data-act="rate" data-r="again">Again<small>1 · ${ivLabel(iv("again"))}</small></button><button type="button" class="hard" data-act="rate" data-r="hard">Hard<small>2 · ${ivLabel(iv("hard"))}</small></button><button type="button" class="good" data-act="rate" data-r="good">Good<small>3 · ${ivLabel(iv("good"))}</small></button><button type="button" class="easy" data-act="rate" data-r="easy">Easy<small>4 · ${ivLabel(iv("easy"))}</small></button></div></div>`}
    </div>
    <p class="tiny faint" style="text-align:center">Keys: Space shows the answer, 1–4 rate it.</p>
  </div>`;
}

function reviewSummaryHTML() {
  const r = S.rev;
  const res = r.results;
  const ok = res.filter((x) => x.ok).length;
  const acc = res.length ? (ok / res.length) * 100 : 0;
  const bySub = {};
  res.forEach((x) => { const b = (bySub[x.subjectId] = bySub[x.subjectId] || { n: 0, ok: 0 }); b.n++; if (x.ok) b.ok++; });
  const fixed = r.fixed || 0;
  return `<div class="review"><div class="qcard" style="text-align:center;align-items:center">
    <div class="eyebrow">Session complete</div><div class="q mono" style="font-size:48px">${Math.round(acc)}%</div>
    <p class="muted">${ok} of ${res.length} right${fixed ? ` · ${plural(fixed, "mistake")} fixed` : ""}${r.xp ? ` · +${r.xp} XP` : ""}</p>
    <div class="list" style="width:100%;max-width:420px;text-align:left">${Object.entries(bySub).map(([sid, b]) => `<div class="li"><div class="li-main">${chip(sid)}</div><span class="mono small">${b.ok}/${b.n}</span></div>`).join("")}</div>
    <div class="row-flex"><button type="button" class="btn primary" data-act="end-review">Done</button></div>
  </div></div>`;
}

function revMapHTML(idx) {
  const s = st();
  const f = S.ui.filters.map || "all";
  const subs = s.subjects.filter((x) => f === "all" || x.id === f);
  const counts = { mastered: 0, good: 0, learning: 0, revise: 0, weak: 0, ns: 0 };
  subs.forEach((sub) => SF.subjectTopics(sub).forEach((t) => counts[idx.topicState[t.id].state]++));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return `<div class="panel empty"><h3>No topics yet</h3><p>Add topics to your subjects and the map fills in as you rate your confidence, review cards and log mistakes.</p><button type="button" class="btn" data-act="go" data-view="subjects">Go to subjects</button></div>`;
  const legend = ["mastered", "good", "learning", "revise", "weak", "ns"].map((k) => `<span><i class="sw-${k}"></i>${SF.STATE_LABEL[k]}</span>`).join("");
  return `<section class="panel">
    <div class="panel-head"><div class="seg" role="group" aria-label="Subject filter"><button type="button" aria-pressed="${f === "all"}" data-act="filter" data-f="map" data-v="all">All</button>${s.subjects.map((x) => `<button type="button" aria-pressed="${f === x.id}" data-act="filter" data-f="map" data-v="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div></div>
    <p style="font-size:18px;margin-bottom:12px"><b>${counts.mastered + counts.good}</b> well understood · <b>${counts.revise + counts.learning}</b> need revision · <b style="color:var(--crit)">${counts.weak}</b> weak${counts.ns ? ` · <b>${counts.ns}</b> not started` : ""}</p>
    <div class="legend" style="margin:0 0 18px">${legend}</div>
    ${subs.map((sub) => `<div class="wm-subject"><h3 data-sc="${esc(sub.color)}"><span class="swatch"></span>${esc(sub.name)}</h3>
      ${sub.chapters.filter((c) => c.topics.length).map((c) => `<div class="wm-ch"><div class="tiny eyebrow">${esc(c.name)}</div><div class="tiles">${c.topics.map((t) => { const ts = idx.topicState[t.id]; return `<button type="button" class="tile st-${ts.state}" data-act="open-topic" data-id="${esc(t.id)}"><span>${esc(t.name)}</span><small>${SF.STATE_LABEL[ts.state]}${ts.n ? ` · ${Math.round(ts.acc * 100)}%` : ""}</small></button>`; }).join("")}</div></div>`).join("")}
    </div>`).join("")}
    <p class="tiny faint" style="margin-top:16px">A topic turns weak when you keep getting it wrong: two or more unfixed mistakes, low accuracy across reviews, or very low confidence. Weak topics get 20 extra minutes in exam revision.</p>
  </section>`;
}

function revExamsHTML(P) {
  const s = st(), today = SF.today(), idx = P.idx;
  const list = s.exams.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const up = list.filter((e) => !e.done && e.date >= today), past = list.filter((e) => e.done || e.date < today);
  const row = (e) => {
    const n = SF.diff(today, e.date);
    const r = examReadiness(e, idx);
    const items = P.items.filter((i) => i.examId === e.id);
    const left = items.reduce((a, i) => a + i.remaining, 0);
    const doneMin = r.ids.reduce((a, id) => a + (idx.minByKey[`r:${e.id}:${id}`] || 0), 0);
    const isPast = e.done || e.date < today;
    return `<div class="count-row" style="grid-template-columns:74px minmax(0,1fr)"><div class="countdown ${!isPast && n <= 3 ? "soon" : ""}" style="${isPast ? "background:var(--surface-2);color:var(--ink-2)" : ""}"><b>${isPast ? icon("check") : n}</b><span>${isPast ? "Done" : n === 1 ? "Day" : "Days"}</span></div>
      <div class="stack-sm" style="min-width:0"><div class="between"><div><span class="li-title">${esc(e.title)}</span><div class="li-sub">${chip(e.subjectId)}<span>${SF.fmtLong(e.date)}</span></div></div>
        <div class="row-flex">${!isPast ? `<button type="button" class="btn sm" data-act="start-review" data-exam="${esc(e.id)}">Practise</button>` : ""}<button type="button" class="btn ghost sm" data-act="edit-exam" data-id="${esc(e.id)}" aria-label="Edit ${esc(e.title)}">${icon("edit", "ico-sm")}</button>${!isPast ? `<button type="button" class="btn ghost sm" data-act="exam-done" data-id="${esc(e.id)}">Mark sat</button>` : ""}</div></div>
        ${!isPast ? `<div class="row-flex"><div class="bar grow" aria-hidden="true"><i style="width:${r.pct}%;background:${r.pct >= 70 ? "var(--good)" : r.pct >= 45 ? "var(--warn)" : "var(--crit)"}"></i></div><span class="small mono">${pct(r.pct)} ready</span></div>
        <div class="small muted">${!r.ids.length ? `No topics yet. <button type="button" class="btn xs" data-act="edit-exam" data-id="${esc(e.id)}">Pick topics</button> or add some under Subjects.` : `${SF.dur(doneMin)} revised · ${left ? `${SF.dur(left)} still planned before ${SF.fmtDay(SF.addDays(e.date, -1))}` : "all planned revision done"}`}</div>` : ""}
        <div class="row-flex" style="gap:6px">${r.ids.map((id) => { const tp = idx.topics[id]; if (!tp) return ""; const ts = idx.topicState[id]; return `<button type="button" class="tile st-${ts.state}" style="min-height:0;padding:4px 8px;flex-direction:row;align-items:center;gap:6px" data-act="open-topic" data-id="${esc(id)}"><span>${esc(tp.name)}</span></button>`; }).join("")}</div>
      </div></div>`;
  };
  return `<section class="panel"><div class="panel-head"><div><h2>Upcoming exams</h2><p class="small muted">Each exam's topics are scheduled into your plan from ${s.meta.settings.lead} days before, weakest first, finishing the day before.</p></div><button type="button" class="btn primary sm" data-act="add-exam">${icon("plus", "ico-sm")}Add exam</button></div>
    ${up.length ? up.map(row).join("") : `<div class="empty"><p>No exams yet. Add one here or type something like <span class="mono">chem test 12 nov</span> in the bar at the top.</p></div>`}</section>
    ${past.length ? `<section class="panel" style="margin-top:20px"><div class="panel-head"><h3>Past</h3></div>${past.slice(-6).reverse().map(row).join("")}</section>` : ""}`;
}

const MTYPES = ["Conceptual", "Calculation", "Memory", "Application", "Carelessness"];
const MTYPE_HINT = { Conceptual: "Didn't understand the idea", Calculation: "Wrong method or arithmetic", Memory: "Forgot a fact or definition", Application: "Knew it but couldn't apply it", Carelessness: "Misread the question" };
function revMistakesHTML() {
  const s = st();
  const f = (S.ui.filters.mistakes = S.ui.filters.mistakes || { subject: "", type: "", resolved: false });
  const list = s.mistakes.filter((m) => (!f.subject || m.subjectId === f.subject) && (!f.type || m.type === f.type) && (f.resolved || !m.resolved)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const open = s.mistakes.filter((m) => !m.resolved && (!f.subject || m.subjectId === f.subject));
  const byType = {};
  open.forEach((m) => (byType[m.type || "Conceptual"] = (byType[m.type || "Conceptual"] || 0) + 1));
  const top = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  const advice = { Conceptual: "Go back to the explanation, not more questions. Ask Claude to explain one of them differently.", Calculation: "Write every line of working and check units before the final step.", Memory: "Turn these into flashcards so they come back on a schedule.", Application: "Practise with unfamiliar questions; your knowledge is there but you need new contexts.", Carelessness: "Underline what the question asks before answering, and reread your answer against it." };
  const bar = open.length ? `<div class="typebar" role="img" aria-label="Mistakes by type">${MTYPES.filter((t) => byType[t]).map((t) => `<i class="mt-${t}" style="flex:${byType[t]}" title="${t}: ${byType[t]}">${t} ${byType[t]}</i>`).join("")}</div>` : "";
  return `<section class="panel">
    <div class="panel-head"><div><h2>Mistake library</h2><p class="small muted">Every question you got wrong, why, and whether you've fixed it. Fixed means right twice in a row on spaced retries.</p></div><button type="button" class="btn primary sm" data-act="add-mistake">${icon("plus", "ico-sm")}Log a mistake</button></div>
    <div class="row-flex" style="margin-bottom:14px">
      <select class="input sm" style="width:auto" id="mf-subject" data-change="mfilter" data-k="subject" aria-label="Filter by subject"><option value="">All subjects</option>${subjectOptions(f.subject)}</select>
      <select class="input sm" style="width:auto" id="mf-type" data-change="mfilter" data-k="type" aria-label="Filter by type"><option value="">All types</option>${MTYPES.map((t) => `<option ${f.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label class="check small"><input type="checkbox" id="mf-res" data-change="mfilter" data-k="resolved" ${f.resolved ? "checked" : ""}>Show fixed</label>
    </div>
    ${bar}${top ? `<p class="small" style="margin:10px 0 6px"><b>Most of these are ${top[0].toLowerCase()} mistakes.</b> ${advice[top[0]]}</p>` : ""}
    <div>${list.length ? list.map(mistakeHTML).join("") : `<div class="empty"><p>${s.mistakes.length ? "No mistakes match these filters." : "When you get a question wrong in a test, worksheet or review, log it here. Before an exam, run a mistake test."}</p></div>`}</div>
  </section>`;
}
function mistakeHTML(m) {
  const t = m.topicId ? topicOf(m.topicId) : null;
  const ex = S.ui.explain && S.ui.explain[m.id];
  return `<div class="mistake" id="mis-${esc(m.id)}"><div class="between"><span class="mq">${esc(m.question)}</span><div class="row-flex">
      ${AI.on() ? `<button type="button" class="btn xs ai" data-act="ai-explain-mistake" data-id="${esc(m.id)}" ${ex && ex.loading ? "disabled" : ""}>${ex && ex.loading ? `<span class="spin"></span>` : icon("ai", "ico-sm")}Explain</button>` : ""}
      <button type="button" class="btn ghost xs" data-act="edit-mistake" data-id="${esc(m.id)}" aria-label="Edit mistake">${icon("edit", "ico-sm")}</button></div></div>
    <div class="ma"><div class="wrong"><em>You wrote</em>${esc(m.myAnswer || "–")}</div><div class="right"><em>Correct</em>${esc(m.correct || "–")}</div></div>
    <div class="li-sub">${chip(m.subjectId)}${t ? `<span>${esc(t.topic.name)}</span>` : ""}<span class="tag">${esc(m.type || "")}</span>${m.resolved ? `<span class="pill good">${icon("check", "ico-sm")}Fixed</span>` : `<span class="faint">Retry ${m.due && m.due > SF.today() ? esc(relLow(m.due)) : "today"}</span>`}${m.why ? `<span>· ${esc(m.why)}</span>` : ""}</div>
    ${m.explanation ? aiExplainBox(m.explanation, m.id, "mistake") : ""}
    ${ex && ex.error ? `<p class="small" style="color:var(--crit)">${esc(ex.error)}</p>` : ""}
  </div>`;
}
function aiExplainBox(x, id, kind) {
  return `<div class="ai-box"><span class="ai-label">${icon("ai", "ico-sm")}Claude's explanation</span><p>${esc(x.explanation)}</p>${x.tip ? `<p class="small"><b>Next time:</b> ${esc(x.tip)}</p>` : ""}
    ${x.variant || x.apply ? `<div class="small muted">Two new questions on the same idea:</div><ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">${[x.variant, x.apply].filter(Boolean).map((q) => `<li>${esc(q.question)}</li>`).join("")}</ol>
    ${x.added ? `<span class="pill good">${icon("check", "ico-sm")}Added as flashcards</span>` : `<div><button type="button" class="btn sm" data-act="ai-add-variants" data-id="${esc(id)}" data-kind="${kind}">${icon("plus", "ico-sm")}Add both as flashcards</button></div>`}` : ""}</div>`;
}

function revCardsHTML() {
  const s = st(), today = SF.today();
  const f = (S.ui.filters.cards = S.ui.filters.cards || { subject: "" });
  const list = s.cards.filter((c) => !f.subject || c.subjectId === f.subject).sort((a, b) => (a.due || "") < (b.due || "") ? -1 : 1);
  return `<section class="panel"><div class="panel-head"><div><h2>Flashcards</h2><p class="small muted">${plural(s.cards.length, "card")}. Rate yourself honestly in review; the schedule depends on it.</p></div>
    <div class="row-flex">${AI.on() ? `<button type="button" class="btn sm ai" data-act="ai-questions">${icon("ai", "ico-sm")}Generate</button>` : ""}<button type="button" class="btn primary sm" data-act="add-card">${icon("plus", "ico-sm")}Add card</button></div></div>
    <div class="row-flex" style="margin-bottom:10px"><select class="input sm" style="width:auto" id="cf-subject" data-change="cfilter" aria-label="Filter by subject"><option value="">All subjects</option>${subjectOptions(f.subject)}</select></div>
    ${list.length ? `<div class="list">${list.map((c) => { const t = c.topicId ? topicOf(c.topicId) : null; const n = c.due ? SF.diff(today, c.due) : 0; return `<div class="li"><div class="li-main"><span class="li-title">${esc(c.front)}</span><span class="li-sub"><span class="faint">${esc(c.back.length > 100 ? c.back.slice(0, 98) + "…" : c.back)}</span></span><span class="li-sub">${chip(c.subjectId)}${t ? `<span>${esc(t.topic.name)}</span>` : ""}${(c.lapses || 0) >= 3 ? `<span class="pill warn">Forgotten ${c.lapses}×</span>` : ""}${c.source === "ai" ? `<span class="tag">AI</span>` : ""}</span></div>
      <div class="li-side"><span class="small mono">${n <= 0 ? "Due" : "in " + n + "d"}</span><button type="button" class="btn ghost xs" data-act="edit-card" data-id="${esc(c.id)}" aria-label="Edit card">${icon("edit", "ico-sm")}</button></div></div>`; }).join("")}</div>`
      : `<div class="empty"><p>Make cards from your notes: a question on the front, a short model answer on the back.${AI.on() ? " Or let Claude write a set from a topic or a note." : ""}</p></div>`}</section>`;
}

// ---------- assignments ----------
function taskStatus(t, P) {
  const today = SF.today();
  if (t.completedAt) return t.completedAt < t.due ? ["good", "Done early"] : t.completedAt === t.due ? ["good", "Done"] : ["", "Done late"];
  if (t.due < today) return ["crit", "Overdue"];
  const keys = new Set(P.atRisk.filter((r) => r.item.taskId === t.id && r.short >= 10).map((r) => r.item.key));
  if (keys.size) return ["crit", "At risk"];
  if (P.blocked.some((b) => b.taskId === t.id)) return ["warn", "Waiting on team"];
  if (taskProgress(t).left <= 0) return ["hi", "Ready to hand in"];
  return ["good", "On track"];
}
V.assignments = () => {
  const s = st(), P = plan(), today = SF.today();
  const f = S.ui.filters.tasks || "active";
  const list = s.tasks.filter((t) => (f === "all" ? true : f === "done" ? !!t.completedAt : !t.completedAt)).sort((a, b) => (f === "done" ? (a.completedAt < b.completedAt ? 1 : -1) : a.due < b.due ? -1 : 1));
  const groups = f === "done" ? [["Done", list]] : [
    ["Overdue", list.filter((t) => !t.completedAt && t.due < today)],
    ["Due in the next 7 days", list.filter((t) => !t.completedAt && t.due >= today && SF.diff(today, t.due) <= 7)],
    ["Later", list.filter((t) => !t.completedAt && SF.diff(today, t.due) > 7)],
    ...(f === "all" ? [["Done", list.filter((t) => t.completedAt)]] : []),
  ];
  const row = (t) => {
    const p = taskProgress(t);
    const [cls, label] = taskStatus(t, P);
    return `<div class="task-row" data-act="open-task" data-id="${esc(t.id)}" role="button" tabindex="0"><div style="min-width:0"><div class="li-title">${esc(t.title)}</div>
      <div class="li-sub" style="margin-top:3px">${chip(t.subjectId)}<span class="tag">${esc({ homework: "Homework", assignment: "Assignment", project: "Project" }[t.kind] || "Task")}</span><span>${t.completedAt ? "Handed in " + esc(SF.fmtDay(t.completedAt)) : "Due " + esc(SF.fmtDay(t.due))}</span>${(t.members || []).length ? `<span>${icon("users", "ico-sm")} ${t.members.length + 1}</span>` : ""}</div>
      <div class="prog"><div class="bar thin" aria-hidden="true"><i style="width:${p.frac * 100}%"></i></div><span class="small mono">${p.label}</span></div></div>
      <div class="li-side"><span class="pill ${cls}">${label}</span></div></div>`;
  };
  const body = groups.filter(([, l]) => l.length).map(([h, l]) => `<section class="panel"><div class="panel-head"><h3>${h}</h3><span class="small muted">${l.length}</span></div>${l.map(row).join("")}</section>`).join("");
  return `<div class="page-head"><div><h1>Assignments</h1><p class="sub">Homework, projects and group work, broken into steps the planner can schedule.</p></div>
    <div class="row-flex"><button type="button" class="btn" data-act="decode">${AI.on() ? icon("ai", "ico-sm") : icon("assignments", "ico-sm")}${AI.on() ? "Decode instructions" : "From a template"}</button><button type="button" class="btn primary" data-act="add-task">${icon("plus", "ico-sm")}Add</button></div></div>
    <div class="seg" role="group" aria-label="Show" style="margin-bottom:20px">${[["active", "To do"], ["done", "Done"], ["all", "All"]].map(([k, l]) => `<button type="button" aria-pressed="${f === k}" data-act="filter" data-f="tasks" data-v="${k}">${l}</button>`).join("")}</div>
    <div class="stack" style="gap:20px">${body || `<div class="panel empty"><h3>${f === "done" ? "Nothing handed in yet" : "No assignments"}</h3><p>${AI.on() ? "Paste or photograph the instructions and Claude turns them into steps with time estimates and a rubric checklist." : "Add one, or type it in the bar at the top, like <span class='mono'>history essay due 3 nov 2h</span>."}</p></div>`}</div>`;
};

V.task = () => {
  const s = st(), t = taskOf(S.ui.task), P = plan(), today = SF.today();
  if (!t) return V.assignments();
  const p = taskProgress(t);
  const [cls, label] = taskStatus(t, P);
  const members = t.members || [];
  const who = (id) => (!id || id === "me" ? "Me" : (members.find((m) => m.id === id) || {}).name || "Me");
  const steps = t.steps || [];
  const byId = Object.fromEntries(steps.map((x) => [x.id, x]));
  const blockedIds = new Set(P.blocked.filter((b) => b.taskId === t.id).map((b) => b.stepId));
  const stepHTML = steps.map((x, i) => {
    const dep = (x.dependsOn || []).map((id) => byId[id]).filter(Boolean)[0];
    const waiting = dep && !dep.done;
    return `<div class="step ${x.done ? "done" : ""} ${blockedIds.has(x.id) ? "blocked" : ""}">
      <label class="check"><input type="checkbox" id="sd-${esc(x.id)}" data-change="step-done" data-task="${esc(t.id)}" data-id="${esc(x.id)}" ${x.done ? "checked" : ""} aria-label="Done: ${esc(x.title)}"></label>
      <div class="st-main"><span class="st-title">${esc(x.title)}</span>
        <div class="st-meta">
          <label class="row-flex" style="gap:4px"><input type="number" min="0" max="600" step="5" id="sm-${esc(x.id)}" value="${Number(x.min) || 0}" data-change="step-field" data-f="min" data-task="${esc(t.id)}" data-id="${esc(x.id)}" style="width:66px" aria-label="Minutes for ${esc(x.title)}"> min</label>
          <label class="row-flex" style="gap:4px">by <input type="date" id="sdue-${esc(x.id)}" value="${esc(x.due || "")}" data-change="step-field" data-f="due" data-task="${esc(t.id)}" data-id="${esc(x.id)}" aria-label="Personal deadline for ${esc(x.title)}"></label>
          ${members.length ? `<select id="sa-${esc(x.id)}" data-change="step-field" data-f="assignee" data-task="${esc(t.id)}" data-id="${esc(x.id)}" aria-label="Who does ${esc(x.title)}"><option value="me">Me</option>${members.map((m) => `<option value="${esc(m.id)}" ${x.assignee === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : ""}
          ${i > 0 ? `<select id="sp-${esc(x.id)}" data-change="step-field" data-f="dependsOn" data-task="${esc(t.id)}" data-id="${esc(x.id)}" aria-label="Must happen after"><option value="">No dependency</option>${steps.filter((y) => y.id !== x.id).map((y) => `<option value="${esc(y.id)}" ${(x.dependsOn || [])[0] === y.id ? "selected" : ""}>After: ${esc(y.title.length > 26 ? y.title.slice(0, 24) + "…" : y.title)}</option>`).join("")}</select>` : ""}
        </div>
        ${waiting && !x.done ? `<span class="small" style="color:var(--warn)">${icon("lock", "ico-sm")} Waiting on ${!dep.assignee || dep.assignee === "me" ? "you" : esc(who(dep.assignee))}: ${esc(dep.title)}</span>` : ""}
      </div>
      <div class="row-flex">${members.length && x.assignee && x.assignee !== "me" ? `<span class="avatar" title="${esc(who(x.assignee))}">${esc(initials(who(x.assignee)))}</span>` : ""}<button type="button" class="btn ghost xs" data-act="del-step" data-task="${esc(t.id)}" data-id="${esc(x.id)}" aria-label="Delete step">${icon("trash", "ico-sm")}</button></div>
    </div>`;
  }).join("");
  const checks = (t.rubric || []).concat((t.checklist || []).map((c) => (typeof c === "string" ? { text: c, checked: false } : c)));
  return `<button type="button" class="back" data-act="go" data-view="assignments">${icon("back", "ico-sm")}Assignments</button>
    <div class="page-head" style="margin-top:0"><div style="min-width:0"><div class="row-flex">${chip(t.subjectId)}<span class="tag">${esc({ homework: "Homework", assignment: "Assignment", project: "Project" }[t.kind] || "Task")}</span><span class="pill ${cls}">${label}</span></div><h1 style="margin-top:8px">${esc(t.title)}</h1>
      <p class="sub">${t.completedAt ? "Handed in " + SF.fmtLong(t.completedAt) : `Due ${SF.fmtLong(t.due)}${SF.diff(today, t.due) < 2 || SF.diff(today, t.due) >= 7 ? " · " + relLow(t.due) : ""}`}</p></div>
      <div class="row-flex">${!t.completedAt ? `<button type="button" class="btn" data-act="focus-task" data-id="${esc(t.id)}">${icon("play", "ico-sm")}Focus</button><button type="button" class="btn hi" data-act="complete-task" data-id="${esc(t.id)}">${icon("check", "ico-sm")}Mark handed in</button>` : `<button type="button" class="btn" data-act="reopen-task" data-id="${esc(t.id)}">Reopen</button>`}<button type="button" class="btn ghost" data-act="edit-task" data-id="${esc(t.id)}" aria-label="Edit">${icon("edit", "ico-sm")}</button></div></div>
    <div class="detail-grid">
      <div class="stack" style="gap:20px">
        <section class="panel"><div class="panel-head"><div><h2>Steps</h2><p class="small muted">${steps.length ? `${p.label} · ${SF.dur(steps.filter((x) => !x.done && (!x.assignee || x.assignee === "me")).reduce((a, x) => a + Math.max(0, (Number(x.min) || 0) - (Number(x.doneMin) || 0)), 0))} of your work left` : "Break it into steps so the planner can spread it out."}</p></div>
          <div class="row-flex">${t.kind === "project" || t.kind === "assignment" ? `<button type="button" class="btn sm" data-act="plan-milestones" data-id="${esc(t.id)}">${icon("calendar", "ico-sm")}Plan milestones</button>` : ""}<button type="button" class="btn sm" data-act="apply-template" data-id="${esc(t.id)}">Template</button></div></div>
          <div class="bar" style="margin-bottom:6px" aria-hidden="true"><i style="width:${p.frac * 100}%"></i></div>
          <div class="steps">${stepHTML || ""}</div>
          <form class="addline" data-form="add-step" data-task="${esc(t.id)}"><input class="input sm" id="as-${esc(t.id)}" name="title" placeholder="Add a step" autocomplete="off" aria-label="New step"><input class="input sm mono" name="min" type="number" min="5" step="5" value="20" style="width:76px" aria-label="Minutes"><button class="btn sm" type="submit">${icon("plus", "ico-sm")}Add</button></form>
          ${!steps.length ? `<div class="stack-sm" style="margin-top:14px"><div class="row-flex"><span class="label">Time estimate</span><input class="input sm mono" type="number" min="0" step="5" id="te-${esc(t.id)}" value="${Number(t.estimate) || 0}" data-change="task-field" data-f="estimate" data-id="${esc(t.id)}" style="width:90px" aria-label="Estimate in minutes"><span class="small">min</span><span class="small muted">· ${SF.dur(Math.min(Number(t.done) || 0, Number(t.estimate) || 0))} done</span></div></div>` : ""}
        </section>
        <section class="panel"><div class="panel-head"><div><h2>Before you hand in</h2><p class="small muted">Rubric points and final checks. Tick each one against your work.</p></div></div>
          ${checks.length ? `<div class="stack-sm">${checks.map((c, i) => `<label class="check"><input type="checkbox" id="ck-${i}" data-change="check-item" data-task="${esc(t.id)}" data-i="${i}" ${c.checked ? "checked" : ""}><span>${esc(c.text)}</span></label>`).join("")}</div>` : `<p class="small muted">No rubric yet.</p>`}
          <form class="addline" data-form="add-check" data-task="${esc(t.id)}"><input class="input sm" id="ac-${esc(t.id)}" name="text" placeholder="Add a rubric point or check" autocomplete="off" aria-label="New check"><button class="btn sm" type="submit">${icon("plus", "ico-sm")}Add</button></form>
        </section>
        ${(t.requirements || []).length ? `<section class="panel"><div class="panel-head"><h3>Requirements</h3></div><ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">${t.requirements.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>` : ""}
      </div>
      <div class="stack" style="gap:20px">
        <section class="panel"><div class="panel-head"><h3>Details</h3></div><dl class="kv">
          <dt>Due</dt><dd><input class="input sm" type="date" id="td-${esc(t.id)}" value="${esc(t.due)}" data-change="task-field" data-f="due" data-id="${esc(t.id)}" aria-label="Due date"></dd>
          <dt>My deadline</dt><dd><input class="input sm" type="date" id="tp-${esc(t.id)}" value="${esc(t.personalDue || "")}" data-change="task-field" data-f="personalDue" data-id="${esc(t.id)}" aria-label="Personal deadline"><div class="tiny faint" style="margin-top:4px">Finish early on purpose. The planner aims for this date.</div></dd>
          <dt>Difficulty</dt><dd><div class="seg" role="group" aria-label="Difficulty">${[[1, "Easy"], [2, "Medium"], [3, "Hard"]].map(([v, l]) => `<button type="button" aria-pressed="${(Number(t.difficulty) || 2) === v}" data-act="task-diff" data-id="${esc(t.id)}" data-v="${v}">${l}</button>`).join("")}</div></dd>
          ${t.format ? `<dt>Format</dt><dd>${esc(t.format)}</dd>` : ""}
        </dl></section>
        <section class="panel"><div class="panel-head"><div><h3>${icon("users")}Group</h3><p class="small muted">Who does which step, and what's waiting on whom.</p></div></div>
          <div class="member"><span class="avatar">${esc(initials(s.meta.name || "Me"))}</span><div class="grow"><b>Me</b><div class="tiny muted">${steps.filter((x) => !x.assignee || x.assignee === "me").filter((x) => x.done).length}/${steps.filter((x) => !x.assignee || x.assignee === "me").length} steps</div></div></div>
          ${members.map((m) => { const mine = steps.filter((x) => x.assignee === m.id); return `<div class="member"><span class="avatar">${esc(initials(m.name))}</span><div class="grow"><b>${esc(m.name)}</b><div class="tiny muted">${mine.filter((x) => x.done).length}/${mine.length} steps${mine.some((x) => !x.done && x.due && x.due < today) ? ` · <span style="color:var(--crit)">behind</span>` : ""}</div></div><button type="button" class="btn ghost xs" data-act="del-member" data-task="${esc(t.id)}" data-id="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">${icon("x", "ico-sm")}</button></div>`; }).join("")}
          <form class="addline" data-form="add-member" data-task="${esc(t.id)}"><input class="input sm" id="am-${esc(t.id)}" name="name" placeholder="Add a teammate" autocomplete="off" aria-label="Teammate name"><button class="btn sm" type="submit">${icon("plus", "ico-sm")}Add</button></form>
          ${members.length ? `<p class="tiny faint" style="margin-top:10px">Your teammates don't see this page. Use it to track who owes what, and share the plan in your group chat.</p>` : ""}
        </section>
        <section class="panel"><div class="panel-head"><h3>Notes and links</h3></div>
          <textarea class="input" id="tn-${esc(t.id)}" data-change="task-field" data-f="notes" data-id="${esc(t.id)}" placeholder="Sources, ideas, teacher feedback" aria-label="Notes">${esc(t.notes || "")}</textarea>
          ${(t.links || []).length ? `<div class="list" style="margin-top:10px">${t.links.map((l, i) => `<div class="li">${icon("link", "ico-sm")}<a class="grow" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="overflow-wrap:anywhere">${esc(l.title || l.url)}</a><button type="button" class="btn ghost xs" data-act="del-link" data-task="${esc(t.id)}" data-i="${i}" aria-label="Remove link">${icon("x", "ico-sm")}</button></div>`).join("")}</div>` : ""}
          <form class="addline" data-form="add-link" data-task="${esc(t.id)}"><input class="input sm" id="al-${esc(t.id)}" name="url" type="url" placeholder="https://…" aria-label="Link URL"><button class="btn sm" type="submit">${icon("plus", "ico-sm")}Link</button></form>
        </section>
      </div>
    </div>`;
};

// ---------- progress ----------
V.progress = () => {
  const s = st(), today = SF.today();
  const li = SF.levelInfo(s.meta.xp);
  const sk = SF.streak(s);
  const ws = SF.weekStart(today);
  const w = SF.weekStats(s, ws), lw = SF.weekStats(s, SF.addDays(ws, -7));
  const doneAll = s.tasks.filter((t) => t.completedAt);
  const onTime = doneAll.length ? (doneAll.filter((t) => t.completedAt <= t.due).length / doneAll.length) * 100 : null;
  const ch = SF.challenge(s, today);
  const P = plan(), idx = P.idx;

  const missed = [];
  for (let d = ws; d < today; d = SF.addDays(d, 1)) {
    const pl = s.meta.planLog[d];
    if (!pl) continue;
    const doneKeys = new Set(s.log.sessions.filter((x) => x.date === d).map((x) => x.key));
    pl.filter((p) => !doneKeys.has(p.key) && !p.key.startsWith("v:")).forEach((p) => missed.push(`${SF.DAYS[SF.wd(d)]}: ${p.title}`));
  }
  const attention = [];
  s.tasks.filter((t) => !t.completedAt && t.due < today).forEach((t) => attention.push(`${t.title} is overdue`));
  for (const sub of s.subjects) {
    const g = SF.gradeSummary(s, sub.id);
    if (g.verdict && ["hard", "impossible"].includes(g.verdict.key)) attention.push(`${sub.name}: ${g.verdict.key === "impossible" ? `${g.target}% is out of reach` : `you need ${pct(g.needed)} on what's left`}`);
    const weak = SF.subjectTopics(sub).filter((t) => idx.topicState[t.id].state === "weak");
    if (weak.length) attention.push(`${sub.name}: ${plural(weak.length, "weak topic")} (${weak.slice(0, 2).map((t) => t.name).join(", ")}${weak.length > 2 ? "…" : ""})`);
  }
  s.exams.filter((e) => !e.done && e.date >= today && SF.diff(today, e.date) <= 7).forEach((e) => { const r = examReadiness(e, idx); if (r.pct < 60) attention.push(`${e.title} in ${SF.diff(today, e.date)} days, ${pct(r.pct)} ready`); });

  const cf = S.ui.filters.chart || "all";
  const minDelta = w.minutes - lw.minutes;
  return `<div class="page-head"><div><h1>Progress</h1><p class="sub">Whether you're improving, not just how busy you were.</p></div><button type="button" class="btn" data-act="go" data-view="settings">${icon("gear", "ico-sm")}Settings</button></div>
    <div class="kpis">
      <div class="kpi level"><span class="k">${icon("bolt", "ico-sm")}Level</span><span class="v">${li.level}</span><div class="xpbar"><i style="width:${(li.into / li.need) * 100}%"></i></div><span class="s">${s.meta.xp} XP · ${li.need - li.into} to level ${li.level + 1}</span></div>
      <div class="kpi"><span class="k">${icon("flame", "ico-sm")}Streak</span><span class="v">${sk.current}</span><span class="s">${sk.today ? "Today counts" : sk.current ? "Study today to keep it" : "Start one today"} · best ${sk.best}</span></div>
      <div class="kpi"><span class="k">${icon("clock", "ico-sm")}This week</span><span class="v">${SF.dur(w.minutes)}</span><span class="s">${lw.minutes || w.minutes ? `${minDelta >= 0 ? "+" : "−"}${SF.dur(Math.abs(minDelta))} vs last week` : "No sessions yet"}</span></div>
      <div class="kpi"><span class="k">${icon("revision", "ico-sm")}Review accuracy</span><span class="v">${w.acc == null ? "–" : Math.round(w.acc * 100) + "%"}</span><span class="s">${plural(w.reviews.length, "answer")} this week${lw.acc != null && w.acc != null ? ` · ${w.acc >= lw.acc ? "up" : "down"} from ${Math.round(lw.acc * 100)}%` : ""}</span></div>
      <div class="kpi"><span class="k">${icon("assignments", "ico-sm")}On time</span><span class="v">${onTime == null ? "–" : Math.round(onTime) + "%"}</span><span class="s">${plural(doneAll.length, "assignment")} handed in</span></div>
    </div>
    <div class="prog-grid">
      <section class="panel span2"><div class="panel-head"><h2>This week</h2><span class="small muted">${SF.fmtDay(w.ws)} – ${SF.fmtDay(w.we)}</span></div>
        <div class="report-cols">
          <div><h4 style="color:var(--good)">${icon("check", "ico-sm")}Done</h4><ul>${[`${plural(w.sessions.length, "study session")}, ${SF.dur(w.minutes)}`, ...w.completed.map((t) => `Handed in ${t.title}`), ...(w.fixed.length ? [`Fixed ${plural(w.fixed.length, "mistake")}`] : []), ...(w.reviews.length ? [`${plural(w.reviews.length, "review answer")}`] : [])].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><h4 style="color:var(--warn)">${icon("clock", "ico-sm")}Missed</h4>${missed.length ? `<ul>${missed.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join("")}${missed.length > 6 ? `<li>and ${missed.length - 6} more</li>` : ""}</ul><p class="tiny faint" style="margin-top:6px">Already moved into your plan.</p>` : `<p class="small muted">Nothing missed so far.</p>`}</div>
          <div><h4 style="color:var(--crit)">${icon("alert", "ico-sm")}Needs attention</h4>${attention.length ? `<ul>${attention.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="small muted">All good.</p>`}</div>
        </div></section>
      <section class="panel"><div class="panel-head"><div><div class="eyebrow">Weekly challenge</div><h2 style="margin-top:4px">${esc(ch.name)}</h2></div><span class="pill ${ch.done ? "hi" : ""}">${ch.done ? "Complete · +50 XP" : "+50 XP"}</span></div>
        <div class="row-flex"><div class="bar grow" style="height:12px"><i style="width:${(ch.value / ch.goal) * 100}%;background:var(--hi)"></i></div><span class="mono">${ch.value}/${ch.goal}</span></div>
        <p class="small muted" style="margin-top:10px">A new challenge every Monday. XP only comes from things that build learning: planned sessions, finishing early, beating your last score, and revising weak topics.</p></section>
      <section class="panel"><div class="panel-head"><h2>Recent XP</h2></div>
        ${s.meta.xpLog.length ? `<div class="list">${s.meta.xpLog.slice(-8).reverse().map((x) => `<div class="li"><span class="pill hi mono">+${x.pts}</span><div class="li-main"><span>${esc(x.why)}</span></div><span class="small faint">${esc(SF.relDay(x.t, today))}</span></div>`).join("")}</div>` : `<p class="muted small">Finish a planned session to earn your first XP.</p>`}</section>
      <section class="panel chart"><div class="panel-head"><h2>Grades over time</h2><div class="seg" role="group" aria-label="Subject">${[["all", "All"]].concat(s.subjects.map((x) => [x.id, x.name])).map(([k, l]) => `<button type="button" aria-pressed="${cf === k}" data-act="filter" data-f="chart" data-v="${esc(k)}">${esc(l)}</button>`).join("")}</div></div>${gradesChart(cf)}</section>
      <section class="panel"><div class="panel-head"><h2>Subject confidence</h2><span class="small muted">Average topic mastery</span></div>
        ${s.subjects.map((sub) => { const ts = SF.subjectTopics(sub).map((t) => idx.topicState[t.id].score); const v = ts.length ? (ts.reduce((a, b) => a + b, 0) / ts.length) * 100 : 0; return `<div class="mbar"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sub.name)}</span><div class="bar" data-sc="${esc(sub.color)}"><i style="width:${v}%;background:var(--sc)"></i></div><span class="mono small" style="text-align:right">${Math.round(v)}%</span></div>`; }).join("") || `<p class="muted small">Add subjects and topics first.</p>`}</section>
      <section class="panel span2"><div class="panel-head"><h2>Achievements</h2><span class="small muted">${s.meta.achievements.length}/${SF.ACHIEVEMENTS.length}</span></div>
        <div class="badges">${SF.ACHIEVEMENTS.map((a) => { const got = s.meta.achievements.find((x) => x.id === a.id); return `<div class="badge ${got ? "got" : ""}"><b>${got ? icon("trophy", "ico-sm") + " " : ""}${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`; }).join("")}</div></section>
    </div>`;
};

function gradesChart(cf) {
  const s = st();
  const subs = s.subjects.filter((x) => cf === "all" || x.id === cf);
  const series = subs.map((sub) => ({ sub, pts: SF.gradeSummary(s, sub.id).done.filter((a) => a.date).map((a) => ({ d: a.date, v: (a.score / a.max) * 100, t: a.title })) })).filter((x) => x.pts.length);
  if (!series.length) return `<p class="muted small">Marked assessments will appear here as a line per subject.</p>`;
  const all = series.flatMap((x) => x.pts);
  let d0 = all.reduce((m, p) => (p.d < m ? p.d : m), all[0].d), d1 = all.reduce((m, p) => (p.d > m ? p.d : m), all[0].d);
  if (d0 === d1) { d0 = SF.addDays(d0, -7); d1 = SF.addDays(d1, 7); }
  const span = SF.diff(d0, d1);
  const W = 560, H = 230, l = 36, r = 14, t = 12, b = 28;
  const lo = Math.max(0, Math.floor(Math.min(...all.map((p) => p.v), ...(cf !== "all" && subs[0] && subs[0].target ? [subs[0].target] : [])) / 10) * 10 - 10), hi = 100;
  const X = (d) => l + (SF.diff(d0, d) / span) * (W - l - r);
  const Y = (v) => t + (1 - (v - lo) / (hi - lo)) * (H - t - b);
  let g = "";
  for (let v = lo; v <= hi; v += lo <= 40 ? 20 : 10) g += `<line class="grid" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  const ticks = [d0, SF.addDays(d0, Math.round(span / 2)), d1];
  ticks.forEach((d, i) => (g += `<text x="${X(d)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${SF.parse(d).getDate()} ${SF.MONTHS[SF.parse(d).getMonth()]}</text>`));
  if (cf !== "all" && subs[0] && subs[0].target) g += `<line class="target" x1="${l}" x2="${W - r}" y1="${Y(subs[0].target)}" y2="${Y(subs[0].target)}"/><text x="${W - r}" y="${Y(subs[0].target) - 6}" text-anchor="end">target ${subs[0].target}%</text>`;
  for (const sr of series) {
    const col = `var(--${sr.sub.color})`;
    const pts = sr.pts.map((p) => `${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
    sr.pts.forEach((p, i) => (g += `<circle cx="${X(p.d)}" cy="${Y(p.v)}" r="${i === sr.pts.length - 1 ? 5 : 3.5}" fill="${col}" stroke="var(--surface)" stroke-width="2"><title>${esc(sr.sub.name)}: ${esc(p.t)}, ${Math.round(p.v)}%</title></circle>`));
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Assessment scores over time">${g}</svg>
    <div class="legend">${series.map((sr) => `<span><i style="background:var(--${sr.sub.color})"></i>${esc(sr.sub.name)}</span>`).join("")}</div>`;
}

// ---------- settings ----------
V.settings = () => {
  const s = st(), set = s.meta.settings;
  const days = [1, 2, 3, 4, 5, 6, 0];
  return `<button type="button" class="back" data-act="go" data-view="progress">${icon("back", "ico-sm")}Progress</button>
    <div class="page-head" style="margin-top:0"><div><h1>Settings</h1><p class="sub">Your study time, activities and data.</p></div></div>
    <div class="prog-grid">
      <section class="panel"><div class="panel-head"><h2>Study time</h2><button type="button" class="btn sm" data-act="copy-monday">Copy Monday to weekdays</button></div>
        <p class="small muted" style="margin-bottom:12px">The planner only books time inside these windows, never more than the daily limit, and around your activities. Set the limit to "Off" for a day off.</p>
        <div class="daygrid"><span></span><span class="h">From</span><span class="h">Until</span><span class="h">Most</span>
        ${days.map((d) => { const c = set.days[d]; return `<b>${SF.DAYS[d]}</b><input class="input sm" type="time" id="st-${d}-start" value="${c.start}" data-change="set-day" data-d="${d}" data-f="start" aria-label="${SF.DAYS_LONG[d]} from"><input class="input sm" type="time" id="st-${d}-end" value="${c.end}" data-change="set-day" data-d="${d}" data-f="end" aria-label="${SF.DAYS_LONG[d]} until"><select class="input sm" id="st-${d}-max" data-change="set-day" data-d="${d}" data-f="max" aria-label="${SF.DAYS_LONG[d]} most">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((m) => `<option value="${m}" ${Number(c.max) === m ? "selected" : ""}>${m ? SF.dur(m) : "Off"}</option>`).join("")}</select>`; }).join("")}</div>
        <div class="grid3" style="margin-top:16px">
          <label class="field"><span>Session length</span><select class="input" id="st-session" data-change="set-gen" data-f="session">${[20, 25, 30, 40, 45, 50, 60].map((m) => `<option value="${m}" ${set.session === m ? "selected" : ""}>${m} min</option>`).join("")}</select></label>
          <label class="field"><span>Break between</span><select class="input" id="st-brk" data-change="set-gen" data-f="brk">${[0, 5, 10, 15].map((m) => `<option value="${m}" ${set.brk === m ? "selected" : ""}>${m ? m + " min" : "None"}</option>`).join("")}</select></label>
          <label class="field"><span>Start exam revision</span><select class="input" id="st-lead" data-change="set-gen" data-f="lead">${[7, 10, 14, 21, 28].map((m) => `<option value="${m}" ${set.lead === m ? "selected" : ""}>${m} days before</option>`).join("")}</select></label>
        </div></section>
      <section class="panel"><div class="panel-head"><h2>Activities</h2></div><p class="small muted" style="margin-bottom:12px">Regular commitments. The planner leaves these times free.</p>
        ${s.meta.activities.length ? `<div class="list" style="margin-bottom:14px">${s.meta.activities.map((a) => `<div class="li"><div class="li-main"><span class="li-title">${esc(a.name)}</span><span class="li-sub">${a.date ? SF.fmtDay(a.date) : (a.days || []).map((d) => SF.DAYS[d]).join(", ")} · ${esc(a.start)}–${esc(a.end)}</span></div><button type="button" class="btn ghost sm" data-act="del-activity" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">${icon("trash", "ico-sm")}</button></div>`).join("")}</div>` : ""}
        ${activityForm("add-activity")}</section>
      <section class="panel"><div class="panel-head"><h2>You</h2></div><div class="stack-sm"><label class="field"><span>First name (for the greeting)</span><input class="input" id="st-name" value="${esc(s.meta.name)}" data-change="set-name" autocomplete="given-name"></label>
        ${window.SF_WEB ? `<a class="small" href="privacy.html" target="_blank" rel="noopener">Privacy: what StudyFlow stores and how to delete it</a>` : ""}
        ${window.SF_WEB && S.auth && S.auth.user ? `<div class="between" style="border-top:1px solid var(--line);padding-top:12px;margin-top:4px"><div><div class="label">Signed in as</div><div style="overflow-wrap:anywhere">${esc(S.auth.user.email || "")}</div></div><button type="button" class="btn" data-act="sign-out">Sign out</button></div>` : ""}</div></section>
      <section class="panel"><div class="panel-head"><h2>Your data</h2></div>
        <div class="stack-sm">
          <div class="row-flex"><span id="save-state-2" class="save-state ${Store.status === "local" || Store.status === "offline" ? "local" : Store.status === "error" ? "err" : ""}"><i></i></span><span>${window.SF_WEB ? (Store.mode === "offline" ? "You're offline. Changes stay on this device and sync to your account when you reconnect." : "Saved to your StudyFlow account. Only you can see it, on any device where you sign in.") : Store.mode === "cloud" ? "Saved to your Claude account. Only you can see it, on any device where you open this page." : "Saved in this browser only. It stays on this device, and clearing site data erases it, so keep a backup."}</span></div>
          ${window.SF_WEB ? "" : `<div class="row-flex"><span class="pill ${AI.on() ? "good" : ""}">${icon("ai", "ico-sm")}${AI.on() ? "AI features on" : AI.denied ? "AI declined" : "AI unavailable here"}</span><span class="small muted">${AI.on() ? "Claude runs on your own account and asks permission the first time." : AI.denied ? "Reload the page to be asked again." : "Open this page in Claude to use AI features."}</span></div>`}
          <div class="row-flex" style="margin-top:8px"><button type="button" class="btn" data-act="backup">${icon("download", "ico-sm")}Download a backup</button>
            <label class="btn" for="restore-file">${icon("upload", "ico-sm")}Restore from backup</label><input id="restore-file" type="file" accept="application/json,.json" data-change="restore" class="sr"></div>
          ${s.meta.isExample ? `<button type="button" class="btn" data-act="clear-example">Clear example data</button>` : !SF.hasData(s) ? `<button type="button" class="btn" data-act="load-example">Load example data</button>` : ""}
          <div style="margin-top:8px">${S.ui.confirmReset ? `<div class="alert crit">${icon("alert")}<div class="stack-sm"><b>Delete everything?</b><span class="small">Subjects, assignments, grades, cards, mistakes and XP will be gone. Download a backup first if you might want it.</span><div class="row-flex"><button type="button" class="btn danger solid sm" data-act="reset-all">Delete everything</button><button type="button" class="btn sm" data-act="reset-cancel">Cancel</button></div></div></div>` : `<button type="button" class="btn danger" data-act="reset-ask">${icon("trash", "ico-sm")}Reset StudyFlow</button>`}</div>
        </div></section>
    </div>`;
};
