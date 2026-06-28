-- Stripe wiring for subscriptions: store the recurring payment link.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "stripePaymentLinkUrl" TEXT;
