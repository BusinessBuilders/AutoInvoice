import { prisma } from '../utils/db';
import { aiRouter } from './ai';
import logger from '../utils/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { generateEmbedding } from './embeddings';

/**
 * Smart Templates System
 * Pre-configured services and customer data for instant invoice creation
 */

export interface QuickInvoiceInput {
  text: string; // "9999 sq feet of hydroseed for Blair today"
  userId?: string;
  autoCreateCustomer?: boolean; // If true, auto-create new customers (default: true for backwards compat)
  autoCreateService?: boolean;  // If true, auto-create new services (default: false)
}

export interface QuickInvoiceLineItem {
  service?: {  // Optional - orphan line items don't have a service
    id: string;
    name: string;
    code: string;
  };
  description?: string; // For orphan line items without service
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface QuickInvoiceResult {
  customer: {
    id: string;
    name: string;
    email?: string;
    isNew?: boolean; // True if customer was just created or is temporary
  };
  lineItems: QuickInvoiceLineItem[];
  subtotal: number;
  total: number;
  date: Date;
  serviceLocation?: string;
  confidence: number;
  warnings?: string[];
  pendingCustomer?: string; // Name of customer that needs to be created (if autoCreate is off)
  pendingServices?: string[]; // Services that need to be created (if autoCreate is off)
}

/**
 * Parse quick invoice text and match with database
 */
export async function parseQuickInvoice(input: QuickInvoiceInput): Promise<QuickInvoiceResult> {
  const { text, autoCreateCustomer = true, autoCreateService = false } = input;

  logger.info('Parsing quick invoice', { text, autoCreateCustomer, autoCreateService });

  // Use AI to extract structured data
  const aiParsed = await aiRouter.parseInvoice(text);

  // Process all services into line items
  const lineItems: QuickInvoiceLineItem[] = [];
  const warnings: string[] = [];
  const pendingServices: string[] = [];
  let pendingCustomer: string | undefined;
  let customerIsNew = false;

  // Find customer (by name or nickname)
  let customer = await findCustomer(aiParsed.customerName);

  if (!customer) {
    if (autoCreateCustomer) {
      // Auto-create the new customer
      customer = await quickAddCustomer({
        name: aiParsed.customerName,
        nickname: [aiParsed.customerName],
      });
      customerIsNew = true;
      warnings.push(`✨ New customer "${customer.name}" auto-created`);
      logger.info('Auto-created customer', { name: customer.name, id: customer.id });
    } else {
      // Create a temporary customer object (will need to be created on invoice save)
      pendingCustomer = aiParsed.customerName;
      customer = {
        id: 'pending-' + Date.now(),
        name: aiParsed.customerName,
        email: null,
      };
      customerIsNew = true;
      warnings.push(`⚠️ Customer "${aiParsed.customerName}" not found - will be created when you save the invoice`);
      logger.info('Customer pending creation', { name: aiParsed.customerName });
    }
  }

  for (const serviceInfo of aiParsed.services) {
    // Find matching service in database (only user's own services)
    let service = await findService(serviceInfo.description, input.userId);

    const desc = serviceInfo.description;

    // Extract unit from ORIGINAL TEXT (since AI might strip it)
    const unitMatch = text.match(/(sqft|sq\s*ft|square\s*feet?|feet|ft|hours?|hrs?|acres?|units?|tanks?)/i);
    const priceUnit = unitMatch ? unitMatch[1].toLowerCase().replace(/\s+/g, '') : 'unit';

    // Extract price from ORIGINAL TEXT - prioritize explicit $ signs over AI extraction
    let detectedPrice = 0;
    const numberPattern = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';

    // PRIORITY 1: Explicit dollar amounts (e.g., "$750", "$12.50")
    // Look for $ followed by number - this is the most explicit price indicator
    const dollarAmountMatch = text.match(new RegExp(`\\$\\s*(${numberPattern})`, 'i'));
    if (dollarAmountMatch) {
      const extractedPrice = parseFloat(dollarAmountMatch[1]);
      // Use it if it's reasonable and not just the quantity
      if (extractedPrice > 0.01 && extractedPrice !== serviceInfo.quantity) {
        detectedPrice = extractedPrice;
      }
    }

    // PRIORITY 2: If no $ found, check for "cents per" patterns
    if (detectedPrice === 0) {
      // Check for $ sign followed by cents (e.g., "$0.10 cents per")
      const dollarCentsMatch = text.match(new RegExp(`\\$\\s*(${numberPattern})\\s*(?:cent|cents|¢)\\s*(?:per|\/|each)`, 'i'));
      if (dollarCentsMatch) {
        detectedPrice = parseFloat(dollarCentsMatch[1]);
      } else {
        // Check for cents without $ (e.g., "10 cents per" → $0.10)
        const centsMatch = text.match(new RegExp(`(${numberPattern})\\s*(?:cent|cents|¢)\\s*(?:per|\/|each)`, 'i'));
        if (centsMatch) {
          detectedPrice = parseFloat(centsMatch[1]) / 100;
        } else {
          // Check for "X per" patterns (e.g., "5 per hour")
          const perMatch = text.match(new RegExp(`(${numberPattern})\\s*(?:per|\/|each)`, 'i'));
          if (perMatch) {
            detectedPrice = parseFloat(perMatch[1]);
          }
        }
      }
    }

    // PRIORITY 3: Fall back to AI's extracted rate if no explicit price found
    if (detectedPrice === 0) {
      detectedPrice = serviceInfo.rate || 0;
    }

    if (!service) {
      // Don't auto-create service - create orphan line item instead
      const quantity = serviceInfo.quantity;
      const rate = detectedPrice;
      const amount = quantity * Number(rate);

      lineItems.push({
        // No service reference - this is an orphan line item
        description: desc,
        quantity,
        unit: priceUnit,
        rate: Number(rate),
        amount,
      });

      warnings.push(`📝 Service "${desc}" not in catalog - added as one-time item (${detectedPrice > 0 ? `$${detectedPrice}/${priceUnit}` : 'no price set'})`);
      logger.info('Created orphan line item (no service)', { description: desc, rate: detectedPrice, quantity: serviceInfo.quantity });

      continue; // Skip the rest of this loop iteration
    } else if (detectedPrice > 0 && Number(service.basePrice) === 0) {
      // Update existing service with detected price if it currently has no price
      await prisma.service.update({
        where: { id: service.id },
        data: {
          basePrice: detectedPrice,
          priceUnit: priceUnit,
        },
      });
      service.basePrice = detectedPrice as any;
      service.priceUnit = priceUnit;
      warnings.push(`💡 Updated "${service.name}" price to $${detectedPrice}/${priceUnit}`);
      logger.info('Updated service price', { name: service.name, basePrice: detectedPrice, priceUnit });
    }

    // Check for customer-specific pricing
    const customPrice = await prisma.priceOverride.findUnique({
      where: {
        customerId_serviceId: {
          customerId: customer.id,
          serviceId: service.id,
        },
      },
    });

    // Calculate pricing
    const quantity = serviceInfo.quantity;
    const rate = customPrice?.price || service.basePrice || 0;
    const amount = quantity * Number(rate);

    lineItems.push({
      service: {
        id: service.id,
        name: service.name,
        code: service.code,
      },
      quantity,
      unit: service.priceUnit || 'unit',
      rate: Number(rate),
      amount,
    });
  }

  if (lineItems.length === 0) {
    throw new Error('No valid services found in the input. Please check your text and try again.');
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  logger.info('Quick invoice parsed', {
    customer: customer.name,
    lineItemsCount: lineItems.length,
    subtotal,
    warnings,
  });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email || undefined,
      isNew: customerIsNew,
    },
    lineItems,
    subtotal,
    total: subtotal,
    date: new Date(aiParsed.serviceDate),
    serviceLocation: aiParsed.serviceLocation,
    confidence: aiParsed.confidence,
    warnings: warnings.length > 0 ? warnings : undefined,
    pendingCustomer,
    pendingServices: pendingServices.length > 0 ? pendingServices : undefined,
  };
}

/**
 * Create invoice from quick input
 */
export async function createQuickInvoice(input: QuickInvoiceInput): Promise<any> {
  const parsed = await parseQuickInvoice(input);

  // Generate invoice number
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  const lastNumber = lastInvoice
    ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
    : 0;
  const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

  // Create invoice with all line items
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      customerId: parsed.customer.id,
      serviceDate: parsed.date,
      serviceAddress: parsed.serviceLocation,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      subtotal: parsed.subtotal,
      total: parsed.total,
      status: 'DRAFT',
      source: 'quick_entry',
      lineItems: {
        create: parsed.lineItems.map((item, index) => ({
          serviceId: item.service?.id || null,  // Orphan line items have no serviceId
          description: item.service
            ? `${item.service.name} - ${item.quantity} ${item.unit}`  // Service-based description
            : item.description || 'Service',  // Orphan description
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount,
          order: index,
        })),
      },
    },
    include: {
      customer: true,
      lineItems: true,
    },
  });

  logger.info('Quick invoice created', {
    invoiceNumber: invoice.invoiceNumber,
    lineItemsCount: parsed.lineItems.length,
    total: invoice.total,
  });

  return invoice;
}

/**
 * Find customer by name or nickname (AI vector search + fallback)
 */
async function findCustomer(nameQuery: string): Promise<any> {
  // Try vector similarity search first (AI-powered semantic matching)
  const queryEmbedding = await generateEmbedding(nameQuery);

  if (queryEmbedding) {
    const customers = await prisma.$queryRaw<any[]>`
      SELECT
        id, name, email, phone, company, nickname,
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector(1536)) as similarity
      FROM "Customer"
      WHERE embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 3
    `;

    if (customers.length > 0 && customers[0].similarity > 0.7) {
      // High confidence match
      return customers[0];
    }
  }

  // Fallback to exact match
  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { name: { equals: nameQuery, mode: 'insensitive' } },
        { nickname: { has: nameQuery } },
      ],
    },
  });

  // Fallback to partial match
  if (!customer) {
    customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { name: { contains: nameQuery, mode: 'insensitive' } },
          { company: { contains: nameQuery, mode: 'insensitive' } },
        ],
      },
    });
  }

  return customer;
}

/**
 * Find service by description (AI vector search + fallback)
 */
async function findService(descQuery: string, userId?: string): Promise<any> {
  // Try vector similarity search first (AI-powered semantic matching)
  const queryEmbedding = await generateEmbedding(descQuery);

  if (queryEmbedding && userId) {
    const services = await prisma.$queryRaw<any[]>`
      SELECT
        id, name, code, category, description, "basePrice", "priceUnit",
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector(1536)) as similarity
      FROM "Service"
      WHERE embedding IS NOT NULL
        AND "userId" = ${userId}
      ORDER BY similarity DESC
      LIMIT 3
    `;

    if (services.length > 0 && services[0].similarity > 0.6) {
      // Good confidence match (lowered from 0.7 to 0.6 for better recall)
      return services[0];
    }
  }

  // Fallback to keyword matching (minimal - let GPT-4o + embeddings do the heavy lifting)
  const serviceKeywords: Record<string, string[]> = {
    'hydroseed': ['hydroseed', 'hydroseeding'],
    'mow': ['mow', 'mowing'],
    'salt': ['salt', 'salting'],
    'fertilize': ['fertilize', 'fertilizer'],
    'trim': ['trim', 'trimming'],
  };

  const queryLower = descQuery.toLowerCase();

  for (const [code, keywords] of Object.entries(serviceKeywords)) {
    if (keywords.some((kw) => queryLower.includes(kw))) {
      const service = await prisma.service.findFirst({
        where: { code: { contains: code, mode: 'insensitive' } },
      });
      if (service) return service;
    }
  }

  // Fallback to exact name match
  let service = await prisma.service.findFirst({
    where: {
      name: { contains: descQuery, mode: 'insensitive' },
    },
  });

  // Fallback to code match
  if (!service) {
    service = await prisma.service.findFirst({
      where: {
        code: { contains: descQuery, mode: 'insensitive' },
      },
    });
  }

  return service;
}

/**
 * Set customer-specific pricing
 */
export async function setCustomerPricing(
  customerNameOrId: string,
  serviceCodeOrName: string,
  price: number,
  unit?: string
): Promise<void> {
  // Check if it's an ID (UUID format) or name
  const isCustomerId = customerNameOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const isServiceId = serviceCodeOrName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  let customerId: string;
  let serviceId: string;

  if (isCustomerId) {
    customerId = customerNameOrId;
  } else {
    const customer = await findCustomer(customerNameOrId);
    if (!customer) {
      throw new Error(`Customer "${customerNameOrId}" not found`);
    }
    customerId = customer.id;
  }

  if (isServiceId) {
    serviceId = serviceCodeOrName;
  } else {
    const service = await findService(serviceCodeOrName);
    if (!service) {
      throw new Error(`Service "${serviceCodeOrName}" not found`);
    }
    serviceId = service.id;
  }

  // Create or update price override
  await prisma.priceOverride.upsert({
    where: {
      customerId_serviceId: {
        customerId,
        serviceId,
      },
    },
    create: {
      customerId,
      serviceId,
      price,
      unit,
    },
    update: {
      price,
      unit,
    },
  });

  logger.info('Customer pricing set', {
    customerId,
    serviceId,
    price,
    unit,
  });
}

/**
 * Get customer pricing overview
 */
export async function getCustomerPricing(customerNameOrId: string): Promise<any[]> {
  const customer = await findCustomer(customerNameOrId);
  if (!customer) {
    throw new Error(`Customer "${customerNameOrId}" not found`);
  }

  const overrides = await prisma.priceOverride.findMany({
    where: { customerId: customer.id },
    include: {
      service: true,
    },
  });

  return overrides.map((override) => ({
    service: override.service.name,
    code: override.service.code,
    customPrice: Number(override.price),
    defaultPrice: Number(override.service.basePrice || 0),
    unit: override.unit || override.service.priceUnit,
  }));
}

/**
 * Quick add customer
 */
export async function quickAddCustomer(data: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  nickname?: string[];
}): Promise<any> {
  return prisma.customer.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      addressLine1: data.address,
      nickname: data.nickname || [data.name],
      tags: ['quick_add'],
    },
  });
}

/**
 * Quick add service
 */
export async function quickAddService(data: {
  name: string;
  code: string;
  category: string;
  basePrice?: number;
  priceUnit?: string;
  userId: string;
}): Promise<any> {
  return prisma.service.create({
    data: {
      name: data.name,
      code: data.code,
      category: data.category,
      basePrice: data.basePrice,
      priceUnit: data.priceUnit || 'unit',
      userId: data.userId,
    },
  });
}

/**
 * Get multiple service candidates for disambiguation
 * Returns top matches with similarity scores
 */
export async function disambiguateService(query: string): Promise<any[]> {
  // Try vector similarity search first
  const queryEmbedding = await generateEmbedding(query);

  if (queryEmbedding) {
    const services = await prisma.$queryRaw<any[]>`
      SELECT
        id, name, code, category, description, "basePrice", "priceUnit",
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector(1536)) as similarity
      FROM "Service"
      WHERE embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 5
    `;

    if (services.length > 0) {
      return services.map((service) => ({
        id: service.id,
        name: service.name,
        code: service.code,
        category: service.category,
        description: service.description,
        basePrice: Number(service.basePrice || 0),
        priceUnit: service.priceUnit,
        similarity: Number(service.similarity),
        confidence: service.similarity > 0.7 ? 'high' : service.similarity > 0.5 ? 'medium' : 'low',
      }));
    }
  }

  // Fallback to keyword search
  const queryLower = query.toLowerCase();
  const services = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { code: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 5,
  });

  return services.map((service) => ({
    id: service.id,
    name: service.name,
    code: service.code,
    category: service.category,
    description: service.description,
    basePrice: Number(service.basePrice || 0),
    priceUnit: service.priceUnit,
    similarity: 0,
    confidence: 'low',
  }));
}

/**
 * Get multiple customer candidates for disambiguation
 * Returns top matches with similarity scores
 */
export async function disambiguateCustomer(query: string): Promise<any[]> {
  // Try vector similarity search first
  const queryEmbedding = await generateEmbedding(query);

  if (queryEmbedding) {
    const customers = await prisma.$queryRaw<any[]>`
      SELECT
        id, name, email, phone, company, nickname,
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector(1536)) as similarity
      FROM "Customer"
      WHERE embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 5
    `;

    if (customers.length > 0) {
      return customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        company: customer.company,
        nickname: customer.nickname,
        similarity: Number(customer.similarity),
        confidence: customer.similarity > 0.7 ? 'high' : customer.similarity > 0.5 ? 'medium' : 'low',
      }));
    }
  }

  // Fallback to keyword search
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { company: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { nickname: { has: query } },
      ],
    },
    take: 5,
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    nickname: customer.nickname,
    similarity: 0,
    confidence: 'low',
  }));
}
