// ---------- StudyFlow web: accounts and cloud saving (Supabase) ----------
const SUPABASE_URL = "https://fdjcufvtjkpyrbodkyfj.supabase.co";
const SUPABASE_KEY = "sb_publishable_v3b-lBbb7L9WiikC76yHJg_drOdpLv3";
const TABLE = "studyflow_docs";
const SUPPORT_EMAIL = "ahaankothari@gmail.com";

const Web = {
  sb: null,
  base: location.origin + location.pathname,
  retryTimer: null,
  lastPull: 0,

  boot() {
    S.auth = { status: "loading", mode: "signin", error: "", info: "", busy: false, user: null };
    this.recovering = new URL(location.href).searchParams.get("reset") === "1";
    renderAuth();
    if (!window.supabase || !window.supabase.createClient) {
      S.auth.status = "error";
      S.auth.error = "StudyFlow couldn't load. Check your internet connection and refresh the page.";
      return renderAuth();
    }
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    this.sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        S.auth.mode = "recovery";
        S.auth.status = "out";
        S.auth.recoveryUser = session && session.user;
        return renderAuth();
      }
      if (session && session.user && this.recovering) {
        S.auth.mode = "recovery";
        S.auth.status = "out";
        S.auth.recoveryUser = session.user;
        return renderAuth();
      }
      if (session && session.user && S.auth.mode !== "recovery") {
        if (!S.auth.user || S.auth.user.id !== session.user.id) setTimeout(() => this.start(session.user), 0);
        else S.auth.user = session.user;
      } else if (event === "SIGNED_OUT") this.end();
    });
    this.sb.auth.getSession().then(({ data, error }) => {
      this.cleanUrl();
      if (error) {
        S.auth.status = "out";
        S.auth.error = authMsg(error);
        return renderAuth();
      }
      if (data && data.session && data.session.user) {
        if (this.recovering) {
          Object.assign(S.auth, { mode: "recovery", status: "out", recoveryUser: data.session.user });
          renderAuth();
        } else if (S.auth.mode !== "recovery") this.start(data.session.user);
      } else if (S.auth.status === "loading") {
        S.auth.status = "out";
        renderAuth();
      }
    });
    window.addEventListener("online", () => this.reconnect());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.refresh();
    });
  },

  cleanUrl() {
    const u = new URL(location.href);
    const err = u.searchParams.get("error_description") || new URLSearchParams(u.hash.slice(1)).get("error_description");
    if (err) S.auth.error = authMsg({ message: err });
    let dirty = false;
    for (const k of ["code", "error", "error_code", "error_description", "type", "reset"]) if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; }
    if (u.hash && /access_token|error/.test(u.hash)) { u.hash = ""; dirty = true; }
    if (dirty) history.replaceState(null, "", u.pathname + u.search + u.hash);
  },

  collection(uid) {
    const sb = this.sb;
    const run = async (q) => {
      const { data, error } = await q;
      if (error) throw dbErr(error);
      return data;
    };
    const col = {
      limit() { return col; },
      async get() {
        const rows = await run(sb.from(TABLE).select("doc_id, body").eq("user_id", uid).limit(2000));
        return { docs: (rows || []).map((r) => ({ id: r.doc_id, data: () => r.body })) };
      },
      doc(id) {
        return {
          set: (body) => run(sb.from(TABLE).upsert({ user_id: uid, doc_id: id, body }, { onConflict: "user_id,doc_id" })),
          delete: () => run(sb.from(TABLE).delete().eq("user_id", uid).eq("doc_id", id)),
        };
      },
    };
    return col;
  },

  async start(user) {
    S.auth.user = user;
    S.auth.status = "in";
    S.auth.error = "";
    LKEY = "studyflow:v1:" + user.id;
    const cached = Store.loadLocal();
    S.state = SF.normalize(cached || SF.blankState());
    S.rev = null;
    S.modal = null;
    S.ui = { view: "today", tab: {}, menu: null, filters: {}, onb: null };
    try {
      const v = localStorage.getItem(LKEY + ":view");
      if (VIEWS.includes(v)) S.ui.view = v;
    } catch (e) {}
    Store.mode = "offline";
    Store.status = "saving";
    Store.dirty.clear();
    Store.dirtyRes.clear();
    Store.delRes.clear();
    if (!cached) {
      S.auth.status = "syncing";
      renderAuth();
    } else {
      renderAuth();
      render();
    }
    await Store.connect(this.collection(user.id));
    this.lastPull = Date.now();
    if (Store.mode === "offline" && !cached) {
      S.auth.status = "error";
      S.auth.error = "Couldn't reach StudyFlow to load your account. Check your connection and try again.";
      renderAuth();
      this.scheduleRetry();
      return;
    }
    if (!S.state.meta.name) {
      const md = user.user_metadata || {};
      const full = md.given_name || md.full_name || md.name || "";
      if (full) {
        S.state.meta.name = String(full).trim().split(/\s+/)[0].slice(0, 40);
        Store.mark("meta");
      }
    }
    S.auth.status = "in";
    renderAuth();
    render();
    if (Store.mode === "offline") this.scheduleRetry();
  },

  // A* Planner shares this Supabase project; its data sits in public.planners (one row per account, readable by its owner).
  async fetchAstar() {
    if (!S.auth || !S.auth.user) return null;
    const { data, error } = await this.sb.from("planners").select("state").eq("user_id", S.auth.user.id).maybeSingle();
    if (error || !data || !data.state) return null;
    const a = SF.unwrapAstar(data.state);
    return a && (a.assessments.length || a.upcoming.length || a.subjects.length) ? a : null;
  },

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.reconnect(), 20000);
  },

  async reconnect() {
    if (!S.auth.user || Store.mode === "cloud") return;
    clearTimeout(this.retryTimer);
    const hadCache = SF.hasData(S.state) || S.state.meta.onboarded;
    await Store.connect(this.collection(S.auth.user.id));
    if (Store.mode === "cloud") {
      this.lastPull = Date.now();
      if (S.auth.status !== "in") S.auth.status = "in";
      renderAuth();
      render();
      if (hadCache) toast("Back online. Your changes are synced.");
    } else this.scheduleRetry();
  },

  async refresh() {
    if (!S.auth.user || Store.mode !== "cloud") return;
    if (Date.now() - this.lastPull < 30000) return;
    if (S.modal || S.focus || S.rev || Store.dirty.size || Store.dirtyRes.size || Store.delRes.size) return;
    try {
      await Store.chain;
      const changed = await Store.pull(false);
      this.lastPull = Date.now();
      if (changed) {
        render(true);
        toast("Updated with changes from your other device.");
      }
    } catch (e) {}
  },

  async signOut() {
    try {
      await Store.flush();
      await Store.chain;
    } catch (e) {}
    try { localStorage.removeItem(LKEY); localStorage.removeItem(LKEY + ":view"); } catch (e) {}
    await this.sb.auth.signOut().catch(() => {});
    this.end();
  },

  end() {
    clearTimeout(this.retryTimer);
    Store.mode = "local";
    Store.col = null;
    Store.known.clear();
    Store.dirty.clear();
    Store.dirtyRes.clear();
    Store.delRes.clear();
    S.state = SF.normalize(SF.blankState());
    S.auth = { status: "out", mode: "signin", error: "", info: "", busy: false, user: null };
    S.modal = null;
    S.focus = null;
    S.rev = null;
    LKEY = "studyflow:v1";
    const t = $("#toasts");
    if (t) t.innerHTML = "";
    renderModal();
    renderAuth();
  },
};

function dbErr(e) {
  const msg = String((e && e.message) || "");
  if (e && e.code === "23514") return { code: "quota_exceeded", message: msg };
  if (e && (e.code === "PGRST301" || e.code === "42501" || /jwt/i.test(msg))) return { code: "auth", message: msg };
  return { code: "unavailable", message: msg };
}

function authMsg(e) {
  const m = String((e && (e.message || e.error_description)) || "").toLowerCase();
  const code = String((e && (e.code || e.error_code)) || "").toLowerCase();
  if (code === "invalid_credentials" || m.includes("invalid login")) return "That email and password don't match. Check them, or reset your password.";
  if (code === "user_already_exists" || m.includes("already registered")) return "There's already an account with that email. Sign in instead.";
  if (code.includes("rate_limit") || m.includes("rate limit") || (e && e.status === 429)) return "Too many tries right now. Wait a few minutes and try again.";
  if (code === "weak_password" || m.includes("password should")) return "Pick a longer password: at least 8 characters, mixing letters and numbers.";
  if (code === "email_address_invalid" || m.includes("invalid email") || m.includes("email address") && m.includes("invalid")) return "That email address doesn't look right.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "New accounts are turned off right now. Ask your teacher.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Can't reach StudyFlow. Check your internet connection.";
  if (m.includes("same password") || code === "same_password") return "Choose a password you haven't used before.";
  return (e && e.message) || "Something went wrong. Try again.";
}

// ---------- auth screen ----------
function renderAuth() {
  const box = $("#auth"), app = $(".app");
  const a = S.auth;
  const showApp = a.status === "in";
  app.hidden = !showApp;
  box.hidden = showApp;
  if (showApp) {
    box.innerHTML = "";
    const who = $("#side-user");
    if (who && a.user) who.innerHTML = `<span class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.user.email || "")}</span><button type="button" data-act="sign-out">${icon("arrow", "ico-sm")}Sign out</button>`;
    return;
  }
  let inner = "";
  if (a.status === "loading" || a.status === "syncing") {
    inner = `<div class="empty" style="padding:48px 0"><span class="spin" style="width:28px;height:28px"></span><p>${a.status === "syncing" ? "Loading your account…" : "Starting StudyFlow…"}</p></div>`;
  } else if (a.status === "error" && !a.mode) {
    inner = `<div class="alert crit">${icon("alert")}<div>${esc(a.error)}</div></div>`;
  } else if (a.status === "error") {
    inner = `<div class="stack"><div class="alert crit">${icon("alert")}<div>${esc(a.error)}</div></div>
      ${a.user ? `<div class="row-flex"><button type="button" class="btn primary" data-act="auth-retry">Try again</button><button type="button" class="btn ghost" data-act="sign-out">Sign out</button></div>` : `<button type="button" class="btn primary" data-act="auth-reload">Refresh</button>`}</div>`;
  } else if (a.mode === "recovery") {
    inner = `<form class="stack" data-form="auth-newpass"><div><h2>Set a new password</h2><p class="muted small">For ${esc((a.recoveryUser && a.recoveryUser.email) || "your account")}.</p></div>
      <label class="field"><span>New password</span><input class="input" type="password" name="password" id="au-newpass" minlength="8" required autocomplete="new-password"></label>
      ${a.error ? `<div class="alert crit">${icon("alert")}<div>${esc(a.error)}</div></div>` : ""}
      <button class="btn primary" type="submit" ${a.busy ? "disabled" : ""}>${a.busy ? `<span class="spin"></span>` : ""}Save password and sign in</button></form>`;
  } else if (a.mode === "reset") {
    inner = `<div class="stack"><div><h2>Forgot your password?</h2><p class="muted" style="margin-top:6px">Email <b style="user-select:all">${esc(SUPPORT_EMAIL)}</b> from the address you signed up with, and you'll get a new temporary password. Change it in Settings once you're back in.</p></div>
      <button type="button" class="btn ghost" style="align-self:flex-start" data-act="auth-mode" data-mode="signin">${icon("back", "ico-sm")}Back to sign in</button></div>`;
  } else {
    const up = a.mode === "signup";
    inner = `<div class="stack">
      <div class="seg" role="tablist" style="align-self:flex-start"><button type="button" role="tab" aria-pressed="${!up}" data-act="auth-mode" data-mode="signin">Sign in</button><button type="button" role="tab" aria-pressed="${up}" data-act="auth-mode" data-mode="signup">Create account</button></div>
      <form class="stack-sm" data-form="${up ? "auth-signup" : "auth-signin"}">
        ${up ? `<label class="field"><span>First name</span><input class="input" name="name" id="au-name" autocomplete="given-name" required value="${esc(a.name || "")}"></label>` : ""}
        <label class="field"><span>Email</span><input class="input" type="email" name="email" id="au-email" required autocomplete="email" value="${esc(a.email || "")}"></label>
        <label class="field"><span>Password${up ? " (8+ characters, with a letter and a number)" : ""}</span><div class="pw"><input class="input" type="password" name="password" id="au-pass" ${up ? 'minlength="8"' : ""} required autocomplete="${up ? "new-password" : "current-password"}"><button type="button" class="btn ghost xs" data-act="auth-showpass" aria-label="Show password">Show</button></div></label>
        ${a.error ? `<div class="alert crit">${icon("alert")}<div>${esc(a.error)}</div></div>` : ""}${a.info ? `<div class="alert info">${icon("info")}<div>${esc(a.info)}</div></div>` : ""}
        <button class="btn primary" type="submit" style="min-height:46px" ${a.busy ? "disabled" : ""}>${a.busy ? `<span class="spin"></span>` : ""}${up ? "Create account" : "Sign in"}</button>
      </form>
      ${up ? "" : `<button type="button" class="btn ghost sm" style="align-self:flex-start" data-act="auth-mode" data-mode="reset">Forgot your password?</button>`}
    </div>`;
  }
  box.innerHTML = `<div class="auth-wrap">
    <div class="auth-hero">
      <div class="brand" style="color:#fff"><span class="brand-mark" style="background:#fff;color:var(--auth-navy)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h9.5a3 3 0 0 1 0 6h-5a3 3 0 0 0 0 6H19"/></svg></span>StudyFlow</div>
      <h1>Your school week, planned around your actual life.</h1>
      <ul class="auth-points">
        <li>${icon("today")}<span>A plan for today that fits around sport, tuition and everything else</span></li>
        <li>${icon("target")}<span>Finds your weak topics and gives them extra revision before a test</span></li>
        <li>${icon("assignments")}<span>Breaks big assignments into steps with time estimates</span></li>
        <li>${icon("progress")}<span>Grades, streaks and XP that reward real learning</span></li>
      </ul>
    </div>
    <div class="auth-card">${inner}
      <p class="tiny faint" style="margin-top:20px">StudyFlow saves your subjects, assignments, grades and revision progress to your account so you can use it on any device. Only you can see your data. <a href="privacy.html">Privacy</a></p>
    </div>
  </div>`;
  if (S.auth.focusId) {
    const f = document.getElementById(S.auth.focusId);
    if (f) f.focus();
    S.auth.focusId = null;
  }
}

function authBusy(on, extra) {
  Object.assign(S.auth, { busy: on }, extra || {});
  renderAuth();
}

ACT["auth-mode"] = (el) => {
  const email = ($("#au-email") || {}).value;
  Object.assign(S.auth, { mode: el.dataset.mode, error: "", info: "", email: email || S.auth.email, focusId: "au-email" });
  renderAuth();
};
ACT["auth-showpass"] = (el) => {
  const i = $("#au-pass");
  if (!i) return;
  const show = i.type === "password";
  i.type = show ? "text" : "password";
  el.textContent = show ? "Hide" : "Show";
  el.setAttribute("aria-label", show ? "Hide password" : "Show password");
};
ACT["auth-retry"] = () => {
  if (!S.auth.user) return location.reload();
  S.auth.status = "syncing";
  renderAuth();
  Web.start(S.auth.user);
};
ACT["auth-reload"] = () => location.reload();
ACT["sign-out"] = () => Web.signOut();

FORM["auth-signin"] = async (fd) => {
  const email = String(fd.get("email") || "").trim(), password = String(fd.get("password") || "");
  authBusy(true, { error: "", info: "", email });
  const { error } = await Web.sb.auth.signInWithPassword({ email, password });
  if (error) authBusy(false, { error: authMsg(error), focusId: "au-pass" });
};
FORM["auth-signup"] = async (fd) => {
  const name = String(fd.get("name") || "").trim(), email = String(fd.get("email") || "").trim(), password = String(fd.get("password") || "");
  if (password.length < 8 || !/[a-z]/i.test(password) || !/[0-9]/.test(password))
    return authBusy(false, { error: "Use at least 8 characters, with at least one letter and one number.", name, email, focusId: "au-pass" });
  authBusy(true, { error: "", info: "", name, email });
  let res, out = {};
  try {
    res = await fetch(SUPABASE_URL + "/functions/v1/studyflow-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ name, email, password }),
    });
    out = await res.json().catch(() => ({}));
  } catch (e) {
    return authBusy(false, { error: "Can't reach StudyFlow. Check your internet connection." });
  }
  if (!res.ok) {
    if (out.error === "exists") return authBusy(false, { mode: "signin", error: out.message, email, focusId: "au-pass" });
    return authBusy(false, { error: out.message || "Couldn't create your account. Try again in a minute." });
  }
  const r = await Web.sb.auth.signInWithPassword({ email, password });
  if (r.error) authBusy(false, { mode: "signin", info: "Account created. Sign in with your email and password.", email });
};
FORM["change-pass"] = async (fd, f) => {
  const password = String(fd.get("password") || "");
  if (password.length < 8 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) return toast("Use at least 8 characters, with a letter and a number.", "err");
  const btn = f.querySelector("button[type=submit]");
  if (btn) btn.disabled = true;
  const { error } = await Web.sb.auth.updateUser({ password });
  if (btn) btn.disabled = false;
  if (error) return toast(authMsg(error), "err");
  f.reset();
  toast("Password changed.");
};
FORM["auth-newpass"] = async (fd) => {
  const password = String(fd.get("password") || "");
  if (password.length < 8) return authBusy(false, { error: "Pick a password with at least 8 characters." });
  authBusy(true, { error: "" });
  const { data, error } = await Web.sb.auth.updateUser({ password });
  if (error) return authBusy(false, { error: authMsg(error) });
  S.auth.mode = "signin";
  S.auth.busy = false;
  Web.recovering = false;
  const { data: sess } = await Web.sb.auth.getSession();
  if (sess && sess.session) Web.start(sess.session.user);
  else authBusy(false, { info: "Password saved. Sign in with it now." });
};
