// StudyFlow sign-up: creates a confirmed email/password account without sending any email.
// The project's built-in email sender only delivers to team members, so the normal signUp() flow
// cannot reach students. Accounts on this project are auto-confirmed anyway (auth.users trigger).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://ahaan001.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];
const PER_IP_PER_HOUR = 60; // a whole class on one school network still fits
const ALL_PER_HOUR = 600;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "method_not_allowed" });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply(origin, 403, { error: "forbidden_origin" });

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return reply(origin, 413, { error: "too_large" });
    body = JSON.parse(raw);
  } catch {
    return reply(origin, 400, { error: "bad_request", message: "Couldn't read that. Try again." });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return reply(origin, 400, { error: "invalid_email", message: "That email address doesn't look right." });
  }
  if (password.length < 8 || password.length > 72) {
    return reply(origin, 400, { error: "weak_password", message: "Pick a password with 8 to 72 characters." });
  }
  if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
    return reply(origin, 400, { error: "weak_password", message: "Use at least one letter and one number in your password." });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Throttle by salted IP hash.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256(serviceKey.slice(-16) + "|" + ip);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [mine, all] = await Promise.all([
    admin.from("studyflow_signup_log").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
    admin.from("studyflow_signup_log").select("id", { count: "exact", head: true }).gte("created_at", hourAgo),
  ]);
  if ((mine.count ?? 0) >= PER_IP_PER_HOUR || (all.count ?? 0) >= ALL_PER_HOUR) {
    return reply(origin, 429, { error: "rate_limited", message: "Lots of sign-ups right now. Wait a few minutes and try again." });
  }
  await admin.from("studyflow_signup_log").insert({ ip_hash: ipHash });
  if (Math.random() < 0.05) {
    await admin.from("studyflow_signup_log").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString());
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, signup_app: "studyflow" },
  });
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (error.status === 422 || msg.includes("already") || msg.includes("exists")) {
      return reply(origin, 409, { error: "exists", message: "There's already an account with that email. Sign in instead." });
    }
    if (msg.includes("password")) {
      return reply(origin, 400, { error: "weak_password", message: "That password isn't allowed. Try a longer one." });
    }
    console.error("createUser failed", error.status, error.message);
    return reply(origin, 500, { error: "failed", message: "Couldn't create your account. Try again in a minute." });
  }
  return reply(origin, 200, { ok: true });
});
