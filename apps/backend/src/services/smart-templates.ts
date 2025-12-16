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
}

export interface QuickInvoiceLineItem {
  service: {
    id: string;
    name: string;
    code: string;
  };
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
  };
  lineItems: QuickInvoiceLineItem[];
  subtotal: number;
  total: number;
  date: Date;
  confidence: number;
  warnings?: string[];
}

/**
 * Parse quick invoice text and match with database
 */
export async function parseQuickInvoice(input: QuickInvoiceInput): Promise<QuickInvoiceResult> {
  const { text } = input;

  logger.info('Parsing quick invoice', { text });

  // Use AI to extract structured data
  const aiParsed = await aiRouter.parseInvoice(text);

  // Find customer (by name or nickname)
  const customer = await findCustomer(aiParsed.customerName);

  if (!customer) {
    throw new Error(`Customer "${aiParsed.customerName}" not found. Add them first with: npm run cli customer:add`);
  }

  // Process all services into line items
  const lineItems: QuickInvoiceLineItem[] = [];
  const warnings: string[] = [];

  for (const serviceInfo of aiParsed.services) {
    // Find matching service in database
    const service = await findService(serviceInfo.description);

    if (!service) {
      warnings.push(`Service "${serviceInfo.description}" not found in database - skipped`);
      continue;
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
    },
    lineItems,
    subtotal,
    total: subtotal,
    date: new Date(aiParsed.serviceDate),
    confidence: aiParsed.confidence,
    warnings: warnings.length > 0 ? warnings : undefined,
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
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      subtotal: parsed.subtotal,
      total: parsed.total,
      status: 'DRAFT',
      source: 'quick_entry',
      lineItems: {
        create: parsed.lineItems.map((item, index) => ({
          serviceId: item.service.id,
          description: `${item.service.name} - ${item.quantity} ${item.unit}`,
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
async function findService(descQuery: string): Promise<any> {
  // Try vector similarity search first (AI-powered semantic matching)
  const queryEmbedding = await generateEmbedding(descQuery);

  if (queryEmbedding) {
    const services = await prisma.$queryRaw<any[]>`
      SELECT
        id, name, code, category, description, "basePrice", "priceUnit",
        1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector(1536)) as similarity
      FROM "Service"
      WHERE embedding IS NOT NULL
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
}): Promise<any> {
  return prisma.service.create({
    data: {
      name: data.name,
      code: data.code,
      category: data.category,
      basePrice: data.basePrice,
      priceUnit: data.priceUnit || 'unit',
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
