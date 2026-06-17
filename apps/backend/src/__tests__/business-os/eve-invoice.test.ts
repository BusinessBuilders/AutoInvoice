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
});
