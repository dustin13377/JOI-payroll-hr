# DNS records to add for Resend (justoutsource.it)

Please add the following **three** DNS records for **justoutsource.it** (Cloudflare).
These verify the domain with Resend (our new transactional email provider) so
invoice emails send reliably.

Record names are shown as Resend lists them (relative to the domain). On Cloudflare
you can paste the name as-is — it appends `.justoutsource.it` automatically.

---

### 1. DKIM — domain verification  (TXT)

| Field | Value |
| --- | --- |
| Type | `TXT` |
| Name | `resend._domainkey` |
| Value | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCdku/vgY+p0UjNGi92Fo2dzr6jcbtogwXJOUyMszkk9sf+n9prHLR9pvhDLCsRM7j/SDH0464stkfp4dbu8dvg+CWcWCGpBL4mXAqkM3sadeyor+B4a12ay9i+QEyiCvpxY58J8TMInJTmT6i0nlM6WVJB615+SCZNo/MAd2IMGwIDAQAB` |
| TTL | Auto |
| Proxy (Cloudflare) | DNS only (grey cloud) |

### 2. Sending — SPF return-path  (MX)

| Field | Value |
| --- | --- |
| Type | `MX` |
| Name | `send` |
| Value | `feedback-smtp.us-east-1.amazonses.com` |
| Priority | `10` |
| TTL | Auto |

### 3. Sending — SPF  (TXT)

| Field | Value |
| --- | --- |
| Type | `TXT` |
| Name | `send` |
| Value | `v=spf1 include:amazonses.com ~all` |
| TTL | Auto |

---

## ⚠️ Do NOT add the inbound/receiving record

Resend also shows an optional **MX record on `@`** with value
`inbound-smtp.us-east-1.amazonaws.com` (priority 0). **Skip it.** That record is only
for *receiving* mail through Resend and would reroute all inbound email for
justoutsource.it. We only need to *send*, so adding it could break existing email.

## Notes

- Leave the existing Postmark DNS records in place — no need to remove anything.
- These are all "DNS only" in Cloudflare (not proxied / grey cloud).
- Once added, Resend verifies automatically within a few minutes to a few hours.
