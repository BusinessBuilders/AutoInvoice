/**
 * Business OS Phase 1 backfill (spec §3.1, §3.2). Idempotent and additive:
 * - fills NULL companyId on Invoice/Quote/Lead and primaryCompanyId on
 *   Customer for users that have exactly one active Company (never overwrites
 *   a non-null value);
 * - emits INVOICE_PAYMENT RevenueEvents for historical PAID invoices (the
 *   unique constraint makes re-runs no-ops).
 *
 * Run from apps/backend:  npx tsx scripts/backfill-business-os.ts [--dry-run]
 */
import { prisma } from '../src/utils/db';
import { emitInvoicePaymentEvent } from '../src/services/revenue-events';

const DRY_RUN = process.argv.includes('--dry-run');
// For users with multiple active companies, --default-company <id> names the
// company that legacy (pre-Business-OS) CRM rows belong to. Only fills NULLs.
const defaultCompanyArg = (() => {
  const i = process.argv.indexOf('--default-company');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

async function main() {
  console.log(`Business OS backfill${DRY_RUN ? ' (dry run)' : ''}`);

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  let scoped = { invoices: 0, quotes: 0, leads: 0, customers: 0 };

  for (const user of users) {
    const companies = await prisma.company.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, name: true },
    });
    let company = companies.length === 1 ? companies[0] : undefined;
    if (!company && companies.length > 1 && defaultCompanyArg) {
      company = companies.find((c) => c.id === defaultCompanyArg);
    }
    if (!company) {
      if (companies.length > 1) {
        console.log(
          `- ${user.email}: ${companies.length} active companies — skipping auto-scope ` +
            `(ambiguous; pass --default-company <id> to resolve)`
        );
      }
      continue;
    }
    const companyId = company.id;
    console.log(`- ${user.email}: scoping NULL rows to company "${company.name}"`);
    if (DRY_RUN) continue;

    const [inv, q, l, c] = await Promise.all([
      prisma.invoice.updateMany({
        where: { userId: user.id, companyId: null },
        data: { companyId },
      }),
      prisma.quote.updateMany({
        where: { userId: user.id, companyId: null },
        data: { companyId },
      }),
      prisma.lead.updateMany({
        where: { userId: user.id, companyId: null },
        data: { companyId },
      }),
      prisma.customer.updateMany({
        where: { userId: user.id, primaryCompanyId: null },
        data: { primaryCompanyId: companyId },
      }),
    ]);
    scoped.invoices += inv.count;
    scoped.quotes += q.count;
    scoped.leads += l.count;
    scoped.customers += c.count;
  }
  console.log(`Company scoping filled:`, scoped);

  const paidInvoices = await prisma.invoice.findMany({
    where: { status: 'PAID' },
    select: { id: true, invoiceNumber: true },
  });
  console.log(`PAID invoices found: ${paidInvoices.length}`);

  let emitted = 0;
  let skipped = 0;
  for (const inv of paidInvoices) {
    if (DRY_RUN) continue;
    const event = await emitInvoicePaymentEvent(inv.id);
    if (event) emitted++;
    else skipped++;
  }
  console.log(`Revenue events: ${emitted} recorded/confirmed, ${skipped} skipped (no company)`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
