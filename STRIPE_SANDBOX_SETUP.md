# Stripe Sandbox Setup — わたしの図鑑

更新日: 2026-09-27

## 接続先
- Stripe account: New business
- Mode: Test / Sandbox

## Products
### PRO Lifetime
- Product ID: prod_VKpkrSHzBKkx90
- Price ID: price_1UKA4YANkoAC1LCpGEIunK5a
- Amount: JPY 1,480
- Payment Link ID: plink_1UKA5QANkoAC1LCpj7dfTsOr
- Payment URL: https://buy.stripe.com/test_5kQ7sKerQfDf8Sg9kUeZ200

### Support 500
- Product ID: prod_VKpk9JCFiqVYnG
- Price ID: price_1UKA4lANkoAC1LCpioQ0rytI
- Amount: JPY 500
- Payment Link ID: plink_1UKA5TANkoAC1LCpp3HR57AI
- Payment URL: https://donate.stripe.com/test_8x2bJ083s4YB5G4cx6eZ201

### Support 1000
- Product ID: prod_VKpkTJ6Pwq16Uk
- Price ID: price_1UKA4nANkoAC1LCpTStSGdcn
- Amount: JPY 1,000
- Payment Link ID: plink_1UKA5XANkoAC1LCpJlcG4BiR
- Payment URL: https://donate.stripe.com/test_4gM4gy83s0Il5G468IeZ202

## Current behavior
- Payment UI is visible only in the web/PWA build.
- Native App Store build hides the web purchase CTA.
- Payment links are sandbox-only.
- PRO is NOT unlocked merely from the redirect.
- Successful PRO checkout returns with CHECKOUT_SESSION_ID and stores it temporarily.
- Next implementation step: server-side verification of the Checkout Session, then issue a signed entitlement.

## Do not switch to live mode yet
Complete these checks first:
1. Sandbox checkout opens from PWA
2. Test card payment succeeds
3. Redirect returns to PWA
4. Server verifies Checkout Session
5. PRO entitlement survives reload
6. Invalid or unpaid session does not unlock PRO
7. Privacy policy reflects Stripe processing
8. Only then recreate products/links in live mode
