---
id: hb-10
title: Inventory and bundles
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-08-12
---

# Inventory and bundles

## Stock basics

Each product variant has a stock count. Stock is reserved when an order is created and deducted
when it is paid. If **Stop selling when out of stock** is on, the storefront hides the Buy button at
zero.

## Edits that do not save

If a merchant changes stock and it reverts after a refresh, check whether a marketplace sync is
running. MarketHub sync writes stock back every hour and overwrites manual edits unless the merchant
sets Kariton as the stock source in **Integrations > MarketHub > Stock source**. If no sync is
connected, collect the product ID and escalate as a bug.

## Bundles

A bundle is a product made of other products, for example a gift set of three items. Selling one
bundle deducts one of each component.

Known issue (tracked by the catalog squad): when two bundle orders that share a component are paid
within the same second, both can pass the stock check, so a component can go below zero. The
**Stop selling** rule then only applies after the next stock recount, which runs every 15 minutes.
Workaround: set a safety stock of 2 on shared components. Report affected shops to the catalog squad.

## Stock recount

Merchants can force a recount from **Products > Inventory > Recount**. It fixes display errors but
does not restore stock lost to oversold orders.
