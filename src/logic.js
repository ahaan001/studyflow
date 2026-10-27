(function (root) {
  const SF = {};

  // ---------- time ----------
  SF._now = null;
  SF.now = () => (SF._now ? new Date(SF._now) : new Date());
  const pad = (n) => String(n).padStart(2, "0");
  SF.iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  SF.today = () => SF.iso(SF.now());
  SF.parse = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  SF.addDays = (s, n) => {
    const d = SF.parse(s);
    d.setDate(d.getDate() + n);
    return SF.iso(d);
  };
  SF.diff = (a, b) => {
    const A = SF.parse(a), B = SF.parse(b);
    return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 864e5);
  };
  SF.wd = (s) => SF.parse(s).getDay();
  SF.DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  SF.DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  SF.MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  SF.MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  SF.fmtDay = (s) => {
    const d = SF.parse(s);
    return `${SF.DAYS[d.getDay()]} ${d.getDate()} ${SF.MONTHS[d.getMonth()]}`;
  };
  SF.fmtLong = (s) => {
    const d = SF.parse(s);
    return `${SF.DAYS_LONG[d.getDay()]} ${d.getDate()} ${SF.MONTHS_LONG[d.getMonth()]}`;
  };
  SF.relDay = (s, today) => {
    const n = SF.diff(today || SF.today(), s);
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n === -1) return "Yesterday";
    if (n < 0) return `${-n} days ago`;
    if (n < 7) return SF.DAYS_LONG[SF.wd(s)];
    return `in ${n} days`;
  };
  SF.toMin = (t) => {
    const [h, m] = String(t || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  SF.fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
  SF.dur = (m) => {
    m = Math.round(m || 0);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  };
  SF.nowMin = () => {
    const d = SF.now();
    return d.getHours() * 60 + d.getMinutes();
  };
  SF.weekStart = (s) => SF.addDays(s, -((SF.wd(s) + 6) % 7));
  SF.weekNo = (s) => {
    const d = SF.parse(s);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  };
  SF.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  SF.clamp = clamp;

  // ---------- defaults ----------
  SF.defaultSettings = () => ({
    days: {
      0: { start: "10:00", end: "18:00", max: 120 },
      1: { start: "16:30", end: "21:00", max: 120 },
      2: { start: "16:30", end: "21:00", max: 120 },
      3: { start: "16:30", end: "21:00", max: 120 },
      4: { start: "16:30", end: "21:00", max: 120 },
      5: { start: "16:30", end: "21:00", max: 120 },
      6: { start: "10:00", end: "18:00", max: 150 },
    },
    session: 40,
    brk: 5,
    lead: 14,
  });

  SF.blankState = () => ({
    meta: {
      v: 1,
      name: "",
      isExample: false,
      onboarded: false,
      xp: 0,
      xpLog: [],
      activeDays: [],
      achievements: [],
      challenges: [],
      settings: SF.defaultSettings(),
      activities: [],
      overrides: {},
      planLog: {},
      createdAt: SF.today(),
    },
    subjects: [],
    tasks: [],
    exams: [],
    assessments: [],
    cards: [],
    mistakes: [],
    resources: [],
    log: { sessions: [], reviews: [] },
  });

  SF.normalize = (s) => {
    const b = SF.blankState();
    s = s && typeof s === "object" ? s : {};
    const out = {
      meta: Object.assign(b.meta, s.meta || {}),
      subjects: Array.isArray(s.subjects) ? s.subjects : [],
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      exams: Array.isArray(s.exams) ? s.exams : [],
      assessments: Array.isArray(s.assessments) ? s.assessments : [],
      cards: Array.isArray(s.cards) ? s.cards : [],
      mistakes: Array.isArray(s.mistakes) ? s.mistakes : [],
      resources: Array.isArray(s.resources) ? s.resources : [],
      log: Object.assign({ sessions: [], reviews: [] }, s.log || {}),
    };
    const st = out.meta.settings || {};
    const def = SF.defaultSettings();
    out.meta.settings = Object.assign(def, st, { days: Object.assign(def.days, st.days || {}) });
    for (const k of ["xpLog", "activeDays", "achievements", "challenges", "activities"]) if (!Array.isArray(out.meta[k])) out.meta[k] = [];
    for (const k of ["overrides", "planLog"]) if (!out.meta[k] || typeof out.meta[k] !== "object") out.meta[k] = {};
    for (const sub of out.subjects) {
      if (!Array.isArray(sub.chapters)) sub.chapters = [];
      for (const ch of sub.chapters) if (!Array.isArray(ch.topics)) ch.topics = [];
    }
    return out;
  };

  SF.hasData = (s) => !!(s && (s.subjects.length || s.tasks.length || s.exams.length || s.cards.length));

  // ---------- subjects ----------
  SF.SUBJECT_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
  SF.KINDS = {
    math: "Maths",
    science: "Science",
    english: "English / literature",
    language: "Language",
    history: "History",
    geography: "Geography",
    ict: "ICT / computing / design",
    arts: "Arts / music / PE",
    other: "Other",
  };
  SF.guessKind = (name) => {
    const n = String(name).toLowerCase();
    if (/robot/.test(n)) return "ict";
    if (/film|self.?defen|wellbeing|well-being/.test(n)) return "arts";
    if (/global perspective/.test(n)) return "history";
    if (/math|algebra|geometry|calculus|statistic/.test(n)) return "math";
    if (/\bart\b|music|drama|\bpe\b|physical ed|dance|theatre|sport/.test(n)) return "arts";
    if (/ict|comput|coding|\bcs\b|\bdt\b/.test(n)) return "ict";
    if (/bio|chem|phys|science|environment/.test(n)) return "science";
    if (/english|literature|lit\b/.test(n)) return "english";
    if (/french|spanish|german|hindi|mandarin|chinese|japanese|arabic|latin|marathi|sanskrit|italian|language/.test(n)) return "language";
    if (/history|civics|politic|social stud/.test(n)) return "history";
    if (/geog/.test(n)) return "geography";
    if (/ict|comput|coding|design|tech|\bcs\b|\bdt\b/.test(n)) return "ict";
    if (/art|music|drama|\bpe\b|physical|dance|theatre|sport/.test(n)) return "arts";
    return "other";
  };
  const ALIASES = {
    math: ["math", "maths", "mathematics"],
    biology: ["bio", "biol"],
    chemistry: ["chem"],
    physics: ["phys", "phy"],
    english: ["eng", "lit", "ela"],
    history: ["hist"],
    geography: ["geo", "geog"],
    ict: ["ict"],
    "computer science": ["cs", "comp", "compsci", "coding"],
    "global perspectives": ["gp", "global"],
    "thinking skills": ["ts", "thinking"],
    "business": ["bs", "bus", "biz"],
    "robotics": ["robo"],
    "self defence": ["sd", "selfdefence", "defence"],
    "student wellbeing": ["wellbeing", "sw"],
    "film club": ["film"],
    "english language": ["lang", "el"],
    "english literature": ["lit", "elit"],
    french: ["fr", "fre"],
    spanish: ["es", "spa", "span"],
    german: ["ger", "de"],
    hindi: ["hin"],
    economics: ["econ", "eco"],
    "physical education": ["pe"],
    design: ["dt", "design"],
    music: ["mus"],
    drama: ["drama"],
    art: ["art"],
  };
  SF.matchSubject = (token, subjects) => {
    const t = token.toLowerCase().replace(/[^a-z]/g, "");
    if (t.length < 2) return null;
    for (const s of subjects) {
      const n = s.name.toLowerCase();
      const first = n.split(/\s+/)[0];
      if (t === n || t === first) return s;
    }
    for (const s of subjects) {
      const n = s.name.toLowerCase();
      for (const [key, list] of Object.entries(ALIASES)) {
        if (n === key && list.includes(t)) return s;
      }
    }
    if (t.length >= 3) for (const s of subjects) if (s.name.toLowerCase().split(/[\s&]+/).slice(1).some((w) => w.length >= 3 && w.startsWith(t))) return s;
    for (const s of subjects) {
      const n = s.name.toLowerCase();
      for (const [key, list] of Object.entries(ALIASES)) {
        if ((n.includes(key) || key.includes(n)) && list.includes(t)) return s;
      }
      if (t.length >= 3 && n.startsWith(t)) return s;
    }
    return null;
  };

  // ---------- index ----------
  SF.index = (state) => {
    const idx = { subjects: {}, topics: {}, chapters: {}, topicState: {}, minByKey: {}, topicStats: {} };
    for (const s of state.subjects) {
      idx.subjects[s.id] = s;
      for (const ch of s.chapters) {
        idx.chapters[ch.id] = Object.assign({ subjectId: s.id }, ch);
        for (const t of ch.topics) idx.topics[t.id] = Object.assign({ subjectId: s.id, chapterId: ch.id, chapterName: ch.name }, t);
      }
    }
    const stats = {};
    for (const r of state.log.reviews) {
      if (!r.t) continue;
      (stats[r.t] = stats[r.t] || []).push(r.ok ? 1 : 0);
    }
    const mist = {};
    for (const m of state.mistakes) if (!m.resolved && m.topicId) mist[m.topicId] = (mist[m.topicId] || 0) + 1;
    for (const id in idx.topics) {
      const arr = (stats[id] || []).slice(-20);
      const st = { n: arr.length, ok: arr.reduce((a, b) => a + b, 0), m: mist[id] || 0 };
      idx.topicStats[id] = st;
      idx.topicState[id] = SF.topicState(idx.topics[id], st);
    }
    for (const s of state.log.sessions) idx.minByKey[s.key] = (idx.minByKey[s.key] || 0) + (s.min || 0);
    return idx;
  };

  // ---------- mastery ----------
  SF.STATUS = { ns: "Not started", learning: "Learning", revise: "Needs revision", mastered: "Mastered" };
  SF.STATE_LABEL = { ns: "Not started", learning: "Learning", revise: "Needs revision", good: "Understood", mastered: "Mastered", weak: "Weak" };
  SF.topicState = (topic, st) => {
    const status = topic.status || "ns";
    const base = { ns: 0, learning: 0.35, revise: 0.5, mastered: 0.85 }[status] ?? 0;
    const conf = topic.confidence ? topic.confidence / 5 : null;
    const n = st.n || 0;
    const acc = n ? st.ok / n : null;
    const m = st.m || 0;
    let score;
    if (n >= 3) score = 0.4 * acc + 0.3 * (conf ?? base) + 0.3 * base;
    else score = conf !== null ? 0.5 * conf + 0.5 * base : base;
    score = clamp(score - Math.min(0.3, 0.08 * m), 0, 1);
    let state;
    if (status === "ns" && n === 0 && conf === null && m === 0) state = "ns";
    else if (m >= 2 || (n >= 4 && acc < 0.5) || (conf !== null && conf <= 0.2) || (m >= 1 && ((conf !== null && conf <= 0.4) || (n >= 3 && acc < 0.6)))) state = "weak";
    else if (status === "learning" && n < 3) state = "learning";
    else if (score >= 0.8 && m === 0) state = "mastered";
    else if (score < 0.6) state = "revise";
    else state = "good";
    return { score, state, acc, n, m };
  };
  SF.revisionNeed = (topic, ts) => ({ ns: 60, learning: 45, revise: 40, mastered: 15 }[topic.status || "ns"] ?? 45) + (ts && ts.state === "weak" ? 20 : 0);

  SF.subjectTopics = (sub) => sub.chapters.flatMap((c) => c.topics);

  // ---------- capacity ----------
  SF.activitiesOn = (state, iso) =>
    (state.meta.activities || []).filter((a) => (a.date ? a.date === iso : (a.days || []).includes(SF.wd(iso))));

  SF.daySlots = (state, iso, fromMin) => {
    const cfg = state.meta.settings.days[SF.wd(iso)] || { start: "16:30", end: "21:00", max: 0 };
    let s = SF.toMin(cfg.start), e = SF.toMin(cfg.end);
    const acts = SF.activitiesOn(state, iso)
      .map((a) => [SF.toMin(a.start), SF.toMin(a.end), a])
      .sort((x, y) => x[0] - y[0]);
    const win = [s, e];
    if (fromMin != null) s = Math.max(s, fromMin);
    let slots = e - s >= 10 && cfg.max > 0 ? [[s, e]] : [];
    for (const [as, ae] of acts) {
      slots = slots.flatMap(([a, b]) => (ae <= a || as >= b ? [[a, b]] : [[a, Math.min(b, as)], [Math.max(a, ae), b]]));
    }
    slots = slots.filter(([a, b]) => b - a >= 10);
    return { slots, max: cfg.max || 0, acts: acts.map((x) => x[2]), win };
  };

  SF.studiedOn = (state, iso) => state.log.sessions.filter((s) => s.date === iso).reduce((a, s) => a + (s.min || 0), 0);

  SF.capacity = (state, iso, live) => {
    const fromMin = live ? Math.ceil(SF.nowMin() / 5) * 5 : null;
    const { slots, max } = SF.daySlots(state, iso, fromMin);
    const slotTotal = slots.reduce((a, [x, y]) => a + y - x, 0);
    const left = Math.max(0, max - (live ? SF.studiedOn(state, iso) : 0));
    const sess = state.meta.settings.session || 40, brk = state.meta.settings.brk || 0;
    const raw = Math.min(left, slotTotal);
    const breaks = brk * Math.max(0, Math.ceil(raw / sess) - 1);
    const cap = Math.min(left, Math.max(0, slotTotal - breaks));
    return { cap: Math.floor(cap / 5) * 5, slots, max };
  };

  // ---------- reviews ----------
  SF.INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64];
  SF.dueReviews = (state, today) => {
    const out = [];
    for (const c of state.cards) if (!c.suspended && (!c.due || c.due <= today)) out.push({ type: "card", id: c.id, ref: c });
    for (const m of state.mistakes) if (!m.resolved && (!m.due || m.due <= today)) out.push({ type: "mistake", id: m.id, ref: m });
    return out;
  };
  SF.nextInterval = (box, rating) => {
    box = box || 0;
    if (rating === "again") return { box: 1, days: 1 };
    if (rating === "hard") {
      const b = Math.max(1, box);
      return { box: b, days: Math.max(1, Math.round(SF.INTERVALS[b] / 2)) };
    }
    if (rating === "good") {
      const b = Math.min(7, box + 1);
      return { box: b, days: SF.INTERVALS[b] };
    }
    const b = Math.min(7, box + 2);
    return { box: b, days: SF.INTERVALS[b] };
  };
  SF.rate = (item, rating, today) => {
    const { box, days } = SF.nextInterval(item.box, rating);
    item.box = box;
    item.due = SF.addDays(today, days);
    item.reps = (item.reps || 0) + 1;
    if (rating === "again") item.lapses = (item.lapses || 0) + 1;
    item.history = (item.history || []).concat([{ d: today, r: rating }]).slice(-12);
    return item;
  };

  // ---------- planner ----------
  SF.workItems = (state, today, idx) => {
    const items = [], blocked = [];
    const clampDue = (d) => (!d || d < today ? today : d);
    for (const t of state.tasks) {
      if (t.completedAt) continue;
      const due0 = t.personalDue && t.personalDue < t.due ? t.personalDue : t.due;
      const overdue = t.due < today;
      const dp = Number(t.difficulty) || 2;
      if (t.steps && t.steps.length) {
        const byId = Object.fromEntries(t.steps.map((s) => [s.id, s]));
        let prevDue = null;
        t.steps.forEach((s, i) => {
          const windowFrom = prevDue;
          if (s.due) prevDue = s.due;
          if (s.done) return;
          if (s.assignee && s.assignee !== "me") return;
          const deps = (s.dependsOn || []).map((id) => byId[id]).filter((d) => d && !d.done);
          const others = deps.filter((d) => d.assignee && d.assignee !== "me");
          const remaining = Math.max(0, (Number(s.min) || 0) - (Number(s.doneMin) || 0));
          const item = {
            key: `s:${t.id}:${s.id}`, kind: "step", title: s.title, parent: t.title, subjectId: t.subjectId,
            taskId: t.id, stepId: s.id, due: clampDue(s.due && s.due < due0 ? s.due : s.due || due0), realDue: t.due,
            remaining, prio: dp + (overdue ? 3 : 0), order: i, overdue,
            from: s.due && windowFrom && windowFrom > today ? windowFrom : null,
            deps: deps.filter((d) => !others.includes(d)).map((d) => `s:${t.id}:${d.id}`),
          };
          if (others.length) {
            item.blockedBy = others;
            blocked.push(item);
            return;
          }
          if (remaining > 0) items.push(item);
        });
      } else {
        const remaining = Math.max(0, (Number(t.estimate) || 0) - (Number(t.done) || 0));
        if (remaining > 0)
          items.push({
            key: `t:${t.id}`, kind: "task", title: t.title, subjectId: t.subjectId, taskId: t.id,
            due: clampDue(due0), realDue: t.due, remaining, prio: dp + (overdue ? 3 : 0), order: 0, deps: [], overdue,
          });
      }
    }
    for (const ex of state.exams) {
      if (ex.done || ex.date < today) continue;
      const sub = idx.subjects[ex.subjectId];
      if (!sub) continue;
      const ids = ex.topicIds && ex.topicIds.length ? ex.topicIds : SF.subjectTopics(sub).map((t) => t.id);
      const due = ex.date <= SF.addDays(today, 1) ? today : SF.addDays(ex.date, -1);
      const from = SF.addDays(ex.date, -(state.meta.settings.lead || 14));
      ids.map((id) => idx.topics[id]).filter(Boolean).forEach((tp, i) => {
        const ts = idx.topicState[tp.id];
        const key = `r:${ex.id}:${tp.id}`;
        const remaining = Math.max(0, SF.revisionNeed(tp, ts) - (idx.minByKey[key] || 0));
        if (remaining <= 0) return;
        const weak = ts.state === "weak";
        items.push({
          key, kind: "revision", title: `Revise ${tp.name}`, parent: ex.title, subjectId: ex.subjectId, examId: ex.id,
          topicId: tp.id, due, realDue: ex.date, from, remaining, weak, state: ts.state,
          prio: 1.5 + (weak ? 2 : ts.state === "revise" || ts.state === "ns" ? 1 : 0), order: i, deps: [],
        });
      });
    }
    const ov = state.meta.overrides || {};
    for (const it of items) {
      const o = ov[it.key];
      if (!o) continue;
      if (o.notBefore && o.notBefore > today) it.from = it.from && it.from > o.notBefore ? it.from : o.notBefore;
      if (o.prefer) it.preferOn = o.prefer;
    }
    return { items, blocked };
  };

  SF.plan = (state, opts) => {
    opts = opts || {};
    const today = opts.today || SF.today();
    const idx = opts.idx || SF.index(state);
    const { items, blocked } = SF.workItems(state, today, idx);
    const due = SF.dueReviews(state, today).length;
    if (due > 0 && !(state.meta.overrides[`v:${today}`] && state.meta.overrides[`v:${today}`].notBefore > today)) {
      items.push({
        key: `v:${today}`, kind: "review", title: `Review ${due} card${due === 1 ? "" : "s"} and mistakes`,
        due: today, remaining: clamp(Math.ceil((due * 0.75) / 5) * 5, 5, 30), prio: 2.5, order: 0, deps: [],
      });
    }
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    const maxDue = items.reduce((m, i) => (i.due > m ? i.due : m), today);
    const horizon = clamp(SF.diff(today, maxDue) + 1, opts.minDays || 14, 60);
    const rem = new Map(items.map((i) => [i.key, i.remaining]));
    const days = {};
    const allocDay = (iso, cap) => {
      let left = cap;
      const per = new Map();
      const elig = items
        .filter((i) => (!i.from || i.from <= iso) && i.due >= iso)
        .sort((a, b) => {
          const pa = a.preferOn === iso ? 1 : 0, pb = b.preferOn === iso ? 1 : 0;
          if (pa !== pb) return pb - pa;
          if (a.due !== b.due) return a.due < b.due ? -1 : 1;
          if (b.prio !== a.prio) return b.prio - a.prio;
          return a.order - b.order;
        });
      let progress = true;
      while (left >= 10 && progress) {
        progress = false;
        for (const it of elig) {
          if (left < 5) break;
          const r = rem.get(it.key);
          if (!(r > 0)) continue;
          if (it.deps.some((d) => rem.get(d) > 0)) continue;
          const dueIn = SF.diff(iso, it.due);
          const capItem = dueIn <= 1 || it.kind === "review" || it.preferOn === iso ? Infinity : it.kind === "revision" ? 45 : 90;
          const used = per.get(it.key) || 0;
          let amt = Math.min(r, left, capItem - used);
          if (amt < r) amt = Math.floor(amt / 5) * 5;
          if (amt <= 0 || (amt < 10 && amt < r)) continue;
          rem.set(it.key, r - amt);
          left -= amt;
          per.set(it.key, used + amt);
          progress = true;
        }
      }
      return { per, left };
    };
    for (let k = 0; k < horizon; k++) {
      const iso = SF.addDays(today, k);
      const live = k === 0 && !opts.wholeDay;
      let { cap } = SF.capacity(state, iso, live);
      let per, left;
      for (let tries = 0; tries < 4; tries++) {
        const snap = new Map(rem);
        ({ per, left } = allocDay(iso, cap));
        if (k > 0) break;
        const alloc0 = [...per].map(([key, min]) => ({ key, min, item: byKey[key] }));
        const lay = SF.layoutDay(state, iso, alloc0, live);
        const unplaced = lay.sessions.filter((x) => x.start == null).reduce((a, x) => a + x.min, 0);
        if (!unplaced || tries === 3) break;
        rem.clear();
        for (const [kk, vv] of snap) rem.set(kk, vv);
        cap = Math.max(0, cap - Math.ceil(unplaced / 5) * 5);
      }
      const alloc = [...per].map(([key, min]) => ({ key, min, item: byKey[key] }));
      const deadlines = state.tasks.filter((t) => !t.completedAt && t.due === iso).length + state.exams.filter((e) => !e.done && e.date === iso).length;
      days[iso] = { cap, total: cap - left, alloc, deadlines };
    }
    const atRisk = items.filter((i) => i.kind !== "review" && rem.get(i.key) > 0).map((i) => ({ item: i, short: rem.get(i.key) }));
    for (const iso of Object.keys(days)) {
      const d = days[iso];
      d.crunch = d.total >= 0.9 * d.cap && d.cap > 0 && atRisk.some((r) => r.short >= 10 && r.item.due >= iso && SF.diff(iso, r.item.due) <= 2 && (!r.item.from || r.item.from <= iso));
    }
    return { today, days, atRisk, blocked, items, idx };
  };

  SF.loadLabel = (total, cap, maxMin, crunch) => {
    const ref = Math.max(cap, maxMin || 0, 1);
    const r = total / ref;
    if (crunch) return { key: "heavy", label: "Heavy" };
    if (total === 0) return { key: "free", label: "Free" };
    if (r < 0.4) return { key: "light", label: "Light" };
    if (r < 0.75) return { key: "ok", label: "Manageable" };
    return { key: "busy", label: "Busy" };
  };

  SF.layoutDay = (state, iso, alloc, live) => {
    const fromMin = live ? Math.ceil(SF.nowMin() / 5) * 5 : null;
    const { slots, acts, win } = SF.daySlots(state, iso, fromMin);
    const sessLen = state.meta.settings.session || 40, brk = state.meta.settings.brk || 0;
    const chunks = [];
    for (const a of alloc) {
      let m = a.min;
      const n = Math.max(1, Math.round(m / sessLen));
      const size = Math.ceil(m / n / 5) * 5;
      while (m > 0) {
        const c = Math.min(size, m);
        if (c < 10 && chunks.length && chunks[chunks.length - 1].key === a.key) chunks[chunks.length - 1].min += c;
        else chunks.push({ key: a.key, min: c, item: a.item });
        m -= c;
      }
    }
    const out = [];
    let si = 0, cur = slots.length ? slots[0][0] : 0;
    for (const ch of chunks) {
      let need = ch.min;
      while (need > 0 && si < slots.length) {
        const end = slots[si][1];
        const room = end - cur;
        if (room >= need) {
          out.push({ key: ch.key, item: ch.item, start: cur, end: cur + need, min: need });
          cur += need + brk;
          need = 0;
        } else if (room >= 15) {
          out.push({ key: ch.key, item: ch.item, start: cur, end: end, min: room });
          need -= room;
          si++;
          cur = si < slots.length ? slots[si][0] : 0;
        } else {
          si++;
          cur = si < slots.length ? slots[si][0] : 0;
        }
        if (si < slots.length && cur >= slots[si][1]) {
          si++;
          cur = si < slots.length ? slots[si][0] : 0;
        }
      }
      if (need > 0) out.push({ key: ch.key, item: ch.item, start: null, end: null, min: need });
    }
    return { sessions: out, acts, win };
  };

  // ---------- grades ----------
  SF.gradeSummary = (state, subjectId) => {
    const list = state.assessments.filter((a) => a.subjectId === subjectId);
    const done = list.filter((a) => a.status !== "upcoming" && a.max > 0 && a.score !== "" && a.score != null);
    const upcoming = list.filter((a) => a.status === "upcoming");
    const anyW = list.some((a) => Number(a.weight) > 0);
    // With no weightings anywhere, marks count by size (total marks), as in A* Planner's marks mode.
    const w = (a) => (anyW ? Number(a.weight) || 0 : Number(a.max) || 0);
    const pct = (a) => (Number(a.score) / Number(a.max)) * 100;
    const wDone = done.reduce((s, a) => s + w(a), 0);
    const wUp = upcoming.reduce((s, a) => s + w(a), 0);
    const wTotal = wDone + wUp;
    const pts = done.reduce((s, a) => s + w(a) * pct(a), 0);
    const avg = wDone > 0 ? pts / wDone : null;
    const sub = state.subjects.find((s) => s.id === subjectId);
    const target = sub && sub.target ? Number(sub.target) : null;
    let needed = null, maxPossible = null, verdict = null;
    if (target != null && wUp > 0) {
      needed = (target * wTotal - pts) / wUp;
      maxPossible = (pts + 100 * wUp) / wTotal;
      if (needed <= 0) verdict = { key: "secured", label: "Already secured" };
      else if (needed > 100) verdict = { key: "impossible", label: "Not possible" };
      else if (avg == null) verdict = { key: "open", label: needed <= 75 ? "Realistic" : "Stretch" };
      else if (needed <= avg + 5) verdict = { key: "realistic", label: "Realistic" };
      else if (needed <= avg + 15) verdict = { key: "stretch", label: "Stretch" };
      else verdict = { key: "hard", label: "Very hard" };
    }
    const sorted = done.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = sorted[sorted.length - 1], prev = sorted[sorted.length - 2];
    const delta = last && prev ? pct(last) - pct(prev) : null;
    const weightSum = anyW ? list.reduce((s, a) => s + (Number(a.weight) || 0), 0) : null;
    return { list, done: sorted, upcoming, avg, target, needed, maxPossible, verdict, delta, wDone, wUp, weightSum, anyW, pct };
  };

  // ---------- xp ----------
  SF.levelInfo = (xp) => {
    let level = 1, floor = 0, need = 100;
    while (xp >= floor + need) {
      floor += need;
      level++;
      need = 100 + 50 * (level - 1);
    }
    return { level, into: xp - floor, need };
  };
  SF.award = (state, pts, why, key) => {
    const m = state.meta;
    if (key && m.xpLog.some((x) => x.key === key)) return null;
    const before = SF.levelInfo(m.xp).level;
    m.xp += pts;
    m.xpLog.push({ t: SF.today(), pts, why, key: key || null });
    if (m.xpLog.length > 400) m.xpLog = m.xpLog.slice(-400);
    const after = SF.levelInfo(m.xp).level;
    return { pts, why, levelUp: after > before, level: after };
  };
  SF.markActive = (state, iso) => {
    iso = iso || SF.today();
    const a = state.meta.activeDays;
    if (!a.includes(iso)) {
      a.push(iso);
      a.sort();
      if (a.length > 400) state.meta.activeDays = a.slice(-400);
    }
  };
  SF.streak = (state) => {
    const set = new Set(state.meta.activeDays);
    const today = SF.today();
    let d = set.has(today) ? today : SF.addDays(today, -1);
    let n = 0;
    while (set.has(d)) {
      n++;
      d = SF.addDays(d, -1);
    }
    let best = 0, run = 0, prev = null;
    for (const x of state.meta.activeDays) {
      run = prev && SF.diff(prev, x) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = x;
    }
    return { current: n, best: Math.max(best, n), today: set.has(today) };
  };

  SF.ACHIEVEMENTS = [
    { id: "first-session", name: "First focus", desc: "Finish your first focus session", test: (s) => s.log.sessions.some((x) => x.timer) },
    { id: "streak-3", name: "Three in a row", desc: "Study 3 days in a row", test: (s) => SF.streak(s).best >= 3 },
    { id: "streak-7", name: "Full week", desc: "Study 7 days in a row", test: (s) => SF.streak(s).best >= 7 },
    { id: "early-3", name: "Ahead of the bell", desc: "Finish 3 assignments before the due date", test: (s) => s.tasks.filter((t) => t.completedAt && t.completedAt < t.due).length >= 3 },
    { id: "mistakes-10", name: "Honest logbook", desc: "Log 10 mistakes", test: (s) => s.mistakes.length >= 10 },
    { id: "fixed-5", name: "Fixer", desc: "Fix 5 mistakes", test: (s) => s.mistakes.filter((m) => m.resolved).length >= 5 },
    { id: "cards-100", name: "Centurion", desc: "Answer 100 review questions", test: (s) => s.log.reviews.length >= 100 },
    { id: "weak-fixed", name: "Weak spot, fixed", desc: "Master a topic you had logged mistakes on", test: (s) => {
      const fixed = new Set(s.mistakes.filter((m) => m.resolved && m.topicId).map((m) => m.topicId));
      return s.subjects.some((sub) => SF.subjectTopics(sub).some((t) => t.status === "mastered" && fixed.has(t.id)));
    } },
    { id: "level-5", name: "Level 5", desc: "Reach level 5", test: (s) => SF.levelInfo(s.meta.xp).level >= 5 },
  ];
  SF.checkAchievements = (state) => {
    const got = new Set(state.meta.achievements.map((a) => a.id));
    const fresh = [];
    for (const a of SF.ACHIEVEMENTS) {
      if (got.has(a.id)) continue;
      let ok = false;
      try { ok = a.test(state); } catch (e) { ok = false; }
      if (ok) {
        state.meta.achievements.push({ id: a.id, t: SF.today() });
        fresh.push(a);
      }
    }
    return fresh;
  };

  SF.weekStats = (state, ws) => {
    const we = SF.addDays(ws, 6);
    const inW = (d) => d >= ws && d <= we;
    const sessions = state.log.sessions.filter((s) => inW(s.date));
    const reviews = state.log.reviews.filter((r) => inW(r.d));
    const minutes = sessions.reduce((a, s) => a + (s.min || 0), 0);
    const acc = reviews.length ? reviews.filter((r) => r.ok).length / reviews.length : null;
    const completed = state.tasks.filter((t) => t.completedAt && inW(t.completedAt));
    const early = completed.filter((t) => t.completedAt < t.due);
    const onTime = completed.filter((t) => t.completedAt <= t.due);
    const fixed = state.mistakes.filter((m) => m.resolved && m.resolvedAt && inW(m.resolvedAt));
    const weakRevised = new Set(state.meta.xpLog.filter((x) => x.key && x.key.startsWith("weak:") && inW(x.t)).map((x) => x.key.split(":")[1])).size;
    const planned = sessions.filter((s) => s.planned).length;
    return { ws, we, sessions, reviews, minutes, acc, completed, early, onTime, fixed, weakRevised, planned };
  };

  SF.CHALLENGES = [
    { id: "weak3", name: "Revise 3 weak topics", goal: 3, val: (w) => w.weakRevised },
    { id: "early2", name: "Finish 2 assignments before their due date", goal: 2, val: (w) => w.early.length },
    { id: "sess5", name: "Complete 5 planned sessions", goal: 5, val: (w) => w.planned },
    { id: "rev60", name: "Answer 60 review questions", goal: 60, val: (w) => w.reviews.length },
    { id: "fix3", name: "Fix 3 mistakes", goal: 3, val: (w) => w.fixed.length },
  ];
  SF.challenge = (state, today) => {
    const ws = SF.weekStart(today || SF.today());
    const c = SF.CHALLENGES[SF.weekNo(ws) % SF.CHALLENGES.length];
    const w = SF.weekStats(state, ws);
    const v = Math.min(c.goal, c.val(w));
    return { ...c, value: v, done: v >= c.goal, key: `challenge:${ws}:${c.id}` };
  };

  // ---------- study methods ----------
  SF.METHODS = {
    math: { how: "Worked examples, then practice questions without notes.", next: {
      ns: "Read one worked example line by line, then try 3 similar questions.",
      learning: "Do 5 practice questions without notes and check every answer.",
      revise: "Redo your old mistakes on this topic, then 3 mixed questions.",
      weak: "Start from a fully worked example. Write each step and why it works.",
      good: "Two exam-style questions under a timer.",
      mastered: "One hard question every week or two to keep it fresh." } },
    science: { how: "Labelled diagrams, recall questions and explanations.", next: {
      ns: "Draw and label the key diagram from your notes, then explain it out loud.",
      learning: "Answer recall questions without notes, then check definitions word for word.",
      revise: "Redraw the diagram from memory and fix what you missed.",
      weak: "Explain the process step by step in your own words, then test with flashcards.",
      good: "Answer a 6-mark explain question and compare it with the mark scheme.",
      mastered: "Quick flashcard review only." } },
    english: { how: "Quote recall, analysis paragraphs and essay plans.", next: {
      ns: "Read the text and note 5 key quotes with what each shows.",
      learning: "Learn the 5 quotes, then write one analysis paragraph (point, evidence, explain).",
      revise: "Plan an essay answer in 10 minutes: thesis plus three points with quotes.",
      weak: "Rewrite one weak paragraph using the teacher's feedback.",
      good: "Timed paragraph on a new question.",
      mastered: "Plan answers to past questions without writing them out." } },
    language: { how: "Vocabulary recall, grammar practice and writing.", next: {
      ns: "Make flashcards for the topic vocabulary.",
      learning: "Recall vocabulary both ways, then 10 grammar sentences.",
      revise: "Write a short paragraph using the topic vocabulary and tenses.",
      weak: "Drill the grammar rule with 10 sentences, then check each one.",
      good: "Speak or write for 2 minutes on the topic without notes.",
      mastered: "Spaced vocabulary review only." } },
    history: { how: "Timelines, cause-and-effect maps and structured answers.", next: {
      ns: "Build a timeline of the key events and dates.",
      learning: "Draw a cause-and-effect map linking the events.",
      revise: "Answer one 'explain why' question with three supported points.",
      weak: "Rebuild the timeline from memory and fix the gaps.",
      good: "Timed essay plan for a 'how far do you agree' question.",
      mastered: "Quick date and key-term flashcards." } },
    geography: { how: "Case studies, maps and data interpretation.", next: {
      ns: "Summarise one case study: place, causes, effects, responses.",
      learning: "Sketch the map and annotate it from memory.",
      revise: "Interpret a graph or table and describe the pattern with figures.",
      weak: "Learn 3 facts and figures for the case study, then test yourself.",
      good: "Answer an exam question using case-study evidence.",
      mastered: "Flashcards on case-study figures." } },
    ict: { how: "Understand the concept, then exam-style questions.", next: {
      ns: "Read the concept and write a one-paragraph explanation in your own words.",
      learning: "Answer 5 short exam-style questions.",
      revise: "Explain the concept to someone else or to yourself out loud.",
      weak: "Work through one example by hand step by step.",
      good: "A longer exam-style question under time.",
      mastered: "Flashcard review of key terms." } },
    arts: { how: "Short recall, then practise the skill.", next: {
      ns: "Watch or read one example and note what makes it work.",
      learning: "Practise the skill for 20 minutes with one clear goal.",
      revise: "Recall the key terms and techniques, then practise.",
      weak: "Break the skill into one small part and repeat it.",
      good: "Do a full run-through and note one thing to improve.",
      mastered: "Keep practising little and often." } },
    other: { how: "Active recall and short practice tasks.", next: {
      ns: "Read your notes once and write 5 questions about them.",
      learning: "Answer your own questions without notes.",
      revise: "Flashcards on the parts you got wrong last time.",
      weak: "Rewrite the topic in your own words, then test yourself.",
      good: "Explain the topic out loud in 2 minutes.",
      mastered: "Spaced review only." } },
  };
  SF.nextActivity = (subject, ts) => {
    const m = SF.METHODS[(subject && subject.kind) || "other"] || SF.METHODS.other;
    return m.next[(ts && ts.state) || "ns"] || m.next.ns;
  };

  // ---------- quick capture ----------
  const WD = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const nextWd = (today, w) => {
    let n = (w - SF.wd(today) + 7) % 7;
    if (n === 0) n = 7;
    return SF.addDays(today, n);
  };
  const mkDate = (today, d, m, y) => {
    const ty = SF.parse(today).getFullYear();
    let year = y ? (y < 100 ? 2000 + y : y) : ty;
    let s = `${year}-${pad(m + 1)}-${pad(d)}`;
    const chk = SF.parse(s);
    if (chk.getMonth() !== m || chk.getDate() !== d) return null;
    if (!y && s < today) s = `${year + 1}-${pad(m + 1)}-${pad(d)}`;
    return s;
  };
  const to24 = (h, m, ap) => {
    h = Number(h);
    m = Number(m || 0);
    if (ap) {
      ap = ap.toLowerCase();
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
    } else if (h < 8) h += 12;
    return `${pad(h)}:${pad(m)}`;
  };
  SF.quickParse = (text, subjects, today) => {
    today = today || SF.today();
    let s = " " + String(text || "").trim() + " ";
    const out = { kind: "homework", title: "", subjectId: null, due: null, dueFound: false, minutes: null, difficulty: 2, days: [], start: null, end: null };
    const cut = (re, fn) => {
      s = s.replace(re, (...a) => {
        const r = fn(...a);
        return r === false ? a[0] : " ";
      });
    };
    cut(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i, (m, h1, m1, a1, h2, m2, a2) => {
      if (!m1 && !m2 && !a1 && !a2 && !/\d\s*(?:-|–)\s*\d/.test(m)) return false;
      out.start = to24(h1, m1, a1 || a2);
      out.end = to24(h2, m2, a2);
      out.kind = "activity";
    });
    cut(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m, y, mo, d) => { out.due = `${y}-${mo}-${d}`; out.dueFound = true; });
    cut(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\b/i, (m, d, mo) => {
      const r = mkDate(today, Number(d), MON[mo.toLowerCase().slice(0, mo.toLowerCase().startsWith("sept") ? 4 : 3)]);
      if (!r) return false;
      out.due = r; out.dueFound = true;
    });
    cut(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i, (m, mo, d) => {
      const r = mkDate(today, Number(d), MON[mo.toLowerCase().slice(0, mo.toLowerCase().startsWith("sept") ? 4 : 3)]);
      if (!r) return false;
      out.due = r; out.dueFound = true;
    });
    cut(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m, d, mo, y) => {
      const r = mkDate(today, Number(d), Number(mo) - 1, y ? Number(y) : 0);
      if (!r) return false;
      out.due = r; out.dueFound = true;
    });
    cut(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d{1,2})\s*(?:m|min|mins|minutes)?)?(?=\s|$)/i, (m, h, mm) => {
      out.minutes = Math.round(Number(h) * 60 + Number(mm || 0));
    });
    cut(/\b(\d{1,3})\s*(?:m|min|mins|minutes)\b/i, (m, mm) => { out.minutes = Number(mm); });
    cut(/\b(today|tonight)\b/i, () => { out.due = today; out.dueFound = true; });
    cut(/\b(tomorrow|tmrw|tmr)\b/i, () => { out.due = SF.addDays(today, 1); out.dueFound = true; });
    cut(/\bnext week\b/i, () => { out.due = SF.addDays(today, 7); out.dueFound = true; });
    cut(/\bin (\d{1,2}) (?:days?|d)\b/i, (m, n) => { out.due = SF.addDays(today, Number(n)); out.dueFound = true; });
    cut(/\bin (\d{1,2}) weeks?\b/i, (m, n) => { out.due = SF.addDays(today, 7 * Number(n)); out.dueFound = true; });
    const wdRe = /\b(?:next |this |every )?(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)(?:day|days|nesday|nesdays|sday|sdays|urday|urdays|s)?\b/gi;
    s = s.replace(wdRe, (m, w) => {
      const n = WD[w.toLowerCase()];
      if (n === undefined) return m;
      out.days.push(n);
      return " ";
    });
    if (out.days.length && !out.dueFound) {
      out.due = nextWd(today, out.days[0]);
      out.dueFound = true;
    }
    if (/\b(test|exam|quiz|assessment|midterm|mid-term|mock|finals?)\b/i.test(s) && out.kind !== "activity") out.kind = "exam";
    else if (/\bproject\b/i.test(s) && out.kind !== "activity") out.kind = "project";
    else if (/\b(essay|assignment|report|presentation|poster|lab|portfolio|coursework)\b/i.test(s) && out.kind !== "activity") out.kind = "assignment";
    if (/\b(hard|tough|difficult)\b/i.test(s)) { out.difficulty = 3; s = s.replace(/\b(hard|tough|difficult)\b/i, " "); }
    else if (/\b(easy|quick|short)\b/i.test(s)) { out.difficulty = 1; s = s.replace(/\b(easy|quick|short)\b/i, " "); }
    s = s.replace(/\b(due|by|on|at|for|before)\b/gi, " ");
    const words = s.split(/\s+/).filter(Boolean);
    let subj = null;
    const titleWords = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!subj) {
        const m = SF.matchSubject(w, subjects || []);
        if (m) {
          subj = m;
          titleWords.push(m.name);
          const parts = m.name.toLowerCase().split(/[\s&]+/).filter(Boolean);
          const al = Object.entries(ALIASES).filter(([k]) => m.name.toLowerCase().includes(k)).flatMap(([, l]) => l);
          while (i + 1 < words.length) {
            const nx = words[i + 1].toLowerCase().replace(/[^a-z]/g, "");
            if (nx && (parts.includes(nx) || al.includes(nx) || (nx.length >= 3 && parts.some((p) => p.startsWith(nx))) || (nx === "maths" && parts.includes("math")))) i++;
            else break;
          }
          continue;
        }
      }
      titleWords.push(w);
    }
    out.subjectId = subj ? subj.id : null;
    out.title = titleWords.join(" ").replace(/\s+/g, " ").trim();
    if (!out.title) out.title = subj ? `${subj.name} ${out.kind === "exam" ? "test" : out.kind}` : "";
    out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
    if (!out.due && out.kind !== "activity") out.due = out.kind === "exam" ? SF.addDays(today, 7) : SF.addDays(today, 1);
    if (out.minutes == null && out.kind !== "exam" && out.kind !== "activity") out.minutes = { homework: 30, assignment: 90, project: 240 }[out.kind];
    return out;
  };

  // ---------- assignment templates ----------
  SF.TEMPLATES = {
    essay: { name: "Essay", steps: [["Understand the question", 10], ["Research the texts or sources", 30], ["Develop a thesis", 15], ["Create an outline", 20], ["Write the first draft", 45], ["Edit against the rubric", 20]] },
    lab: { name: "Lab report", steps: [["Re-read the method and aim", 10], ["Organise results into tables", 20], ["Draw graphs", 25], ["Write analysis", 30], ["Write evaluation and conclusion", 25], ["Check against the rubric", 15]] },
    presentation: { name: "Presentation", steps: [["Understand the brief and rubric", 10], ["Research", 40], ["Plan the slides", 20], ["Make the slides", 45], ["Rehearse twice", 20]] },
    problems: { name: "Problem set", steps: [["Skim all questions", 5], ["Do the questions you can", 30], ["Work through the hard ones with notes", 25], ["Check answers", 10]] },
    generic: { name: "General", steps: [["Understand the task", 10], ["Gather what you need", 20], ["Do the main work", 60], ["Review and fix", 20]] },
  };

  SF.MILESTONES = [
    ["Understand the question and rubric", 1],
    ["Research", 3],
    ["Organise evidence", 1],
    ["Write the project", 3],
    ["Edit and improve", 2],
    ["Check citations and formatting", 1],
    ["Final review", 1],
    ["Buffer for unexpected problems", 1],
  ];
  SF.milestonePlan = (state, today, due, estimate) => {
    const days = [];
    for (let d = today; d < due; d = SF.addDays(d, 1)) {
      if ((state.meta.settings.days[SF.wd(d)] || {}).max > 0) days.push(d);
    }
    if (!days.length) days.push(today);
    const total = SF.MILESTONES.reduce((a, m) => a + m[1], 0);
    const workW = SF.MILESTONES.slice(0, -1).reduce((a, m) => a + m[1], 0);
    let cum = 0;
    return SF.MILESTONES.map(([title, w], i) => {
      cum += w;
      const di = clamp(Math.ceil((cum / total) * days.length) - 1, 0, days.length - 1);
      const isBuffer = i === SF.MILESTONES.length - 1;
      const min = isBuffer ? 0 : Math.max(10, Math.round(((estimate || 240) * w) / workW / 5) * 5);
      return { id: SF.uid(), title, min, due: days[di], done: false, assignee: "me", dependsOn: [] };
    }).filter((s) => s.min > 0);
  };

  // ---------- search ----------
  SF.search = (state, q) => {
    q = String(q || "").trim().toLowerCase();
    if (q.length < 2) return [];
    const has = (...xs) => xs.some((x) => x && String(x).toLowerCase().includes(q));
    const res = [];
    for (const sub of state.subjects) {
      if (has(sub.name)) res.push({ type: "subject", id: sub.id, title: sub.name, sub: "Subject", subjectId: sub.id });
      for (const ch of sub.chapters) for (const t of ch.topics) if (has(t.name)) res.push({ type: "topic", id: t.id, title: t.name, sub: `${sub.name} · ${ch.name}`, subjectId: sub.id });
    }
    for (const r of state.resources) if (has(r.title, r.body, r.url, (r.tags || []).join(" "))) res.push({ type: "resource", id: r.id, title: r.title, sub: r.kind === "link" ? "Link" : "Note", subjectId: r.subjectId });
    for (const m of state.mistakes) if (has(m.question, m.correct, m.why)) res.push({ type: "mistake", id: m.id, title: m.question, sub: `Mistake · ${m.type || ""}`, subjectId: m.subjectId });
    for (const c of state.cards) if (has(c.front, c.back)) res.push({ type: "card", id: c.id, title: c.front, sub: "Flashcard", subjectId: c.subjectId });
    for (const t of state.tasks) if (has(t.title, t.notes)) res.push({ type: "task", id: t.id, title: t.title, sub: t.completedAt ? "Done" : `Due ${SF.fmtDay(t.due)}`, subjectId: t.subjectId });
    for (const e of state.exams) if (has(e.title)) res.push({ type: "exam", id: e.id, title: e.title, sub: `Exam ${SF.fmtDay(e.date)}`, subjectId: e.subjectId });
    return res.slice(0, 60);
  };

  // ---------- example data ----------
  SF.exampleState = (today) => {
    today = today || SF.today();
    const D = (n) => SF.addDays(today, n);
    const s = SF.blankState();
    s.meta.isExample = true;
    s.meta.onboarded = true;
    s.meta.name = "Riya";
    const id = SF.uid;
    const T = (name, status, confidence) => ({ id: id(), name, status, confidence: confidence || 0 });
    const maths = { id: id(), name: "Mathematics", color: "c1", kind: "math", target: 85, chapters: [
      { id: id(), name: "Algebra", topics: [T("Expanding brackets", "mastered", 5), T("Factorising quadratics", "revise", 3), T("Linear equations", "mastered", 4), T("Simultaneous equations", "learning", 2)] },
      { id: id(), name: "Geometry", topics: [T("Pythagoras' theorem", "mastered", 5), T("Trigonometry: SOH CAH TOA", "learning", 0), T("Angles in polygons", "revise", 3)] },
      { id: id(), name: "Number", topics: [T("Laws of indices", "mastered", 4), T("Standard form", "revise", 3), T("Surds", "ns", 0)] },
    ] };
    const bio = { id: id(), name: "Biology", color: "c3", kind: "science", target: 80, chapters: [
      { id: id(), name: "Cells", topics: [T("Cell structure", "mastered", 5), T("Microscopy and magnification", "revise", 2), T("Diffusion and osmosis", "learning", 3)] },
      { id: id(), name: "Enzymes", topics: [T("Enzyme action (lock and key)", "revise", 3), T("Effect of temperature and pH", "learning", 2)] },
      { id: id(), name: "Plants", topics: [T("Photosynthesis", "mastered", 4), T("Leaf structure", "revise", 3), T("Transpiration", "ns", 0)] },
    ] };
    const chem = { id: id(), name: "Chemistry", color: "c5", kind: "science", target: 80, chapters: [
      { id: id(), name: "Atoms and bonding", topics: [T("Atomic structure", "mastered", 5), T("The periodic table", "mastered", 4), T("Ionic bonding", "revise", 3), T("Covalent bonding", "learning", 2)] },
      { id: id(), name: "Reactions", topics: [T("Rates of reaction", "ns", 0), T("Acids and alkalis", "learning", 3)] },
    ] };
    const eng = { id: id(), name: "English", color: "c4", kind: "english", target: 80, chapters: [
      { id: id(), name: "Poetry", topics: [T("Unseen poetry", "revise", 3), T("Comparing two poems", "learning", 2)] },
      { id: id(), name: "Writing", topics: [T("Persuasive writing", "mastered", 4), T("Narrative openings", "revise", 3)] },
    ] };
    const hist = { id: id(), name: "History", color: "c2", kind: "history", target: 75, chapters: [
      { id: id(), name: "Causes of WW1", topics: [T("The alliance system", "mastered", 4), T("Militarism and the naval race", "revise", 3), T("Assassination at Sarajevo", "mastered", 5)] },
      { id: id(), name: "Peacemaking", topics: [T("Treaty of Versailles terms", "learning", 3), T("The League of Nations", "ns", 0)] },
    ] };
    s.subjects = [maths, bio, chem, eng, hist];
    const tp = (sub, name) => SF.subjectTopics(sub).find((t) => t.name === name).id;

    s.meta.activities = [
      { id: id(), name: "Badminton practice", days: [1, 3], start: "18:00", end: "19:30" },
      { id: id(), name: "Piano lesson", days: [6], start: "10:00", end: "11:00" },
    ];

    const essaySteps = SF.TEMPLATES.essay.steps.map(([title, min], i) => ({ id: id(), title, min, done: i < 2, doneMin: i < 2 ? min : 0, assignee: "me", dependsOn: [] }));
    const proj = { id: id(), subjectId: hist.id, kind: "project", title: "Causes of WW1 research project", due: D(12), estimate: 300, difficulty: 3, createdAt: D(-2),
      requirements: ["1,200-1,500 words", "At least 4 sources, 2 of them primary", "One annotated map or timeline"],
      rubric: [{ text: "Criterion A: knowledge and understanding", checked: false }, { text: "Criterion B: investigating (sources and citations)", checked: false }, { text: "Criterion C: communicating (structure, clarity)", checked: false }, { text: "Criterion D: thinking critically (weighing causes)", checked: false }],
      format: "Google Doc, MLA citations", members: [], links: [], notes: "" };
    proj.steps = SF.milestonePlan(s, today, proj.due, proj.estimate);
    proj.personalDue = D(11);
    proj.steps[0].done = true;
    proj.steps[0].doneMin = proj.steps[0].min;

    const lab = { id: id(), subjectId: chem.id, kind: "assignment", title: "Rates of reaction lab report", due: D(5), estimate: 125, difficulty: 2, createdAt: D(-3),
      requirements: ["Results table with units", "Graph of time vs concentration", "Evaluation of errors"], rubric: [{ text: "Graph has labelled axes and units", checked: false }, { text: "Conclusion refers to collision theory", checked: false }],
      format: "Group report, one PDF", notes: "", links: [] };
    lab.members = [{ id: "m1", name: "Aarav" }, { id: "m2", name: "Mia" }];
    const ls = SF.TEMPLATES.lab.steps.map(([title, min]) => ({ id: id(), title, min, done: false, assignee: "me", dependsOn: [] }));
    ls[0].done = true;
    ls[1].assignee = "m1";
    ls[2].assignee = "me";
    ls[2].dependsOn = [ls[1].id];
    ls[3].assignee = "me";
    ls[4].assignee = "m2";
    ls[4].dependsOn = [ls[3].id];
    lab.steps = ls;

    s.tasks = [
      { id: id(), subjectId: maths.id, kind: "homework", title: "Mathematics ex 4.2 (simultaneous equations)", due: D(1), estimate: 30, done: 0, difficulty: 2, steps: [], createdAt: D(-1) },
      { id: id(), subjectId: eng.id, kind: "assignment", title: "Comparative essay: two war poems", due: D(4), estimate: 140, difficulty: 3, steps: essaySteps, createdAt: D(-4),
        requirements: ["Compare both poems throughout", "800-1,000 words", "Embedded quotations"], rubric: [{ text: "Clear comparative thesis", checked: false }, { text: "Analysis of language and form", checked: false }, { text: "Embedded quotes, at least 3 per poem", checked: false }], format: "Typed, double spaced", members: [], links: [], notes: "" },
      lab,
      proj,
      { id: id(), subjectId: bio.id, kind: "homework", title: "Biology worksheet: osmosis in potato cells", due: D(-3), estimate: 25, done: 25, difficulty: 1, steps: [], createdAt: D(-6), completedAt: D(-4) },
      { id: id(), subjectId: maths.id, kind: "homework", title: "Mathematics ex 3.6 (indices)", due: D(-2), estimate: 30, done: 30, difficulty: 2, steps: [], createdAt: D(-5), completedAt: D(-2) },
    ];

    s.exams = [
      { id: id(), subjectId: bio.id, title: "Biology unit test: cells and enzymes", date: D(3), createdAt: D(-5), topicIds: [tp(bio, "Cell structure"), tp(bio, "Microscopy and magnification"), tp(bio, "Diffusion and osmosis"), tp(bio, "Enzyme action (lock and key)"), tp(bio, "Effect of temperature and pH")] },
      { id: id(), subjectId: maths.id, title: "Mathematics algebra quiz", date: D(8), createdAt: D(-2), topicIds: [tp(maths, "Factorising quadratics"), tp(maths, "Linear equations"), tp(maths, "Simultaneous equations"), tp(maths, "Expanding brackets")] },
    ];

    const A = (sub, title, date, score, max, weight, status) => ({ id: id(), subjectId: sub.id, title, date, score, max, weight, status: status || "done" });
    s.assessments = [
      A(maths, "Unit 1 test: number", D(-48), 18, 25, 20), A(maths, "Unit 2 test: algebra basics", D(-20), 17, 20, 20), A(maths, "Mid-term exam", D(30), "", 100, 30, "upcoming"), A(maths, "End of term exam", D(70), "", 100, 30, "upcoming"),
      A(bio, "Practical write-up", D(-40), 14, 20, 25), A(bio, "Quiz: cells", D(-14), 7, 10, 15), A(bio, "Unit test", D(3), "", 50, 30, "upcoming"), A(bio, "Final exam", D(65), "", 100, 30, "upcoming"),
      A(chem, "Bonding test", D(-25), 31, 40, 30), A(chem, "Lab report", D(5), "", 30, 30, "upcoming"), A(chem, "Final exam", D(66), "", 100, 40, "upcoming"),
      A(eng, "Persuasive speech", D(-35), 24, 30, 25), A(eng, "Reading comprehension", D(-10), 21, 30, 25), A(eng, "Comparative essay", D(4), "", 40, 50, "upcoming"),
      A(hist, "Source analysis", D(-30), 13, 20, 30), A(hist, "Research project", D(12), "", 40, 40, "upcoming"), A(hist, "Final test", D(60), "", 50, 30, "upcoming"),
    ];

    const C = (sub, topicName, front, back, box, dueIn, lapses) => ({ id: id(), subjectId: sub.id, topicId: tp(sub, topicName), front, back, box, due: D(dueIn), reps: box + (lapses || 0), lapses: lapses || 0, source: "manual", history: [] });
    s.cards = [
      C(bio, "Cell structure", "What is the function of mitochondria?", "Site of aerobic respiration, which releases energy for the cell.", 4, 6),
      C(bio, "Microscopy and magnification", "Write the magnification equation.", "Magnification = image size ÷ actual size.", 1, 0, 3),
      C(bio, "Diffusion and osmosis", "Define osmosis.", "The net movement of water molecules from a dilute solution to a more concentrated solution through a partially permeable membrane.", 2, 0, 1),
      C(bio, "Enzyme action (lock and key)", "Why does an enzyme stop working when it is denatured?", "The shape of the active site changes, so the substrate no longer fits.", 1, 0, 2),
      C(bio, "Effect of temperature and pH", "What happens to enzyme activity above the optimum temperature?", "Activity falls quickly because the enzyme denatures.", 2, 1),
      C(bio, "Photosynthesis", "Word equation for photosynthesis?", "Carbon dioxide + water → glucose + oxygen (using light energy).", 5, 9),
      C(chem, "Ionic bonding", "What happens to electrons in ionic bonding?", "Electrons are transferred from a metal atom to a non-metal atom, forming oppositely charged ions.", 2, 0),
      C(chem, "Covalent bonding", "What is a covalent bond?", "A shared pair of electrons between two non-metal atoms.", 1, 0, 1),
      C(hist, "Treaty of Versailles terms", "What did Article 231 say?", "The 'war guilt' clause: Germany accepted responsibility for causing the war.", 2, 0),
      C(hist, "Militarism and the naval race", "Which ship type started the Anglo-German naval race in 1906?", "HMS Dreadnought.", 3, 2),
      C(maths, "Laws of indices", "Simplify a^5 × a^3.", "a^8 (add the powers).", 4, 5),
      C(maths, "Standard form", "Write 0.00042 in standard form.", "4.2 × 10^-4", 1, 0, 1),
    ];

    const M = (sub, topicName, question, myAnswer, correct, why, type, daysAgo, attempts) => ({ id: id(), subjectId: sub.id, topicId: tp(sub, topicName), question, myAnswer, correct, why, type, date: D(-daysAgo), resolved: false, attempts: attempts || [], due: D(0), box: 1 });
    s.mistakes = [
      M(maths, "Factorising quadratics", "Factorise x² + 5x + 6", "(x + 6)(x + 1)", "(x + 2)(x + 3)", "Picked factors that multiply to 6 but forgot they must add to 5.", "Calculation", 9, [{ d: D(-5), ok: false }]),
      M(maths, "Simultaneous equations", "Solve 2x + y = 7 and x − y = 2", "x = 5, y = −3", "x = 3, y = 1", "Added the equations wrong: 2x + x is 3x, not 2x.", "Carelessness", 6),
      M(bio, "Microscopy and magnification", "An image is 20 mm and the cell is 0.05 mm. Find the magnification.", "× 40", "× 400", "Forgot to keep units the same before dividing.", "Calculation", 12, [{ d: D(-8), ok: false }]),
      M(bio, "Microscopy and magnification", "Convert 2 mm into micrometres.", "200 µm", "2,000 µm", "Mixed up the conversion: 1 mm = 1,000 µm.", "Memory", 4),
      M(bio, "Enzyme action (lock and key)", "Explain why enzymes are specific.", "They only work at one temperature.", "Each enzyme's active site has a shape that only fits one substrate.", "Confused specificity with optimum temperature.", "Conceptual", 7),
      M(hist, "Treaty of Versailles terms", "Explain one way the Treaty weakened Germany's army.", "Germany lost Alsace-Lorraine.", "The army was limited to 100,000 men and conscription was banned.", "Gave a territorial term, not a military one.", "Application", 3),
    ];

    s.resources = [
      { id: id(), subjectId: bio.id, topicId: tp(bio, "Photosynthesis"), kind: "note", title: "Photosynthesis class notes", body: "Photosynthesis happens in chloroplasts. Chlorophyll absorbs light energy. Carbon dioxide + water → glucose + oxygen. Limiting factors: light intensity, CO2 concentration, temperature. Glucose is used for respiration, stored as starch, or made into cellulose, proteins and fats.", url: "", date: D(-9) },
      { id: id(), subjectId: bio.id, topicId: tp(bio, "Enzyme action (lock and key)"), kind: "note", title: "Enzymes summary", body: "Enzymes are biological catalysts made of protein. The substrate fits into the active site (lock and key). High temperature or extreme pH changes the active site shape: the enzyme is denatured. Each enzyme has an optimum temperature and pH.", url: "", date: D(-6) },
      { id: id(), subjectId: hist.id, topicId: tp(hist, "The alliance system"), kind: "link", title: "BBC Bitesize: causes of WW1", body: "", url: "https://www.bbc.co.uk/bitesize", date: D(-11) },
    ];

    const S = (dAgo, key, title, sub, min, planned, timer) => ({ id: id(), date: D(-dAgo), key, title, subjectId: sub.id, min, planned, timer: !!timer, at: "17:00" });
    s.log.sessions = [
      S(6, "x1", "Biology worksheet", bio, 25, true, true), S(5, "x2", "Mathematics ex 3.6", maths, 30, true, true), S(5, "x3", "History reading", hist, 40, true),
      S(4, "x4", "Essay: understand the question", eng, 10, true), S(4, "x5", "Essay: research", eng, 30, true, true), S(3, "x6", "Bonding flashcards", chem, 15, false),
      S(2, "x7", "Project: rubric", hist, 20, true, true), S(1, "x8", "Biology revision", bio, 40, true, true),
    ];
    const rv = [];
    const pushR = (sub, name, dAgo, oks) => oks.forEach((ok) => rv.push({ d: D(-dAgo), s: sub.id, t: tp(sub, name), ok }));
    pushR(bio, "Microscopy and magnification", 5, [0, 0, 1, 0]);
    pushR(bio, "Cell structure", 5, [1, 1, 1]);
    pushR(bio, "Enzyme action (lock and key)", 3, [0, 1, 0]);
    pushR(chem, "Ionic bonding", 3, [1, 0, 1]);
    pushR(maths, "Laws of indices", 2, [1, 1, 1, 1]);
    pushR(hist, "Militarism and the naval race", 1, [1, 1, 0]);
    pushR(bio, "Photosynthesis", 1, [1, 1, 1, 1]);
    s.log.reviews = rv;
    s.meta.activeDays = [D(-6), D(-5), D(-4), D(-3), D(-2), D(-1)];
    s.meta.xp = 0;
    const award = (pts, why, key, dAgo) => { s.meta.xp += pts; s.meta.xpLog.push({ t: D(-dAgo), pts, why, key }); };
    award(20, "Planned session: Biology worksheet", "ex1", 6);
    award(30, "Finished early: Biology worksheet", "ex2", 4);
    award(20, "Planned session: Mathematics ex 3.6", "ex3", 5);
    award(20, "Planned session: History reading", "ex4", 5);
    award(20, "Planned session: Essay research", "ex5", 4);
    award(25, "Beat your last Chemistry score", "ex6", 3);
    award(20, "Planned session: Project rubric", "ex7", 2);
    award(15, "Revised a weak topic: Microscopy", "weak:" + tp(bio, "Microscopy and magnification") + ":" + D(-1), 1);
    award(20, "Planned session: Biology revision", "ex8", 1);
    s.meta.achievements = [{ id: "first-session", t: D(-6) }, { id: "streak-3", t: D(-4) }];
    return s;
  };

  // ---------- letter grades ----------
  SF.sortedGrades = (grades) => (Array.isArray(grades) ? grades : [])
    .filter((g) => g && String(g.name || "").trim() && isFinite(Number(g.min)))
    .map((g) => ({ name: String(g.name).trim(), min: Number(g.min), max: g.max == null || g.max === "" ? null : Number(g.max) }))
    .sort((a, b) => b.min - a.min);
  SF.letterFor = (pct, grades) => {
    if (pct == null || !isFinite(pct)) return null;
    for (const g of SF.sortedGrades(grades)) if (pct >= g.min - 1e-9) return g.name;
    return null;
  };

  // ---------- subject name matching ----------
  SF.normSubject = (name) => String(name || "").toLowerCase()
    .replace(/&/g, " and ").replace(/\b(igcse|gcse|cambridge|ib|cbse|icse|syllabus|course|subject|grade|year|level|hl|sl|core|extended)\b/g, " ")
    .replace(/\(.*?\)/g, " ").replace(/\b\d{3,4}\b/g, " ")
    .replace(/mathematics|maths/g, "math").replace(/\bstudies\b/g, "").replace(/\blit\b/g, "literature").replace(/\blang\b/g, "language")
    .replace(/\bphysical education\b/g, "pe").replace(/\bcomputer science\b/g, "computerscience").replace(/\bglobal perspectives?\b/g, "globalperspectives")
    .replace(/[^a-z0-9]+/g, "");
  SF.findSubjectByName = (name, subjects) => {
    const n = SF.normSubject(name);
    if (!n) return null;
    let hit = subjects.find((s) => SF.normSubject(s.name) === n);
    if (hit) return hit;
    hit = subjects.find((s) => { const m = SF.normSubject(s.name); return m.length >= 3 && n.length >= 3 && (m.startsWith(n) || n.startsWith(m)); });
    if (hit) return hit;
    const words = String(name).trim().split(/\s+/);
    if (words.length === 1) return SF.matchSubject(words[0], subjects);
    return null;
  };

  // ---------- A* Planner import ----------
  SF.isAstarState = (x) => !!(x && typeof x === "object" && Array.isArray(x.subjects) && (Array.isArray(x.assessments) || Array.isArray(x.upcoming)) && x.subjects.every((s) => s && ("grades" in s || "target" in s)));
  SF.unwrapAstar = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    if (raw.state && SF.isAstarState(raw.state)) return raw.state;
    return SF.isAstarState(raw) ? raw : null;
  };
  SF.astarPlan = (astar, state) => {
    const subs = (astar.subjects || []).filter((s) => s && s.name);
    return subs.map((a) => {
      const nA = (astar.assessments || []).filter((x) => x.subjectId === a.id).length;
      const nU = (astar.upcoming || []).filter((x) => x.subjectId === a.id).length;
      const match = SF.findSubjectByName(a.name, state.subjects) || (a.code ? SF.findSubjectByName(a.code, state.subjects) : null);
      const target = match ? match.id : nA || nU ? "new" : "skip";
      return { astarId: a.id, name: a.name, code: a.code || "", nA, nU, target };
    });
  };
  SF.applyAstar = (state, astar, plan, opts, today) => {
    opts = Object.assign({ grades: true, upcoming: true, exams: true, boundaries: true }, opts || {});
    today = today || SF.today();
    const out = { subjects: 0, assessments: 0, upcoming: 0, exams: 0, skipped: 0 };
    const used = new Set(state.subjects.map((s) => s.color));
    const nextColor = () => { const c = SF.SUBJECT_COLORS.find((x) => !used.has(x)) || SF.SUBJECT_COLORS[state.subjects.length % SF.SUBJECT_COLORS.length]; used.add(c); return c; };
    const have = new Set(state.assessments.map((a) => a.srcId).filter(Boolean).concat(state.exams.map((e) => e.srcId).filter(Boolean)));
    for (const row of plan) {
      if (!row.target || row.target === "skip") continue;
      const a = (astar.subjects || []).find((s) => s.id === row.astarId);
      if (!a) continue;
      let sub;
      if (row.target === "new") sub = SF.findSubjectByName(a.name, state.subjects);
      if (row.target === "new" && !sub) {
        sub = { id: SF.uid(), name: String(a.name).trim().slice(0, 60), color: nextColor(), kind: SF.guessKind(a.name), target: null, chapters: [] };
        state.subjects.push(sub);
        out.subjects++;
      } else if (row.target !== "new") sub = state.subjects.find((s) => s.id === row.target);
      if (!sub) continue;
      if (opts.boundaries) {
        const gs = SF.sortedGrades(a.grades);
        if (gs.length) {
          sub.grades = gs;
          const t = gs.find((g) => g.name === String(a.target)) || gs[0];
          sub.target = t.min;
        }
      }
      const marksMode = a.mode === "marks";
      const wOf = (x) => (marksMode ? "" : x.weight == null || x.weight === "" || !isFinite(Number(x.weight)) ? "" : Number(x.weight));
      if (opts.grades) for (const x of (astar.assessments || []).filter((x) => x.subjectId === a.id)) {
        const src = "astar:" + x.id;
        if (have.has(src)) { out.skipped++; continue; }
        have.add(src);
        state.assessments.push({ id: SF.uid(), subjectId: sub.id, title: String(x.name || "Assessment").slice(0, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "", score: Number(x.obtained) || 0, max: Number(x.max) || 1, weight: wOf(x), status: "done", srcId: src });
        out.assessments++;
      }
      for (const x of (astar.upcoming || []).filter((x) => x.subjectId === a.id)) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "";
        if (opts.upcoming) {
          const src = "astar-up:" + x.id;
          if (!have.has(src)) {
            have.add(src);
            state.assessments.push({ id: SF.uid(), subjectId: sub.id, title: String(x.name || "Upcoming test").slice(0, 80), date, score: "", max: Number(x.max) || 1, weight: wOf(x), status: "upcoming", srcId: src });
            out.upcoming++;
          } else out.skipped++;
        }
        if (opts.exams && date && date >= today) {
          const src = "astar-exam:" + x.id;
          if (!have.has(src)) {
            have.add(src);
            state.exams.push({ id: SF.uid(), subjectId: sub.id, title: String(x.name || sub.name + " test").slice(0, 80), date, topicIds: [], createdAt: today, srcId: src });
            out.exams++;
          }
        }
      }
    }
    return out;
  };

  // ---------- whole-syllabus parser ----------
  const CMD_VERB = /^(describe|explain|state|define|identify|calculate|use|investigate|interpret|recall|know|understand|recogni[sz]e|compare|outline|draw|name|list|discuss|evaluate|anal[ys][sz]e|show|sketch|determine|demonstrate|apply|suggest|predict|plot|measure|convert|derive|deduce|construct|write|read|solve|find|be able|candidates|students|learners)\b/i;
  const NOISE = /^(core|supplement|supplementary|extended|notes?( and guidance)?|guidance|learning (objectives?|outcomes?)|objectives?|content|subject content|assessment objectives?|key concepts?|overview|contents|page \d+|\d+|topics?|syllabus|scheme of work|term \d+|week \d+)[:.]?$/i;
  const GENERIC = /\b(syllabus|topics?|curriculum|term|grade|year|overview|content|portion|portions|course|outline|igcse|gcse|cambridge|ib|cbse|icse|cie|edexcel|aqa|subject|paper|\d{3,4}|[0-9]+(st|nd|rd|th)?)\b/gi;
  SF.COMMON_SUBJECTS = ["English", "English Language", "English Literature", "First Language English", "English as a Second Language", "Mathematics", "Additional Mathematics", "Further Mathematics", "Statistics",
    "Biology", "Chemistry", "Physics", "Science", "Combined Science", "Co-ordinated Sciences", "Environmental Management", "Environmental Science", "Agriculture",
    "History", "Geography", "Economics", "Business Studies", "Accounting", "Sociology", "Psychology", "Political Science", "Civics", "Social Studies", "Global Perspectives", "Thinking Skills",
    "Computer Science", "ICT", "Information Technology", "Design and Technology", "Art and Design", "Art", "Music", "Drama", "Physical Education", "PE", "Media Studies", "Travel and Tourism",
    "Hindi", "Marathi", "Sanskrit", "Gujarati", "Tamil", "Urdu", "French", "German", "Spanish", "Mandarin", "Chinese", "Japanese", "Arabic", "Italian", "Latin",
    "Religious Studies", "Moral Education", "Robotics", "Student Wellbeing", "Life Skills", "Theory of Knowledge"];
  SF.parseSyllabus = (text, subjects, presets) => {
    presets = (presets || []).concat(SF.COMMON_SUBJECTS);
    const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    const subjectOf = (line) => {
      if (line.length > 70) return null;
      let core = line.replace(/^(subject|course)\s*[:\-–]\s*/i, "").replace(/[:\-–|]+\s*$/, "").replace(/\(.*?\)/g, " ");
      core = core.replace(GENERIC, " ").replace(/[^A-Za-z&+ ]/g, " ").replace(/\s+/g, " ").trim();
      if (!core || core.split(" ").length > 4) return null;
      const n = SF.normSubject(core);
      if (!n) return null;
      const hit = subjects.find((s) => SF.normSubject(s.name) === n);
      if (hit) return { subjectId: hit.id, name: hit.name };
      const words = core.split(" ");
      if (words.length === 1) { const m = SF.matchSubject(words[0], subjects); if (m && SF.normSubject(m.name).startsWith(n.slice(0, 3))) return { subjectId: m.id, name: m.name }; }
      const pre = presets.find((p) => SF.normSubject(p) === n);
      if (pre) return { subjectId: null, name: pre };
      return null;
    };
    const sections = [];
    let sec = null, ch = null, ignored = 0;
    const newSec = (info, heading) => { sec = { heading, subjectId: info ? info.subjectId : null, guess: info ? info.name : null, chapters: [] }; sections.push(sec); ch = null; };
    const newCh = (name) => { ch = { name: name.slice(0, 80), topics: [], depths: [] }; sec.chapters.push(ch); };
    const addTopic = (name, depth) => {
      if (!sec) newSec(null, null);
      if (!ch) newCh("Topics");
      name = name.replace(/[:;.,]+$/, "").trim().slice(0, 100);
      if (!name || ch.topics.some((t) => t.toLowerCase() === name.toLowerCase())) return;
      ch.topics.push(name);
      ch.depths.push(depth || 2);
    };
    for (const raw of lines) {
      const isMdHeading = /^#{1,6}\s/.test(raw);
      const line = raw.replace(/^[#>]+\s*/, "").replace(/^\*\*(.+)\*\*$/, "$1");
      const subj = subjectOf(line);
      if (subj) { newSec(subj, line); continue; }
      if (!line.replace(GENERIC, " ").replace(/[^A-Za-z]/g, "")) { ignored++; continue; }
      if (isMdHeading) { if (!sec) newSec(null, null); newCh(line.replace(/[:.]+$/, "")); continue; }
      if (NOISE.test(line) || /^(https?:|www\.)/i.test(line) || /^©/.test(line)) { ignored++; continue; }
      let m;
      // Chapter: "Unit 3: Forces", "Chapter 2 - Cells", "Topic 4 Enzymes"
      if ((m = line.match(/^(unit|chapter|topic|module|section|theme|strand|part)\s*([0-9]+|[ivxlc]+|[a-z])\b\s*[:.\-–)]?\s*(.*)$/i))) {
        if (!sec) newSec(null, null);
        newCh((m[3] || line).trim() || line);
        continue;
      }
      // Topic: "1.2 Diffusion", "1.2.3 ..."
      if ((m = line.match(/^(\d{1,2}(?:\.\d{1,2})+)[.)]?\s+(.+)$/))) {
        const body = m[2];
        if (CMD_VERB.test(body) || body.split(" ").length > 14) { ignored++; continue; }
        addTopic(body, m[1].split(".").length);
        continue;
      }
      // Chapter: "1 Cells", "2. Enzymes"
      if ((m = line.match(/^(\d{1,2})[.)]?\s+(.+)$/))) {
        const body = m[2];
        if (CMD_VERB.test(body) || body.split(" ").length > 12) { ignored++; continue; }
        if (!sec) newSec(null, null);
        newCh(body.replace(/[:.]+$/, ""));
        continue;
      }
      // Bullets and lettered items are topics
      if ((m = line.match(/^(?:[-•*▪◦●○·–]|\(?[a-z]\)|[a-z]\.)\s+(.+)$/i))) {
        const body = m[1];
        if (CMD_VERB.test(body) || body.split(" ").length > 14) { ignored++; continue; }
        addTopic(body, 2);
        continue;
      }
      // "Heading:" or ALL CAPS line -> chapter
      if (/:$/.test(line) && line.split(" ").length <= 8) {
        if (!sec) newSec(null, null);
        newCh(line.replace(/:$/, ""));
        continue;
      }
      if (/^[A-Z0-9 &,'()\-]{4,60}$/.test(line) && /[A-Z]{3}/.test(line)) {
        if (!sec) newSec(null, null);
        newCh(line.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()));
        continue;
      }
      if (CMD_VERB.test(line) || line.split(" ").length > 14) { ignored++; continue; }
      addTopic(line, 2);
    }
    // Tidy: prefer x.y topics over deeper x.y.z when both exist; handle empty chapters.
    for (const s of sections) {
      for (const c of s.chapters) {
        if (c.depths.some((d) => d === 2) && c.depths.some((d) => d > 2)) {
          c.topics = c.topics.filter((_, i) => c.depths[i] <= 2);
        }
        delete c.depths;
      }
      const empty = s.chapters.filter((c) => !c.topics.length);
      if (empty.length && empty.length === s.chapters.length) {
        s.chapters = [{ name: "Syllabus", topics: empty.map((c) => c.name) }];
      } else {
        for (const c of empty) c.topics = [c.name];
      }
    }
    // Merge sections that point at the same subject; drop empty ones.
    const merged = [];
    for (const s of sections) {
      if (!s.chapters.length) continue;
      const key = s.subjectId || (s.guess ? "new:" + s.guess : null);
      const prev = key && merged.find((x) => (x.subjectId || (x.guess ? "new:" + x.guess : null)) === key);
      if (prev) prev.chapters.push(...s.chapters);
      else merged.push(s);
    }
    return { sections: merged, ignored };
  };
  SF.applySyllabus = (state, sections) => {
    const out = { subjects: 0, chapters: 0, topics: 0 };
    const used = new Set(state.subjects.map((s) => s.color));
    for (const s of sections) {
      if (!s.target || s.target === "skip") continue;
      let sub;
      if (String(s.target).startsWith("new:")) {
        const name = s.target.slice(4).trim() || "New subject";
        sub = SF.findSubjectByName(name, state.subjects);
        if (!sub) {
          const color = SF.SUBJECT_COLORS.find((x) => !used.has(x)) || SF.SUBJECT_COLORS[state.subjects.length % SF.SUBJECT_COLORS.length];
          used.add(color);
          sub = { id: SF.uid(), name: name.slice(0, 60), color, kind: SF.guessKind(name), target: 80, chapters: [] };
          state.subjects.push(sub);
          out.subjects++;
        }
      } else sub = state.subjects.find((x) => x.id === s.target);
      if (!sub) continue;
      for (const c of s.chapters) {
        let ch = sub.chapters.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
        if (!ch) { ch = { id: SF.uid(), name: c.name, topics: [] }; sub.chapters.push(ch); out.chapters++; }
        for (const t of c.topics) {
          if (ch.topics.some((x) => x.name.toLowerCase() === t.toLowerCase())) continue;
          ch.topics.push({ id: SF.uid(), name: t, status: "ns", confidence: 0 });
          out.topics++;
        }
      }
    }
    return out;
  };

  root.SF = SF;
  if (typeof module !== "undefined") module.exports = SF;
})(typeof window !== "undefined" ? window : globalThis);
