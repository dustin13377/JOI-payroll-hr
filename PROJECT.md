# JOI Recruitment Tool — project map

Read this first. It says which accounts and services this app is wired to,
so nothing gets confused with your other projects (apex-digital, the-living-word, etc.).

## Code
- GitHub repo: https://github.com/sandoval-art/JOI-payroll-hr
- Stack: Vite + React + TypeScript + shadcn/ui (deploys to Vercel via vercel.json)
- This folder should contain a clone of that repo.

## Database (Supabase)
- Project name: joi-hr
- Project ref / id: jpaihltkrohdqkqlbqkf
- Region: us-east-1
- Status: active
- Connector to use: supabase-joi
- Note: there is a second Supabase project ("sandoval-art's Project",
  ref gveewblbxqqrckwoxgvj) — NOT this app. Don't touch it.

## Hosting (Vercel)
- Live URL: https://app.justoutsource.it  (recruiting at /recruiting; unauthenticated hits redirect to /auth)
- Auto-deploys from GitHub `main` on push (confirmed 2026-07-07: pushing c2e8cef put the new
  recruiting buttons into the live JS bundle without any manual deploy step).
- To verify a deploy without logging in: fetch the /assets/index-*.js bundle from the live URL
  and grep for a known new string (e.g. "offer_extended").
- Vercel team visible to Claude (sandoval028-ctrl's projects, team_TgZIxkTdx9kJf2hmKmZw1RdO) only
  shows apex-digital + the-living-word, so this app's Vercel project sits under a different
  scope/account not exposed to the connector. The GitHub→Vercel integration still deploys it fine.

## Key tables (recruiting)
- recruiting_candidates — candidate profiles (stage, final_status, source, notes)
- recruiting_interviews — one row per interview; outcome + candidate_id (required) + event_key
- recruiting_positions, recruiting_messages

## Notes
- Interviews require a linked candidate_id, so any calendar event without a
  matched profile needs a profile created before an outcome can be recorded.
