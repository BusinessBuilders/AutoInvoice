import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@autoinvoice/backend/src/routers';

export const trpc = createTRPCReact<AppRouter>();
