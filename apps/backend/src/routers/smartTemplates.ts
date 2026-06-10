import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import * as smartTemplates from '../services/smart-templates';
import logger from '../utils/logger';

export const smartTemplatesRouter = router({
  /**
   * Parse quick invoice text with AI
   */
  parseQuickInvoice: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        autoCreateCustomer: z.boolean().optional().default(true),
        autoCreateService: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      logger.info('Parsing quick invoice', {
        userId: ctx.user.id,
        text: input.text,
        autoCreateCustomer: input.autoCreateCustomer,
        autoCreateService: input.autoCreateService,
      });

      try {
        const result = await smartTemplates.parseQuickInvoice({
          text: input.text,
          userId: ctx.user.id,
          autoCreateCustomer: input.autoCreateCustomer,
          autoCreateService: input.autoCreateService,
        });

        return result;
      } catch (error: any) {
        logger.error('Quick invoice parsing failed', { error: error.message });
        throw new Error(error.message || 'Failed to parse invoice');
      }
    }),

  /**
   * Create invoice from quick entry
   */
  createQuickInvoice: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      logger.info('Creating quick invoice', {
        userId: ctx.user.id,
        text: input.text
      });

      try {
        const invoice = await smartTemplates.createQuickInvoice({
          text: input.text,
          userId: ctx.user.id,
        });

        return invoice;
      } catch (error: any) {
        logger.error('Quick invoice creation failed', { error: error.message });
        throw new Error(error.message || 'Failed to create invoice');
      }
    }),

  /**
   * Set custom pricing for customer/service combo
   */
  setCustomerPricing: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        serviceId: z.string(),
        price: z.number().positive(),
        unit: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      logger.info('Setting customer pricing', {
        customerId: input.customerId,
        serviceId: input.serviceId,
        price: input.price,
      });

      await smartTemplates.setCustomerPricing(
        input.customerId,
        input.serviceId,
        input.price,
        input.unit
      );

      return { success: true };
    }),

  /**
   * Get customer pricing overrides
   */
  getCustomerPricing: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const pricing = await smartTemplates.getCustomerPricing(input.customerId);
      return pricing;
    }),

  /**
   * Quick add customer
   */
  quickAddCustomer: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        nickname: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const customer = await smartTemplates.quickAddCustomer({
        ...input,
        userId: ctx.user.id,
      });
      return customer;
    }),

  /**
   * Quick add service
   */
  quickAddService: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().min(1),
        category: z.string().min(1),
        basePrice: z.number().optional(),
        priceUnit: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const service = await smartTemplates.quickAddService({
        ...input,
        userId: ctx.userId,
      });
      return service;
    }),

  /**
   * Disambiguate service matches when AI is uncertain
   * Returns multiple candidates for user selection
   */
  disambiguateService: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const candidates = await smartTemplates.disambiguateService(input.query);
      return candidates;
    }),

  /**
   * Disambiguate customer matches when AI is uncertain
   * Returns multiple candidates for user selection
   */
  disambiguateCustomer: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const candidates = await smartTemplates.disambiguateCustomer(input.query);
      return candidates;
    }),
});
