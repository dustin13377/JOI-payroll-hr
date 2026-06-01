# Session Handoff

**Saved:** 2026-06-01T15:11:00-06:00
**Machine:** Diomedess-Mac-mini (Mac mini)
**Branch:** main
**Last commit:** 6d12545 session-handoff: EOD digest 401 fix + RLS gotcha + auto-clockout EOD bug discovered (SESSION.md)

## What we were doing

Prepping the HFB May 2026 invoice. HFB pays in advance, so D needed an accurate count of missed days to deduct. We merged the dialer "TimeSheetStandard" CSV (pre-cutover system) with JOI's `time_clock` data, identified real absences vs. data divergences, and backfilled JOI with the pre-May 11 attendance the CSV held. HFB sign-off on the numbers is pending before D sends the invoice.

Side work: rotated the apex MCP API key (old one was partially exposed in chat). Set up a dual Supabase MCP config — one server per org — so JOI and personal projects are both reachable in the same session.

## Files in flight

- `HFB_BACKFILL_2026-05_TIMECLOCK.sql` — 36-row backfill into `time_clock` covering May 1–8 for 8 HFB agents (Diego, Francisco, Ivana, Lucia, Marisol, Sebastian, Sofia, Ubaldo). Already executed against prod JOI; file kept for audit. Times converted from Mexico Central (UTC-6) to UTC.
- `~/Library/Application Support/Claude/claude_desktop_config.json` (local-only, NOT in repo) — now has `apex` (rotated key), `supabase-joi` (sandoval-art org token), `supabase-personal` (other org token).

## Decisions made this session

- **JOI is source of truth from May 11+** for HFB attendance. CSV used only for May 1–8 (pre-cutover).
- **MX mandatory holidays bill at standard rate** when unworked (e.g., May 1 Labor Day). Worked holidays still 3× per LFT Art. 75. Don't deduct holidays from missed-day count.
- **Sebastian's May 1 work was a different campaign**, not HFB — dropped from backfill so HFB isn't charged.
- **Aldo, Mauro, Gibran** are HFB agents not in the dialer CSV. Decided to use JOI alone for them; pre-May 11 assumed present.
- **Wendy Mena** has `daily_bill_rate = 0` (internal/training) — skip on invoice.
- **Final missed-day deductions:** Sebastian 2 days ($160), Francisco 4 ($320), Ivana 6 ($480), Aldo 4 ($320), Mauro 4 ($320), Gibran 4 ($320), Diego/Lucia/Marisol/Sofia/Ubaldo 0. Total $1,920 across ~24 days. **Not yet confirmed with HFB.**

## Open todos

- [ ] Wait for HFB to confirm the missed-day handling and final numbers
- [ ] Send the HFB May invoice once confirmed
- [ ] Investigate Sofia Corrales May 25–29 divergence — CSV said absent, JOI shows full 7.6–8 hr shifts. Possible work-not-done issue (clocked in but not productive on HFB tasks) — worth flagging to her TL
- [ ] Investigate Francisco May 25 + May 28 — JOI clock_in/out exist but `total_hours` is null and times look manually entered (identical 13:50→23:20 both days)
- [ ] Aldo + Mauro both went silent May 25–28 (no JOI rows) — confirm reason
- [ ] If laptop is the next machine: update `claude_desktop_config.json` with the new apex key, add `supabase-personal` block if you want both orgs reachable

## Next step when you come back

Once HFB confirms, generate and send the May invoice via the existing invoice flow (`FacturaNueva` / `generate_weekly_invoices` RPC — but note HFB is monthly, not weekly). Cross-reference the deduction table from this session before sending.

## Watch out for

- **Apex MCP will fail on the laptop** until you update `~/Library/Application Support/Claude/claude_desktop_config.json` with the rotated key (old `apex_3d0457ca...` was revoked). Same goes for the dual Supabase setup if you want both orgs on the laptop.
- **Three new memory entries** I wrote (HFB JOI cutover date, MX holidays paid standard rule, dual-Supabase reference) live in this Mac mini's Cowork memory space — they won't appear in long-term memory on the laptop.
- **`time_clock` has no UNIQUE constraint** on `(employee_id, date)`. Re-running `HFB_BACKFILL_2026-05_TIMECLOCK.sql` would create duplicates. Treat the file as a one-shot artifact.
- **2 commits ahead of origin before this save** (the earlier session-handoff commits `6dfa2d6` + `6d12545` were never pushed). After this save, you'll be 3 commits ahead — push needs to go through.
- Sandbox couldn't run `git add/commit/push` (hard rule). Commands are below for you to paste in terminal.
