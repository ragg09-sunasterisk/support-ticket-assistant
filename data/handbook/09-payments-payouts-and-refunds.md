---
id: hb-09
title: Payments, payouts and refunds
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-09-18
---

# Payments, payouts and refunds

## Payouts

Kariton pays merchants for completed orders every business day. Money from an order is paid out two
business days after the order is marked delivered. The dashboard status **Paid out** means Kariton
sent the money to the merchant's bank; banks can take one more business day to show it.

## Payout not received

1. Confirm the payout date and amount in **Finance > Payouts**.
2. Check that the bank account on file is correct and verified.
3. If more than 3 business days have passed since **Paid out**, escalate to the Payments squad with
   the payout ID. This is **high** severity.

Never change a merchant's bank account details from a support ticket. The merchant must change them
in the dashboard, which requires their 2-step verification.

## Refunds

Merchants refund buyers from the order page. Refunds go back to the original payment method:

| Method | Time to reach the buyer |
|---|---|
| E-wallet | 1 to 3 days |
| Card | 5 to 14 banking days |

The status stays **Refund processing** until the card network confirms. A card refund that is still
processing after 14 banking days should be escalated to the Payments squad.

## When refunds are not possible

The **Refund** button is disabled when the order was already refunded, when the order is older than
180 days, or when a payout dispute is open for the order.

## Damaged or lost deliveries

The merchant decides whether to refund a buyer for a damaged delivery. Kariton support never issues
refunds on a merchant's behalf.
