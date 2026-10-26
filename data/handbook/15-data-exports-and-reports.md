---
id: hb-15
title: Data exports and reports
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-10-04
---

# Data exports and reports

## Exporting orders

Merchants export orders from **Orders > Export** as CSV. Exports of up to 5,000 rows download
directly. Larger exports run in the background and are emailed as a link that works for 7 days.

## Time zones

Date ranges in exports use the shop's time zone from **Settings > General**. A shop set to UTC that
exports "Oct 1 to Oct 3" will miss orders placed between 00:00 and 08:00 Manila time on Oct 1.

## Known issue: empty exports for the current month

Since the 2026-10-01 release, exports whose date range starts in the current month can return a file
with headers only. Exports for past months are not affected. Workaround: export with a range that
starts on the last day of the previous month, then remove the extra rows. The reports squad is
tracking the fix.

## Dashboard charts

Sales charts update every hour from the reporting database, so the latest hour is often missing.
A chart showing zero for a full past day while orders exist is a bug: collect the shop and the date
and escalate to the reports squad.

## Accounting documents

Exports are for the merchant's own records. For Kariton's own invoices and official receipts, see
[Billing, plans and invoices](16-billing-plans-and-invoices.md).
