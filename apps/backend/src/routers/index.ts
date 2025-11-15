import { router } from '../trpc';
import { authRouter } from './auth';
import { customerRouter } from './customer';
import { invoiceRouter } from './invoice';
import { serviceRouter } from './service';

export const appRouter = router({
  auth: authRouter,
  customer: customerRouter,
  invoice: invoiceRouter,
  service: serviceRouter,
});

export type AppRouter = typeof appRouter;
