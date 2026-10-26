---
id: hb-13
title: Email notifications and deliverability
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-07-30
---

# Email notifications and deliverability

## Which emails are sent

Kariton emails buyers when an order is placed, paid, shipped and refunded, and emails merchants for
new orders and payouts. Merchants edit templates in **Settings > Notifications**.

## Default and custom sender addresses

By default, buyer emails are sent from `no-reply@mail.kariton.test`. Merchants can use their own
address, such as `orders@theirshop.example.com`, but only after verifying the domain.

## Domain verification

To send from their own domain, the merchant adds three DNS records shown in
**Settings > Notifications > Sender domain**:

- an SPF record that includes Kariton's mail servers,
- a DKIM record with Kariton's public key,
- a DMARC record (recommended).

Until the domain shows **Verified**, mail from it fails authentication checks and Gmail and Yahoo
often put it in spam or reject it.

## Emails going to spam

1. Ask whether the merchant recently changed the sender address.
2. Check **Sender domain** status. If it is not **Verified**, walk the merchant through the records.
3. If the domain is verified and only one buyer is affected, the buyer's mailbox rules are the likely
   cause.

## Bounces

Hard bounces are listed under **Settings > Notifications > Bounces**. Kariton stops emailing an
address after two hard bounces.
