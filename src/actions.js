const ACT = {}, FORM = {}, CHG = {}, INP = {};
const COLORS = SF.SUBJECT_COLORS;

// ---------- navigation ----------
ACT.nav = (el) => go(el.dataset.nav);
ACT.go = (el) => {
  const v = el.dataset.view;
  if (el.dataset.tab) S.ui.tab[v] = el.dataset.tab;
  closeModal();
  go(v);
};
ACT.tab = (el) => { S.ui.tab[el.dataset.scope] = el.dataset.tab; render(); };
ACT.filter = (el) => { S.ui.filters[el.dataset.f] = el.dataset.v; render(); };
ACT.menu = (el) => { S.ui.menu = S.ui.menu === el.dataset.menu ? null : el.dataset.menu; render(); };
ACT["close-modal"] = () => closeModal();
ACT["open-subject"] = (el) => go("subject", { subject: el.dataset.id });
ACT["open-task"] = (el, e) => {
  if (e && e.target.closest("button") && e.target.closest("button") !== el && e.target.closest("button").dataset.act !== "open-task") return;
  closeModal();
  go("task", { task: el.dataset.id });
};
ACT["open-topic"] = (el) => openTopic(el.dataset.id);
ACT.search = () => openSearch();
ACT["focus-qc"] = (el) => {
  const i = $("#qc-input");
  i.value = el.dataset.text || "";
  i.focus();
  INP.qc(i);
};

// ---------- sessions ----------
function findItem(key) {
  return plan().items.find((i) => i.key === key) || null;
}
function itemTitle(item) {
  if (!item) return "Study";
  return item.kind === "step" ? `${item.parent}: ${item.title}` : item.title;
}
function logSession({ key, item, min, planned, timer, markDone }) {
  const s = st(), today = SF.today();
  min = Math.max(1, Math.round(min));
  const rec = { id: SF.uid(), date: today, key, title: itemTitle(item), subjectId: item ? item.subjectId : null, topicId: (item && item.topicId) || null, min, planned: !!planned, timer: !!timer, at: SF.fromMin(SF.nowMin()) };
  s.log.sessions.push(rec);
  const kinds = ["log", "meta"];
  if (item && item.kind === "task") {
    const t = taskOf(item.taskId);
    if (t) {
      t.done = (Number(t.done) || 0) + min;
      kinds.push("tasks");
    }
  }
  if (item && item.kind === "step") {
    const t = taskOf(item.taskId);
    const x = t && t.steps.find((z) => z.id === item.stepId);
    if (x) {
      x.doneMin = (Number(x.doneMin) || 0) + min;
      if (markDone || x.doneMin >= (Number(x.min) || 0)) x.done = true;
      kinds.push("tasks");
    }
  }
  SF.markActive(s);
  delete s.meta.overrides[key];
  if (planned && min >= 15) award(20, `Planned session: ${rec.title.length > 40 ? rec.title.slice(0, 38) + "…" : rec.title}`, `sess:${rec.id}`);
  if (item && item.kind === "revision" && item.weak) {
    const tp = topicOf(item.topicId);
    award(15, `Revised a weak topic: ${tp ? tp.topic.name : ""}`, `weak:${item.topicId}:${today}`);
  }
  afterAction();
  commit(...kinds);
}
ACT["done-sess"] = (el) => {
  const item = findItem(el.dataset.key);
  if (!item) return;
  logSession({ key: el.dataset.key, item, min: Number(el.dataset.min), planned: true });
  toast(`${icon("check", "ico-sm")}<span>Logged ${SF.dur(Number(el.dataset.min))}</span>`);
};
ACT.defer = (el) => {
  const days = Number(el.dataset.days) || 1;
  const d = SF.addDays(SF.today(), days);
  st().meta.overrides[el.dataset.key] = { notBefore: d };
  S.ui.menu = null;
  toast(`Moved to ${SF.fmtDay(d)}. The rest of the plan re-balanced.`);
  commit("meta");
};
ACT["defer-pick"] = (el) => {
  S.ui.menu = null;
  const key = el.dataset.key;
  const it = findItem(key);
  openModal({
    title: "Move to another day",
    render: () => `<form data-form="defer-pick" data-key="${esc(key)}"><div class="sheet-body"><p class="muted">${esc(itemTitle(it))}</p>
      <label class="field"><span>Do it on</span><input class="input" type="date" name="date" id="dp-date" min="${SF.addDays(SF.today(), 1)}" ${it ? `max="${esc(it.due)}"` : ""} value="${SF.addDays(SF.today(), 1)}" required></label>
      ${it ? `<p class="small muted">Must be on or before ${SF.fmtDay(it.due)} to stay on time.</p>` : ""}</div>
      <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Move</button></div></form>`,
  });
  render();
};
FORM["defer-pick"] = (fd, f) => {
  const d = fd.get("date");
  if (!d) return;
  st().meta.overrides[f.dataset.key] = { notBefore: d, prefer: d };
  closeModal();
  toast(`Moved to ${SF.fmtDay(d)}.`);
  commit("meta");
};

// ---------- focus mode ----------
let focusTimer = null, wakeLock = null;
function startFocus(f) {
  S.focus = Object.assign({ start: Date.now(), paused: 0, pauseAt: null, stage: "run" }, f);
  S.focus.target = Math.max(5, f.min || 25) * 60;
  $("#focus").hidden = false;
  renderFocus();
  clearInterval(focusTimer);
  focusTimer = setInterval(tickFocus, 1000);
  try {
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => (wakeLock = w)).catch(() => {});
  } catch (e) {}
}
function focusElapsed() {
  const f = S.focus;
  if (!f) return 0;
  const now = f.pauseAt || Date.now();
  return Math.max(0, (now - f.start - f.paused) / 1000);
}
function tickFocus() {
  const f = S.focus;
  if (!f || f.stage !== "run") return;
  const el = focusElapsed();
  const left = Math.max(0, f.target - el);
  const c = $("#focus .clock"), p = $("#focus .prg");
  if (c) c.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
  if (p) p.style.strokeDashoffset = String(339.29 * (1 - Math.min(1, el / f.target)));
  if (left <= 0 && !f.pauseAt) {
    f.stage = "done";
    renderFocus();
  }
}
function renderFocus() {
  const f = S.focus, box = $("#focus");
  if (!f) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const sub = subjOf(f.subjectId);
  const el = focusElapsed();
  const mins = Math.max(1, Math.round(el / 60));
  const canMark = f.item && (f.item.kind === "step" || f.item.kind === "task");
  if (f.stage === "run") {
    const left = Math.max(0, f.target - el);
    box.innerHTML = `<div class="eyebrow">${f.planned ? "Planned session" : "Focus session"}</div>
      ${sub ? chip(sub.id) : ""}<h2>${esc(f.title)}</h2>
      <div class="ring" data-sc="${sub ? esc(sub.color) : ""}"><svg viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="54" fill="none" stroke-width="8"/><circle class="prg" cx="60" cy="60" r="54" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="339.29" stroke-dashoffset="${339.29 * (1 - Math.min(1, el / f.target))}"/></svg>
      <div class="clock" aria-live="off">${String(Math.floor(left / 60)).padStart(2, "0")}:${String(Math.floor(left % 60)).padStart(2, "0")}</div></div>
      <div class="ctrls"><button type="button" class="btn" data-act="focus-pause">${f.pauseAt ? icon("play", "ico-sm") + "Resume" : icon("pause", "ico-sm") + "Pause"}</button><button type="button" class="btn" data-act="focus-more">+5 min</button><button type="button" class="btn primary" data-act="focus-finish">${icon("check", "ico-sm")}Finish</button></div>
      <p class="small muted">Phone face down. One thing at a time.</p>`;
  } else {
    box.innerHTML = `<div class="eyebrow">${f.stage === "done" ? "Time's up" : "Finish session"}</div><h2>You studied ${SF.dur(mins)}</h2><p class="muted">${esc(f.title)}</p>
      <div class="ctrls">${canMark ? `<button type="button" class="btn hi" data-act="focus-save" data-done="1">${icon("check", "ico-sm")}Save and mark ${f.item.kind === "step" ? "step" : "it"} done</button>` : ""}<button type="button" class="btn primary" data-act="focus-save">Save ${SF.dur(mins)}</button></div>
      <div class="ctrls"><button type="button" class="btn ghost" data-act="focus-resume">Keep going</button><button type="button" class="btn ghost danger" data-act="focus-discard">Discard</button></div>`;
  }
}
function endFocus() {
  clearInterval(focusTimer);
  S.focus = null;
  renderFocus();
  try { if (wakeLock) wakeLock.release(); } catch (e) {}
  wakeLock = null;
}
ACT.focus = (el) => {
  const item = findItem(el.dataset.key);
  if (!item) return;
  startFocus({ key: item.key, item, min: Number(el.dataset.min), planned: true, title: itemTitle(item), subjectId: item.subjectId });
};
ACT["focus-task"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  const set = st().meta.settings;
  const P = plan();
  let item = P.items.find((i) => i.taskId === t.id && i.kind === "step") || P.items.find((i) => i.taskId === t.id);
  if (!item) {
    const x = (t.steps || []).find((z) => !z.done && (!z.assignee || z.assignee === "me"));
    item = x ? { kind: "step", key: `s:${t.id}:${x.id}`, taskId: t.id, stepId: x.id, title: x.title, parent: t.title, subjectId: t.subjectId, remaining: Math.max(10, (x.min || 0) - (x.doneMin || 0)) }
      : { kind: "task", key: `t:${t.id}`, taskId: t.id, title: t.title, subjectId: t.subjectId, remaining: set.session };
  }
  startFocus({ key: item.key, item, min: Math.min(set.session, Math.max(10, item.remaining)), planned: false, title: itemTitle(item), subjectId: t.subjectId });
};
ACT["focus-pause"] = () => {
  const f = S.focus;
  if (!f) return;
  if (f.pauseAt) {
    f.paused += Date.now() - f.pauseAt;
    f.pauseAt = null;
  } else f.pauseAt = Date.now();
  renderFocus();
};
ACT["focus-more"] = () => { if (S.focus) { S.focus.target += 300; renderFocus(); } };
ACT["focus-finish"] = () => {
  const f = S.focus;
  if (!f) return;
  if (!f.pauseAt) f.pauseAt = Date.now();
  f.stage = "finish";
  renderFocus();
};
ACT["focus-resume"] = () => {
  const f = S.focus;
  if (!f) return;
  if (f.pauseAt) { f.paused += Date.now() - f.pauseAt; f.pauseAt = null; }
  if (focusElapsed() >= f.target) f.target = focusElapsed() + 300;
  f.stage = "run";
  renderFocus();
};
ACT["focus-save"] = (el) => {
  const f = S.focus;
  if (!f) return;
  const mins = Math.max(1, Math.round(focusElapsed() / 60));
  const markDone = el.dataset.done === "1";
  endFocus();
  if (markDone && f.item && f.item.kind === "task") {
    logSession({ key: f.key, item: f.item, min: mins, planned: f.planned, timer: true });
    const t = taskOf(f.item.taskId);
    if (t) completeTask(t);
    return;
  }
  logSession({ key: f.key, item: f.item, min: mins, planned: f.planned, timer: true, markDone });
  toast(`${icon("check", "ico-sm")}<span>Saved ${SF.dur(mins)} of focus</span>`);
};
ACT["focus-discard"] = () => endFocus();

// ---------- tasks ----------
function completeTask(t) {
  const today = SF.today();
  t.completedAt = today;
  const early = today < t.due;
  if (early) {
    const n = SF.diff(today, t.due);
    award(30, `Finished early: ${t.title.length > 34 ? t.title.slice(0, 32) + "…" : t.title}`, `done:${t.id}`);
    toast(`${icon("trophy", "ico-sm")}<span>Handed in ${plural(n, "day")} early</span>`, "xp");
    celebrate();
  } else if (today === t.due) {
    award(15, `Finished on the due date: ${t.title.length > 26 ? t.title.slice(0, 24) + "…" : t.title}`, `done:${t.id}`);
  } else toast("Handed in. Late, but done.");
  SF.markActive(st());
  afterAction();
  commit("tasks", "meta");
}
ACT["complete-task"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (t && !t.completedAt) completeTask(t);
};
ACT["reopen-task"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  delete t.completedAt;
  commit("tasks");
};
ACT["task-diff"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  t.difficulty = Number(el.dataset.v);
  commit("tasks");
};
CHG["task-field"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  const f = el.dataset.f;
  let v = el.value;
  if (f === "estimate") v = Math.max(0, Number(v) || 0);
  if (f === "due" && !v) return render();
  if (f === "personalDue" && !v) { delete t.personalDue; return commit("tasks"); }
  t[f] = v;
  commit("tasks");
};
CHG["step-field"] = (el) => {
  const t = taskOf(el.dataset.task);
  const x = t && t.steps.find((z) => z.id === el.dataset.id);
  if (!x) return;
  const f = el.dataset.f;
  if (f === "min") x.min = Math.max(0, Number(el.value) || 0);
  else if (f === "dependsOn") x.dependsOn = el.value ? [el.value] : [];
  else if (f === "due") { if (el.value) x.due = el.value; else delete x.due; }
  else x[f] = el.value;
  commit("tasks");
};
CHG["step-done"] = (el) => {
  const t = taskOf(el.dataset.task);
  const x = t && t.steps.find((z) => z.id === el.dataset.id);
  if (!x) return;
  x.done = el.checked;
  if (x.done) SF.markActive(st());
  if (x.done && t.steps.every((z) => z.done)) toast("All steps done. Hand it in when it's ready.");
  commit("tasks", "meta");
};
ACT["del-step"] = (el) => {
  const t = taskOf(el.dataset.task);
  if (!t) return;
  t.steps = t.steps.filter((z) => z.id !== el.dataset.id);
  t.steps.forEach((z) => (z.dependsOn = (z.dependsOn || []).filter((d) => d !== el.dataset.id)));
  commit("tasks");
};
FORM["add-step"] = (fd, f) => {
  const t = taskOf(f.dataset.task);
  const title = String(fd.get("title") || "").trim();
  if (!t || !title) return;
  t.steps = t.steps || [];
  if (!t.steps.length && (Number(t.done) || 0) > 0) t.steps.push({ id: SF.uid(), title: "Work so far", min: Number(t.done), done: true, doneMin: Number(t.done), assignee: "me", dependsOn: [] });
  t.steps.push({ id: SF.uid(), title, min: Math.max(5, Number(fd.get("min")) || 20), done: false, assignee: "me", dependsOn: [] });
  commit("tasks");
};
FORM["add-check"] = (fd, f) => {
  const t = taskOf(f.dataset.task);
  const text = String(fd.get("text") || "").trim();
  if (!t || !text) return;
  t.rubric = (t.rubric || []).concat([{ text, checked: false }]);
  commit("tasks");
};
CHG["check-item"] = (el) => {
  const t = taskOf(el.dataset.task);
  if (!t) return;
  const i = Number(el.dataset.i);
  t.rubric = t.rubric || [];
  if (i < t.rubric.length) t.rubric[i].checked = el.checked;
  else {
    t.checklist = (t.checklist || []).map((c) => (typeof c === "string" ? { text: c, checked: false } : c));
    const j = i - t.rubric.length;
    if (t.checklist[j]) t.checklist[j].checked = el.checked;
  }
  commit("tasks");
};
FORM["add-member"] = (fd, f) => {
  const t = taskOf(f.dataset.task);
  const name = String(fd.get("name") || "").trim();
  if (!t || !name) return;
  t.members = (t.members || []).concat([{ id: SF.uid(), name }]);
  commit("tasks");
};
ACT["del-member"] = (el) => {
  const t = taskOf(el.dataset.task);
  if (!t) return;
  t.members = (t.members || []).filter((m) => m.id !== el.dataset.id);
  (t.steps || []).forEach((z) => { if (z.assignee === el.dataset.id) z.assignee = "me"; });
  commit("tasks");
};
FORM["add-link"] = (fd, f) => {
  const t = taskOf(f.dataset.task);
  const url = String(fd.get("url") || "").trim();
  if (!t || !/^https?:\/\//i.test(url)) return toast("Links need to start with https://", "err");
  t.links = (t.links || []).concat([{ url, title: url.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 60) }]);
  commit("tasks");
};
ACT["del-link"] = (el) => {
  const t = taskOf(el.dataset.task);
  if (!t) return;
  t.links.splice(Number(el.dataset.i), 1);
  commit("tasks");
};
ACT["plan-milestones"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  const apply = () => {
    const today = SF.today();
    const est = (t.steps || []).length ? t.steps.reduce((a, x) => a + (Number(x.min) || 0), 0) : Number(t.estimate) || 240;
    t.steps = SF.milestonePlan(st(), today, t.personalDue && t.personalDue < t.due ? SF.addDays(t.personalDue, 1) : t.due, est);
    t.estimate = est;
    closeModal();
    toast(`Planned ${plural(t.steps.length, "milestone")} from today to ${SF.fmtDay(t.due)}.`);
    commit("tasks");
  };
  if (!(t.steps || []).length) return apply();
  openModal({
    title: "Replace steps with milestones?",
    data: { apply },
    render: () => `<div class="sheet-body"><p>This swaps the current ${plural(t.steps.length, "step")} for a milestone plan (rubric, research, organise, write, edit, citations, final review) spread over your study days until ${SF.fmtDay(t.due)}, with a buffer day before it's due. Total time stays at ${SF.dur(t.steps.reduce((a, x) => a + (Number(x.min) || 0), 0))}.</p></div>
      <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button type="button" class="btn primary" data-act="modal-run">Replace steps</button></div>`,
  });
};
ACT["modal-run"] = () => { if (S.modal && S.modal.data.apply) S.modal.data.apply(); };
ACT["apply-template"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  openModal({
    title: "Use a step template",
    render: () => `<form data-form="apply-template" data-id="${esc(t.id)}"><div class="sheet-body"><div class="stack-sm">${Object.entries(SF.TEMPLATES).map(([k, tp], i) => `<label class="check"><input type="radio" name="tpl" value="${k}" ${i === 0 ? "checked" : ""}><span><b>${esc(tp.name)}</b> <span class="small muted">${tp.steps.map((x) => x[0]).join(" → ")} (${SF.dur(tp.steps.reduce((a, x) => a + x[1], 0))})</span></span></label>`).join("")}</div>
      ${(t.steps || []).length ? `<label class="check"><input type="checkbox" name="replace" checked><span>Replace the current steps</span></label>` : ""}</div>
      <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Apply</button></div></form>`,
  });
};
FORM["apply-template"] = (fd, f) => {
  const t = taskOf(f.dataset.id);
  const tp = SF.TEMPLATES[fd.get("tpl")];
  if (!t || !tp) return;
  const steps = tp.steps.map(([title, min]) => ({ id: SF.uid(), title, min, done: false, assignee: "me", dependsOn: [] }));
  t.steps = fd.get("replace") || !(t.steps || []).length ? steps : t.steps.concat(steps);
  closeModal();
  commit("tasks");
};

function taskForm(t, mode) {
  t = t || { title: "", subjectId: (S.state.subjects[0] || {}).id || "", kind: "homework", due: SF.addDays(SF.today(), 1), estimate: 30, difficulty: 2 };
  return `<form data-form="task" data-id="${esc(t.id || "")}"><div class="sheet-body">
    <label class="field"><span>Title</span><input class="input" name="title" id="tf-title" required value="${esc(t.title)}" placeholder="e.g. Comparative essay on two poems" autofocus></label>
    <div class="grid2"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="tf-subject">${subjectOptions(t.subjectId, true)}</select></label>
      <label class="field"><span>Type</span><select class="input" name="kind" id="tf-kind">${[["homework", "Homework"], ["assignment", "Assignment"], ["project", "Project"]].map(([k, l]) => `<option value="${k}" ${t.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <div class="grid2"><label class="field"><span>Due</span><input class="input" type="date" name="due" id="tf-due" required value="${esc(t.due)}"></label>
      ${mode === "edit" ? `<label class="field"><span>Format</span><input class="input" name="format" id="tf-format" value="${esc(t.format || "")}" placeholder="e.g. PDF, 800 words"></label>` : `<label class="field"><span>Time it'll take (minutes)</span><input class="input mono" type="number" min="5" step="5" name="estimate" id="tf-est" value="${Number(t.estimate) || 30}"></label>`}</div>
    ${mode === "edit" ? `<label class="field"><span>Requirements (one per line)</span><textarea class="input" name="requirements" id="tf-req">${esc((t.requirements || []).join("\n"))}</textarea></label>` : `
    <label class="field"><span>Steps</span><select class="input" name="tpl" id="tf-tpl"><option value="">No steps, just a time estimate</option>${Object.entries(SF.TEMPLATES).map(([k, tp]) => `<option value="${k}">${esc(tp.name)} template (${SF.dur(tp.steps.reduce((a, x) => a + x[1], 0))})</option>`).join("")}<option value="milestones">Milestones up to the due date (best for projects)</option></select></label>`}
    <div class="field"><span>Difficulty</span><div class="seg" role="radiogroup">${[[1, "Easy"], [2, "Medium"], [3, "Hard"]].map(([v, l]) => `<label style="display:contents"><input type="radio" name="difficulty" value="${v}" class="sr" ${(Number(t.difficulty) || 2) === v ? "checked" : ""}><button type="button" aria-pressed="${(Number(t.difficulty) || 2) === v}" data-act="seg-radio">${l}</button></label>`).join("")}</div></div>
    ${mode === "edit" ? (S.modal && S.modal.data.confirmDel ? `<div class="alert crit">${icon("alert")}<div class="stack-sm"><b>Delete this assignment?</b><div class="row-flex"><button type="button" class="btn danger solid sm" data-act="del-task" data-id="${esc(t.id)}">Delete</button><button type="button" class="btn sm" data-act="modal-flag" data-k="confirmDel" data-v="">Cancel</button></div></div></div>` : `<div><button type="button" class="btn danger sm" data-act="modal-flag" data-k="confirmDel" data-v="1">${icon("trash", "ico-sm")}Delete assignment</button></div>`) : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${mode === "edit" ? "Save" : "Add assignment"}</button></div></form>`;
}
ACT["seg-radio"] = (el) => {
  const lab = el.closest("label");
  const inp = lab && lab.querySelector("input");
  if (!inp) return;
  inp.checked = true;
  $$("button", el.closest(".seg")).forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
};
ACT["modal-flag"] = (el) => {
  if (!S.modal) return;
  S.modal.data[el.dataset.k] = el.dataset.v || null;
  renderModal();
};
ACT["add-task"] = () => {
  openModal({ title: "Add assignment", render: () => taskForm(null, "add") });
};
ACT["edit-task"] = (el) => {
  const t = taskOf(el.dataset.id);
  if (!t) return;
  openModal({ title: "Edit assignment", render: () => taskForm(t, "edit") });
};
FORM.task = (fd, f) => {
  const s = st(), today = SF.today();
  const id = f.dataset.id;
  const title = String(fd.get("title") || "").trim();
  if (!title) return;
  if (id) {
    const t = taskOf(id);
    if (!t) return;
    Object.assign(t, { title, subjectId: fd.get("subjectId") || null, kind: fd.get("kind"), due: fd.get("due") || t.due, format: String(fd.get("format") || "").trim(), difficulty: Number(fd.get("difficulty")) || 2 });
    t.requirements = String(fd.get("requirements") || "").split("\n").map((x) => x.trim()).filter(Boolean);
    closeModal();
    return commit("tasks");
  }
  const est = Math.max(5, Number(fd.get("estimate")) || 30);
  const t = { id: SF.uid(), title, subjectId: fd.get("subjectId") || null, kind: fd.get("kind"), due: fd.get("due") || SF.addDays(today, 1), estimate: est, done: 0, difficulty: Number(fd.get("difficulty")) || 2, steps: [], rubric: [], requirements: [], members: [], links: [], notes: "", createdAt: today };
  const tpl = fd.get("tpl");
  if (tpl === "milestones") t.steps = SF.milestonePlan(s, today, t.due, est);
  else if (tpl && SF.TEMPLATES[tpl]) t.steps = SF.TEMPLATES[tpl].steps.map(([x, m]) => ({ id: SF.uid(), title: x, min: m, done: false, assignee: "me", dependsOn: [] }));
  s.tasks.push(t);
  closeModal();
  toast(`Added. The planner fitted it in before ${SF.fmtDay(t.due)}.`);
  commit("tasks");
};
ACT["del-task"] = (el) => {
  const s = st();
  s.tasks = s.tasks.filter((t) => t.id !== el.dataset.id);
  closeModal();
  go("assignments");
  commit("tasks");
};

// ---------- decoder ----------
ACT.decode = () => {
  openModal({ title: AI.on() ? "Decode assignment instructions" : "Add from a template", wide: true, data: { stage: "input", text: "", images: [], tpl: "essay" }, render: decodeHTML });
};
function decodeHTML(d) {
  if (d.stage === "loading") return `<div class="sheet-body"><div class="empty"><span class="spin" style="width:28px;height:28px"></span><h3>Reading the instructions…</h3><p>Claude is pulling out the deadline, requirements and rubric, and splitting the work into timed steps. This usually takes 10 to 40 seconds.</p></div></div><div class="sheet-foot"><button type="button" class="btn" data-act="decode-stop">Stop</button></div>`;
  if (d.stage === "preview") {
    const r = d.result;
    const total = r.steps.reduce((a, x) => a + (Number(x.minutes) || 0), 0);
    return `<form data-form="decode-create" id="decode-form"><div class="sheet-body">
      ${d.fromAI ? `<div class="alert info">${icon("ai")}<div>Check this before you rely on it. Fix anything Claude got wrong; the times are estimates you can change.</div></div>` : ""}
      <label class="field"><span>Title</span><input class="input" name="title" id="dc-title" value="${esc(r.title)}" required></label>
      <div class="grid3"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="dc-subject">${subjectOptions(r.subjectId, true)}</select></label>
        <label class="field"><span>Type</span><select class="input" name="kind" id="dc-kind">${[["homework", "Homework"], ["assignment", "Assignment"], ["project", "Project"]].map(([k, l]) => `<option value="${k}" ${r.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field"><span>Due</span><input class="input" type="date" name="due" id="dc-due" value="${esc(r.dueDate || SF.addDays(SF.today(), 7))}" required></label></div>
      <label class="field"><span>Format</span><input class="input" name="format" id="dc-format" value="${esc(r.format || "")}" placeholder="e.g. 800–1,000 words, PDF"></label>
      <div class="field"><span>Steps · ${SF.dur(total)} total</span>
        <div class="stack-sm">${r.steps.map((x, i) => `<div class="row-flex" style="flex-wrap:nowrap"><span class="mono small faint" style="width:20px">${i + 1}</span><input class="input sm grow" name="st_${i}" id="dc-st-${i}" value="${esc(x.title)}" aria-label="Step ${i + 1}"><input class="input sm mono" type="number" min="5" step="5" name="sm_${i}" id="dc-sm-${i}" value="${Number(x.minutes) || 15}" style="width:76px" aria-label="Minutes for step ${i + 1}"><button type="button" class="btn ghost xs" data-act="decode-delstep" data-i="${i}" aria-label="Remove step ${i + 1}">${icon("x", "ico-sm")}</button></div>`).join("")}
        <div><button type="button" class="btn sm" data-act="decode-addstep">${icon("plus", "ico-sm")}Add step</button></div></div></div>
      <div class="grid2"><label class="field"><span>Requirements (one per line)</span><textarea class="input" name="requirements" id="dc-req">${esc(r.requirements.join("\n"))}</textarea></label>
        <label class="field"><span>Rubric and final checks (one per line)</span><textarea class="input" name="rubric" id="dc-rub">${esc(r.rubric.concat(r.checklist || []).join("\n"))}</textarea></label></div>
    </div><div class="sheet-foot"><button type="button" class="btn" data-act="decode-back">Back</button><button class="btn primary" type="submit">Create assignment</button></div></form>`;
  }
  const imgs = d.images || [];
  return `<form data-form="decode" id="decode-in"><div class="sheet-body">
    ${AI.on() ? `<p class="muted">Paste the instructions your teacher gave you${AI.images ? ", or add a photo or screenshot of them" : ""}. Claude extracts the deadline, requirements and rubric, and breaks the work into steps with time estimates.</p>
    <label class="field"><span>Instructions</span><textarea class="input" name="text" id="dc-text" style="min-height:160px" placeholder="Paste the assignment brief, rubric, or both">${esc(d.text || "")}</textarea></label>
    ${AI.images ? `<div class="drop" id="dc-drop">${icon("camera")}<span>Drop a photo or screenshot here, or</span><label class="btn sm" for="dc-file">Choose image</label><input type="file" id="dc-file" class="sr" accept="${esc(AI.mediaTypes.join(",") || "image/*")}" multiple data-change="decode-file">
      ${imgs.length ? `<div class="thumbs">${imgs.map((im, i) => `<div style="position:relative"><img src="${im.url}" alt="Attached image ${i + 1}"><button type="button" class="btn xs" style="position:absolute;top:2px;right:2px;padding:0 4px;min-height:22px" data-act="decode-delimg" data-i="${i}" aria-label="Remove image">${icon("x", "ico-sm")}</button></div>`).join("")}</div>` : ""}</div>` : ""}
    ${d.error ? `<div class="alert crit">${icon("alert")}<div>${esc(d.error)}</div></div>` : ""}
    <div class="small muted" style="border-top:1px solid var(--line);padding-top:12px">No instructions handy? Start from a template instead.</div>` : `<p class="muted">Pick a template to get timed steps. You can rename, re-time and add steps afterwards.</p>`}
    <div class="row-flex"><select class="input" style="width:auto" name="tpl" id="dc-tpl">${Object.entries(SF.TEMPLATES).map(([k, tp]) => `<option value="${k}" ${d.tpl === k ? "selected" : ""}>${esc(tp.name)}</option>`).join("")}</select><button type="button" class="btn" data-act="decode-template">Use template</button></div>
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button>${AI.on() ? `<button class="btn primary" type="submit">${icon("ai", "ico-sm")}Decode</button>` : ""}</div></form>`;
}
CHG["decode-file"] = (el) => {
  const d = S.modal && S.modal.data;
  if (!d) return;
  const files = [...(el.files || [])].slice(0, Math.max(1, AI.maxImages - d.images.length));
  for (const f of files) d.images.push({ blob: f, url: URL.createObjectURL(f) });
  d.text = ($("#dc-text") || {}).value || d.text;
  renderModal();
};
ACT["decode-delimg"] = (el) => {
  const d = S.modal.data;
  const im = d.images.splice(Number(el.dataset.i), 1)[0];
  if (im) URL.revokeObjectURL(im.url);
  d.text = ($("#dc-text") || {}).value || d.text;
  renderModal();
};
ACT["decode-template"] = () => {
  const d = S.modal.data;
  const k = ($("#dc-tpl") || {}).value || "generic";
  d.tpl = k;
  d.text = ($("#dc-text") || {}).value || "";
  const tp = SF.TEMPLATES[k];
  d.result = { title: "", subjectId: (S.state.subjects[0] || {}).id || "", kind: k === "problems" ? "homework" : "assignment", dueDate: SF.addDays(SF.today(), 7), format: "", requirements: [], rubric: [], checklist: [], steps: tp.steps.map(([title, minutes]) => ({ title, minutes })) };
  d.fromAI = false;
  d.stage = "preview";
  renderModal();
};
FORM.decode = async (fd) => {
  const d = S.modal && S.modal.data;
  if (!d || !AI.on()) return;
  const text = String(fd.get("text") || "").trim();
  d.text = text;
  if (!text && !d.images.length) {
    d.error = "Paste the instructions or add a photo first.";
    return renderModal();
  }
  d.error = null;
  d.stage = "loading";
  renderModal();
  const ctl = new AbortController();
  S.modal.ctl = ctl;
  const s = st(), today = SF.today();
  const prompt = `You are helping a Grade 9 student turn assignment instructions into a plan.
Today is ${SF.fmtLong(today)} (${today}). The student's subjects are: ${s.subjects.map((x) => x.name).join(", ") || "not set"}.
Read the instructions${d.images.length ? " in the attached image(s)" : ""}${text && d.images.length ? " and the text below" : ""} and reply with only a JSON object in this shape:
{"title": "short title, e.g. Comparative essay: two war poems", "subject": "one of the subject names above, or null", "kind": "homework" | "assignment" | "project", "dueDate": "YYYY-MM-DD or null (resolve weekday names relative to today)", "format": "submission format, length, citation style, or null", "requirements": ["concrete requirements, max 8"], "rubric": ["what the teacher marks on, phrased as a check the student can tick, max 8"], "steps": [{"title": "step in order", "minutes": integer}], "checklist": ["final checks before handing in, max 6"]}
Use 3 to 8 steps with realistic minutes for a Grade 9 student (5 to 120 each). Only include requirements and rubric points that are actually in the instructions; use empty arrays if there are none. Keep steps generic if the instructions are vague.${text ? `\n\nInstructions:\n"""\n${text.slice(0, 20000)}\n"""` : ""}`;
  try {
    const out = await AI.json(prompt, { signal: ctl.signal, images: d.images.length ? d.images.map((x) => x.blob) : undefined });
    if (!S.modal || S.modal.data !== d) return;
    const arr = (x, n) => (Array.isArray(x) ? x.map((y) => String(typeof y === "object" && y ? y.text || y.title || "" : y || "").trim()).filter(Boolean).slice(0, n) : []);
    const subj = out && out.subject ? s.subjects.find((x) => x.name.toLowerCase() === String(out.subject).toLowerCase()) || s.subjects.find((x) => SF.matchSubject(String(out.subject), [x])) : null;
    const steps = Array.isArray(out && out.steps) ? out.steps.map((x) => ({ title: String((x && x.title) || "").trim(), minutes: SF.clamp(Math.round((Number(x && x.minutes) || 15) / 5) * 5, 5, 180) })).filter((x) => x.title).slice(0, 10) : [];
    const due = out && /^\d{4}-\d{2}-\d{2}$/.test(String(out.dueDate || "")) ? out.dueDate : null;
    d.result = {
      title: String((out && out.title) || "").trim() || "New assignment",
      subjectId: subj ? subj.id : "",
      kind: ["homework", "assignment", "project"].includes(out && out.kind) ? out.kind : "assignment",
      dueDate: due && due >= today ? due : null,
      format: out && out.format ? String(out.format) : "",
      requirements: arr(out && out.requirements, 8),
      rubric: arr(out && out.rubric, 8),
      checklist: arr(out && out.checklist, 6),
      steps: steps.length ? steps : SF.TEMPLATES.generic.steps.map(([title, minutes]) => ({ title, minutes })),
    };
    d.fromAI = true;
    d.stage = "preview";
  } catch (e) {
    if (!S.modal || S.modal.data !== d) return;
    d.stage = "input";
    d.error = e && e.code === "cancelled" ? null : AI.msg(e);
  }
  renderModal();
};
ACT["decode-stop"] = () => { if (S.modal && S.modal.ctl) S.modal.ctl.abort(); };
function syncDecode() {
  const d = S.modal.data, f = $("#decode-form");
  if (!f) return;
  const fd = new FormData(f);
  d.result.title = fd.get("title");
  d.result.subjectId = fd.get("subjectId");
  d.result.kind = fd.get("kind");
  d.result.dueDate = fd.get("due");
  d.result.format = fd.get("format");
  d.result.requirements = String(fd.get("requirements") || "").split("\n");
  d.result.rubric = String(fd.get("rubric") || "").split("\n");
  d.result.checklist = [];
  d.result.steps = d.result.steps.map((x, i) => ({ title: fd.get("st_" + i), minutes: Number(fd.get("sm_" + i)) || 15 }));
}
ACT["decode-delstep"] = (el) => { syncDecode(); S.modal.data.result.steps.splice(Number(el.dataset.i), 1); renderModal(); };
ACT["decode-addstep"] = () => { syncDecode(); S.modal.data.result.steps.push({ title: "", minutes: 20 }); renderModal(); };
ACT["decode-back"] = () => { S.modal.data.stage = "input"; renderModal(); };
FORM["decode-create"] = (fd) => {
  syncDecode();
  const r = S.modal.data.result;
  const today = SF.today();
  const steps = r.steps.filter((x) => String(x.title || "").trim()).map((x) => ({ id: SF.uid(), title: String(x.title).trim(), min: Math.max(5, Number(x.minutes) || 15), done: false, assignee: "me", dependsOn: [] }));
  const t = {
    id: SF.uid(), title: String(r.title || "").trim() || "New assignment", subjectId: r.subjectId || null, kind: r.kind || "assignment", due: r.dueDate || SF.addDays(today, 7),
    estimate: steps.reduce((a, x) => a + x.min, 0), done: 0, difficulty: 2, steps, format: String(r.format || "").trim(),
    requirements: r.requirements.map((x) => String(x).trim()).filter(Boolean), rubric: r.rubric.map((x) => String(x).trim()).filter(Boolean).map((text) => ({ text, checked: false })),
    members: [], links: [], notes: S.modal.data.text ? S.modal.data.text.slice(0, 4000) : "", createdAt: today,
  };
  st().tasks.push(t);
  closeModal();
  toast(`Created with ${plural(steps.length, "step")}. They're in your plan now.`);
  go("task", { task: t.id });
  commit("tasks");
};

// ---------- subjects ----------
function subjectForm(sub) {
  const used = new Set(S.state.subjects.map((x) => x.color));
  sub = sub || { name: "", color: COLORS.find((c) => !used.has(c)) || "c1", kind: "other", target: 80 };
  return `<form data-form="subject" data-id="${esc(sub.id || "")}"><div class="sheet-body">
    <label class="field"><span>Name</span><input class="input" name="name" id="sf-name" required value="${esc(sub.name)}" placeholder="e.g. Biology" list="sf-list" autocomplete="off" autofocus><datalist id="sf-list">${PRESET_SUBJECTS.filter((x) => !S.state.subjects.some((y) => y.name === x)).map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label>
    <div class="field"><span>Colour</span><div class="row-flex">${COLORS.map((c) => `<label style="position:relative" data-sc="${c}"><input type="radio" name="color" value="${c}" class="sr" ${sub.color === c ? "checked" : ""}><span class="swatch" style="display:block;width:34px;height:34px;border-radius:8px;cursor:pointer;outline:${sub.color === c ? "3px solid var(--ink)" : "none"};outline-offset:2px" data-act="pick-color"></span></label>`).join("")}</div></div>
    <div class="grid2"><label class="field"><span>Type (sets study advice)</span><select class="input" name="kind" id="sf-kind">${Object.entries(SF.KINDS).map(([k, l]) => `<option value="${k}" ${sub.kind === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label class="field"><span>Target grade (%)</span><input class="input mono" type="number" min="0" max="100" name="target" id="sf-target" value="${sub.target ?? ""}"></label></div>
    ${sub.id ? (S.modal && S.modal.data.confirmDel ? `<div class="alert crit">${icon("alert")}<div class="stack-sm"><b>Delete ${esc(sub.name)} and everything in it?</b><span class="small">Its topics, grades, exams, assignments, flashcards, mistakes and notes go too.</span><div class="row-flex"><button type="button" class="btn danger solid sm" data-act="del-subject" data-id="${esc(sub.id)}">Delete subject</button><button type="button" class="btn sm" data-act="modal-flag" data-k="confirmDel" data-v="">Cancel</button></div></div></div>` : `<div><button type="button" class="btn danger sm" data-act="modal-flag" data-k="confirmDel" data-v="1">${icon("trash", "ico-sm")}Delete subject</button></div>`) : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${sub.id ? "Save" : "Add subject"}</button></div></form>`;
}
ACT["pick-color"] = (el) => {
  const lab = el.closest("label");
  const inp = lab.querySelector("input");
  inp.checked = true;
  $$("[data-act=pick-color]", lab.parentElement).forEach((sw) => (sw.style.outline = sw === el ? "3px solid var(--ink)" : "none"));
};
ACT["add-subject"] = () => openModal({ title: "Add subject", render: () => subjectForm(null) });
ACT["edit-subject"] = (el) => { const sub = subjOf(el.dataset.id); if (sub) openModal({ title: "Edit subject", render: () => subjectForm(sub) }); };
FORM.subject = (fd, f) => {
  const s = st();
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  const data = { name, color: fd.get("color") || "c1", kind: fd.get("kind") || SF.guessKind(name), target: fd.get("target") === "" ? null : SF.clamp(Number(fd.get("target")), 0, 100) };
  if (f.dataset.id) Object.assign(subjOf(f.dataset.id), data);
  else {
    if (data.kind === "other") data.kind = SF.guessKind(name);
    s.subjects.push(Object.assign({ id: SF.uid(), chapters: [] }, data));
  }
  closeModal();
  commit("subjects");
};
ACT["del-subject"] = (el) => {
  const s = st(), id = el.dataset.id;
  s.subjects = s.subjects.filter((x) => x.id !== id);
  for (const k of ["tasks", "exams", "assessments", "cards", "mistakes"]) s[k] = s[k].filter((x) => x.subjectId !== id);
  s.resources.filter((r) => r.subjectId === id).forEach((r) => Store.removeRes(r.id));
  s.resources = s.resources.filter((r) => r.subjectId !== id);
  closeModal();
  go("subjects");
  commit("subjects", "tasks", "exams", "assessments", "cards", "mistakes");
};
CHG["subject-target"] = (el) => {
  const sub = subjOf(el.dataset.id);
  if (!sub) return;
  sub.target = el.value === "" ? null : SF.clamp(Number(el.value), 0, 100);
  commit("subjects");
};
ACT["add-chapter"] = (el) => openModal({
  title: "Add chapter",
  render: () => `<form data-form="chapter" data-sub="${esc(el.dataset.id)}"><div class="sheet-body"><label class="field"><span>Chapter or unit name</span><input class="input" name="name" id="ch-name" required placeholder="e.g. Cells" autofocus></label></div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Add</button></div></form>`,
});
ACT["edit-chapter"] = (el) => {
  let ch = null, sub = null;
  for (const x of S.state.subjects) for (const c of x.chapters) if (c.id === el.dataset.id) { ch = c; sub = x; }
  if (!ch) return;
  openModal({
    title: "Edit chapter",
    render: (d) => `<form data-form="chapter" data-sub="${esc(sub.id)}" data-id="${esc(ch.id)}"><div class="sheet-body"><label class="field"><span>Name</span><input class="input" name="name" id="ch-name" required value="${esc(ch.name)}"></label>
      ${d.confirmDel ? `<div class="alert crit">${icon("alert")}<div class="stack-sm"><b>Delete ${esc(ch.name)} and its ${plural(ch.topics.length, "topic")}?</b><div class="row-flex"><button type="button" class="btn danger solid sm" data-act="del-chapter" data-sub="${esc(sub.id)}" data-id="${esc(ch.id)}">Delete</button><button type="button" class="btn sm" data-act="modal-flag" data-k="confirmDel" data-v="">Cancel</button></div></div></div>` : `<div><button type="button" class="btn danger sm" data-act="modal-flag" data-k="confirmDel" data-v="1">${icon("trash", "ico-sm")}Delete chapter</button></div>`}
      </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`,
  });
};
FORM.chapter = (fd, f) => {
  const sub = subjOf(f.dataset.sub);
  const name = String(fd.get("name") || "").trim();
  if (!sub || !name) return;
  if (f.dataset.id) sub.chapters.find((c) => c.id === f.dataset.id).name = name;
  else sub.chapters.push({ id: SF.uid(), name, topics: [] });
  closeModal();
  commit("subjects");
};
ACT["del-chapter"] = (el) => {
  const sub = subjOf(el.dataset.sub);
  if (!sub) return;
  sub.chapters = sub.chapters.filter((c) => c.id !== el.dataset.id);
  closeModal();
  commit("subjects");
};
FORM["add-topic"] = (fd, f) => {
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  for (const sub of S.state.subjects) for (const c of sub.chapters) if (c.id === f.dataset.ch) c.topics.push({ id: SF.uid(), name, status: "ns", confidence: 0 });
  commit("subjects");
};
ACT["bulk-topics"] = (el) => {
  const sub = subjOf(el.dataset.id);
  openModal({
    title: `Paste ${sub ? esc(sub.name) : ""} topics`,
    render: () => `<form data-form="bulk-topics" data-sub="${esc(el.dataset.id)}"><div class="sheet-body">
      <p class="muted small">One topic per line. A line ending in a colon starts a new chapter. Copy straight from your syllabus or course outline.</p>
      <textarea class="input" name="text" id="bt-text" style="min-height:220px;font-family:var(--f-mono);font-size:14px" placeholder="Cells:\nCell structure\nMicroscopy\nDiffusion and osmosis\n\nEnzymes:\nEnzyme action\nEffect of temperature and pH" autofocus></textarea></div>
      <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Add topics</button></div></form>`,
  });
};
FORM["bulk-topics"] = (fd, f) => {
  const sub = subjOf(f.dataset.sub);
  if (!sub) return;
  let ch = null, n = 0;
  for (let line of String(fd.get("text") || "").split("\n")) {
    line = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    if (/:$/.test(line) || /^#+\s/.test(line)) {
      const name = line.replace(/:$/, "").replace(/^#+\s*/, "").trim();
      ch = sub.chapters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!ch) { ch = { id: SF.uid(), name, topics: [] }; sub.chapters.push(ch); }
      continue;
    }
    if (!ch) {
      ch = sub.chapters[sub.chapters.length - 1];
      if (!ch) { ch = { id: SF.uid(), name: "Topics", topics: [] }; sub.chapters.push(ch); }
    }
    ch.topics.push({ id: SF.uid(), name: line.slice(0, 120), status: "ns", confidence: 0 });
    n++;
  }
  closeModal();
  toast(`Added ${plural(n, "topic")}.`);
  commit("subjects");
};
CHG["topic-status"] = (el) => {
  const t = topicOf(el.dataset.id);
  if (!t) return;
  t.topic.status = el.value;
  commit("subjects");
};
ACT["topic-conf"] = (el) => {
  const t = topicOf(el.dataset.id);
  if (!t) return;
  const v = Number(el.dataset.v);
  t.topic.confidence = t.topic.confidence === v ? 0 : v;
  commit("subjects");
};

function openTopic(id) {
  const found = topicOf(id);
  if (!found) return;
  openModal({
    title: esc(found.topic.name),
    wide: true,
    render: (d) => {
      const f = topicOf(id);
      if (!f) return `<div class="sheet-body"><p>This topic was deleted.</p></div>`;
      const { topic, chapter, subject } = f;
      const P = plan(), idx = P.idx;
      const ts = idx.topicState[id] || SF.topicState(topic, { n: 0, ok: 0, m: 0 });
      const s = st();
      const cards = s.cards.filter((c) => c.topicId === id);
      const mis = s.mistakes.filter((m) => m.topicId === id);
      const res = s.resources.filter((r) => r.topicId === id);
      const mins = s.log.sessions.filter((x) => x.topicId === id).reduce((a, x) => a + (x.min || 0), 0);
      return `<div class="sheet-body">
        <div class="row-flex">${chip(subject.id, chapter.name)}${topicStateTag(ts)}<span class="small muted">Mastery score ${Math.round(ts.score * 100)}%</span></div>
        <div class="alert info">${icon("info")}<div><b>Next step:</b> ${esc(SF.nextActivity(subject, ts))}</div></div>
        <div class="grid2"><label class="field"><span>Status</span><select class="input" id="tm-status" data-change="topic-status" data-id="${esc(id)}">${Object.entries(SF.STATUS).map(([k, l]) => `<option value="${k}" ${(topic.status || "ns") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <div class="field"><span>Confidence</span><span class="conf" style="height:42px;align-items:center">${[1, 2, 3, 4, 5].map((v) => `<button type="button" style="width:34px;height:34px" class="${(topic.confidence || 0) >= v ? "on" : ""}" data-act="topic-conf" data-id="${esc(id)}" data-v="${v}" aria-label="Confidence ${v} of 5"></button>`).join("")}</span></div></div>
        <div class="calc"><div class="stat"><span>Review accuracy</span><b>${ts.n ? Math.round(ts.acc * 100) + "%" : "–"}</b></div><div class="stat"><span>Flashcards</span><b>${cards.length}</b></div><div class="stat"><span>Unfixed mistakes</span><b>${mis.filter((m) => !m.resolved).length}</b></div><div class="stat"><span>Time revised</span><b>${SF.dur(mins)}</b></div></div>
        <div class="row-flex">${cards.length || mis.some((m) => !m.resolved) ? `<button type="button" class="btn primary" data-act="start-review" data-topic="${esc(id)}">${icon("play", "ico-sm")}Practise this topic</button>` : ""}${AI.on() ? `<button type="button" class="btn ai" data-act="ai-questions" data-subject="${esc(subject.id)}" data-topic="${esc(id)}">${icon("ai", "ico-sm")}Make practice questions</button>` : ""}<button type="button" class="btn" data-act="add-card" data-subject="${esc(subject.id)}" data-topic="${esc(id)}">${icon("plus", "ico-sm")}Card</button><button type="button" class="btn" data-act="add-mistake" data-subject="${esc(subject.id)}" data-topic="${esc(id)}">${icon("plus", "ico-sm")}Mistake</button><button type="button" class="btn" data-act="add-resource" data-id="${esc(subject.id)}" data-topic="${esc(id)}" data-kind="note">${icon("plus", "ico-sm")}Note</button></div>
        ${mis.length ? `<div><h3 style="margin-bottom:6px">Mistakes</h3>${mis.map(mistakeHTML).join("")}</div>` : ""}
        ${cards.length ? `<div><h3 style="margin-bottom:6px">Flashcards</h3><div class="list">${cards.map((c) => `<div class="li"><div class="li-main"><span class="li-title">${esc(c.front)}</span><span class="li-sub faint">${esc(c.back)}</span></div><button type="button" class="btn ghost xs" data-act="edit-card" data-id="${esc(c.id)}" aria-label="Edit card">${icon("edit", "ico-sm")}</button></div>`).join("")}</div></div>` : ""}
        ${res.length ? `<div><h3 style="margin-bottom:6px">Notes and links</h3><div class="list">${res.map(resRow).join("")}</div></div>` : ""}
        <form class="addline" data-form="rename-topic" data-id="${esc(id)}" style="border-top:1px solid var(--line);padding-top:14px"><input class="input sm" name="name" id="tm-name" value="${esc(topic.name)}" aria-label="Topic name"><button class="btn sm" type="submit">Rename</button>
          ${d.confirmDel ? `<button type="button" class="btn danger solid sm" data-act="del-topic" data-id="${esc(id)}">Really delete</button>` : `<button type="button" class="btn danger sm" data-act="modal-flag" data-k="confirmDel" data-v="1">${icon("trash", "ico-sm")}Delete</button>`}</form>
      </div>`;
    },
  });
}
FORM["rename-topic"] = (fd, f) => {
  const t = topicOf(f.dataset.id);
  const name = String(fd.get("name") || "").trim();
  if (!t || !name) return;
  t.topic.name = name;
  S.modal.title = esc(name);
  commit("subjects");
};
ACT["del-topic"] = (el) => {
  const f = topicOf(el.dataset.id);
  if (!f) return;
  f.chapter.topics = f.chapter.topics.filter((t) => t.id !== el.dataset.id);
  const s = st();
  s.cards.forEach((c) => { if (c.topicId === el.dataset.id) c.topicId = null; });
  s.mistakes.forEach((m) => { if (m.topicId === el.dataset.id) m.topicId = null; });
  s.exams.forEach((e) => (e.topicIds = (e.topicIds || []).filter((x) => x !== el.dataset.id)));
  closeModal();
  commit("subjects", "cards", "mistakes", "exams");
};

// ---------- assessments ----------
function assessmentForm(a, subjectId) {
  a = a || { title: "", date: SF.today(), score: "", max: 20, weight: "", status: "done", subjectId };
  const up = a.status === "upcoming";
  return `<form data-form="assessment" data-id="${esc(a.id || "")}" data-sub="${esc(a.subjectId)}"><div class="sheet-body">
    <label class="field"><span>Assessment</span><input class="input" name="title" id="af-title" required value="${esc(a.title)}" placeholder="e.g. Unit 2 test" autofocus></label>
    <div class="seg" role="radiogroup" aria-label="Status">${[["done", "Marked"], ["upcoming", "Upcoming"]].map(([k, l]) => `<label style="display:contents"><input type="radio" name="status" value="${k}" class="sr" ${a.status === k ? "checked" : ""}><button type="button" aria-pressed="${a.status === k}" data-act="seg-radio">${l}</button></label>`).join("")}</div>
    <div class="grid2"><label class="field"><span>Date</span><input class="input" type="date" name="date" id="af-date" value="${esc(a.date || "")}"></label>
      <label class="field"><span>Weight (% of final grade)</span><input class="input mono" type="number" min="0" max="100" step="any" name="weight" id="af-weight" value="${esc(a.weight)}" placeholder="e.g. 20"></label></div>
    <div class="grid2"><label class="field"><span>Your mark${up ? " (leave empty)" : ""}</span><input class="input mono" type="number" min="0" step="any" name="score" id="af-score" value="${esc(a.score)}"></label>
      <label class="field"><span>Out of</span><input class="input mono" type="number" min="1" step="any" name="max" id="af-max" value="${esc(a.max)}" required></label></div>
    ${a.id ? `<div><button type="button" class="btn danger sm" data-act="del-assessment" data-id="${esc(a.id)}">${icon("trash", "ico-sm")}Delete</button></div>` : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`;
}
ACT["add-assessment"] = (el) => openModal({ title: "Add assessment", render: () => assessmentForm(null, el.dataset.id) });
ACT["edit-assessment"] = (el) => {
  const a = S.state.assessments.find((x) => x.id === el.dataset.id);
  if (a) openModal({ title: "Edit assessment", render: () => assessmentForm(a) });
};
FORM.assessment = (fd, f) => {
  const s = st();
  const status = fd.get("status") || "done";
  const score = fd.get("score");
  if (status === "done" && (score === "" || score == null)) return toast("Add your mark, or switch it to Upcoming.", "err");
  const prev = SF.gradeSummary(s, f.dataset.sub);
  const data = { title: String(fd.get("title") || "").trim(), date: fd.get("date") || "", status, score: status === "done" ? Number(score) : "", max: Number(fd.get("max")) || 1, weight: fd.get("weight") === "" ? "" : Number(fd.get("weight")) };
  if (f.dataset.id) Object.assign(s.assessments.find((x) => x.id === f.dataset.id), data);
  else s.assessments.push(Object.assign({ id: SF.uid(), subjectId: f.dataset.sub }, data));
  closeModal();
  if (status === "done" && prev.done.length) {
    const lastPct = prev.pct(prev.done[prev.done.length - 1]);
    if ((data.score / data.max) * 100 > lastPct + 0.5 && !f.dataset.id) {
      award(25, `Improved on your last ${subjOf(f.dataset.sub) ? subjOf(f.dataset.sub).name : ""} mark`, `improve:${f.dataset.sub}:${data.title}:${data.date}`);
      afterAction();
    }
  }
  commit("assessments", "meta");
};
ACT["del-assessment"] = (el) => {
  const s = st();
  s.assessments = s.assessments.filter((x) => x.id !== el.dataset.id);
  closeModal();
  commit("assessments");
};

// ---------- resources ----------
ACT["add-resource"] = (el) => {
  const kind = el.dataset.kind || "note";
  openModal({ title: kind === "link" ? "Add link" : "Add note", render: () => resourceForm({ kind, subjectId: el.dataset.id, topicId: el.dataset.topic || "" }) });
};
function resourceForm(r) {
  return `<form data-form="resource" data-id="${esc(r.id || "")}"><div class="sheet-body">
    <input type="hidden" name="kind" value="${esc(r.kind)}">
    <label class="field"><span>Title</span><input class="input" name="title" id="rf-title" required value="${esc(r.title || "")}" placeholder="${r.kind === "link" ? "e.g. Teacher's revision site" : "e.g. Photosynthesis class notes"}" autofocus></label>
    <div class="grid2"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="rf-subject" data-change="rf-subject">${subjectOptions(r.subjectId, true)}</select></label>
      <label class="field"><span>Topic</span><select class="input" name="topicId" id="rf-topic">${topicOptions(r.subjectId, r.topicId)}</select></label></div>
    ${r.kind === "link" ? `<label class="field"><span>Link</span><input class="input" type="url" name="url" id="rf-url" required value="${esc(r.url || "")}" placeholder="https://"></label>` : `<label class="field"><span>Notes</span><textarea class="input" name="body" id="rf-body" style="min-height:200px" placeholder="Type or paste your notes">${esc(r.body || "")}</textarea></label>`}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`;
}
CHG["rf-subject"] = (el) => { const t = $("#rf-topic"); if (t) t.innerHTML = topicOptions(el.value, ""); };
FORM.resource = (fd, f) => {
  const s = st();
  const data = { kind: fd.get("kind"), title: String(fd.get("title") || "").trim(), subjectId: fd.get("subjectId") || null, topicId: fd.get("topicId") || null, body: String(fd.get("body") || "").slice(0, 30000), url: String(fd.get("url") || "").trim() };
  if (data.kind === "link" && !/^https?:\/\//i.test(data.url)) return toast("Links need to start with https://", "err");
  let r;
  if (f.dataset.id) { r = resOf(f.dataset.id); Object.assign(r, data); }
  else { r = Object.assign({ id: SF.uid(), date: SF.today() }, data); s.resources.push(r); }
  Store.markRes(r.id);
  closeModal();
  commit();
};
ACT["open-resource"] = (el) => {
  const id = el.dataset.id;
  openModal({
    title: esc((resOf(id) || {}).title || "Note"),
    wide: true,
    render: (d) => {
      const r = resOf(id);
      if (!r) return `<div class="sheet-body"><p>Deleted.</p></div>`;
      const t = r.topicId ? topicOf(r.topicId) : null;
      if (d.edit) return resourceForm(r);
      return `<div class="sheet-body"><div class="row-flex">${chip(r.subjectId)}${t ? `<button type="button" class="btn ghost xs" data-act="open-topic" data-id="${esc(t.topic.id)}">${esc(t.topic.name)}</button>` : ""}<span class="small faint">Added ${SF.fmtDay(r.date)}</span></div>
        ${r.kind === "link" ? `<p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" style="overflow-wrap:anywhere">${esc(r.url)}</a></p>` : `<div style="white-space:pre-wrap;line-height:1.6;max-width:68ch">${esc(r.body)}</div>`}
        <div class="row-flex">${r.kind === "note" && AI.on() && r.body ? `<button type="button" class="btn ai" data-act="ai-questions" data-subject="${esc(r.subjectId || "")}" data-topic="${esc(r.topicId || "")}" data-res="${esc(r.id)}">${icon("ai", "ico-sm")}Make questions from this note</button>` : ""}
          <button type="button" class="btn" data-act="modal-flag" data-k="edit" data-v="1">${icon("edit", "ico-sm")}Edit</button>
          ${d.confirmDel ? `<button type="button" class="btn danger solid" data-act="del-resource" data-id="${esc(r.id)}">Really delete</button>` : `<button type="button" class="btn danger" data-act="modal-flag" data-k="confirmDel" data-v="1">${icon("trash", "ico-sm")}Delete</button>`}</div></div>`;
    },
  });
};
ACT["del-resource"] = (el) => {
  const s = st();
  s.resources = s.resources.filter((r) => r.id !== el.dataset.id);
  Store.removeRes(el.dataset.id);
  closeModal();
  commit();
};

// ---------- exams ----------
function examForm(e) {
  const s = st();
  e = e || { subjectId: (s.subjects[0] || {}).id || "", title: "", date: SF.addDays(SF.today(), 7), topicIds: [] };
  const sub = subjOf(S.modal && S.modal.data.subjectId !== undefined ? S.modal.data.subjectId : e.subjectId);
  const sel = new Set(e.topicIds && e.topicIds.length ? e.topicIds : sub ? SF.subjectTopics(sub).map((t) => t.id) : []);
  return `<form data-form="exam" data-id="${esc(e.id || "")}"><div class="sheet-body">
    <div class="grid2"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="ef-subject" data-change="exam-subject">${subjectOptions(sub ? sub.id : "")}</select></label>
      <label class="field"><span>Date</span><input class="input" type="date" name="date" id="ef-date" required value="${esc(e.date)}"></label></div>
    <label class="field"><span>Name</span><input class="input" name="title" id="ef-title" value="${esc(e.title)}" placeholder="${sub ? esc(sub.name) + " unit test" : "Unit test"}"></label>
    <div class="field"><span>Topics it covers</span>${sub && SF.subjectTopics(sub).length ? `<div class="stack-sm" style="max-height:260px;overflow-y:auto;padding:4px 2px">${sub.chapters.map((c) => `<div><div class="tiny eyebrow" style="margin:6px 0 4px">${esc(c.name)}</div>${c.topics.map((t) => `<label class="check" style="padding:3px 0"><input type="checkbox" name="topic" value="${esc(t.id)}" ${sel.has(t.id) ? "checked" : ""}><span>${esc(t.name)}</span></label>`).join("")}</div>`).join("")}</div>` : `<p class="small muted">This subject has no topics yet, so revision time will be planned once you add some. Add them under Subjects.</p>`}</div>
    ${e.id ? `<div><button type="button" class="btn danger sm" data-act="del-exam" data-id="${esc(e.id)}">${icon("trash", "ico-sm")}Delete exam</button></div>` : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`;
}
ACT["add-exam"] = () => { if (!S.state.subjects.length) return toast("Add a subject first.", "err"); openModal({ title: "Add exam", render: () => examForm(null) }); };
ACT["edit-exam"] = (el) => { const e = examOf(el.dataset.id); if (e) openModal({ title: "Edit exam", render: () => examForm(e) }); };
CHG["exam-subject"] = (el) => {
  S.modal.data.subjectId = el.value;
  const f = el.closest("form");
  const keep = { title: f.elements.namedItem("title").value, date: f.elements.namedItem("date").value };
  renderModal();
  const g = $("#modal form");
  if (g) { g.elements.namedItem("title").value = keep.title; g.elements.namedItem("date").value = keep.date; }
};
FORM.exam = (fd, f) => {
  const s = st();
  const sub = subjOf(fd.get("subjectId"));
  if (!sub) return;
  const topics = fd.getAll("topic");
  const all = SF.subjectTopics(sub).map((t) => t.id);
  const data = { subjectId: sub.id, title: String(fd.get("title") || "").trim() || `${sub.name} test`, date: fd.get("date"), topicIds: topics.length === all.length ? [] : topics };
  if (f.dataset.id) Object.assign(examOf(f.dataset.id), data);
  else s.exams.push(Object.assign({ id: SF.uid(), createdAt: SF.today() }, data));
  closeModal();
  toast("Saved. Revision for its topics is in your plan.");
  commit("exams");
};
ACT["del-exam"] = (el) => { const s = st(); s.exams = s.exams.filter((e) => e.id !== el.dataset.id); closeModal(); commit("exams"); };
ACT["exam-done"] = (el) => {
  const e = examOf(el.dataset.id);
  if (!e) return;
  e.done = true;
  toast("Marked as sat. Add the mark under Grades when you get it back.");
  commit("exams");
};

// ---------- mistakes ----------
function mistakeForm(m) {
  m = m || { subjectId: (S.state.subjects[0] || {}).id || "", topicId: "", question: "", myAnswer: "", correct: "", why: "", type: "Conceptual" };
  const d = S.modal ? S.modal.data : {};
  const sid = d.subjectId !== undefined ? d.subjectId : m.subjectId;
  return `<form data-form="mistake" data-id="${esc(m.id || "")}"><div class="sheet-body">
    <div class="grid2"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="mf-sub" data-change="mf-subject">${subjectOptions(sid, true)}</select></label>
      <label class="field"><span>Topic</span><select class="input" name="topicId" id="mf-topic">${topicOptions(sid, m.topicId)}</select></label></div>
    <label class="field"><span>The question</span><textarea class="input" name="question" id="mf-q" required style="min-height:72px" autofocus>${esc(m.question)}</textarea></label>
    <div class="grid2"><label class="field"><span>What you answered</span><textarea class="input" name="myAnswer" id="mf-mine" style="min-height:64px">${esc(m.myAnswer)}</textarea></label>
      <label class="field"><span>Correct answer</span><textarea class="input" name="correct" id="mf-correct" required style="min-height:64px">${esc(m.correct)}</textarea></label></div>
    <label class="field"><span>Why you got it wrong</span><input class="input" name="why" id="mf-why" value="${esc(m.why)}" placeholder="In your own words"></label>
    <div class="field"><span>Type of mistake</span><div class="stack-sm">${MTYPES.map((t) => `<label class="check"><input type="radio" name="type" value="${t}" ${m.type === t ? "checked" : ""}><span><b>${t}</b> <span class="small muted">${MTYPE_HINT[t]}</span></span></label>`).join("")}</div></div>
    ${m.id ? `<div class="row-flex"><label class="check"><input type="checkbox" name="resolved" ${m.resolved ? "checked" : ""}><span>Fixed</span></label><button type="button" class="btn danger sm" data-act="del-mistake" data-id="${esc(m.id)}">${icon("trash", "ico-sm")}Delete</button></div>` : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`;
}
CHG["mf-subject"] = (el) => { const t = $("#mf-topic"); if (t) t.innerHTML = topicOptions(el.value, ""); };
ACT["add-mistake"] = (el) => {
  const pre = { subjectId: el.dataset.subject || (S.state.subjects[0] || {}).id || "", topicId: el.dataset.topic || "", question: "", myAnswer: "", correct: "", why: "", type: "Conceptual" };
  openModal({ title: "Log a mistake", render: () => mistakeForm(pre) });
};
ACT["edit-mistake"] = (el) => { const m = mistakeOf(el.dataset.id); if (m) openModal({ title: "Edit mistake", render: () => mistakeForm(m) }); };
FORM.mistake = (fd, f) => {
  const s = st();
  const data = { subjectId: fd.get("subjectId") || null, topicId: fd.get("topicId") || null, question: String(fd.get("question") || "").trim(), myAnswer: String(fd.get("myAnswer") || "").trim(), correct: String(fd.get("correct") || "").trim(), why: String(fd.get("why") || "").trim(), type: fd.get("type") || "Conceptual" };
  if (!data.question) return;
  if (f.dataset.id) {
    const m = mistakeOf(f.dataset.id);
    Object.assign(m, data);
    const res = !!fd.get("resolved");
    if (res && !m.resolved) m.resolvedAt = SF.today();
    m.resolved = res;
  } else s.mistakes.push(Object.assign({ id: SF.uid(), date: SF.today(), resolved: false, attempts: [], due: SF.addDays(SF.today(), 1), box: 1 }, data));
  closeModal();
  if (!f.dataset.id) toast("Logged. It comes back for a retry tomorrow.");
  afterAction();
  commit("mistakes", "meta");
};
ACT["del-mistake"] = (el) => { const s = st(); s.mistakes = s.mistakes.filter((m) => m.id !== el.dataset.id); closeModal(); commit("mistakes"); };
CHG.mfilter = (el) => {
  const f = (S.ui.filters.mistakes = S.ui.filters.mistakes || {});
  f[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value;
  render();
};

// ---------- cards ----------
function cardForm(c) {
  const d = S.modal ? S.modal.data : {};
  const sid = d.subjectId !== undefined ? d.subjectId : c.subjectId;
  return `<form data-form="card" data-id="${esc(c.id || "")}"><div class="sheet-body">
    <div class="grid2"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="cf-sub" data-change="cf-subject">${subjectOptions(sid, true)}</select></label>
      <label class="field"><span>Topic</span><select class="input" name="topicId" id="cf-topic">${topicOptions(sid, c.topicId)}</select></label></div>
    <label class="field"><span>Front (question)</span><textarea class="input" name="front" id="cf-front" required style="min-height:72px" autofocus>${esc(c.front || "")}</textarea></label>
    <label class="field"><span>Back (answer)</span><textarea class="input" name="back" id="cf-back" required style="min-height:72px">${esc(c.back || "")}</textarea></label>
    ${c.id ? `<div><button type="button" class="btn danger sm" data-act="del-card" data-id="${esc(c.id)}">${icon("trash", "ico-sm")}Delete card</button></div>` : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button>${c.id ? "" : `<button class="btn" type="submit" name="again" value="1">Save and add another</button>`}<button class="btn primary" type="submit">Save</button></div></form>`;
}
CHG["cf-subject"] = (el) => { const t = $("#cf-topic"); if (t) t.innerHTML = topicOptions(el.value, ""); };
CHG.cfilter = (el) => { S.ui.filters.cards = { subject: el.value }; render(); };
ACT["add-card"] = (el) => {
  const pre = { subjectId: el.dataset.subject || (S.ui.filters.cards || {}).subject || (S.state.subjects[0] || {}).id || "", topicId: el.dataset.topic || "" };
  openModal({ title: "Add flashcard", render: () => cardForm(pre) });
};
ACT["edit-card"] = (el) => { const c = cardOf(el.dataset.id); if (c) openModal({ title: "Edit flashcard", render: () => cardForm(c) }); };
FORM.card = (fd, f, sub) => {
  const s = st();
  const data = { subjectId: fd.get("subjectId") || null, topicId: fd.get("topicId") || null, front: String(fd.get("front") || "").trim(), back: String(fd.get("back") || "").trim() };
  if (!data.front || !data.back) return;
  if (f.dataset.id) Object.assign(cardOf(f.dataset.id), data);
  else s.cards.push(Object.assign({ id: SF.uid(), box: 0, due: SF.today(), reps: 0, lapses: 0, source: "manual", history: [] }, data));
  if (sub && sub.name === "again") {
    S.modal.data.subjectId = data.subjectId;
    const keep = { subjectId: data.subjectId, topicId: data.topicId };
    S.modal.render = () => cardForm(keep);
    commit("cards");
    toast("Card added.");
    setTimeout(() => { const x = $("#cf-front"); if (x) x.focus(); }, 30);
    return;
  }
  closeModal();
  commit("cards");
};
ACT["del-card"] = (el) => { const s = st(); s.cards = s.cards.filter((c) => c.id !== el.dataset.id); closeModal(); commit("cards"); };

// ---------- AI: questions / explain / check ----------
ACT["ai-questions-from-select"] = () => {
  const id = ($("#tp-topic") || {}).value;
  const t = id && topicOf(id);
  ACT["ai-questions"]({ dataset: { subject: t ? t.subject.id : "", topic: id || "" } });
};
ACT["ai-questions"] = (el) => {
  if (!AI.on()) return;
  const d = { stage: "input", subjectId: el.dataset.subject || (S.state.subjects[0] || {}).id || "", topicId: el.dataset.topic || "", resId: el.dataset.res || "", count: 6 };
  openModal({ title: "Make practice questions", wide: true, data: d, render: aiQHTML });
};
function aiQHTML(d) {
  if (d.stage === "loading") return `<div class="sheet-body"><div class="empty"><span class="spin" style="width:28px;height:28px"></span><h3>Writing questions…</h3><p>Usually 10 to 30 seconds.</p></div></div><div class="sheet-foot"><button type="button" class="btn" data-act="decode-stop">Stop</button></div>`;
  if (d.stage === "preview") {
    return `<form data-form="ai-q-add"><div class="sheet-body"><div class="alert info">${icon("ai")}<div>Check each answer against your notes before you keep it. Untick any you don't want.</div></div>
      <div class="stack-sm">${d.items.map((q, i) => `<label class="check" style="padding:10px 0;border-top:1px solid var(--line)"><input type="checkbox" name="pick" value="${i}" checked><span class="stack-sm" style="gap:4px"><b>${esc(q.front)}</b><span class="small muted">${esc(q.back)}</span>${q.type ? `<span class="tag" style="align-self:flex-start">${esc(q.type)}</span>` : ""}</span></label>`).join("")}</div></div>
      <div class="sheet-foot"><button type="button" class="btn" data-act="aiq-back">Back</button><button class="btn primary" type="submit">Add selected as flashcards</button></div></form>`;
  }
  const s = st();
  const notes = s.resources.filter((r) => r.kind === "note" && r.body && (!d.subjectId || r.subjectId === d.subjectId));
  return `<form data-form="ai-q"><div class="sheet-body">
    <div class="grid2"><label class="field"><span>Subject</span><select class="input" name="subjectId" id="aq-sub" data-change="aq-subject">${subjectOptions(d.subjectId)}</select></label>
      <label class="field"><span>Topic</span><select class="input" name="topicId" id="aq-topic">${topicOptions(d.subjectId, d.topicId, true)}</select></label></div>
    <label class="field"><span>Base them on</span><select class="input" name="resId" id="aq-res"><option value="">What a Grade 9 syllabus usually covers</option>${notes.map((r) => `<option value="${esc(r.id)}" ${d.resId === r.id ? "selected" : ""}>Note: ${esc(r.title)}</option>`).join("")}<option value="paste" ${d.resId === "paste" ? "selected" : ""}>Text I paste below</option></select></label>
    <label class="field"><span>Pasted text (optional)</span><textarea class="input" name="paste" id="aq-paste" placeholder="Paste part of your notes or a textbook section">${esc(d.paste || "")}</textarea></label>
    <label class="field" style="max-width:200px"><span>How many</span><select class="input" name="count" id="aq-count">${[4, 6, 8, 10].map((n) => `<option ${d.count === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    ${d.error ? `<div class="alert crit">${icon("alert")}<div>${esc(d.error)}</div></div>` : ""}
  </div><div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn primary" type="submit">${icon("ai", "ico-sm")}Write questions</button></div></form>`;
}
CHG["aq-subject"] = (el) => { const t = $("#aq-topic"); if (t) t.innerHTML = topicOptions(el.value, ""); };
ACT["aiq-back"] = () => { S.modal.data.stage = "input"; renderModal(); };
FORM["ai-q"] = async (fd) => {
  const d = S.modal.data;
  Object.assign(d, { subjectId: fd.get("subjectId"), topicId: fd.get("topicId"), resId: fd.get("resId"), paste: String(fd.get("paste") || ""), count: Number(fd.get("count")) || 6, error: null });
  const sub = subjOf(d.subjectId), tp = d.topicId ? topicOf(d.topicId) : null;
  const r = d.resId && d.resId !== "paste" ? resOf(d.resId) : null;
  const notes = r ? r.body : d.resId === "paste" || d.paste.trim() ? d.paste : "";
  if (!tp && !notes.trim()) { d.error = "Pick a topic or give it some notes to work from."; return renderModal(); }
  d.stage = "loading";
  renderModal();
  const ctl = new AbortController();
  S.modal.ctl = ctl;
  const prompt = `Write ${d.count} practice questions for a Grade 9 student${sub ? ` studying ${sub.name}` : ""}${tp ? `, topic: "${tp.topic.name}"` : ""}.
About half should be recall questions (definitions, facts, labels) and half application questions (explain, apply to a new example, calculate). Each answer should be a short model answer of one to three sentences, or a worked line for calculations.
${notes.trim() ? `Base every question only on these notes:\n"""\n${notes.slice(0, 12000)}\n"""` : "Keep to what a Grade 9 syllabus normally covers for this topic."}
Reply with only a JSON array of objects: [{"front": "question", "back": "model answer", "type": "recall" or "application"}].`;
  try {
    const out = await AI.json(prompt, { signal: ctl.signal });
    if (!S.modal || S.modal.data !== d) return;
    const items = (Array.isArray(out) ? out : Array.isArray(out && out.questions) ? out.questions : []).map((q) => ({ front: String((q && q.front) || "").trim(), back: String((q && q.back) || "").trim(), type: q && q.type ? String(q.type) : "" })).filter((q) => q.front && q.back).slice(0, 12);
    if (!items.length) throw { code: "invalid_json" };
    d.items = items;
    d.stage = "preview";
  } catch (e) {
    if (!S.modal || S.modal.data !== d) return;
    d.stage = "input";
    d.error = e && e.code === "cancelled" ? null : AI.msg(e);
  }
  renderModal();
};
FORM["ai-q-add"] = (fd) => {
  const d = S.modal.data;
  const picks = fd.getAll("pick").map(Number);
  const s = st();
  picks.forEach((i) => { const q = d.items[i]; if (q) s.cards.push({ id: SF.uid(), subjectId: d.subjectId || null, topicId: d.topicId || null, front: q.front, back: q.back, box: 0, due: SF.today(), reps: 0, lapses: 0, source: "ai", history: [] }); });
  closeModal();
  toast(`Added ${plural(picks.length, "flashcard")}. They're due for review now.`);
  commit("cards");
};

async function aiExplain(front, back, extra) {
  const prompt = `A Grade 9 student keeps getting this question wrong.
${extra.subject ? `Subject: ${extra.subject}. ` : ""}${extra.topic ? `Topic: ${extra.topic}.` : ""}
Question: ${front}
${extra.mine ? `Their answer: ${extra.mine}\n` : ""}Correct answer: ${back}
${extra.why ? `Their note on why they got it wrong: ${extra.why}${extra.type ? ` (type: ${extra.type})` : ""}\n` : ""}
Reply with only a JSON object: {"explanation": "2 to 4 sentences, addressed to the student, explaining the idea behind the correct answer${extra.mine ? " and where their answer went wrong" : ""}, in plain words", "tip": "one sentence on how to avoid this mistake next time", "variant": {"question": "a different question that tests the same idea", "answer": "short model answer"}, "apply": {"question": "a question that applies the idea in a new context", "answer": "short model answer"}}`;
  const out = await AI.json(prompt);
  const q = (x) => (x && x.question && x.answer ? { question: String(x.question), answer: String(x.answer) } : null);
  if (!out || !out.explanation) throw { code: "invalid_json" };
  return { explanation: String(out.explanation), tip: out.tip ? String(out.tip) : "", variant: q(out.variant), apply: q(out.apply) };
}
ACT["ai-explain-mistake"] = async (el) => {
  const m = mistakeOf(el.dataset.id);
  if (!m || !AI.on()) return;
  S.ui.explain = S.ui.explain || {};
  S.ui.explain[m.id] = { loading: true };
  render();
  try {
    const t = m.topicId ? topicOf(m.topicId) : null;
    m.explanation = await aiExplain(m.question, m.correct, { subject: (subjOf(m.subjectId) || {}).name, topic: t && t.topic.name, mine: m.myAnswer, why: m.why, type: m.type });
    S.ui.explain[m.id] = null;
    commit("mistakes");
  } catch (e) {
    S.ui.explain[m.id] = { error: AI.msg(e) };
    render();
  }
};
ACT["ai-explain-card"] = async (el) => {
  const c = cardOf(el.dataset.id);
  if (!c || !AI.on()) return;
  const d = { loading: true, cardId: c.id };
  openModal({
    title: "A different way to see it",
    data: d,
    render: (d) => {
      const c = cardOf(d.cardId);
      if (!c) return `<div class="sheet-body"><p>Card deleted.</p></div>`;
      return `<div class="sheet-body"><p class="muted"><b>${esc(c.front)}</b><br>${esc(c.back)}</p>
        ${d.loading ? `<div class="empty"><span class="spin" style="width:28px;height:28px"></span><p>Claude is writing a fresh explanation and two new questions…</p></div>` : d.error ? `<div class="alert crit">${icon("alert")}<div>${esc(d.error)}</div></div>` : aiExplainBox(d.result, c.id, "card")}</div>
        <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Close</button></div>`;
    },
  });
  try {
    const t = c.topicId ? topicOf(c.topicId) : null;
    d.result = await aiExplain(c.front, c.back, { subject: (subjOf(c.subjectId) || {}).name, topic: t && t.topic.name });
  } catch (e) {
    d.error = AI.msg(e);
  }
  d.loading = false;
  if (S.modal && S.modal.data === d) renderModal();
};
ACT["ai-add-variants"] = (el) => {
  const s = st();
  let x, src;
  if (el.dataset.kind === "mistake") { src = mistakeOf(el.dataset.id); x = src && src.explanation; }
  else { src = cardOf(el.dataset.id); x = S.modal && S.modal.data.result; }
  if (!src || !x) return;
  [x.variant, x.apply].filter(Boolean).forEach((q) => s.cards.push({ id: SF.uid(), subjectId: src.subjectId, topicId: src.topicId, front: q.question, back: q.answer, box: 0, due: SF.today(), reps: 0, lapses: 0, source: "ai", history: [] }));
  x.added = true;
  toast("Added two flashcards. They're due now.");
  commit("cards", "mistakes");
};
ACT["ai-check"] = async () => {
  const r = S.rev;
  if (!r || !AI.on() || r.checking) return;
  const q = r.queue[r.i];
  const item = q.type === "card" ? cardOf(q.id) : mistakeOf(q.id);
  r.checking = true;
  render();
  try {
    const out = await AI.json(`Mark a Grade 9 student's answer against the model answer. Accept equivalent wording; the key idea must be there. Spelling doesn't matter.
Question: ${q.type === "card" ? item.front : item.question}
Model answer: ${q.type === "card" ? item.back : item.correct}
Student's answer: ${r.typed}
Reply with only a JSON object: {"verdict": "correct" | "partly" | "incorrect", "feedback": "one or two sentences to the student saying what was right and what was missing"}`, { modelTier: "quick" });
    if (S.rev !== r) return;
    r.check = { verdict: ["correct", "partly", "incorrect"].includes(out && out.verdict) ? out.verdict : "partly", feedback: String((out && out.feedback) || "") };
  } catch (e) {
    toast(AI.msg(e), "err");
  }
  r.checking = false;
  render();
};

// ---------- review sessions ----------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function startReview(opts) {
  const s = st(), today = SF.today();
  let items = [];
  let label = "Review";
  if (opts.topic) {
    items = s.cards.filter((c) => c.topicId === opts.topic).map((c) => ({ type: "card", id: c.id })).concat(s.mistakes.filter((m) => !m.resolved && m.topicId === opts.topic).map((m) => ({ type: "mistake", id: m.id })));
    label = (topicOf(opts.topic) || { topic: { name: "Topic" } }).topic.name;
  } else if (opts.exam) {
    const e = examOf(opts.exam);
    const ids = new Set(examReadiness(e, plan().idx).ids);
    items = s.cards.filter((c) => ids.has(c.topicId)).map((c) => ({ type: "card", id: c.id })).concat(s.mistakes.filter((m) => !m.resolved && ids.has(m.topicId)).map((m) => ({ type: "mistake", id: m.id })));
    label = e.title;
  } else if (opts.mistakes) {
    items = s.mistakes.filter((m) => !m.resolved && (!opts.subject || m.subjectId === opts.subject) && (!opts.topics || opts.topics.has(m.topicId))).map((m) => ({ type: "mistake", id: m.id }));
    label = "Mistake test";
  } else {
    items = SF.dueReviews(s, today).filter((d) => !opts.subject || d.ref.subjectId === opts.subject).map((d) => ({ type: d.type, id: d.id }));
  }
  if (!items.length) return toast("Nothing to review there yet.", "err");
  S.rev = { queue: shuffle(items).slice(0, 40), i: 0, revealed: false, typed: "", check: null, results: [], seen: new Set(), requeued: new Set(), label, xp: 0, fixed: 0 };
  closeModal();
  go("revision");
}
ACT["start-review"] = (el) => startReview({ subject: el.dataset.subject, topic: el.dataset.topic, exam: el.dataset.exam });
FORM["mistake-test"] = (fd) => {
  const v = String(fd.get("subject") || "");
  if (v.startsWith("exam:")) {
    const e = examOf(v.slice(5));
    if (!e) return;
    return startReview({ mistakes: true, subject: e.subjectId, topics: e.topicIds && e.topicIds.length ? new Set(e.topicIds) : null });
  }
  startReview({ mistakes: true, subject: v || undefined });
};
FORM["topic-practice"] = (fd) => {
  if (!fd.get("topic")) return toast("Add topics to a subject first.", "err");
  startReview({ topic: fd.get("topic") });
};
ACT["rev-show"] = () => { if (S.rev) { S.rev.typed = ($("#rev-typed") || {}).value || S.rev.typed; S.rev.revealed = true; render(); } };
INP["rev-typed"] = (el) => { if (S.rev) S.rev.typed = el.value; };
ACT.rate = (el) => rate(el.dataset.r);
function rate(rating) {
  const r = S.rev;
  if (!r || !r.revealed) return;
  const s = st(), today = SF.today();
  const q = r.queue[r.i];
  const item = q.type === "card" ? cardOf(q.id) : mistakeOf(q.id);
  const kinds = ["log", "meta"];
  if (item) {
    const ok = rating !== "again";
    const first = !r.seen.has(q.type + q.id);
    r.seen.add(q.type + q.id);
    const wasWeak = item.topicId && plan().idx.topicState[item.topicId] && plan().idx.topicState[item.topicId].state === "weak";
    SF.rate(item, rating, today);
    if (q.type === "mistake") {
      item.attempts = (item.attempts || []).concat([{ d: today, ok }]).slice(-10);
      const l2 = item.attempts.slice(-2);
      if (ok && l2.length === 2 && l2.every((a) => a.ok) && l2[0].d !== l2[1].d && !item.resolved) {
        item.resolved = true;
        item.resolvedAt = today;
        r.fixed++;
        const a = award(10, "Fixed a mistake", `fix:${item.id}`);
        if (a) r.xp += a.pts;
      }
      kinds.push("mistakes");
    } else kinds.push("cards");
    if (first) {
      s.log.reviews.push({ d: today, s: item.subjectId, t: item.topicId || null, ok: ok ? 1 : 0, c: item.id });
      r.results.push({ subjectId: item.subjectId, ok });
    }
    if (wasWeak) {
      const tp = topicOf(item.topicId);
      const a = award(15, `Revised a weak topic: ${tp ? tp.topic.name : ""}`, `weak:${item.topicId}:${today}`);
      if (a) r.xp += a.pts;
    }
    if (rating === "again" && !r.requeued.has(q.type + q.id)) {
      r.requeued.add(q.type + q.id);
      r.queue.push(q);
    }
  }
  r.i++;
  r.revealed = false;
  r.typed = "";
  r.check = null;
  if (r.i >= r.queue.length) finishReview();
  S.ver++;
  Store.mark(...kinds);
  render();
}
function finishReview() {
  const r = S.rev, s = st();
  if (r.results.length >= 3) SF.markActive(s);
  s.meta.lastAcc = s.meta.lastAcc || {};
  const bySub = {};
  r.results.forEach((x) => { const b = (bySub[x.subjectId] = bySub[x.subjectId] || { n: 0, ok: 0 }); b.n++; if (x.ok) b.ok++; });
  for (const [sid, b] of Object.entries(bySub)) {
    if (b.n < 5) continue;
    const acc = b.ok / b.n;
    const prev = s.meta.lastAcc[sid];
    if (prev != null && acc > prev + 0.001) {
      const sub = subjOf(sid);
      const a = award(25, `Beat your last ${sub ? sub.name : ""} review score`, `acc:${sid}:${SF.today()}`);
      if (a) r.xp += a.pts;
    }
    s.meta.lastAcc[sid] = acc;
  }
  afterAction();
}
ACT["end-review"] = () => {
  if (S.rev && S.rev.i < S.rev.queue.length && S.rev.results.length) finishReview();
  S.rev = null;
  commit("meta");
};

// ---------- quick capture ----------
function qcPreviewHTML(p) {
  if (p.kind === "activity") return `<div class="row-flex"><span class="pill info">Activity</span><b>${esc(p.title || "Activity")}</b><span class="small">${(p.days.length ? p.days : [SF.wd(SF.today())]).map((d) => SF.DAYS[d]).join(", ")} · ${p.start}–${p.end}, every week</span></div><div class="hint">The planner will keep this time free. Press Enter to add.</div>`;
  const kind = { homework: "Homework", assignment: "Assignment", project: "Project", exam: "Test" }[p.kind];
  return `<div class="row-flex"><span class="pill ${p.kind === "exam" ? "crit" : "info"}">${kind}</span><b>${esc(p.title || "…")}</b></div>
    <div class="row-flex small">${chip(p.subjectId)}<span>${p.kind === "exam" ? "on" : "due"} ${esc(SF.fmtDay(p.due))}${p.dueFound ? "" : " (default)"}</span>${p.minutes ? `<span>· ${SF.dur(p.minutes)}</span>` : ""}${p.difficulty === 3 ? `<span class="pill warn">Hard</span>` : p.difficulty === 1 ? `<span class="pill">Easy</span>` : ""}${p.kind === "project" ? `<span>· milestones planned to the due date</span>` : ""}</div>
    <div class="hint">${p.subjectId ? "" : "No subject matched. Start with the subject name, like “bio” or “maths”. "}Enter to add · Esc to cancel</div>`;
}
INP.qc = (el) => {
  const box = $("#qc-prev");
  const v = el.value.trim();
  if (!v) { box.hidden = true; return; }
  const p = SF.quickParse(v, S.state.subjects, SF.today());
  box.innerHTML = qcPreviewHTML(p);
  box.hidden = false;
};
FORM.qc = (fd, f) => {
  const text = String(fd.get("q") || "").trim();
  if (!text) return;
  const s = st(), today = SF.today();
  const p = SF.quickParse(text, s.subjects, today);
  let msg = "";
  if (p.kind === "activity") {
    s.meta.activities.push({ id: SF.uid(), name: p.title || "Activity", days: p.days.length ? [...new Set(p.days)] : [SF.wd(today)], start: p.start, end: p.end });
    msg = `Added ${p.title || "activity"}. Plans now work around it.`;
    Store.mark("meta");
  } else if (p.kind === "exam") {
    s.exams.push({ id: SF.uid(), subjectId: p.subjectId, title: p.title, date: p.due, topicIds: [], createdAt: today });
    const sub = subjOf(p.subjectId);
    msg = !sub ? "Test added. Give it a subject in Revision → Exams so revision gets planned." : SF.subjectTopics(sub).length ? `Test added. Revision for ${sub.name} topics is in your plan.` : `Test added. Add ${sub.name} topics so revision can be planned.`;
    Store.mark("exams");
  } else {
    const t = { id: SF.uid(), subjectId: p.subjectId, kind: p.kind, title: p.title || "Homework", due: p.due, estimate: p.minutes, done: 0, difficulty: p.difficulty, steps: [], rubric: [], requirements: [], members: [], links: [], notes: "", createdAt: today };
    if (p.kind === "project") { t.steps = SF.milestonePlan(s, today, t.due, t.estimate); }
    s.tasks.push(t);
    msg = `Added. Planned before ${SF.fmtDay(t.due)}.`;
    Store.mark("tasks");
  }
  f.reset();
  $("#qc-prev").hidden = true;
  toast(msg);
  S.ver++;
  render();
};

// ---------- search ----------
function openSearch() {
  openModal({
    title: "Search",
    wide: true,
    render: (d) => `<div class="sheet-body"><input class="input" id="search-q" data-input="search" placeholder="Topics, notes, mistakes, flashcards, assignments" value="${esc(d.q || "")}" autocomplete="off" aria-label="Search" autofocus><div id="search-res" class="searchres">${searchResHTML(d.q || "")}</div></div>`,
  });
}
function searchResHTML(q) {
  const res = SF.search(S.state, q);
  if (String(q).trim().length < 2) return `<p class="small muted" style="padding:8px 0">Type at least two letters. Try a topic like “osmosis”.</p>`;
  if (!res.length) return `<p class="small muted" style="padding:8px 0">Nothing matches “${esc(q)}”.</p>`;
  const lab = { subject: "Subject", topic: "Topic", resource: "Note", mistake: "Mistake", card: "Card", task: "Assignment", exam: "Exam" };
  return res.map((r) => `<button type="button" data-act="search-go" data-type="${r.type}" data-id="${esc(r.id)}"><span class="tag">${lab[r.type]}</span><span class="grow" style="min-width:0"><b style="display:block;overflow-wrap:anywhere">${esc(r.title.length > 120 ? r.title.slice(0, 118) + "…" : r.title)}</b><span class="small muted">${esc(r.sub)}</span></span>${r.subjectId ? chip(r.subjectId) : ""}</button>`).join("");
}
INP.search = (el) => {
  if (S.modal) S.modal.data.q = el.value;
  const box = $("#search-res");
  if (box) box.innerHTML = searchResHTML(el.value);
};
ACT["search-go"] = (el) => {
  const { type, id } = el.dataset;
  closeModal();
  if (type === "subject") return go("subject", { subject: id });
  if (type === "topic") return openTopic(id);
  if (type === "resource") return ACT["open-resource"]({ dataset: { id } });
  if (type === "task") return go("task", { task: id });
  if (type === "exam") { S.ui.tab.revision = "exams"; return go("revision"); }
  if (type === "mistake") {
    const m = mistakeOf(id);
    S.ui.tab.revision = "mistakes";
    S.ui.filters.mistakes = { subject: m ? m.subjectId : "", type: "", resolved: true };
    go("revision");
    setTimeout(() => { const x = document.getElementById("mis-" + id); if (x) { x.scrollIntoView({ block: "center" }); x.style.outline = "2px solid var(--accent-2)"; } }, 50);
    return;
  }
  if (type === "card") return ACT["edit-card"]({ dataset: { id } });
};

// ---------- onboarding ----------
ACT["onb-pick"] = (el) => {
  const o = onbState();
  const n = el.dataset.name;
  o.picked = o.picked.includes(n) ? o.picked.filter((x) => x !== n) : o.picked.concat([n]);
  render();
};
ACT["onb-confirm-subjects"] = () => {
  const o = onbState();
  if (!o.picked.length) return;
  o.confirmed = true;
  render();
};
ACT["onb-edit-subjects"] = () => { onbState().confirmed = false; render(); };
CHG["onb-time"] = (el) => {
  const o = onbState();
  const c = o.days[el.dataset.d];
  c[el.dataset.f] = el.dataset.f === "max" ? Number(el.value) : el.value;
  if (el.dataset.f !== "max" && SF.toMin(c.end) <= SF.toMin(c.start)) toast(`${SF.DAYS_LONG[el.dataset.d]}: the end time needs to be after the start.`, "err");
  if (el.dataset.f === "max") render();
};
ACT["onb-copy-monday"] = () => {
  const o = onbState();
  [2, 3, 4, 5].forEach((d) => (o.days[d] = Object.assign({}, o.days[1])));
  render();
  toast("Copied Monday's times to Tuesday–Friday.");
};
function readActivity(fd) {
  const name = String(fd.get("name") || "").trim();
  const days = fd.getAll("day").map(Number);
  const start = fd.get("start"), end = fd.get("end");
  if (!name) return null;
  if (!days.length) { toast("Pick at least one day.", "err"); return null; }
  if (!(SF.toMin(end) > SF.toMin(start))) { toast("The end time needs to be after the start.", "err"); return null; }
  return { id: SF.uid(), name, days, start, end };
}
FORM["onb-act"] = (fd, f) => {
  const a = readActivity(fd);
  if (!a) return;
  S.ui.onb.acts.push(a);
  render();
};
ACT["onb-del-act"] = (el) => { S.ui.onb.acts.splice(Number(el.dataset.i), 1); render(); };
ACT["onb-finish"] = () => {
  const o = S.ui.onb;
  const s = st();
  if (!o.confirmed || !o.picked.length) return;
  PRESET_SUBJECTS.filter((x) => o.picked.includes(x)).concat(o.picked.filter((x) => !PRESET_SUBJECTS.includes(x)))
    .forEach((name, i) => s.subjects.push({ id: SF.uid(), name, color: COLORS[i % COLORS.length], kind: SF.guessKind(name), target: 80, chapters: [] }));
  for (const d of [0, 1, 2, 3, 4, 5, 6]) s.meta.settings.days[d] = Object.assign({}, o.days[d]);
  s.meta.activities = o.acts;
  s.meta.onboarded = true;
  S.ui.onb = null;
  S.ui.view = "today";
  commit("meta", "subjects");
  toast("You're set up. Add your homework and tests in the bar at the top.");
};

// ---------- settings ----------
CHG["set-day"] = (el) => {
  const c = st().meta.settings.days[el.dataset.d];
  c[el.dataset.f] = el.dataset.f === "max" ? Number(el.value) : el.value;
  commit("meta");
};
CHG["set-gen"] = (el) => { st().meta.settings[el.dataset.f] = Number(el.value); commit("meta"); };
CHG["set-name"] = (el) => { st().meta.name = el.value.trim().slice(0, 40); commit("meta"); };
ACT["copy-monday"] = () => {
  const d = st().meta.settings.days;
  [2, 3, 4, 5].forEach((k) => (d[k] = Object.assign({}, d[1])));
  toast("Copied Monday to Tuesday–Friday.");
  commit("meta");
};
FORM["add-activity"] = (fd, f) => {
  const a = readActivity(fd);
  if (!a) return;
  st().meta.activities.push(a);
  f.reset();
  commit("meta");
};
ACT["del-activity"] = (el) => { const m = st().meta; m.activities = m.activities.filter((a) => a.id !== el.dataset.id); commit("meta"); };
ACT.backup = async () => {
  const data = JSON.stringify({ app: "StudyFlow", v: 1, exportedAt: new Date().toISOString(), state: S.state }, null, 1);
  if (window.SF_WEB) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = `studyflow-backup-${SF.today()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return toast("Backup downloaded.");
  }
  let dl = null;
  try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) {}
  if (dl) {
    try {
      await dl.save({ filename: `studyflow-backup-${SF.today()}.json`, data });
      toast("Backup saved.");
    } catch (e) {
      if (!(e && e.code === "declined")) toast("Couldn't save the backup file. Try again.", "err");
    }
    return;
  }
  openModal({
    title: "Your backup",
    render: () => `<div class="sheet-body"><p class="small muted">Downloads aren't available here. Copy this text and save it in a file ending in .json.</p><textarea class="input mono" id="bk-text" style="min-height:240px;font-size:12px" readonly>${esc(data)}</textarea></div>
      <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Close</button><button type="button" class="btn primary" data-act="copy-backup">Copy</button></div>`,
  });
};
ACT["copy-backup"] = () => {
  const t = $("#bk-text");
  if (!t) return;
  const done = () => toast("Copied.");
  try {
    navigator.clipboard.writeText(t.value).then(done).catch(() => { t.select(); toast("Selected. Press Ctrl+C or Cmd+C to copy."); });
  } catch (e) { t.select(); }
};
CHG.restore = (el) => {
  const file = el.files && el.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    let obj = null;
    try { obj = JSON.parse(String(rd.result)); } catch (e) {}
    const data = obj && (obj.state || obj);
    if (!data || !Array.isArray(data.subjects)) return toast("That file isn't a StudyFlow backup.", "err");
    openModal({
      title: "Restore this backup?",
      data: { apply: () => { S.state = SF.normalize(data); S.state.meta.onboarded = true; Store.markAll(); closeModal(); S.ver++; toast("Restored."); go("today"); } },
      render: () => `<div class="sheet-body"><p>This replaces everything with the backup${obj.exportedAt ? ` from ${esc(new Date(obj.exportedAt).toLocaleString())}` : ""}: ${plural(data.subjects.length, "subject")}, ${plural((data.tasks || []).length, "assignment")}, ${plural((data.cards || []).length, "flashcard")}.</p></div>
        <div class="sheet-foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button type="button" class="btn primary" data-act="modal-run">Replace with backup</button></div>`,
    });
  };
  rd.readAsText(file);
  el.value = "";
};
ACT["load-example"] = () => {
  S.state = SF.normalize(SF.exampleState(SF.today()));
  S.rev = null;
  Store.markAll();
  S.ver++;
  toast("Loaded an example term. Clear it from the yellow banner whenever you like.");
  go("today");
};
function wipe() {
  S.state = SF.normalize(SF.blankState());
  S.rev = null;
  S.ui.confirmReset = false;
  S.ui.onb = null;
  Store.markAll();
  S.ver++;
  go("today");
}
ACT["clear-example"] = () => { wipe(); toast("Example data cleared."); };
ACT["reset-ask"] = () => { S.ui.confirmReset = true; render(); };
ACT["reset-cancel"] = () => { S.ui.confirmReset = false; render(); };
ACT["reset-all"] = () => { wipe(); toast("Everything was deleted."); };
