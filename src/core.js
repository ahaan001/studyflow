"use strict";
const S = { state: SF.normalize(SF.blankState()), ver: 0, ui: { view: "today", tab: {}, menu: null, filters: {}, onb: null }, modal: null, focus: null, rev: null };
let LKEY = "studyflow:v1";
const VIEWS = ["today", "subjects", "revision", "assignments", "progress"];

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const st = () => S.state;
const subjOf = (id) => S.state.subjects.find((s) => s.id === id);
const taskOf = (id) => S.state.tasks.find((t) => t.id === id);
const examOf = (id) => S.state.exams.find((e) => e.id === id);
const cardOf = (id) => S.state.cards.find((c) => c.id === id);
const mistakeOf = (id) => S.state.mistakes.find((m) => m.id === id);
const resOf = (id) => S.state.resources.find((r) => r.id === id);
const topicOf = (id) => {
  for (const s of S.state.subjects) for (const c of s.chapters) for (const t of c.topics) if (t.id === id) return { topic: t, chapter: c, subject: s };
  return null;
};
const chip = (subjectId, extra) => {
  const s = subjOf(subjectId);
  return s ? `<span class="chip" data-sc="${esc(s.color)}"><span>${esc(s.name)}${extra ? " · " + esc(extra) : ""}</span></span>` : `<span class="chip"><span>No subject</span></span>`;
};
const relLow = (iso) => { const r = SF.relDay(iso); return ["Today", "Tomorrow", "Yesterday"].includes(r) || /^in |ago$/.test(r) ? r.toLowerCase() : r; };
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + "s"}`;
const pct = (x) => (x == null || isNaN(x) ? "–" : Math.round(x) + "%");
const initials = (n) => String(n || "?").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const subjectOptions = (sel, allowNone) =>
  (allowNone ? `<option value="">No subject</option>` : "") + S.state.subjects.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("");
const topicOptions = (subjectId, sel, allowNone = true) => {
  const s = subjOf(subjectId);
  let h = allowNone ? `<option value="">No topic</option>` : "";
  if (!s) return h;
  for (const c of s.chapters) {
    h += `<optgroup label="${esc(c.name)}">` + c.topics.map((t) => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("") + `</optgroup>`;
  }
  return h;
};

// ---------- icons ----------
const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  subjects: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14"/>',
  revision: '<rect x="3" y="7" width="14" height="14" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>',
  assignments: '<path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M8.5 14l2.5 2.5 4.5-5"/>',
  progress: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3-1-3 0-6 1-8.5z"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.2a3.2 3.2 0 0 1 0 6.2M21 20c0-2.6-1.6-4.8-3.8-5.6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  note: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>',
  alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M10 17h4v4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  upload: '<path d="M12 20V8M6 14l6-6 6 6M4 4h16"/>',
  brand: '<path d="M5 7h9.5a3 3 0 0 1 0 6h-5a3 3 0 0 0 0 6H19"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};
const icon = (n, cls) => `<svg class="ico ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

// ---------- storage ----------
const KINDS = ["meta", "subjects", "tasks", "exams", "assessments", "cards", "mistakes", "log"];
const Store = {
  mode: "local",
  status: "local",
  error: "",
  col: null,
  dirty: new Set(),
  dirtyRes: new Set(),
  delRes: new Set(),
  known: new Set(),
  timer: null,
  chain: Promise.resolve(),
  resolved: false,
  loadLocal() {
    try {
      const raw = localStorage.getItem(LKEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  saveLocal() {
    try {
      localStorage.setItem(LKEY, JSON.stringify(S.state));
      return true;
    } catch (e) {
      return false;
    }
  },
  mark(...kinds) {
    for (const k of kinds) if (k === "resources") continue; else this.dirty.add(k);
    this.schedule();
  },
  markRes(id) {
    this.dirtyRes.add(id);
    this.delRes.delete(id);
    this.schedule();
  },
  removeRes(id) {
    this.delRes.add(id);
    this.dirtyRes.delete(id);
    this.schedule();
  },
  markAll() {
    KINDS.forEach((k) => this.dirty.add(k));
    S.state.resources.forEach((r) => this.dirtyRes.add(r.id));
    for (const id of this.known) if (!resOf(id)) this.delRes.add(id);
    this.schedule();
  },
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 700);
  },
  body(kind) {
    const s = S.state;
    if (kind === "meta") return { v: 1, data: s.meta };
    if (kind === "log") {
      if (s.log.reviews.length > 2500) s.log.reviews = s.log.reviews.slice(-2500);
      if (s.log.sessions.length > 1500) s.log.sessions = s.log.sessions.slice(-1500);
      return { v: 1, data: s.log };
    }
    return { v: 1, items: s[kind] };
  },
  async flush() {
    clearTimeout(this.timer);
    this.saveLocal();
    if (this.mode === "offline") {
      this.status = "offline";
      updateSaveState();
      return;
    }
    if (this.mode !== "cloud") {
      this.dirty.clear();
      this.dirtyRes.clear();
      this.delRes.clear();
      this.status = "local";
      updateSaveState();
      return;
    }
    const kinds = [...this.dirty], res = [...this.dirtyRes], dels = [...this.delRes];
    this.dirty.clear();
    this.dirtyRes.clear();
    this.delRes.clear();
    if (!kinds.length && !res.length && !dels.length) return;
    this.status = "saving";
    updateSaveState();
    this.chain = this.chain.then(async () => {
      try {
        for (const k of kinds) {
          const b = this.body(k);
          if (JSON.stringify(b).length > 250000) throw { code: "too_big", kind: k };
          await this.col.doc("k-" + k).set(b);
        }
        for (const id of res) {
          const r = resOf(id);
          if (!r) continue;
          await this.col.doc("r-" + id).set({ v: 1, item: r });
          this.known.add(id);
        }
        for (const id of dels) {
          await this.col.doc("r-" + id).delete();
          this.known.delete(id);
        }
        this.status = "saved";
        this.error = "";
      } catch (e) {
        if (e && e.code === "too_big") {
          this.status = "error";
          this.error = `Your ${e.kind} list is too large to save. Delete some old items.`;
          toast(this.error, "err");
        } else if (e && (e.code === "invalid_argument" || e.code === "revoked" || e.code === "not_granted")) {
          this.mode = "local";
          this.status = "local";
          this.error = "";
          toast("Can't save to your account from here. Saving in this browser instead.");
        } else if (e && e.code === "quota_exceeded") {
          this.status = "error";
          this.error = "Storage is full. Delete some notes or old items.";
          toast(this.error, "err");
        } else {
          kinds.forEach((k) => this.dirty.add(k));
          res.forEach((id) => this.dirtyRes.add(id));
          dels.forEach((id) => this.delRes.add(id));
          this.status = "error";
          this.error = "Couldn't reach the server. Retrying shortly.";
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.flush(), 4000 + Math.random() * 2000);
        }
      }
      updateSaveState();
    });
  },
  async connect(col) {
    try {
      if (!col) {
        if (!window.claude || typeof window.claude.use !== "function") throw 0;
        const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
        if (!db || !user) throw 0;
        const uid = await user.id();
        if (!uid) throw 0;
        col = db.collection("data/users/" + uid);
      }
      this.col = col;
      await this.pull(true);
      this.mode = "cloud";
      if (this.dirty.size || this.dirtyRes.size || this.delRes.size) this.schedule();
    } catch (e) {
      this.mode = col ? "offline" : "local";
      this.status = this.mode;
    }
    this.resolved = true;
    afterLoad();
  },
  // Load every saved document. Kinds edited locally while offline (still dirty) keep the local copy.
  async pull(initial) {
    const snap = await this.col.limit(1000).get();
    const got = {};
    const resources = [];
    this.known.clear();
    for (const d of snap.docs) {
      const b = d.data() || {};
      if (d.id.startsWith("k-")) got[d.id.slice(2)] = b;
      else if (d.id.startsWith("r-") && b.item) {
        resources.push(b.item);
        this.known.add(d.id.slice(2));
      }
    }
    if (Object.keys(got).length) {
      const local = S.state;
      const keepK = new Set(this.dirty), keepR = new Set(this.dirtyRes), dropR = new Set(this.delRes);
      const raw = { meta: got.meta && got.meta.data, log: got.log && got.log.data, resources };
      for (const k of ["subjects", "tasks", "exams", "assessments", "cards", "mistakes"]) raw[k] = got[k] ? got[k].items : [];
      const next = SF.normalize(raw);
      for (const k of keepK) next[k] = local[k];
      if (keepR.size || dropR.size) {
        next.resources = next.resources.filter((r) => !keepR.has(r.id) && !dropR.has(r.id)).concat(local.resources.filter((r) => keepR.has(r.id)));
      }
      const changed = JSON.stringify(next) !== JSON.stringify(local);
      S.state = next;
      if (changed) S.ver++;
      this.saveLocal();
      this.status = keepK.size || keepR.size || dropR.size ? "saving" : "saved";
      return changed;
    }
    if (initial && (SF.hasData(S.state) || S.state.meta.onboarded)) {
      this.mode = "cloud";
      this.markAll();
      this.status = "saving";
    } else if (initial) this.status = "saved";
    return false;
  },
  async wipeCloud() {
    if (this.mode !== "cloud") return;
    const snap = await this.col.limit(1000).get();
    for (const d of snap.docs) await this.col.doc(d.id).delete();
    this.known.clear();
  },
};

function updateSaveState() {
  const el = $("#save-state");
  if (!el) return;
  const map = {
    saved: ["", "Saved to your account"],
    saving: ["", "Saving…"],
    local: ["local", "Saved in this browser only"],
    offline: ["local", "Offline. Changes are kept on this device and sync when you reconnect."],
    error: ["err", Store.error || "Not saved"],
  };
  const [cls, text] = map[Store.status] || map.local;
  el.className = "save-state " + cls;
  el.innerHTML = `<i></i><span>${esc(text)}</span>`;
}

// ---------- mutations ----------
function commit(...kinds) {
  S.ver++;
  Store.mark(...kinds);
  render();
}

// ---------- AI ----------
const AI = {
  fn: null,
  images: false,
  mediaTypes: [],
  maxImages: 1,
  denied: false,
  async init() {
    try {
      if (!window.claude || typeof window.claude.use !== "function") return;
      const s = await window.claude.use("sample");
      if (s) {
        this.fn = s;
        const lim = await s.limits().catch(() => null);
        if (lim && lim.images) {
          this.images = true;
          this.mediaTypes = lim.images.mediaTypes || [];
          this.maxImages = lim.images.maxCount || 1;
        }
      }
    } catch (e) {}
    bgRender();
  },
  on() {
    return !!this.fn && !this.denied;
  },
  async json(prompt, opts) {
    try {
      return await this.fn.json(prompt, opts || {});
    } catch (e) {
      if (e && ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e.code)) {
        this.denied = true;
        setTimeout(render, 0);
      }
      throw e;
    }
  },
  msg(e) {
    const c = e && e.code;
    return ({
      not_granted: "Claude access was declined for this page, so AI features are off for now.",
      sampling_disabled: "Claude isn't available on this account.",
      rate_limited: "Too many AI requests right now. Try again in a minute.",
      refused: "Claude couldn't help with that input. Try rewording it.",
      invalid_json: "The answer came back in the wrong shape. Try again.",
      images_unavailable: "Photos can't be sent from this viewer. Paste the text instead.",
      image_rejected: "That image couldn't be used. Try a JPG or PNG under 20 MB.",
      prompt_too_large: "That's too much text. Paste a shorter section.",
      session_expired: "Sign in to Claude again, then retry.",
      empty_completion: "Claude returned nothing. Try again with more detail.",
      cancelled: "Stopped.",
    })[c] || "Couldn't reach Claude. Check your connection and try again.";
  },
};

// ---------- toasts & celebration ----------
function toast(text, kind, ms) {
  const box = $("#toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.setAttribute("role", "status");
  el.innerHTML = text;
  box.appendChild(el);
  const cap = window.innerWidth < 860 ? 2 : 3;
  while (box.children.length > cap) box.firstElementChild.remove();
  setTimeout(() => el.remove(), ms || 3200);
}
function xpToast(r) {
  if (!r) return;
  toast(`${icon("bolt", "ico-sm")}<span class="xpn">+${r.pts} XP</span><span>${esc(r.why)}</span>`, "xp");
  if (r.levelUp) {
    setTimeout(() => toast(`${icon("trophy", "ico-sm")}<span>Level ${r.level}! Keep going.</span>`, "xp", 4200), 400);
    celebrate();
  }
}
function award(pts, why, key) {
  const r = SF.award(S.state, pts, why, key);
  xpToast(r);
  return r;
}
function afterAction() {
  const fresh = SF.checkAchievements(S.state);
  fresh.forEach((a, i) => setTimeout(() => toast(`${icon("trophy", "ico-sm")}<span>Achievement: ${esc(a.name)}</span>`, "xp", 4200), 600 + i * 500));
  if (fresh.length) celebrate();
  const ch = SF.challenge(S.state);
  if (ch.done && !S.state.meta.xpLog.some((x) => x.key === ch.key)) {
    const r = award(50, `Weekly challenge: ${ch.name}`, ch.key);
    if (r) celebrate();
  }
}
function celebrate() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("#confetti");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  cv.hidden = false;
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--c1", "--c2", "--c3", "--c4", "--c5", "--hi"].map((v) => cs.getPropertyValue(v).trim() || "#2f6bff");
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 160, y: innerHeight * 0.38, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0],
  }));
  const t0 = performance.now();
  const step = (t) => {
    const k = (t - t0) / 1500;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.42;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(step);
    else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      cv.hidden = true;
    }
  };
  requestAnimationFrame(step);
}

// ---------- plan cache ----------
let _plan = null, _planKey = "";
function plan() {
  const key = S.ver + "|" + SF.today() + "|" + Math.floor(SF.nowMin() / 5);
  if (key !== _planKey) {
    _plan = SF.plan(S.state);
    _planKey = key;
  }
  return _plan;
}

// ---------- modal ----------
function openModal(m) {
  S.modal = Object.assign({ data: {} }, m);
  renderModal();
  setTimeout(() => {
    const f = $("#modal [autofocus]") || $("#modal input:not([type=hidden]):not([type=checkbox]), #modal textarea, #modal select");
    if (f && !("ontouchstart" in window)) f.focus();
  }, 30);
}
function closeModal() {
  if (S.modal && S.modal.ctl) try { S.modal.ctl.abort(); } catch (e) {}
  if (S.modal && S.modal.data && S.modal.data.images) S.modal.data.images.forEach((im) => URL.revokeObjectURL(im.url));
  S.modal = null;
  renderModal();
}
function renderModal() {
  const box = $("#modal");
  if (!S.modal) {
    box.hidden = true;
    box.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }
  const m = S.modal;
  const body = m.render(m.data);
  box.innerHTML = `<div class="sheet ${m.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="mtitle">
    <div class="sheet-head"><h2 id="mtitle">${m.title}</h2><button type="button" class="btn ghost sm" data-act="close-modal" aria-label="Close">${icon("x")}</button></div>
    ${body}
  </div>`;
  box.hidden = false;
  document.body.style.overflow = "hidden";
}

// ---------- render ----------
function keepFocus(fn) {
  const a = document.activeElement;
  const id = a && a.id;
  let s0 = null, s1 = null;
  try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) {}
  const y = window.scrollY;
  fn();
  if (id) {
    const el = document.getElementById(id);
    if (el && el !== document.activeElement) {
      el.focus({ preventScroll: true });
      try { if (s0 != null) el.setSelectionRange(s0, s1); } catch (e) {}
    }
  }
  window.scrollTo(0, y);
}
function go(view, extra) {
  S.ui.view = view;
  S.ui.menu = null;
  Object.assign(S.ui, extra || {});
  if (VIEWS.includes(view)) try { localStorage.setItem(LKEY + ":view", view); } catch (e) {}
  render();
  window.scrollTo(0, 0);
}
function render(bg) {
  keepFocus(() => {
    const s = S.state;
    const needOnb = !s.meta.onboarded && (!SF.hasData(s) || !!(S.ui.onb && S.ui.onb.imported));
    const view = needOnb ? "onboarding" : S.ui.view;
    const navView = { subject: "subjects", task: "assignments", settings: "progress" }[view] || view;
    $$("[data-nav]").forEach((b) => b.setAttribute("aria-current", b.dataset.nav === navView && !needOnb ? "page" : "false"));
    const dueN = SF.dueReviews(s, SF.today()).length;
    $$("[data-due-count]").forEach((el) => {
      el.textContent = dueN > 99 ? "99+" : dueN;
      el.hidden = !dueN;
    });
    const li = SF.levelInfo(s.meta.xp);
    const sx = $("#side-xp");
    if (sx) sx.innerHTML = `<div class="lvl"><span>Level <b>${li.level}</b></span><span class="mono small">${s.meta.xp} XP</span></div>
      <div class="xpbar" role="progressbar" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="${li.need}" aria-valuenow="${li.into}"><i style="width:${(li.into / li.need) * 100}%"></i></div>
      <div class="tiny muted">${li.need - li.into} XP to level ${li.level + 1} · ${icon("flame", "ico-sm")} ${SF.streak(s).current}-day streak</div>`;
    const ban = $("#banner");
    ban.innerHTML = s.meta.isExample && !needOnb
      ? `<div class="banner"><span>You're looking at example data for a made-up student.</span><button type="button" class="btn sm" data-act="clear-example">Clear it and start my own</button></div>`
      : "";
    const fn = V[view] || V.today;
    $("#view").innerHTML = fn();
    updateSaveState();
    if (S.modal && !bg) renderModal();
  });
}
