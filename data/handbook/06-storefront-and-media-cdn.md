---
id: hb-06
title: Storefront and media CDN
access: public
allowed_roles: [support_agent, engineer, security]
updated: 2026-10-03
---

# Storefront and media CDN

## How product images are served

When a merchant uploads a product photo, the media service stores the original and generates
variants: a 1600px desktop image, an 800px mobile image and a 200px thumbnail. Storefront pages ask
the media CDN for the right variant based on screen size. Variants are cached at the CDN for 30 days.

## Grey boxes or missing images

If images show as grey boxes on one device type but not another, the variant for that device is
usually missing or the CDN cached a bad response.

1. Open the image URL with `?w=800` and `?w=1600`. If only one fails, the variant is the problem.
2. From the admin tools, run **Regenerate media variants** for the shop.
3. Purge the shop's CDN cache. Changes appear within 10 minutes.

If many shops report the same thing after a release, treat it as an incident, not single tickets.

## Storefront speed

Slow storefronts are most often caused by very large images uploaded without compression, many
third-party scripts added in the theme editor, or a theme with autoplay video. Kariton's own page
render time is shown on the status page. If it is normal, review the shop's theme before
escalating.

## Theme editor

Merchants customize themes with the theme editor. Saving creates a new theme version; the last 20
versions can be restored from **Online store > Themes > History**.
