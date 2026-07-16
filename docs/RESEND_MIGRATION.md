# Moving invoice email off Postmark → Resend

**Why:** the Postmark account is on the free plan (100 emails/month) and it's maxed
out (100/100, resets Jul 28). The Jul 7 TORRO-27 and SCOOP-25 invoices never left
Postmark — the clients never received them, which is why neither paid. Resend's free
tier is 3,000/month (30× the headroom) and is a near drop-in swap.

Anything you (D) have to do yourself is marked **[D]**. Everything else is code
Claude has already written or will deploy.

---

## What's already done

- `supabase/functions/send-invoice-email/index.resend.ts` — the Resend version of
  the send function. Same request/response as the live Postmark one, so the app's
  frontend needs zero changes. Not deployed yet (won't touch the live function
  until the steps below are done).

---

## Step 1 — [D] Create a Resend account

1. Go to https://resend.com and sign up (free "Developer" plan is fine to start).
2. You don't need to enter a card for the free tier.

Claude can't create the account or sign in for you — that part is yours.

## Step 2 — [D] Verify the justoutsource.it domain

This is the same idea as what you already did for Postmark (SPF/DKIM), just on
Resend.

1. In Resend: **Domains → Add Domain → `justoutsource.it`**.
2. Resend shows a list of DNS records (a DKIM `TXT`, an SPF/`MX` for the return-path,
   and usually a DMARC `TXT`).
3. Add those records at whoever hosts your DNS for justoutsource.it (the same place
   you added the Postmark records).
4. Back in Resend, click **Verify**. It can take a few minutes to a few hours for DNS
   to propagate.

> Tip: keep the Postmark DNS records in place for now — having both providers
> verified doesn't hurt, and it lets us fall back if needed.

## Step 3 — [D] Create an API key

1. Resend → **API Keys → Create API Key**.
2. Name it something like `joi-invoices`, permission "Sending access".
3. Copy the key (starts with `re_`). You'll only see it once.

## Step 4 — [D + Claude] Store the key as a Supabase secret

Give Claude the key (or set it yourself) as an Edge Function secret named
`RESEND_API_KEY`. Also confirm these are set (they already exist for Postmark, same
values carry over):

| Secret | Value |
| --- | --- |
| `RESEND_API_KEY` | the `re_...` key from Step 3 |
| `INVOICE_FROM_EMAIL` | `JOI Accounting <accounting@justoutsource.it>` (must be on the verified domain) |
| `INVOICE_BCC` | `accounting@justoutsource.it` |
| `ALLOWED_ORIGIN` | `https://app.justoutsource.it` |

## Step 5 — [Claude] Swap and deploy

Once the domain shows **Verified** in Resend and the key is set, Claude will:

1. Replace `send-invoice-email/index.ts` with the Resend version.
2. Redeploy the function.

## Step 6 — [Claude + D] Test end-to-end

1. Claude sends one real test through the app to `diomedes.sandoval@torro.com`.
2. Confirm it lands in that inbox **and** shows in Resend's activity as delivered.
3. Confirm a deliberately-bad send shows up as an **error** (not a false "sent").

## Step 7 — Re-send the two invoices that never arrived

After the test passes, re-send **TORRO-27** and **SCOOP-25** to the real client
contacts so Torro and Scoop finally get them.

---

## The reliability fix (the real reason those failures were invisible)

Separate from the provider swap: today the app marks an invoice "sent" the moment
the email provider *accepts* the API call. "Accepted" is not "delivered" — a bounce
or an over-quota drop still reads as "sent". That's the trap that hid the Postmark
failure.

The proper fix is a **Resend webhook**: Resend calls back with `delivered`,
`bounced`, and `complained` events, and we update `invoice_email_log.status` to match
reality. Then a bounced invoice shows as bounced, not "sent".

Claude can build this webhook function next (it needs your Resend account first, to
get the webhook signing secret and to paste the endpoint URL into Resend). Recommended
as the immediate follow-up once sending works again.

---

## Optional — move the other email functions too

These also send through the shared Postmark account and compete for the same quota
(this is probably why 100 emails got used up so fast):

- `send-eod-digest`
- `holiday-notifications`
- `review-notifications`
- `compliance-notifications`
- `send-paystubs`

Not required to fix invoices, but worth migrating to Resend later so everything sits
on the bigger free tier. One at a time, lowest-risk first.
