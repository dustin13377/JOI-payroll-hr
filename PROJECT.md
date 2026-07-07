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
- Vercel team: sandoval028-ctrl's projects (team_TgZIxkTdx9kJf2hmKmZw1RdO)
- This app does NOT appear under that team (only apex-digital + the-living-word do).
- TODO: confirm where the recruiting tool is actually deployed.

## Key tables (recruiting)
- recruiting_candidates — candidate profiles (stage, final_status, source, notes)
- recruiting_interviews — one row per interview; outcome + candidate_id (required) + event_key
- recruiting_positions, recruiting_messages

## Notes
- Interviews require a linked candidate_id, so any calendar event without a
  matched profile needs a profile created before an outcome can be recorded.
