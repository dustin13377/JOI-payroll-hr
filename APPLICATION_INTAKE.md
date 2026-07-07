# How applicant emails get into the tool

_Last updated: 2026-07-07_

## The short version

An applicant submits the Gravity Forms job form on justoutsource.it → the site
emails the application to **humanresources@justoutsource.it** → a **Google Apps
Script** in that account reads it and hands it to the Supabase edge function
**`inbound-application`**, which parses it and inserts a row into
**`recruiting_candidates`**. The tool just displays those rows.

## What changed (and why)

Originally the delivery step was **Postmark** (Form → email → Postmark inbound
webhook → `inbound-application`). On **2026-07-06 ~5pm MDT**, Postmark hit its
free-tier cap of **100 emails/period**. Everything after Pablo Rivera (Jul 6,
4:55pm) got stuck in Postmark's "Queued" state and never reached the tool — a
clean, silent cutoff. Applicants were dropping without any error.

We couldn't use the two obvious fixes: the site has **no valid Gravity Forms
license** (so no Webhooks add-on to POST the form directly), and we **don't
control the domain's DNS** (so we can't swap in a free inbound-email service).

Since the applications already land in a Google mailbox we own, we cut Postmark
out entirely and replaced it with a small script that reads that inbox directly.
Free, no per-message limit, and it reuses the exact parser the tool already had.

## The moving parts now

- **Google Apps Script** — `gmail-application-bridge.gs` (a copy lives in this
  repo). Runs in the **humanresources@justoutsource.it** Google account on a
  **time-driven trigger every 5 minutes**.
  - Searches for: `from:mail@justoutsource.it subject:"New Application -
    Employment Application" -label:JOI-Ingested` (this is **Form 7**, the live
    application form — despite its "(Staging)" name).
  - Posts each new email to the endpoint as `{From, Subject, Date, HtmlBody,
    TextBody}` with `?secret=` (same shape Postmark used).
  - Labels handled emails **`JOI-Ingested`** so nothing is processed twice.
  - `CUTOFF_ISO = 2026-07-06T22:55:04Z`: emails at/before this were already in
    the tool via Postmark, so the script marked them done **without** resending
    (that's why the first run reported "backlog adopted: 46, delivered: 0").
  - Script Properties required: `ENDPOINT_URL`, `INBOUND_SECRET`, `CUTOFF_ISO`.

- **Supabase edge function `inbound-application`** — unchanged. Verifies the
  secret, parses the Gravity Forms email HTML (`parser.ts`), dedups by CURP,
  inserts into `recruiting_candidates`.

- **Postmark** — no longer in the loop. Left alone as a dead backup; safe to
  ignore.

## If applications stop showing up again

1. In the humanresources@ Google account, open **script.google.com** →
   the intake project → check the **Executions** log for errors.
2. Confirm the **5-minute trigger** still exists (Triggers ⏰).
3. Confirm the emails are still arriving in that inbox with the expected
   subject/sender (the search query above).
4. Check `inbound-application` logs in Supabase for non-200 responses.

## Open follow-ups

- Renew the **Gravity Forms license** (currently invalid → no security updates).
- If a second form ("Job Application - JOI", Form 4) goes live, widen the
  script's search query to include its subject.
