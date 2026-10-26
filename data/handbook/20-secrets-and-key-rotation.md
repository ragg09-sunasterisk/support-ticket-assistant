---
id: hb-20
title: Secrets and key rotation
access: restricted
allowed_roles: [engineer, security]
updated: 2026-10-09
---

# Secrets and key rotation

Restricted: engineers and Security only.

## Where secrets live

All service credentials, signing keys and third-party tokens live in the secrets vault. Services read
them at start-up through their workload identity. Secrets never go in code, config files, CI logs,
tickets or chat.

## Rotation schedule

| Secret | Rotation |
|---|---|
| Database passwords | Every 90 days, automatic |
| Payment provider keys | Every 180 days, manual with the Payments squad |
| Webhook signing master key | Every 365 days, and after any suspected leak |
| Courier and marketplace tokens | When the partner requires it |

## Rotating the webhook signing master key

Merchant signing secrets are derived from the master key. Rotating it changes every merchant's secret,
so it is done with a 14-day overlap: Kariton signs with both old and new keys and sends both values
in the header until the overlap ends. The 2026-10-10 header change to `v2` was a format change, not a
key rotation.

## Suspected leak

1. Treat it as a security incident (see the Security incident response page).
2. Rotate the secret immediately; skip the overlap if the leak is confirmed.
3. Search logs for use of the old secret since the suspected leak time.

## Pre-commit checks

Every repository runs a secret scanner before commit and in CI. A blocked commit is never bypassed
with `--no-verify`.
