// ---------- events ----------
function isTyping() {
  const a = document.activeElement;
  return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
}
function bgRender() {
  if (isTyping() && document.activeElement.closest("#view, #modal")) return setTimeout(bgRender, 1500);
  render(true);
}

document.addEventListener("click", (e) => {
  const modal = $("#modal");
  if (e.target === modal) return closeModal();
  if (S.ui.menu && !e.target.closest(".menu-wrap")) {
    S.ui.menu = null;
    render();
  }
  if (!e.target.closest(".qc")) $("#qc-prev").hidden = true;
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "A") e.preventDefault();
  try {
    fn(el, e);
  } catch (err) {
    console.error(err);
    toast("Something went wrong there. Try again.", "err");
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const fn = FORM[f.dataset.form];
  if (!fn) return;
  try {
    const r = fn(new FormData(f), f, e.submitter);
    if (r && r.catch) r.catch((err) => { console.error(err); toast("Something went wrong there. Try again.", "err"); });
  } catch (err) {
    console.error(err);
    toast("Something went wrong there. Try again.", "err");
  }
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (!el) return;
  const fn = CHG[el.dataset.change];
  if (fn) try { fn(el, e); } catch (err) { console.error(err); }
});
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-input]");
  if (!el) return;
  const fn = INP[el.dataset.input];
  if (fn) fn(el, e);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (S.modal) return closeModal();
    if (S.ui.menu) { S.ui.menu = null; return render(); }
    const p = $("#qc-prev");
    if (!p.hidden) { p.hidden = true; $("#qc-input").blur(); return; }
  }
  if (S.focus) return;
  const t = e.target;
  const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  if (S.rev && !S.modal && S.ui.view === "revision" && !typing) {
    if ((e.key === " " || e.key === "Enter") && !S.rev.revealed && S.rev.i < S.rev.queue.length) {
      e.preventDefault();
      return ACT["rev-show"]();
    }
    const map = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
    if (map[e.key] && S.rev.revealed) {
      e.preventDefault();
      return rate(map[e.key]);
    }
  }
  if (!typing && !S.modal && (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey)))) {
    e.preventDefault();
    if (e.key === "/") $("#qc-input").focus();
    else openSearch();
  }
  if (e.key === "Enter" && t && t.classList && t.classList.contains("task-row")) ACT["open-task"](t);
});
window.addEventListener("scroll", () => {
  const tb = $(".topbar");
  if (tb) tb.classList.toggle("scrolled", window.scrollY > 4);
}, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") Store.flush();
  else if (!S.modal && !S.focus) bgRender();
});
window.addEventListener("pagehide", () => Store.flush());
setInterval(() => {
  if (!S.modal && !S.focus && !S.ui.menu && document.visibilityState === "visible" && !isTyping() && ["today", "progress"].includes(S.ui.view)) render(true);
}, 60000);

// ---------- boot ----------
function cleanOverrides() {
  const today = SF.today(), ov = S.state.meta.overrides;
  for (const k of Object.keys(ov)) {
    const o = ov[k];
    if ((!o.notBefore || o.notBefore <= today) && (!o.prefer || o.prefer < today)) delete ov[k];
    else if (o.prefer && o.prefer < today) delete o.prefer;
  }
}
function recordPlanLog() {
  const s = S.state, today = SF.today();
  if (!SF.hasData(s) || s.meta.planLog[today]) return;
  const P = plan();
  s.meta.planLog[today] = P.days[today].alloc.map((a) => ({ key: a.key, min: a.min, title: itemTitle(a.item) }));
  const cutoff = SF.addDays(today, -21);
  for (const d of Object.keys(s.meta.planLog)) if (d < cutoff) delete s.meta.planLog[d];
  Store.mark("meta");
}
function afterLoad() {
  cleanOverrides();
  S.ver++;
  recordPlanLog();
  bgRender();
}
function boot() {
  if (window.SF_WEB) return Web.boot();
  const local = Store.loadLocal();
  if (local) S.state = SF.normalize(local);
  try {
    const v = localStorage.getItem(LKEY + ":view");
    if (VIEWS.includes(v)) S.ui.view = v;
  } catch (e) {}
  const h = (location.hash || "").slice(1);
  if (VIEWS.includes(h) || h === "settings") S.ui.view = h;
  cleanOverrides();
  render();
  Store.connect();
  AI.init();
}
boot();
