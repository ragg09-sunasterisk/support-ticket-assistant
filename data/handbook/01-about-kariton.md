---
id: hb-01
title: About the Kariton platform
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-09-15
---

# About the Kariton platform

## What Kariton does

Kariton is a software-as-a-service platform that runs online shops for small businesses. A merchant
signs up, adds products, and gets a storefront at `<shop>.kariton.test` or on their own custom domain.
Kariton handles checkout, payments, payouts, inventory, shipping bookings and buyer notifications.

Most merchants are small teams of one to five people. Many sell on Kariton and on the MarketHub
marketplace at the same time, and book deliveries with the SwiftPadala courier.

## Plans

| Plan | Monthly price | Staff accounts | Custom domain | Marketplace sync | Webhooks |
|---|---|---|---|---|---|
| Starter | PHP 499 | 0 | No | No | No |
| Growth | PHP 1,499 | 2 | Yes | Yes | No |
| Pro | PHP 3,999 | 5 | Yes | Yes | Yes |

Plan changes take effect at the start of the next billing cycle. See [Billing, plans and invoices](16-billing-plans-and-invoices.md).

## Main services

- **Storefront**: renders shop pages; product media is served through the media CDN.
- **Checkout**: cart, discount engine, payment authorization.
- **Payments**: card and e-wallet collection, refunds, merchant payouts.
- **Catalog and inventory**: products, variants, bundles, stock.
- **Integrations**: MarketHub sync, SwiftPadala bookings, merchant webhooks.
- **Notifications**: order emails and SMS to buyers.

## Who owns what

Each service has an owning squad listed in the service catalog. Support agents escalate to the owning
squad through the on-call process in [Incident response and on-call](04-incident-response-and-on-call.md).
