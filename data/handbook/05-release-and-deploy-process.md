---
id: hb-05
title: Release and deploy process
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-09-10
---

# Release and deploy process

## Release schedule

Kariton ships a regular release every Tuesday and Thursday at 14:00 Manila time. No releases go out
on Fridays, weekends, or during the freeze windows before big sale days (9.9, 10.10, 11.11, 12.12).
Release notes are posted in the support channel one hour before each release.

## Feature flags

New features ship behind feature flags and are turned on gradually: internal shops, then 5% of
merchants, then 50%, then everyone. A support agent who suspects a new feature is causing a problem
should check the release notes and ask the owning squad whether a flag can be turned off for that
merchant.

## Rollback

Any engineer can roll back the latest release of a service from the deploy dashboard. Roll back
first and investigate second when a release causes a SEV1 or SEV2. A rollback does not undo
database migrations; those need a separate fix.

## Checking whether a release caused a problem

1. Note when the merchant says the problem started.
2. Compare it with the release times in the deploy dashboard.
3. If they line up, add the release ID to the ticket and tell the owning squad.

Problems that start right after a release are the most common source of high-severity tickets about
the storefront and media.
