import { prisma } from '../utils/db';
import { findCustomer } from './smart-templates';

const DEFAULT_COMPANY_ID = 'donovan-farms';

export class StructuredInvoiceError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export interface StructuredLineItem {
  description: string;
  quantity: number;
  rate: number; // dollars
}

export interface StructuredInvoiceInput {
  customer: { name?: string; customer_id?: string };
  lineItems: StructuredLineItem[];
  serviceAddress?: string;
  serviceDate?: string; // YYYY-MM-DD
  companyId?: string;
  confirmCreateCustomer?: boolean;
}

export type StructuredInvoiceResult =
  | { ok: true; invoice: any }
  | { ok: false; needs: 'customer_confirmation'; query: string; candidates: { id: string; name: string }[] };

function validate(input: StructuredInvoiceInput): void {
  if (!input.lineItems || input.lineItems.length === 0) {
    throw new StructuredInvoiceError('At least one line item is required');
  }
  for (const li of input.lineItems) {
    if (!li.description || !li.description.trim()) throw new StructuredInvoiceError('Each line item needs a description');
    if (!(li.quantity > 0)) throw new StructuredInvoiceError('Each line item needs a quantity greater than 0');
    if (li.rate < 0) throw new StructuredInvoiceError('Line item rate cannot be negative');
  }
  if (!input.customer?.name && !input.customer?.customer_id) {
    throw new StructuredInvoiceError('A customer name or customer_id is required');
  }
}

export async function createStructuredInvoice(input: StructuredInvoiceInput): Promise<StructuredInvoiceResult> {
  validate(input);

  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const company = await prisma.company.findFirst({ where: { id: companyId, active: true }, select: { id: true, userId: true } });
  if (!company) throw new StructuredInvoiceError(`Unknown or inactive company: ${companyId}`);
  const ownerUserId = company.userId;

  // Resolve customer
  let customer: { id: string; name: string } | null = null;
  if (input.customer.customer_id) {
    const c = await prisma.customer.findFirst({ where: { id: input.customer.customer_id, userId: ownerUserId }, select: { id: true, name: true } });
    if (!c) throw new StructuredInvoiceError(`Customer not found: ${input.customer.customer_id}`, 404);
    customer = c;
  } else {
    const name = input.customer.name!;
    const matched = await findCustomer(name, ownerUserId);
    if (matched) {
      customer = { id: matched.id, name: matched.name };
    } else if (input.confirmCreateCustomer) {
      customer = await prisma.customer.create({ data: { userId: ownerUserId, name }, select: { id: true, name: true } });
    } else {
      return { ok: false, needs: 'customer_confirmation', query: name, candidates: [] };
    }
  }

  // Build line items (Eve-confirmed rates; orphan line items, no serviceId)
  const lineItems = input.lineItems.map((li, index) => {
    const amount = Math.round(li.quantity * li.rate * 100) / 100;
    return { serviceId: null as string | null, description: li.description.trim(), quantity: li.quantity, unit: null as string | null, rate: li.rate, amount, order: index };
  });
  const subtotal = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100;

  // Invoice number (same scheme as createQuickInvoice)
  const lastInvoice = await prisma.invoice.findFirst({ orderBy: { createdAt: 'desc' }, select: { invoiceNumber: true } });
  const lastNumber = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
  const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

  const serviceDate = input.serviceDate ? new Date(input.serviceDate) : new Date();

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      userId: ownerUserId,
      companyId: company.id,
      customerId: customer.id,
      serviceDate,
      serviceAddress: input.serviceAddress,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal,
      total: subtotal,
      status: 'DRAFT',
      source: 'eve',
      lineItems: { create: lineItems },
    },
    include: { customer: true, lineItems: true },
  });

  return { ok: true, invoice };
}
