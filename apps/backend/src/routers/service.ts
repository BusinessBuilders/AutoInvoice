import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { generateServiceEmbedding, generateEmbedding, cosineSimilarity } from '../services/embeddings';
import { aiRouter } from '../services/ai/router';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';

// Helper to detect if buffer is a PDF
function isPdf(buffer: Buffer): boolean {
  // PDF magic bytes: %PDF
  return buffer.length > 4 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46;   // F
}

// Convert PDF to image using pdf-to-img
async function convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    // Dynamic import for ESM module
    const pdfToImg = await import('pdf-to-img');
    const pdfDoc = await pdfToImg.pdf(pdfBuffer, { scale: 2 });

    // Get first page
    const page = await pdfDoc.getPage(1);

    logger.info('Converted PDF to image successfully');
    return Buffer.from(page);
  } catch (error: any) {
    logger.error('PDF conversion failed', { error: error.message });
    throw new Error(`Failed to convert PDF to image: ${error.message}`);
  }
}

const createServiceSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string(),
  description: z.string().optional(),
  basePrice: z.number().optional(),
  priceUnit: z.string().optional(),
  customerTag: z.string().optional(), // Customer this service is for (e.g., "Westview", "Hawthorn")
});

export const serviceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.service.findMany({
      where: { userId: ctx.user.id },
      orderBy: { category: 'asc' },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.service.findUnique({
        where: {
          id: input.id,
          userId: ctx.user.id, // Only return if owned by current user
        },
      });
    }),

  create: protectedProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      // Generate embedding for semantic search
      const embedding = await generateServiceEmbedding({
        name: input.name,
        code: input.code,
        description: input.description,
        category: input.category,
      });

      // Create service without embedding first
      const service = await ctx.prisma.service.create({
        data: {
          ...input,
          userId: ctx.user.id, // Set owner
        },
      });

      // Then update with embedding via raw SQL
      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Service"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${service.id}
        `;
      }

      return service;
    }),

  update: protectedProcedure
    .input(createServiceSchema.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Regenerate embedding if any relevant fields changed
      let embedding: number[] | null = null;
      if (data.name || data.code || data.description || data.category) {
        const existing = await ctx.prisma.service.findUnique({
          where: {
            id,
            userId: ctx.user.id, // Only allow updating own services
          },
        });

        if (existing) {
          embedding = await generateServiceEmbedding({
            name: data.name || existing.name,
            code: data.code || existing.code,
            description: data.description !== undefined ? data.description : existing.description,
            category: data.category || existing.category,
          });
        }
      }

      // Update service data without embedding first
      const service = await ctx.prisma.service.update({
        where: {
          id,
          userId: ctx.user.id, // Only update own services
        },
        data: {
          ...data,
        },
      });

      // Then update embedding via raw SQL if it was regenerated
      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Service"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${id}
        `;
      }

      return service;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.service.delete({
        where: {
          id: input.id,
          userId: ctx.user.id, // Only delete own services
        },
      });
    }),

  /**
   * Force add a service (bypassing duplicate detection)
   * Used for "Add Anyway" when importing services that were flagged as duplicates
   */
  forceAdd: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      code: z.string().min(1),
      category: z.string(),
      description: z.string().optional(),
      basePrice: z.number().optional(),
      priceUnit: z.string().optional(),
      customerTag: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Check if code already exists for this user
      const existingCode = await ctx.prisma.service.findUnique({
        where: {
          userId_code: {
            userId,
            code: input.code,
          },
        },
      });

      // If code exists, append customer tag or number to make unique
      let uniqueCode = input.code;
      if (existingCode) {
        if (input.customerTag) {
          uniqueCode = `${input.code}_${input.customerTag.toUpperCase().replace(/\s+/g, '_')}`;
        } else {
          // Append a number
          const count = await ctx.prisma.service.count({
            where: {
              userId,
              code: { startsWith: input.code },
            },
          });
          uniqueCode = `${input.code}_${count + 1}`;
        }
      }

      // Generate embedding for semantic search
      const embedding = await generateServiceEmbedding({
        name: input.name,
        code: uniqueCode,
        description: input.description,
        category: input.category,
      });

      // Create service
      const service = await ctx.prisma.service.create({
        data: {
          name: input.name,
          code: uniqueCode,
          category: input.category,
          description: input.description,
          basePrice: input.basePrice,
          priceUnit: input.priceUnit,
          customerTag: input.customerTag,
          userId,
        },
      });

      // Update with embedding via raw SQL
      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Service"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${service.id}
        `;
      }

      logger.info('Force added service', {
        serviceId: service.id,
        name: input.name,
        code: uniqueCode,
        customerTag: input.customerTag,
        userId,
      });

      return service;
    }),

  /**
   * Import services from a PDF pricing document
   * Uses AI vision to extract services and semantic matching to detect duplicates
   * If customerId is provided, creates PriceOverrides for customer-specific pricing
   */
  importFromPdf: protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      similarityThreshold: z.number().min(0).max(1).default(0.85),
      dryRun: z.boolean().default(false),
      customerId: z.string().optional(), // If provided, create PriceOverrides instead of base prices
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const isCustomerPricing = !!input.customerId;
      logger.info('Importing services from PDF', {
        userId,
        dryRun: input.dryRun,
        customerId: input.customerId,
        mode: isCustomerPricing ? 'customer-pricing' : 'base-pricing'
      });

      // Verify customer exists if customerId provided
      if (input.customerId) {
        const customer = await ctx.prisma.customer.findUnique({
          where: { id: input.customerId },
        });
        if (!customer) {
          throw new Error('Customer not found');
        }
      }

      // 1. Decode the file and extract pricing using AI vision
      const originalBuffer = Buffer.from(input.fileBase64, 'base64');

      // Convert PDF to image if needed (GPT-4 Vision only accepts images)
      let imageBuffer: Buffer;
      if (isPdf(originalBuffer)) {
        logger.info('Detected PDF, converting to image...');
        imageBuffer = await convertPdfToImage(originalBuffer);
      } else {
        imageBuffer = originalBuffer;
      }

      const extracted = await aiRouter.extractPricing(imageBuffer);

      if (!extracted.services || extracted.services.length === 0) {
        return {
          success: true,
          message: 'No services found in the document',
          extracted: [],
          created: [],
          skipped: [],
          confidence: extracted.confidence,
        };
      }

      logger.info('AI extracted services from PDF', {
        count: extracted.services.length,
        confidence: extracted.confidence,
      });

      // 2. Get existing services with embeddings
      const existingServices = await ctx.prisma.service.findMany({
        where: { userId },
        select: { id: true, name: true, code: true, category: true, description: true },
      });

      // Fetch embeddings for existing services via raw query (pgvector)
      // Note: pgvector's vector type must be cast to text first, then parsed in JS
      const existingEmbeddingsRaw: { id: string; embedding_text: string }[] = existingServices.length > 0
        ? await ctx.prisma.$queryRaw`
            SELECT id, embedding::text as embedding_text
            FROM "Service"
            WHERE id = ANY(${existingServices.map(s => s.id)}) AND embedding IS NOT NULL
          `
        : [];

      // Parse vector text format "[0.1,0.2,...]" to number array
      const embeddingMap = new Map<string, number[]>();
      for (const row of existingEmbeddingsRaw) {
        try {
          // pgvector returns format like "[0.1,0.2,0.3]"
          const parsed = JSON.parse(row.embedding_text);
          embeddingMap.set(row.id, parsed);
        } catch {
          logger.warn('Failed to parse embedding for service', { id: row.id });
        }
      }

      // 3. Process each extracted service
      const results = {
        created: [] as { name: string; code: string; category: string; basePrice: number }[],
        skipped: [] as {
          name: string;
          code: string;
          category: string;
          description?: string;
          basePrice: number;
          priceUnit?: string;
          reason: string;
          matchedService?: string;
          similarity?: number
        }[],
        overrides: [] as { name: string; price: number; existingService?: string }[], // Customer-specific prices
      };

      for (const service of extracted.services) {
        // Generate embedding for the new service
        const serviceText = [service.name, service.code, service.category, service.description].filter(Boolean).join(' | ');
        const newEmbedding = await generateEmbedding(serviceText);

        // Check for duplicates by semantic similarity
        let isDuplicate = false;
        let matchedService: string | undefined;
        let matchedServiceId: string | undefined;
        let highestSimilarity = 0;

        if (newEmbedding) {
          for (const existing of existingServices) {
            const existingEmb = embeddingMap.get(existing.id);
            if (existingEmb) {
              const similarity = cosineSimilarity(newEmbedding, existingEmb);
              if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                matchedService = existing.name;
                matchedServiceId = existing.id;
              }
              if (similarity >= input.similarityThreshold) {
                isDuplicate = true;
                break;
              }
            }
          }
        }

        // Also check for exact code match
        const codeMatch = existingServices.find(
          s => s.code.toLowerCase() === (service.code || '').toLowerCase()
        );
        if (codeMatch) {
          isDuplicate = true;
          matchedService = codeMatch.name;
          matchedServiceId = codeMatch.id;
          highestSimilarity = 1.0;
        }

        // CUSTOMER-SPECIFIC PRICING MODE
        if (isCustomerPricing && input.customerId) {
          let serviceId: string;
          let serviceName: string;

          if (matchedServiceId) {
            // Use existing service for the PriceOverride
            serviceId = matchedServiceId;
            serviceName = matchedService || service.name;
          } else {
            // Create new service first, then add override
            if (!input.dryRun) {
              const embedding = await generateServiceEmbedding({
                name: service.name,
                code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
                description: service.description,
                category: service.category || 'General',
              });

              const newService = await ctx.prisma.service.create({
                data: {
                  name: service.name,
                  code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
                  category: service.category || 'General',
                  description: service.description,
                  basePrice: 0, // Base price is 0, actual price in override
                  priceUnit: service.priceUnit,
                  userId,
                },
              });

              if (embedding) {
                await ctx.prisma.$executeRaw`
                  UPDATE "Service"
                  SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
                  WHERE id = ${newService.id}
                `;
              }

              serviceId = newService.id;
            } else {
              serviceId = 'dry-run-id';
            }
            serviceName = service.name;

            results.created.push({
              name: service.name,
              code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
              category: service.category || 'General',
              basePrice: 0,
            });
          }

          // Create or update PriceOverride for this customer
          if (!input.dryRun && serviceId !== 'dry-run-id') {
            await ctx.prisma.priceOverride.upsert({
              where: {
                customerId_serviceId: {
                  customerId: input.customerId,
                  serviceId: serviceId,
                },
              },
              create: {
                customerId: input.customerId,
                serviceId: serviceId,
                price: service.basePrice,
                unit: service.priceUnit,
              },
              update: {
                price: service.basePrice,
                unit: service.priceUnit,
              },
            });
          }

          results.overrides.push({
            name: service.name,
            price: service.basePrice,
            existingService: matchedServiceId ? matchedService : undefined,
          });

          continue;
        }

        // BASE PRICING MODE (no customer selected)
        if (isDuplicate) {
          results.skipped.push({
            name: service.name,
            code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
            category: service.category || 'General',
            description: service.description,
            basePrice: service.basePrice,
            priceUnit: service.priceUnit,
            reason: 'Similar service already exists',
            matchedService,
            similarity: highestSimilarity,
          });
          continue;
        }

        // Create the service (unless dry run)
        if (!input.dryRun) {
          const embedding = await generateServiceEmbedding({
            name: service.name,
            code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
            description: service.description,
            category: service.category || 'General',
          });

          const newService = await ctx.prisma.service.create({
            data: {
              name: service.name,
              code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
              category: service.category || 'General',
              description: service.description,
              basePrice: service.basePrice,
              priceUnit: service.priceUnit,
              userId,
            },
          });

          // Update with embedding
          if (embedding) {
            await ctx.prisma.$executeRaw`
              UPDATE "Service"
              SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
              WHERE id = ${newService.id}
            `;
          }
        }

        results.created.push({
          name: service.name,
          code: service.code || service.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20),
          category: service.category || 'General',
          basePrice: service.basePrice,
        });
      }

      logger.info('PDF import completed', {
        userId,
        created: results.created.length,
        skipped: results.skipped.length,
        overrides: results.overrides.length,
        dryRun: input.dryRun,
        customerId: input.customerId,
      });

      // Build message based on mode
      let message: string;
      if (isCustomerPricing) {
        if (input.dryRun) {
          message = `Preview: Would set ${results.overrides.length} customer prices${results.created.length > 0 ? ` and create ${results.created.length} new services` : ''}`;
        } else {
          message = `Set ${results.overrides.length} customer prices${results.created.length > 0 ? ` and created ${results.created.length} new services` : ''}`;
        }
      } else {
        if (input.dryRun) {
          message = `Preview: Would create ${results.created.length} services, skip ${results.skipped.length} duplicates`;
        } else {
          message = `Created ${results.created.length} services, skipped ${results.skipped.length} duplicates`;
        }
      }

      return {
        success: true,
        message,
        extracted: extracted.services,
        created: results.created,
        skipped: results.skipped,
        overrides: results.overrides,
        confidence: extracted.confidence,
        mode: isCustomerPricing ? 'customer-pricing' : 'base-pricing',
      };
    }),
});
