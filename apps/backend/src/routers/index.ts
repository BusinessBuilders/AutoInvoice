import { router } from '../trpc';
import { authRouter } from './auth';
import { customerRouter } from './customer';
import { invoiceRouter } from './invoice';
import { serviceRouter } from './service';
import { receiptRouter } from './receipt';
import { smartTemplatesRouter } from './smartTemplates';
import { checkRouter } from './check';
import { leadRouter } from './lead';
import { quoteRouter } from './quote';
import { teamRouter } from './team';
import { brandingRouter } from './branding';
import { gdprRouter } from './gdpr';
import { leadBusinessCardRouter } from './leadBusinessCard';
import { contactRouter } from './contact';
import { reportingRouter } from './reporting';
import { tallyRouter } from './tally';
import { voiceRouter } from './voice';
import { accountsRouter } from './accounts';
import { journalRouter } from './journal';
import { expenseCategoryRouter } from './expenseCategory';
import { customerStatementRouter } from './customerStatement';

export const appRouter = router({
  auth: authRouter,
  customer: customerRouter,
  invoice: invoiceRouter,
  service: serviceRouter,
  receipt: receiptRouter,
  smartTemplates: smartTemplatesRouter,
  check: checkRouter,
  lead: leadRouter,
  quote: quoteRouter,
  team: teamRouter,
  branding: brandingRouter,
  gdpr: gdprRouter,
  leadBusinessCard: leadBusinessCardRouter,
  contact: contactRouter,
  reporting: reportingRouter,
  tally: tallyRouter,
  voice: voiceRouter,
  accounts: accountsRouter,
  journal: journalRouter,
  expenseCategory: expenseCategoryRouter,
  customerStatement: customerStatementRouter,
});

export type AppRouter = typeof appRouter;
