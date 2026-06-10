import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import { aiRouter } from '../services/ai';
import logger from '../utils/logger';

export const leadBusinessCardRouter = router({
  /**
   * Upload and process multiple business card images
   */
  upload: protectedProcedure
    .input(
      z.object({
        images: z.array(
          z.object({
            imageBase64: z.string(),
            filename: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        logger.info('Processing business card upload batch', {
          userId: ctx.user.id,
          imageCount: input.images.length,
        });

        // Process all images in parallel
        const results = await Promise.all(
          input.images.map(async (img) => {
            try {
              const imageBuffer = Buffer.from(img.imageBase64, 'base64');

              // Extract business card data using AI vision
              const cardData = await aiRouter.extractBusinessCard(imageBuffer);

              // Create Lead record with business card data
              const lead = await prisma.lead.create({
                data: {
                  userId: ctx.user.id,
                  name: cardData.name,
                  phone: cardData.phone || '',
                  email: cardData.email || null,
                  source: 'business_card',

                  // Business card specific fields
                  company: cardData.company || null,
                  title: cardData.title || null,
                  website: cardData.website || null,
                  linkedIn: cardData.linkedIn || null,
                  twitter: cardData.twitter || null,
                  facebook: cardData.facebook || null,
                  instagram: cardData.instagram || null,
                  addressLine1: cardData.addressLine1 || null,
                  addressLine2: cardData.addressLine2 || null,
                  city: cardData.city || null,
                  state: cardData.state || null,
                  zipCode: cardData.zipCode || null,
                  country: cardData.country || null,

                  // Image storage
                  businessCardImageData: imageBuffer,
                  businessCardImageUrl: null,
                  extractedData: cardData as any,
                  extractionConfidence: cardData.confidence,

                  status: 'NEW',
                },
              });

              return {
                success: true,
                lead,
                extractedData: cardData,
              };
            } catch (error) {
              logger.error('Failed to process business card:', error);
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          })
        );

        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;

        logger.info('Business card batch processing complete', {
          total: input.images.length,
          successful: successCount,
          failed: failureCount,
        });

        return {
          results,
          summary: {
            total: input.images.length,
            successful: successCount,
            failed: failureCount,
          },
        };
      } catch (error) {
        logger.error('Business card upload batch error:', error);
        throw new Error('Failed to process business cards');
      }
    }),

  /**
   * List business card leads with filtering and search
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST', 'DEAD']).optional(),
        sortBy: z.enum(['createdAt', 'name', 'company']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
        source: 'business_card',
      };

      // Search across name, company, email, phone
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { company: { contains: input.search, mode: 'insensitive' } },
          { email: { contains: input.search, mode: 'insensitive' } },
          { phone: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      // Filter by tags
      if (input.tags && input.tags.length > 0) {
        where.tags = { hasSome: input.tags };
      }

      // Filter by status
      if (input.status) {
        where.status = input.status;
      }

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { [input.sortBy]: input.sortOrder },
          skip: input.offset,
          take: input.limit,
          include: {
            notes: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        }),
        prisma.lead.count({ where }),
      ]);

      return {
        leads,
        pagination: {
          total,
          offset: input.offset,
          limit: input.limit,
          hasMore: input.offset + input.limit < total,
        },
      };
    }),

  /**
   * Get single business card lead by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
          source: 'business_card',
        },
        include: {
          notes: {
            orderBy: { createdAt: 'desc' },
          },
          reminders: {
            orderBy: { remindAt: 'asc' },
          },
        },
      });

      if (!lead) {
        throw new Error('Business card lead not found');
      }

      return lead;
    }),

  /**
   * Update business card lead information
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
          company: z.string().optional(),
          title: z.string().optional(),
          website: z.string().optional(),
          linkedIn: z.string().optional(),
          twitter: z.string().optional(),
          facebook: z.string().optional(),
          instagram: z.string().optional(),
          addressLine1: z.string().optional(),
          addressLine2: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zipCode: z.string().optional(),
          country: z.string().optional(),
          status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST', 'DEAD']).optional(),
          tags: z.array(z.string()).optional(),
          message: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      const updated = await prisma.lead.update({
        where: { id: input.id },
        data: input.data,
      });

      logger.info('Business card lead updated', {
        leadId: input.id,
        userId: ctx.user.id,
      });

      return updated;
    }),

  /**
   * Add note to business card lead
   */
  addNote: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify lead exists and belongs to user
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.leadId,
          userId: ctx.user.id,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      const note = await prisma.leadNote.create({
        data: {
          leadId: input.leadId,
          content: input.content,
        },
      });

      logger.info('Note added to business card lead', {
        leadId: input.leadId,
        noteId: note.id,
      });

      return note;
    }),

  /**
   * Convert business card lead to customer
   */
  convertToCustomer: protectedProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.leadId,
          userId: ctx.user.id,
          source: 'business_card',
        },
      });

      if (!lead) {
        throw new Error('Business card lead not found');
      }

      if (lead.convertedToCustomerId) {
        throw new Error('Lead already converted to customer');
      }

      // Create customer from lead data
      const customer = await prisma.customer.create({
        data: {
          userId: ctx.user.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          company: lead.company || null,
          addressLine1: lead.addressLine1 || null,
          addressLine2: lead.addressLine2 || null,
          city: lead.city || null,
          state: lead.state || null,
          zipCode: lead.zipCode || null,
        },
      });

      // Update lead with customer link and status
      await prisma.lead.update({
        where: { id: input.leadId },
        data: {
          convertedToCustomerId: customer.id,
          status: 'WON',
        },
      });

      logger.info('Business card lead converted to customer', {
        leadId: input.leadId,
        customerId: customer.id,
      });

      return customer;
    }),

  /**
   * Export business card leads to vCard or CSV
   */
  export: protectedProcedure
    .input(
      z.object({
        leadIds: z.array(z.string()).optional(),
        format: z.enum(['vcard', 'csv']),
      })
    )
    .query(async ({ input, ctx }) => {
      const { generateVCard, generateVCardBatch } = await import(
        '../utils/vcard-generator'
      );
      const { generateCSV } = await import('../utils/csv-generator');

      // Get leads to export
      const where: any = {
        userId: ctx.user.id,
        source: 'business_card',
      };

      if (input.leadIds && input.leadIds.length > 0) {
        where.id = { in: input.leadIds };
      }

      const leads = await prisma.lead.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      if (leads.length === 0) {
        throw new Error('No leads found to export');
      }

      // Generate export data
      if (input.format === 'vcard') {
        const vcardData = generateVCardBatch(leads);
        return {
          data: vcardData,
          mimeType: 'text/vcard;charset=utf-8',
          filename: `leads_${leads.length}_${new Date().toISOString().split('T')[0]}.vcf`,
          count: leads.length,
        };
      } else {
        const csvData = generateCSV(leads);
        return {
          data: csvData,
          mimeType: 'text/csv;charset=utf-8',
          filename: `leads_${leads.length}_${new Date().toISOString().split('T')[0]}.csv`,
          count: leads.length,
        };
      }
    }),

  /**
   * Delete business card lead
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      await prisma.lead.delete({
        where: { id: input.id },
      });

      logger.info('Business card lead deleted', {
        leadId: input.id,
        userId: ctx.user.id,
      });

      return { success: true };
    }),
});
