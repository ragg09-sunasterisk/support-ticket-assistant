---
id: hb-04
title: Incident response and on-call
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-07-21
---

# Incident response and on-call

## On-call rotation

Each squad keeps one primary and one secondary on-call engineer, rotating weekly on Monday at 10:00
Manila time. The current on-call is shown in the paging tool. Support pages the primary; if there is
no acknowledgement in 10 minutes, the page goes to the secondary, then the squad lead.

## Incident levels

- **SEV1**: platform-wide outage or checkout failing for most merchants.
- **SEV2**: a major feature broken for many merchants, or one service badly degraded.
- **SEV3**: a feature broken for a few merchants with a workaround.

Support severity (see [Support severity levels](02-support-severity-levels.md)) is per ticket.
Incident level is per event. Many critical tickets about the same failure become one SEV1 incident.

## During an incident

1. The on-call engineer becomes incident commander until they hand it over.
2. Open an incident channel and post a status page update within 15 minutes for SEV1 and SEV2.
3. Support links related tickets to the incident and replies with the status page link.
4. Updates go out every 30 minutes until resolved.

## After an incident

Every SEV1 and SEV2 gets a blameless post-incident review within 5 business days. The review lists
the timeline, the root cause, what went well, and action items with owners.
Merchants affected by a SEV1 may receive a service credit; support cannot promise one before the
review decides.
