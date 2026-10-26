---
id: hb-11
title: Marketplace and courier integrations
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-10-06
---

# Marketplace and courier integrations

## MarketHub sync

Growth and Pro merchants can connect a MarketHub account. Every hour, Kariton pushes products, prices
and stock to MarketHub and pulls MarketHub orders into Kariton.

Kariton matches products to existing MarketHub listings by **SKU**. A product with no SKU, or with a
SKU that differs from the MarketHub listing, cannot be matched, so the sync creates a new listing
every run. This is the usual cause of duplicate listings.

Fix: pause the sync, add matching SKUs, delete the duplicates on MarketHub, then resume.

## SwiftPadala bookings

Merchants book SwiftPadala pickups from the order page. SwiftPadala sends the tracking number back to
Kariton with a callback, and the order changes from **Awaiting tracking** to **Shipped**.

If bookings succeed but tracking never arrives, the callback is failing. Check the integration health
page for SwiftPadala callback errors. If errors started for many merchants at the same time, escalate
to the Integrations squad as **high**: buyers cannot track parcels.

## Integration health page

The health page shows, per integration, the last successful sync, error counts for the last 24 hours,
and the most common error message. Always include a screenshot of it when escalating.
