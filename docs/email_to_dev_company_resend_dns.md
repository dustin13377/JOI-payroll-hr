Subject: DNS records to add for justoutsource.it (Cloudflare)

Hi [name],

We're setting up Resend as our email provider for sending invoices, and it needs
three DNS records added for justoutsource.it in Cloudflare. Could you add these when
you get a chance?

All three should be "DNS only" (grey cloud, not proxied). Please leave our existing
Postmark records in place.

1) DKIM — domain verification
   Type: TXT
   Name: resend._domainkey
   Value: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCdku/vgY+p0UjNGi92Fo2dzr6jcbtogwXJOUyMszkk9sf+n9prHLR9pvhDLCsRM7j/SDH0464stkfp4dbu8dvg+CWcWCGpBL4mXAqkM3sadeyor+B4a12ay9i+QEyiCvpxY58J8TMInJTmT6i0nlM6WVJB615+SCZNo/MAd2IMGwIDAQAB

2) Sending — return-path (MX)
   Type: MX
   Name: send
   Value: feedback-smtp.us-east-1.amazonses.com
   Priority: 10

3) Sending — SPF (TXT)
   Type: TXT
   Name: send
   Value: v=spf1 include:amazonses.com ~all

One important thing: Resend also suggests an inbound MX record on "@" pointing to
inbound-smtp.us-east-1.amazonaws.com. Please DO NOT add that one — it's only for
receiving mail through Resend and would reroute our incoming email. We only need to
send, so the three records above are all we want.

Once they're in, let me know and I'll confirm verification on our end. Thanks!

[your name]
