# Session Handoff Routine

Keep `SESSION.md` current so picking up on another machine (or after a few days away) doesn't require reverse-engineering the git log — which is exactly what happened on 2026-06-22 when the handoff had gone stale since June 1.

## The routine

A scheduled task fires every **weekday at ~7:00 PM Central** and:
1. Reads the git reflog to summarize the day's commits
2. Rewrites `SESSION.md` from that
3. Hands back a paste-ready `git commit` / `git push` block

It does **not** push on its own — the Cowork sandbox can't run git against this repo, so you run the final commit/push in a terminal. The task only runs while the Claude desktop app is open; if it's closed at 7pm, it runs on next launch.

## Important: each machine needs its own task

Scheduled tasks are stored **locally** (`~/Documents/Claude/Scheduled/`) and are **not** synced through git. The 7pm timer currently exists only on the **MacBook Air**. To get the same behavior on the **Mac mini** (or any other machine), set it up there once:

> Open the Claude desktop app on that machine and say:
> *"Schedule /save-session to run every weekday at 7pm"*

…or recreate it directly with these settings:

- **Schedule (cron, local time):** `0 19 * * 1-5`  (7:00 PM, Mon–Fri)
- **What it does:** reconstruct today's work from `.git/logs/HEAD`, rewrite `SESSION.md`, output the commit/push commands
- **Repo path:** `/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr`

## Manual fallback (any machine, any time)

Run `/save-session` in a Claude session, or just commit the handoff yourself:

```bash
cd "/Users/admin000/Desktop/JOI Payroll/JOI-payroll-hr"
git add SESSION.md
git commit -m "session-handoff: <one-line summary of the day>"
git push
```

## Gotchas

- **Cowork can't push for you.** The sandbox can read the repo and rewrite `SESSION.md`, but the `commit`/`push` is yours to run in a terminal.
- **`main` is branch-protected.** Pushing a handoff straight to `main` bypasses the PR rule (harmless for docs, but it'll log a "Bypassed rule violations" notice).
- **Don't commit** `.claude/settings.local.json` or `*.tsbuildinfo` — both are local/build artifacts.
- The task only runs while the Claude app is open on that machine.
