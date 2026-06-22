# Session Handoff

**Saved:** 2026-06-22 (Cowork session)
**Machine:** admins-MacBook-Air (MacBook Air)
**Branch:** main — up to date with origin/main (nothing to push for code)
**Last commit:** 1fb543e chore: remove stale payroll-run / Phase 4c comments from sidebar (#107)

## What we were doing

Reconstructed from git history because the previous SESSION.md was stale (June 1). Last week was a payroll / spiffs / invoicing overhaul, all merged to `main` via PRs #102–#107 and already pushed. **No feature work is currently in flight** — the working tree only holds stray docs and build artifacts.

## Shipped last week (all on main, pushed)

- **Payroll rebuild (#102):** quincenal pre-payroll, lock + history, spiffs, paystubs — `payrollEngine` + tests, `PrePayroll`, `PrepayHistory`, `send-paystubs` edge fn
- **Deploy status (#103):** `prepay_lines` + `send-paystubs` live; base/spiffs migrations held back
- **Retired legacy weekly payroll UI (#104)** — prepay is the only entry point
- **Pagination (#105):** 15/50/100 on PrePayroll, PrepayHistory, Empleados
- **Reincidencia unlink fix (#106)** on acta drafts
- **Sidebar cleanup (#107)**
- **Earlier in week:** Spiffs v2 (first-class `spiffs` table, TL entry page, invoicing attach/detach RPCs, retired Sheet importer); invoice "Paid Monthly" status; invoice vacation billing + out-of-window punch-gap detection (`clients.bill_vacation`, Torro=true); clock-in alert emails (TL + manager + escalation)

## Recruiting subsystem (shipped May 28 – June 11, not last week)

A full recruiting MVP is on `main` in this repo. MVP merged **May 28–29**; polish through **June 11** (latest: position-fit tags + recruiter notes). Nothing in the last 7 days — last week was payroll/spiffs/invoices only. The "layout" work D half-remembers is most likely the June 10–11 recruiting-page polish (Calendly link, HR calendar card, dropdown roles, position-fit tags).
- Data model: `recruiting_candidates / _messages / _interviews` tables + RLS, SECURITY DEFINER trigger fns, CURP column + dedup index
- Inbound pipeline: `inbound-application` edge fn (Postmark webhook → DB upsert), TDD email parser, CSV backfill from Gmail, one-off Postmark replay script
- UI: `/recruiting` route (leadership only), candidate table with stage badges + search/filter, candidate detail drawer + stage selector, sidebar entry
- Outreach/scheduling: WhatsApp interview invite (US/intl phone handling) + Contacted stage, Calendly booking link, HR interview calendar card + `hr-calendar` edge fn, interview reminder banner, position-fit tags + recruiter notes
- Live cutover recorded (real Postmark address + Gmail backlog note)

## Working tree right now (uncommitted)

- `modified: .claude/settings.local.json` — local-only, **do not commit**
- Untracked docs (worth committing): `docs/collaborator-access.md`, `docs/superpowers/plans/2026-06-19-invoice-generator-vacation-gaps.md`, `docs/superpowers/plans/2026-06-19-spiffs-invoicing-link.md`, `docs/superpowers/plans/2026-06-19-spiffs-tl-entry.md`
- `generate_seed.sql` — untracked; decide whether it belongs in the repo (may hold seed data) or stays local
- Build artifacts: `tsconfig.app.tsbuildinfo`, `tsconfig.node.tsbuildinfo` — should be **gitignored**, never committed

## Open todos

- [ ] Commit the 4 untracked docs (or .gitignore them if intentionally local)
- [ ] Add `*.tsbuildinfo` to `.gitignore`
- [ ] Decide on `generate_seed.sql` (commit vs. keep local)
- [ ] Recruiting MVP shipped May 28 – June 11 (see section above), already on `main` — no open recruiting work from last week
- [ ] Payroll: base/spiffs migrations still held (not deployed) per #103 — confirm before next payroll run

## Next step when you come back

Nothing blocking — `main` is clean and pushed. Triage the untracked files (commit docs, gitignore build artifacts), then continue the payroll rework with Joe (finish quincenal base + lock periods) per `docs/payroll-rework.md`.

## Watch out for

- `main` already matches `origin` — no code push needed. Only SESSION.md + any doc commits below.
- Never commit `.claude/settings.local.json` or `*.tsbuildinfo`.
- The Cowork shell can't run git against this repo — use the paste-ready commands provided in chat.
