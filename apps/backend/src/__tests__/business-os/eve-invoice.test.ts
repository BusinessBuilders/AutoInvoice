import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createStructuredInvoice, StructuredInvoiceError } from '../../services/eve-invoice';

const prisma = new PrismaClient();

describe('eve-invoice: createStructuredInvoice', () => {
  let ownerId: string;
  let companyId: string;

  beforeEach(async () => {
    const owner = await prisma.user.create({
      data: { email: 'eve-owner@test.com', password: 'x', name: 'Owner', role: 'OWNER' },
    });
    ownerId = owner.id;
    companyId = (await prisma.company.create({ data: { id: 'donovan-farms', userId: ownerId, name: 'Donovan Farms' } })).id;
  });

  it('rejects empty line items', async () => {
    await expect(
      createStructuredInvoice({ customer: { name: 'X' }, lineItems: [] })
    ).rejects.toThrow(StructuredInvoiceError);
  });

  it('rejects a line item with non-positive quantity or negative rate', async () => {
    await expect(
      createStructuredInvoice({ customer: { name: 'X' }, lineItems: [{ description: 'Mow', quantity: 0, rate: 50 }] })
    ).rejects.toThrow(/quantity/i);
    await expect(
      createStructuredInvoice({ customer: { name: 'X' }, lineItems: [{ description: 'Mow', quantity: 1, rate: -5 }] })
    ).rejects.toThrow(/rate/i);
  });

  it('returns a customer_confirmation signal (no invoice written) when the name has no match', async () => {
    const res = await createStructuredInvoice({
      customer: { name: 'Nobody McGhost' },
      lineItems: [{ description: 'Mowing', quantity: 1, rate: 50 }],
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.needs).toBe('customer_confirmation');
      expect(res.query).toBe('Nobody McGhost');
    }
    expect(await prisma.invoice.count()).toBe(0);
  });

  it('creates a DRAFT invoice for a matched customer with correct totals and source=eve', async () => {
    await prisma.customer.create({ data: { userId: ownerId, name: 'Brown Family' } });
    const res = await createStructuredInvoice({
      customer: { name: 'Brown Family' },
      lineItems: [
        { description: 'Mowing', quantity: 3, rate: 50 },
        { description: 'Edging', quantity: 1, rate: 20 },
      ],
      serviceAddress: '14 Oak St',
      serviceDate: '2026-06-15',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.invoice.status).toBe('DRAFT');
      expect(res.invoice.source).toBe('eve');
      expect(res.invoice.companyId).toBe('donovan-farms');
      expect(res.invoice.serviceAddress).toBe('14 Oak St');
      expect(Number(res.invoice.subtotal)).toBe(170);
      expect(Number(res.invoice.total)).toBe(170);
      expect(res.invoice.lineItems).toHaveLength(2);
      expect(res.invoice.userId).toBe(ownerId);
    }
  });

  it('creates the customer when confirmCreateCustomer is true', async () => {
    const res = await createStructuredInvoice({
      customer: { name: 'Jim Hawthorne' },
      lineItems: [{ description: 'Plowing', quantity: 1, rate: 75 }],
      confirmCreateCustomer: true,
    });
    expect(res.ok).toBe(true);
    const created = await prisma.customer.findFirst({ where: { name: 'Jim Hawthorne', userId: ownerId } });
    expect(created).not.toBeNull();
  });

  it('defaults to donovan-farms and rejects an unknown company', async () => {
    await prisma.customer.create({ data: { userId: ownerId, name: 'Default Co Cust' } });
    const ok = await createStructuredInvoice({ customer: { name: 'Default Co Cust' }, lineItems: [{ description: 'X', quantity: 1, rate: 10 }] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.invoice.companyId).toBe('donovan-farms');

    await expect(
      createStructuredInvoice({ customer: { name: 'Default Co Cust' }, lineItems: [{ description: 'X', quantity: 1, rate: 10 }], companyId: 'no-such-co' })
    ).rejects.toThrow(/Unknown or inactive company/);
  });
});
