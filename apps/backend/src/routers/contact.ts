import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import { aiRouter } from '../services/ai';
import logger from '../utils/logger';

export const contactRouter = router({
  /**
   * Upload and process multiple business card images for network contacts
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
        logger.info('Processing network contact upload batch', {
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

              // Create Contact record with business card data
              const contact = await prisma.contact.create({
                data: {
                  userId: ctx.user.id,
                  name: cardData.name,
                  phone: cardData.phone || null,
                  email: cardData.email || null,

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

                  category: null, // Can be set later
                  tags: [],
                  source: 'business_card',
                },
              });

              return {
                success: true,
                contact,
                extractedData: cardData,
              };
            } catch (error) {
              logger.error('Failed to process network contact:', error);
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          })
        );

        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;

        logger.info('Network contact batch processing complete', {
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
        logger.error('Network contact upload batch error:', error);
        throw new Error('Failed to process network contacts');
      }
    }),

  /**
   * List network contacts with filtering and search
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().optional(),
        sortBy: z.enum(['createdAt', 'name', 'company']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
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

      // Filter by category
      if (input.category) {
        where.category = input.category;
      }

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          orderBy: { [input.sortBy]: input.sortOrder },
          skip: input.offset,
          take: input.limit,
        }),
        prisma.contact.count({ where }),
      ]);

      return {
        contacts,
        pagination: {
          total,
          offset: input.offset,
          limit: input.limit,
          hasMore: input.offset + input.limit < total,
        },
      };
    }),

  /**
   * Get single network contact by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const contact = await prisma.contact.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      return contact;
    }),

  /**
   * Update network contact information
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
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
          notes: z.string().optional(),
          lastContactedAt: z.date().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const contact = await prisma.contact.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      const updated = await prisma.contact.update({
        where: { id: input.id },
        data: input.data,
      });

      logger.info('Network contact updated', {
        contactId: input.id,
        userId: ctx.user.id,
      });

      return updated;
    }),

  /**
   * Export network contacts to vCard or CSV
   */
  export: protectedProcedure
    .input(
      z.object({
        contactIds: z.array(z.string()).optional(),
        format: z.enum(['vcard', 'csv']),
      })
    )
    .query(async ({ input, ctx }) => {
      const { generateVCard, generateVCardBatch } = await import(
        '../utils/vcard-generator'
      );
      const { generateCSV } = await import('../utils/csv-generator');

      // Get contacts to export
      const where: any = {
        userId: ctx.user.id,
      };

      if (input.contactIds && input.contactIds.length > 0) {
        where.id = { in: input.contactIds };
      }

      const contacts = await prisma.contact.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      if (contacts.length === 0) {
        throw new Error('No contacts found to export');
      }

      // Generate export data
      if (input.format === 'vcard') {
        const vcardData = generateVCardBatch(contacts);
        return {
          data: vcardData,
          mimeType: 'text/vcard;charset=utf-8',
          filename: `contacts_${contacts.length}_${new Date().toISOString().split('T')[0]}.vcf`,
          count: contacts.length,
        };
      } else {
        const csvData = generateCSV(contacts);
        return {
          data: csvData,
          mimeType: 'text/csv;charset=utf-8',
          filename: `contacts_${contacts.length}_${new Date().toISOString().split('T')[0]}.csv`,
          count: contacts.length,
        };
      }
    }),

  /**
   * Delete network contact
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const contact = await prisma.contact.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      await prisma.contact.delete({
        where: { id: input.id },
      });

      logger.info('Network contact deleted', {
        contactId: input.id,
        userId: ctx.user.id,
      });

      return { success: true };
    }),

  /**
   * Get all unique categories
   */
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const contacts = await prisma.contact.findMany({
      where: {
        userId: ctx.user.id,
        category: { not: null },
      },
      select: {
        category: true,
      },
      distinct: ['category'],
    });

    return contacts.map((c) => c.category).filter(Boolean);
  }),

  /**
   * Get all unique tags
   */
  getTags: protectedProcedure.query(async ({ ctx }) => {
    const contacts = await prisma.contact.findMany({
      where: {
        userId: ctx.user.id,
      },
      select: {
        tags: true,
      },
    });

    const allTags = new Set<string>();
    contacts.forEach((contact) => {
      contact.tags.forEach((tag) => allTags.add(tag));
    });

    return Array.from(allTags).sort();
  }),
});
