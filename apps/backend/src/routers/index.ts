import { router } from '../trpc';
import { authRouter } from './auth';
import { customerRouter } from './customer';
import { invoiceRouter } from './invoice';
import { serviceRouter } from './service';
import { receiptRouter } from './receipt';

export const appRouter = router({
  auth: authRouter,
  customer: customerRouter,
  invoice: invoiceRouter,
  service: serviceRouter,
  receipt: receiptRouter,
});

export type AppRouter = typeof appRouter;
