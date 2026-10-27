# StudyFlow

A study planner for Grade 9 students. It plans each day around real free time, finds weak topics before tests, breaks assignments into timed steps, and tracks grades, streaks and XP.

**Live site:** https://ahaan001.github.io/studyflow/

## How it works

- **Frontend:** one static page (`index.html`), plain JavaScript, no build tools beyond `build.py`.
- **Accounts and data:** Supabase Auth (email and password) and one Postgres table, `studyflow_docs`, with row-level security so each student can only read and write their own rows.
- **Sign-up:** the `studyflow-signup` Edge Function creates confirmed accounts without sending email (the built-in Supabase email sender only reaches project team members). It throttles by hashed IP using `studyflow_signup_log`.
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
| `supabase/migrations/` | SQL for the `studyflow_docs` table, its policies, and the sign-up throttle log. |
| `supabase/functions/studyflow-signup/` | Edge Function that creates accounts (deploy with `verify_jwt` off). |
| `privacy.html` | Privacy page, linked from the sign-in screen and Google's consent screen. |

## Making changes

Edit files in `src/`, then rebuild `index.html`:

```bash
python3 build.py
```

Commit both `src/` and `index.html`; Pages serves `index.html`.

## Supabase settings this needs

1. **Authentication → URL Configuration → Redirect URLs:** include `https://ahaan001.github.io/studyflow/**`.
2. **Edge Function `studyflow-signup`** deployed with JWT verification off. Add your own origin to `ALLOWED_ORIGINS` if you host the site elsewhere.
3. **Password resets:** the built-in email sender can't reach students, so a forgotten password is reset by the admin in the SQL editor:

   ```sql
   update auth.users set encrypted_password = crypt('TemporaryPass1', gen_salt('bf'))
   where email = 'student@example.com';
   ```

   The student signs in with the temporary password and changes it in Settings. Connecting custom SMTP (Authentication → Emails → SMTP) would make resets self-service.

The publishable key in `src/web.js` is meant to be public; row-level security is what protects student data.

## Local testing

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/.
