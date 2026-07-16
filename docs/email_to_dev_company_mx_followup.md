Subject: One more DNS record needed — MX on "send" (justoutsource.it)

Hi [name],

Thanks for adding those. Two of the three records are live and correct (the DKIM
TXT and the SPF TXT on "send"). The third one — the MX record — still isn't showing
up, and it's the last thing Resend needs before it'll verify.

Could you add (and save) this one:

   Type: MX
   Name: send
   Mail server / target: feedback-smtp.us-east-1.amazonses.com
   Priority: 10

Two notes:
- This goes on the "send" subdomain, NOT the root. Please don't change the root MX —
  that's our Google Workspace mail and it should stay as-is.
- In Cloudflare, MX records can't be proxied, so there's no orange/grey cloud toggle
  to worry about here.

Once it's saved, let me know and I'll confirm it verifies. Thanks again!

[your name]
