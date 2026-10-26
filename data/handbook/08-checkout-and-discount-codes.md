---
id: hb-08
title: Checkout and discount codes
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-10-01
---

# Checkout and discount codes

## Checkout flow

1. The buyer's cart is priced by the discount engine.
2. Shipping is quoted by the courier service.
3. Payment is authorized with the buyer's card or e-wallet.
4. The order is created and stock is reserved.

A failure at any step stops the order and shows an error to the buyer. Error 500 means Kariton failed,
not the buyer.

## Discount codes

Merchants create codes in **Marketing > Discounts**: a percentage, a fixed amount, or free shipping,
with optional minimum spend, usage limits and start and end dates. Codes can be stacked only if both
codes allow stacking.

Scheduled start and end times are not supported yet; merchants turn codes on and off manually. This
is a common feature request.

## Checkout errors with codes

If checkouts fail only when a code is used, the discount engine is the likely cause.

- Check whether the failure is for all codes or one code. A single broken code is usually a
  misconfigured rule, such as a minimum spend higher than the maximum cart value.
- If all codes fail for a merchant or many merchants, treat it as **critical**: merchants are
  losing sales. Page the checkout on-call and link the tickets to an incident.

## Big sale days

Traffic on 9.9, 10.10, 11.11 and 12.12 is up to 8 times normal. Merchants often launch codes the
same morning, so checkout tickets on these days are reviewed first.
