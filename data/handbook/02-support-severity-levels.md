---
id: hb-02
title: Support severity levels
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-08-30
---

# Support severity levels

Every ticket gets one severity. Severity describes **impact on the merchant's business**, not how
upset the merchant sounds. An angry ticket about a typo is still low; a polite ticket about failed
checkouts is still critical.

## Critical

Merchants cannot take money or the storefront is unreachable for many buyers. Examples: checkout
errors for all or most orders, platform-wide outage, payouts sent to the wrong account.
First response within 15 minutes, 24/7. Page the on-call engineer.

## High

A core function is broken for one merchant or a group of merchants, with a workaround that is
painful or none at all. Examples: a payout not received after the expected date, broken product
images on mobile, an integration that stopped syncing, an owner locked out of their account.
First response within 2 business hours.

## Medium

Something is wrong but sales continue. Examples: a report or export is empty, a refund is slower than
expected, one setting does not save. First response within 1 business day.

## Low

How-to questions, feature requests, billing questions with no money at risk, and anything that only
needs information. First response within 2 business days.

## When severity is unclear

If a ticket does not say what is broken, do not guess high. Set medium, ask one clarifying
question, and re-rate when the merchant answers. Record your confidence in the ticket.
