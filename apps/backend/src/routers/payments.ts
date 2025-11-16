import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

/**
 * Payment processing with Stripe
 * Subscription management for SaaS
 */

export const paymentsRouter = router({
  // Create Stripe checkout session
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        priceId: z.string(), // Stripe price ID
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Stripe integration would go here
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      // const session = await stripe.checkout.sessions.create({...});

      return {
        sessionId: 'mock_session_id',
        url: 'https://checkout.stripe.com/mock',
      };
    }),

  // Create payment intent for invoice
  createPaymentIntent: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.invoiceId },
      });

      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Create Stripe payment intent
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      // const paymentIntent = await stripe.paymentIntents.create({
      //   amount: Math.round(parseFloat(invoice.total.toString()) * 100),
      //   currency: 'usd',
      //   metadata: { invoiceId: invoice.id },
      // });

      return {
        clientSecret: 'mock_client_secret',
        amount: invoice.total,
      };
    }),

  // Get subscription plans
  getPlans: publicProcedure.query(async () => {
    return {
      plans: [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          interval: 'month',
          features: [
            '1 user',
            '10 leads/month',
            'Basic features',
            'Email support',
          ],
        },
        {
          id: 'pro',
          name: 'Pro',
          price: 49,
          interval: 'month',
          features: [
            '5 users',
            'Unlimited leads',
            'All features',
            'Priority support',
            'AI message generation',
            'Advanced analytics',
          ],
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 199,
          interval: 'month',
          features: [
            'Unlimited users',
            'Unlimited everything',
            'White-label',
            '24/7 support',
            'Custom integrations',
            'Dedicated account manager',
          ],
        },
      ],
    };
  }),

  // Get current subscription
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    // Would fetch from Stripe
    return {
      plan: 'free',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }),

  // Cancel subscription
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    // Cancel in Stripe
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // await stripe.subscriptions.del(subscriptionId);

    return {
      success: true,
      message: 'Subscription cancelled',
    };
  }),
});
