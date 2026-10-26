---
id: hb-18
title: Security incident response
access: restricted
allowed_roles: [security]
updated: 2026-09-28
---

# Security incident response

Restricted: Security team only. Do not quote this page to merchants or other teams.

## What counts as a security incident

- Unauthorized access to a merchant account, admin tool or production system.
- Buyer or merchant personal data exposed to the wrong party.
- Leaked credentials, such as a signing secret or an internal service token.
- Malware or a malicious script found in a merchant theme.

## First hour

1. Open a private incident channel; invite only the security on-call and the incident commander.
2. Contain first: revoke sessions, rotate the affected secrets, disable the compromised account.
3. Preserve evidence: snapshot logs before rotation jobs overwrite them.
4. Do not discuss the incident in public channels or with merchants until Legal approves wording.

## Notification duty

If personal data was likely exposed, the Data Protection Officer decides within 24 hours whether to
notify the National Privacy Commission and affected people. The legal deadline is 72 hours from
discovery.

## Account takeover playbook

Lock the account, invalidate all sessions and API tokens, freeze payouts for 72 hours, and contact
the owner through the phone number verified at signup, not the contact details in the ticket.

## Evidence log

Every action is logged with time, person and reason in the incident record. The log is kept for
5 years.
