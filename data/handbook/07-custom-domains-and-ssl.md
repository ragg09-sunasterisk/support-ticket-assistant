---
id: hb-07
title: Custom domains and SSL certificates
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-09-25
---

# Custom domains and SSL certificates

## Connecting a custom domain

Growth and Pro merchants can use their own domain. The merchant adds two DNS records at their
domain registrar:

| Type | Name | Value |
|---|---|---|
| CNAME | `www` | `shops.kariton.test` |
| A | `@` | `203.0.113.10` |

The shop's default address (`<shop>.kariton.test`) keeps working at all times.

## How certificates are issued

Kariton requests a free SSL certificate for the domain automatically once the DNS records resolve.
Certificates last 90 days and renew automatically 30 days before they expire. Issuance can take up
to 1 hour after DNS is correct.

## "Your connection is not private"

This browser warning means the domain has no valid certificate from Kariton. Common causes:

1. **CAA record**: the domain has a CAA record that does not allow Kariton's certificate authority.
   Registrars sometimes add one when a domain is renewed or transferred. Remove it or add our
   authority to it.
2. **DNS not pointing to Kariton**: the CNAME or A record was changed or removed.
3. **Proxy in front**: a CDN or proxy at the registrar is serving its own certificate.

After fixing the cause, the merchant clicks **Retry certificate** in **Settings > Domains**.

## When to escalate

Escalate to the storefront squad if DNS and CAA are correct, **Retry certificate** fails twice, and
more than 2 hours have passed.
