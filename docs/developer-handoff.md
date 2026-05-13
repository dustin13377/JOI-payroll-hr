# Developer Handoff — JOI Payroll HR

This document covers everything an external developer needs to know to deploy, host, or take over the JOI Payroll HR app. Read `HANDOFF.md` in the root for the full architecture and feature history.

---

## Stack

- **Frontend:** React + TypeScript + Vite + TanStack React Query + shadcn/ui + Tailwind
- **Backend/DB:** Supabase (Postgres + Auth + Edge Functions + Storage + pg_cron)
- **Email:** Gmail SMTP via `EOD@justoutsource.it` (App Password required — see below)
- **CI/CD:** GitHub Actions (`.github/workflows/supabase-deploy.yml`)
- **Current hosting:** TBD — previously targeted Vercel but not yet deployed

---

## Supabase Project

| Field | Value |
|---|---|
| Project ref | `jpaihltkrohdqkqlbqkf` |
| Region | (check Supabase dashboard) |
| Dashboard | https://supabase.com/dashboard/project/jpaihltkrohdqkqlbqkf |

---

## Frontend Environment Variables

The app reads two vars at build time. Copy `.env.example` and fill in:

```
VITE_SUPABASE_URL=https://jpaihltkrohdqkqlbqkf.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Supabase dashboard → Settings → API>
```

For Vercel: set these under **Project Settings → Environment Variables**. Never commit them to the repo.

---

## Supabase Edge Function Secrets

These are project-level secrets accessible to all edge functions. Set them under:
**Supabase Dashboard → Settings → Edge Functions → Secrets**

| Secret | Description | Example value |
|---|---|---|
| `APP_URL` | Full URL of the deployed frontend | `https://joi-payroll-hr.vercel.app` |
| `APP_DOMAIN` | Domain only (no protocol) | `joi-payroll-hr.vercel.app` |
| `REPLY_TO_EMAIL` | HR reply-to address for emails | `humanresources@justoutsource.it` |
| `CRON_SECRET` | Shared secret for pg_cron → edge function calls | (see app_config table in DB) |
| `GMAIL_USER` | Gmail sender address | `EOD@justoutsource.it` |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not the account password) | (generated in Google account security) |
| `DRY_RUN_EOD` | Set to `false` to enable real EOD digest emails | `false` |
| `DRY_RUN_COMPLIANCE` | Set to `false` to enable real compliance notification emails | `false` |
| `DRY_RUN_HOLIDAY` | Set to `false` to enable real holiday/PTO notification emails | `false` |
| `ALLOWED_ORIGIN` | CORS origin for edge functions (used by `provision-org`, `holiday-notifications`, `compliance-notifications`, `notify-hr-request-filed`, `get-hr-document-signed-url`) | `https://app.justoutsource.it` |
| `APP_SUPABASE_KEY` | Anon/publishable key for edge functions that need user-scoped clients. See "Edge function anon key pattern" below. | `sb_publishable_...` |

> **Note:** All of the above are already set on the current JOI Supabase project. If standing up a fresh Supabase project, every secret needs to be re-entered.

### Edge function anon key pattern

Supabase auto-injects a `SUPABASE_ANON_KEY` env var into every edge function. Historically this contained the legacy JWT-format anon key. With the rollout of `sb_publishable_...` keys (legacy keys retire end of 2026), edge functions that need an anon key should read `APP_SUPABASE_KEY` first and fall back to the auto-injected var:

```ts
const SUPABASE_ANON_KEY =
  Deno.env.get("APP_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
```

This decouples our functions from the legacy/publishable transition: when the legacy key is disabled, the functions keep working because they're reading our explicit secret. Drop the second fallback once the legacy key is fully retired.

**Use the anon key when:** verifying a caller's JWT (`auth.getUser(token)`) or creating a user-scoped client that respects RLS. **Use `SUPABASE_SERVICE_ROLE_KEY` instead when:** the function needs to bypass RLS (reading across users, generating signed URLs from storage, writing to leadership-only tables).

Currently using this pattern: `holiday-notifications`, `get-hr-document-signed-url`.

---

## GitHub Actions (CI/CD)

The workflow at `.github/workflows/supabase-deploy.yml` auto-deploys edge functions on every push to `main`.

Two GitHub repository secrets are required:

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Supabase dashboard → Project Settings → Database → Database password |

Set these under **GitHub repo → Settings → Secrets and variables → Actions**.

### Important: migrations are NOT auto-deployed

The `db push` step is intentionally disabled in CI due to migration filename collisions in the repo history. All database migrations are applied manually via the Supabase MCP after merging. Do not assume a merged PR has applied its migration — check `supabase/migrations/` and apply any new files via the Supabase SQL editor or MCP.

---

## Database Migrations

All migration files are in `supabase/migrations/`. Run them in order (by filename timestamp) on a fresh database. See the numbered list in `HANDOFF.md → Database migrations` for a description of what each file does.

**Do not run the dev seed files on any non-JOI instance:**
- `supabase/dev-seed/03_joi_employees.sql` — 53 real JOI employees with names
- `supabase/dev-seed/04_joi_salaries.sql` — real salary data

These are JOI-specific and must stay off any white-label or staging database.

---

## Gmail SMTP Setup

The `send-eod-digest`, `compliance-notifications`, and `holiday-notifications` edge functions send email via Gmail SMTP. Requirements:

1. A Gmail account (or Google Workspace account) — currently `EOD@justoutsource.it`
2. **2-Factor Authentication must be enabled** on the Google account
3. Generate an **App Password** under Google account → Security → 2-Step Verification → App Passwords
4. Store the App Password as the `GMAIL_APP_PASSWORD` Supabase secret (never in the repo)

If switching to a different email provider, the edge functions use `nodemailer` — update the SMTP transport config inside the functions.

---

## Multi-Tenancy

The app is fully multi-tenant. Each customer is an "organization" in the `organizations` table. All data is org-scoped via Row Level Security.

To provision a new customer org:
1. Log in as an **owner** role user
2. Navigate to `/admin/provision-org`
3. Fill in org name, slug, owner email, and owner full name
4. The `provision-org` edge function handles the rest: creates the org, an employee record, and sends an Auth invite to the owner email

New orgs get their own employee ID prefix (e.g. `ACME-0001`) set at provisioning time. JOI uses `JOI-XXXX`.

---

## Role Model

Five-tier hierarchy: `owner → admin → manager → team_lead → agent`

| Role | Access |
|---|---|
| owner / admin / manager | Full access including payroll and pay info |
| team_lead | Team-scoped data, no pay info |
| agent | Own data only |
| client | Client portal — own campaign EOD summaries only |

Route gating is handled by `<RequireLeadership>`, `<RequireTeamLeadOrAbove>`, and `<RequireOwner>` wrappers in `src/components/RequireRole.tsx`.

---

## Key Files

| File | Purpose |
|---|---|
| `HANDOFF.md` | Full project history, architecture, migration log, what's built, what's left |
| `.env.example` | Required frontend environment variables |
| `supabase/config.toml` | Supabase project ID + edge function JWT settings |
| `supabase/migrations/` | All database migrations in order |
| `supabase/functions/` | Edge functions (email sending, org provisioning, signed URLs) |
| `src/hooks/useAuth.tsx` | Auth context — role booleans, loading state |
| `src/components/RequireRole.tsx` | Route guards |
| `src/App.tsx` | Routing + AuthProvider |
| `docs/security/rls-audit-2026-04-16.md` | RLS audit notes |

---

## Questions to Align On

Before starting, confirm the following with JOI:

1. **Hosting platform** — Vercel, Netlify, self-hosted, or other? The app is a standard Vite SPA so any static host works. `APP_URL` and `ALLOWED_ORIGIN` secrets need to match the final domain.
2. **Supabase project** — Using the existing JOI project or standing up a fresh one? Fresh = re-apply all migrations + re-enter all secrets.
3. **Email sender** — Keep `EOD@justoutsource.it` or switch? If switching, update `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `REPLY_TO_EMAIL` secrets.
4. **Custom domain** — If the app gets a custom domain, update `APP_URL`, `APP_DOMAIN`, and `ALLOWED_ORIGIN` in Supabase secrets.
