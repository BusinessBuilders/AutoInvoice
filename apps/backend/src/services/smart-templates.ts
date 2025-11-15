import { prisma } from '../utils/db';
import { aiRouter } from './ai';
import logger from '../utils/logger';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Smart Templates System
 * Pre-configured services and customer data for instant invoice creation
 */

export interface QuickInvoiceInput {
  text: string; // "9999 sq feet of hydroseed for Blair today"
  userId?: string;
}

export interface QuickInvoiceResult {
  customer: {
    id: string;
    name: string;
    email?: string;
  };
  service: {
    id: string;
    name: string;
    code: string;
  };
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  date: Date;
  confidence: number;
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

  // Extract first service (for quick entry)
  const serviceInfo = aiParsed.services[0];

  // Find matching service in database
  const service = await findService(serviceInfo.description);

  if (!service) {
    throw new Error(`Service "${serviceInfo.description}" not found. Add it first with: npm run cli service:add`);
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
  const total = quantity * Number(rate);

  logger.info('Quick invoice parsed', {
    customer: customer.name,
    service: service.name,
    quantity,
    rate,
    total,
  });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email || undefined,
    },
    service: {
      id: service.id,
      name: service.name,
      code: service.code,
    },
    quantity,
    unit: service.priceUnit || 'unit',
    rate: Number(rate),
    total,
    date: new Date(aiParsed.serviceDate),
    confidence: aiParsed.confidence,
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

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      customerId: parsed.customer.id,
      serviceDate: parsed.date,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      subtotal: parsed.total,
      total: parsed.total,
      status: 'DRAFT',
      source: 'quick_entry',
      lineItems: {
        create: [
          {
            serviceId: parsed.service.id,
            description: `${parsed.service.name} - ${parsed.quantity} ${parsed.unit}`,
            quantity: parsed.quantity,
            unit: parsed.unit,
            rate: parsed.rate,
            amount: parsed.total,
            order: 0,
          },
        ],
      },
    },
    include: {
      customer: true,
      lineItems: true,
    },
  });

  logger.info('Quick invoice created', {
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
  });

  return invoice;
}

/**
 * Find customer by name or nickname (fuzzy match)
 */
async function findCustomer(nameQuery: string): Promise<any> {
  // Try exact match first
  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { name: { equals: nameQuery, mode: 'insensitive' } },
        { nickname: { has: nameQuery } },
      ],
    },
  });

  // Try partial match
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
 * Find service by description (fuzzy match)
 */
async function findService(descQuery: string): Promise<any> {
  // Common mappings
  const serviceKeywords: Record<string, string[]> = {
    'hydroseed': ['hydroseed', 'hydroseeding', 'seed'],
    'lawn_mow': ['mow', 'mowing', 'lawn', 'grass'],
    'salt': ['salt', 'salting', 'de-ice', 'ice'],
    'fertilize': ['fertilize', 'fertilizer', 'fert'],
    'trim': ['trim', 'trimming', 'edge', 'edging'],
  };

  // Try to match keywords
  const queryLower = descQuery.toLowerCase();

  for (const [code, keywords] of Object.entries(serviceKeywords)) {
    if (keywords.some((kw) => queryLower.includes(kw))) {
      const service = await prisma.service.findFirst({
        where: { code: { contains: code, mode: 'insensitive' } },
      });
      if (service) return service;
    }
  }

  // Try exact name match
  let service = await prisma.service.findFirst({
    where: {
      name: { contains: descQuery, mode: 'insensitive' },
    },
  });

  // Try code match
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
  // Find customer
  const customer = await findCustomer(customerNameOrId);
  if (!customer) {
    throw new Error(`Customer "${customerNameOrId}" not found`);
  }

  // Find service
  const service = await findService(serviceCodeOrName);
  if (!service) {
    throw new Error(`Service "${serviceCodeOrName}" not found`);
  }

  // Create or update price override
  await prisma.priceOverride.upsert({
    where: {
      customerId_serviceId: {
        customerId: customer.id,
        serviceId: service.id,
      },
    },
    create: {
      customerId: customer.id,
      serviceId: service.id,
      price,
      unit: unit || service.priceUnit,
    },
    update: {
      price,
      unit: unit || service.priceUnit,
    },
  });

  logger.info('Customer pricing set', {
    customer: customer.name,
    service: service.name,
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
