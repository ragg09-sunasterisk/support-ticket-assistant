---
id: hb-19
title: Production data access procedure
access: restricted
allowed_roles: [engineer, security]
updated: 2026-08-08
---

# Production data access procedure

Restricted: engineers and Security only.

## Default: no standing access

No engineer has standing read access to production databases that hold merchant or buyer data.
Day-to-day debugging uses the masked replica, where names, phones, emails and addresses are replaced
with fake values.

## Requesting temporary access

1. Open an access request in the access portal with the ticket or incident ID and the exact tables.
2. A second engineer from a different squad approves it.
3. Access is granted for 4 hours, read-only, through the bastion host. Every query is recorded.

## Break-glass access

During a SEV1, the incident commander can grant break-glass write access for 1 hour. Security
reviews every break-glass session within 2 business days.

## Rules while you have access

- Query only the rows needed for the ticket. No `SELECT *` on buyer tables.
- Never copy production data to a laptop, a chat tool or an AI assistant.
- Never change data by hand without a second engineer watching.

## Revoking access

Access expires automatically. Revoke it early in the portal when you are done, and note in the
ticket what you looked at.
