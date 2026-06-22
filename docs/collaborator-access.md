# Collaborator Access — Joe (Payroll)

_Last updated: 2026-06-15_

## Goal

Give Joe full access to build **and** operate the payroll feature, while keeping
**D as the only person who can ship to production** (deploys + live database changes).

## The one control that matters

Production deploys and production DB migrations both flow from merges into `main`.
Lock `main` to D and Joe can have full read/write everywhere else without ever being
able to push live.

---

## Track 1 — Operating payroll in the app

Joe gets the **`admin`** role. Keep **`owner`** for D alone.

- The app treats `owner + admin + manager` as "leadership," which sees everything
  including pay (`useAuth.tsx`: `isLeadership`). So `admin` already grants full
  payroll access — no code change needed.
- `owner` stays the single top tier (D only).

**Steps**
1. Joe signs in once to create his account.
2. D opens **System Users** → finds Joe → **Change Role** → `admin`.

---

## Track 2 — Code access, D ships only

### GitHub (`sandoval-art/JOI-payroll-hr`)
1. Settings → Collaborators → add Joe with **Write** access.
2. Settings → Branches → add a protection rule for `main`:
   - Require a pull request before merging.
   - Require review approval (so Joe can't self-merge).
   - Do **not** add Joe to any "bypass" list.
3. Joe works on feature branches and opens PRs. **D reviews and merges.**

### Supabase / production database
- Do **not** add Joe to the production Supabase project.
- Joe writes migration SQL as files inside his PRs.
- **D is the only one who applies migrations to the live database** (existing
  migrate-via-merge workflow).
- Result: Joe needs no Supabase dashboard access.

### Deploys
- If Vercel auto-deploys from `main`, protecting `main` already means only D's
  merges reach production. No extra step.

---

## Why not full admin on GitHub / prod?

Payroll holds the most sensitive data in the app (pay, bank details, terminations,
finiquito amounts). Branch protection costs nothing now and is painful to retrofit.
It lets Joe move fast on branches while guaranteeing a careless migration or a bad
merge can't hit live pay data without D's review.
