import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';

// Initialize Stripe client
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function getStripe(): Stripe {
  if (!stripe) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env',
    });
  }
  return stripe;
}

/**
 * Payment processing with Stripe
 */
export const paymentsRouter = router({
  // Create Payment Link for an invoice
  createPaymentLink: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripeClient = getStripe();

      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.invoiceId },
        include: { customer: true, lineItems: { include: { service: true } } },
      });

      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Create a Stripe Price for this invoice amount
      const price = await stripeClient.prices.create({
        unit_amount: Math.round(invoice.total.toNumber() * 100), // cents
        currency: 'usd',
        product_data: {
          name: `Invoice #${invoice.invoiceNumber} - ${invoice.lineItems.map(li => li.description).join(', ')}`,
        },
      });

      // Create Payment Link
      const paymentLink = await stripeClient.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          invoiceNumber: invoice.invoiceNumber,
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?invoice=${invoice.id}` },
        },
      });

      // Store payment link URL on invoice
      await ctx.prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfUrl: paymentLink.url }, // Reusing pdfUrl field for now
      });

      return {
        url: paymentLink.url,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.total.toNumber(),
        customerName: invoice.customer?.name,
        customerPhone: invoice.customer?.phone,
      };
    }),

  // Quick Payment Link - for billing without creating full invoice
  createQuickPaymentLink: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        amount: z.number().positive(),
        description: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripeClient = getStripe();

      const customer = await ctx.prisma.customer.findUnique({
        where: { id: input.customerId },
      });

      if (!customer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }

      // Create a Stripe Price
      const price = await stripeClient.prices.create({
        unit_amount: Math.round(input.amount * 100), // cents
        currency: 'usd',
        product_data: {
          name: input.description,
        },
      });

      // Create Payment Link
      const paymentLink = await stripeClient.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          customerId: input.customerId,
          customerName: customer.name,
          description: input.description,
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success` },
        },
      });

      return {
        url: paymentLink.url,
        amount: input.amount,
        customerName: customer.name,
        customerPhone: customer.phone,
      };
    }),

  // Create Payment Link for plow customer (quick billing)
  createPlowBillingLink: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        services: z.array(
          z.object({
            name: z.string(),
            amount: z.number().positive(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripeClient = getStripe();

      const customer = await ctx.prisma.customer.findUnique({
        where: { id: input.customerId },
      });

      if (!customer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }

      const totalAmount = input.services.reduce((sum, s) => sum + s.amount, 0);
      const description = input.services.map(s => `${s.name}: $${s.amount}`).join(', ');

      // Parse plow/salt counts from service names
      let plowCount = 0, plowPrice = 0, saltCount = 0, saltPrice = 0;
      for (const s of input.services) {
        if (s.name.toLowerCase().includes('plow')) {
          const match = s.name.match(/x(\d+)/);
          plowCount = match ? parseInt(match[1]) : 1;
          plowPrice = s.amount / plowCount;
        }
        if (s.name.toLowerCase().includes('salt')) {
          const match = s.name.match(/x(\d+)/);
          saltCount = match ? parseInt(match[1]) : 1;
          saltPrice = s.amount / saltCount;
        }
      }

      // Create a Stripe Price
      const price = await stripeClient.prices.create({
        unit_amount: Math.round(totalAmount * 100),
        currency: 'usd',
        product_data: {
          name: `Snow Service - ${customer.name} (${description})`,
        },
      });

      // Create Payment Link with billing record ID in metadata
      const billingId = `plow_${Date.now()}`;
      const paymentLink = await stripeClient.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          billingId,
          customerId: input.customerId,
          customerName: customer.name,
          services: description,
          type: 'plow_billing',
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?billing=${billingId}` },
        },
      });

      // Save billing record
      const billing = await ctx.prisma.plowBilling.create({
        data: {
          customerId: input.customerId,
          plowCount,
          plowPrice,
          saltCount,
          saltPrice,
          totalAmount,
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url,
          description,
          status: 'PENDING',
        },
      });

      return {
        id: billing.id,
        url: paymentLink.url,
        amount: totalAmount,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: `${customer.addressLine1 || ''} ${customer.city || ''}`.trim(),
        services: input.services,
        status: 'PENDING',
      };
    }),

  // Get plow billing history for a customer
  getPlowBillings: protectedProcedure
    .input(
      z.object({
        customerId: z.string().optional(),
        status: z.enum(['PENDING', 'SENT', 'VIEWED', 'PAID', 'EXPIRED', 'CANCELLED']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const billings = await ctx.prisma.plowBilling.findMany({
        where: {
          ...(input.customerId && { customerId: input.customerId }),
          ...(input.status && { status: input.status }),
        },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, addressLine1: true, city: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });

      return billings.map((b) => ({
        id: b.id,
        customerId: b.customerId,
        customerName: b.customer.name,
        customerPhone: b.customer.phone,
        customerAddress: `${b.customer.addressLine1 || ''} ${b.customer.city || ''}`.trim(),
        plowCount: b.plowCount,
        saltCount: b.saltCount,
        totalAmount: b.totalAmount.toNumber(),
        status: b.status,
        url: b.stripePaymentLinkUrl,
        createdAt: b.createdAt,
        paidAt: b.paidAt,
      }));
    }),

  // Mark billing as sent (after texting)
  markBillingSent: protectedProcedure
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const billing = await ctx.prisma.plowBilling.update({
        where: { id: input.billingId },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return { success: true, status: billing.status };
    }),

  // Get payment links history
  getPaymentLinks: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const stripeClient = getStripe();

      const paymentLinks = await stripeClient.paymentLinks.list({
        limit: input.limit,
        active: true,
      });

      return paymentLinks.data.map(link => ({
        id: link.id,
        url: link.url,
        active: link.active,
        metadata: link.metadata,
      }));
    }),

  // Check Stripe connection status
  checkConnection: protectedProcedure.query(async () => {
    if (!stripe) {
      return { connected: false, message: 'Stripe not configured' };
    }

    try {
      const account = await stripe.accounts.retrieve();
      return {
        connected: true,
        message: 'Connected to Stripe',
        accountId: account.id,
      };
    } catch (error) {
      return { connected: false, message: 'Failed to connect to Stripe' };
    }
  }),

  // Get price overrides for plow services (or any services)
  getCustomerPrices: protectedProcedure
    .input(
      z.object({
        customerIds: z.array(z.string()),
        serviceCodes: z.array(z.string()).optional(), // e.g., ['PLOW', 'SALT']
      })
    )
    .query(async ({ ctx, input }) => {
      // Get services by code
      const services = input.serviceCodes
        ? await ctx.prisma.service.findMany({
            where: { userId: ctx.user.id, code: { in: input.serviceCodes } },
          })
        : await ctx.prisma.service.findMany({
            where: { userId: ctx.user.id },
          });

      const serviceIds = services.map((s) => s.id);

      // Get all price overrides for these customers and services
      const overrides = await ctx.prisma.priceOverride.findMany({
        where: {
          customerId: { in: input.customerIds },
          serviceId: { in: serviceIds },
        },
        include: {
          service: true,
        },
      });

      // Build map: customerId -> { serviceCode -> price }
      const priceMap: Record<string, Record<string, number>> = {};
      for (const override of overrides) {
        if (!priceMap[override.customerId]) {
          priceMap[override.customerId] = {};
        }
        priceMap[override.customerId][override.service.code] = override.price.toNumber();
      }

      return {
        prices: priceMap,
        services: services.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          basePrice: s.basePrice ? parseFloat(s.basePrice.toString()) : 0,
        })),
      };
    }),

  // Set price override for a customer/service
  setCustomerPrice: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        serviceCode: z.string(),
        price: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find the service
      const service = await ctx.prisma.service.findFirst({
        where: { userId: ctx.user.id, code: input.serviceCode },
      });

      if (!service) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
      }

      // Upsert the price override
      const override = await ctx.prisma.priceOverride.upsert({
        where: {
          customerId_serviceId: {
            customerId: input.customerId,
            serviceId: service.id,
          },
        },
        create: {
          customerId: input.customerId,
          serviceId: service.id,
          price: input.price,
        },
        update: {
          price: input.price,
        },
      });

      return {
        success: true,
        customerId: input.customerId,
        serviceCode: input.serviceCode,
        price: override.price.toNumber(),
      };
    }),
});
