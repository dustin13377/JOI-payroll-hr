# Clock-In Alerts

Emails team leads and managers when agents have not clocked in after their shift starts, and escalates to management if anyone is still not clocked in later. Built on the same infrastructure as the EOD digest (`send-eod-digest`) so the operational patterns match.

## Why

Too many agents were forgetting to clock in. This puts a single, consolidated list in front of the responsible team lead each morning, and gives management an automatic escalation when a team still isn't in — so accountability for a team's attendance sits with its lead.

## How it works

A pg_cron job (`clock-in-alerts-check`) hits the `clock-in-alerts` edge function every 5 minutes. The function figures out which campaigns are due and which stage to fire. There are two stages per campaign per day:

**Initial alert** — fires once, `initial_delay` minutes after the shift's grace period ends (default 15 min, so ~25 min after an 8:00 start with a 10-min grace). One email goes to the campaign's team lead(s) **and** the managers, listing everyone who hasn't clocked in. If nobody is missing, no email is sent (a zero-count row is still logged so it doesn't re-check all day).

**Escalation** — fires `escalation_delay` minutes after grace ends (default 60 min). It re-checks who is *still* not clocked in. If anyone remains, it escalates to the managers and owner (team leads kept on the thread), noting when the team lead was first notified. This is the accountability step.

### Who counts as "not clocked in"

Deliberately narrow, to avoid false alarms (the whole point is to stop people ignoring the emails). An agent is listed only if **all** of these are true:

- Active, non-system employee assigned to the campaign (`employees.campaign_id`)
- Has an app login (`user_profiles` row) — agents the TL clocks in for are excluded
- Not on approved PTO for the date (`vacation_requests`)
- No `time_clock` row with a `clock_in` for the date

This is the same bucketing the EOD digest calls "did not work."

### Who gets the emails

- **Team lead(s):** resolved from `campaigns.team_lead_id` **and** `team_lead_campaigns` (so multi-TL campaigns like SLOC/MCA all get it), via `employees.email`.
- **Managers:** all `user_profiles` with role `manager` (escalation also includes `owner`), via their linked `employees.email`.
- **Extra recipients:** any active `campaign_eod_recipients` rows with `role_label` `tl` or `manager` for that campaign.

All addresses are de-duplicated case-insensitively.

### Timing

Fire times come from `shift_settings` (start time + grace) per campaign, computed by the `campaigns_clock_in_alert_times()` RPC. Multi-shift campaigns use the **earliest** shift start of the day. Timezone is the campaign's `eod_digest_timezone` (default `America/Denver`).

The two delays are stored in `app_config` and can be changed without redeploying:

| Key | Default | Meaning |
| --- | --- | --- |
| `clock_in_alert_initial_delay_min` | `15` | Minutes after grace ends to send the initial alert |
| `clock_in_alert_escalation_delay_min` | `60` | Minutes after grace ends to escalate |

Per-campaign on/off: `campaigns.clock_in_alert_enabled` (defaults `true`).

## Double-send guard

`clock_in_alert_log` holds one row per `(campaign_id, alert_date, stage)`, with a unique constraint. The function refuses to send a stage twice and records recipients, the missing list, dry-run flag, SMTP message id, and any error.

## Configuration / secrets

Set on the `clock-in-alerts` edge function (same Gmail creds as the other senders):

- `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- `CRON_SECRET` — must match `app_config.cron_secret`
- `APP_URL`, `APP_DOMAIN`
- `DRY_RUN_CLOCK_IN` — **safe default is dry-run.** Leave unset (or `true`) to log only; set to `false` to send real email. Independent of the other functions' dry-run flags.

## Rollout

1. Merge the PR — CI deploys the function and runs the migrations.
2. Confirm the function secrets are set (copy from `send-eod-digest`; add `DRY_RUN_CLOCK_IN`).
3. Leave `DRY_RUN_CLOCK_IN` unset for a day and watch `clock_in_alert_log` (and the function logs) to confirm the right people are being flagged.
4. When the lists look right, set `DRY_RUN_CLOCK_IN=false` to start sending.

## Known limitations / future

- **Multi-shift campaigns** use the earliest shift start, so late-shift agents could be briefly flagged before their own shift. Nearly all active campaigns are single-shift today; revisit per-shift handling if that changes.
- No weekly accountability scorecard yet (per-team no-show/late trend). The `clock_in_alert_log` table already captures the history needed to build one — a natural next step if escalation alone isn't enough.
