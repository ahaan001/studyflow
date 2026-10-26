# StudyFlow

A study planner for Grade 9 students. It plans each day around real free time, finds weak topics before tests, breaks assignments into timed steps, and tracks grades, streaks and XP.

**Live site:** https://ahaan001.github.io/studyflow/

## How it works

- **Frontend:** one static page (`index.html`), plain JavaScript, no build tools beyond `build.py`.
- **Accounts and data:** Supabase Auth (email/password and Google) and one Postgres table, `studyflow_docs`, with row-level security so each student can only read and write their own rows.
- **Hosting:** GitHub Pages from the `main` branch root.

## Project layout

| Path | What it is |
|---|---|
| `src/logic.js` | Planner, workload forecast, grades, spaced repetition, XP, quick-add parser. No DOM. |
| `src/core.js` | State, saving (cloud plus offline cache), rendering, toasts, modals. |
| `src/views.js` | Today, Subjects, Revision, Assignments, Progress, Settings, onboarding. |
| `src/actions.js` | Button, form and input handlers. |
| `src/web.js` | Supabase client, sign-in screen, account sessions. |
| `src/main.js` | Global event wiring and boot. |
| `src/style.css`, `src/web.css` | Styles (light and dark). |
| `src/shell.html` | Page markup. |
| `supabase/migrations/` | SQL for the `studyflow_docs` table and its policies. |
| `privacy.html` | Privacy page, linked from the sign-in screen and Google's consent screen. |

## Making changes

Edit files in `src/`, then rebuild `index.html`:

```bash
python3 build.py
```

Commit both `src/` and `index.html`; Pages serves `index.html`.

## Supabase settings this needs

In the Supabase dashboard for the project in `src/web.js`:

1. **Authentication → URL Configuration → Redirect URLs:** include `https://ahaan001.github.io/studyflow/` (and `http://localhost:8000/` for local testing).
2. **Authentication → Sign In / Providers → Google:** enabled, with a Google Cloud OAuth client whose authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Email sign-up at school scale:** the built-in email sender only allows a few emails per hour. Either connect custom SMTP (Authentication → Emails → SMTP) or turn off "Confirm email".

The publishable key in `src/web.js` is meant to be public; row-level security is what protects student data.

## Local testing

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/.
