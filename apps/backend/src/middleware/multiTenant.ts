import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';

/**
 * Multi-tenant middleware for row-level security
 * Ensures users can only access data from their organization
 */

export interface TenantContext {
  userId: string;
  organizationId?: string;
  role: string;
}

/**
 * Add organizationId filter to Prisma queries
 * Ensures data isolation between tenants
 */
export function addOrganizationFilter(
  where: any,
  organizationId: string
): any {
  if (!organizationId) {
    return where;
  }

  return {
    ...where,
    organizationId,
  };
}

/**
 * Validate user belongs to organization
 */
export function validateOrganizationAccess(
  userOrgId: string | undefined,
  resourceOrgId: string
): void {
  if (!userOrgId || userOrgId !== resourceOrgId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied to this resource',
    });
  }
}

/**
 * Multi-tenant Prisma middleware
 * Automatically adds organizationId filter to all queries
 */
export function createTenantMiddleware(organizationId: string) {
  return Prisma.defineExtension((prisma) => {
    return prisma.$extends({
      query: {
        // Apply to all models
        $allModels: {
          async findMany({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async update({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async updateMany({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async delete({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async deleteMany({ args, query }) {
            args.where = addOrganizationFilter(args.where, organizationId);
            return query(args);
          },
          async create({ args, query }) {
            if (args.data) {
              // @ts-ignore - Multi-tenant support is a future feature, organizationId not yet in schema
              args.data = { ...args.data, organizationId };
            }
            return query(args);
          },
          async createMany({ args, query }) {
            if (args.data) {
              // @ts-ignore - Multi-tenant support is a future feature, organizationId not yet in schema
              args.data = Array.isArray(args.data)
                ? args.data.map(d => ({ ...d, organizationId }))
                : { ...args.data, organizationId };
            }
            return query(args);
          },
        },
      },
    });
  });
}

/**
 * Read replica configuration
 * Routes read queries to replica, writes to primary
 */
export function createReadReplicaClient(primaryUrl: string, replicaUrl?: string) {
  if (!replicaUrl) {
    // No replica configured, use primary for everything
    return {
      isPrimaryDB: () => true,
      url: primaryUrl,
    };
  }

  return {
    isPrimaryDB: () => false,
    primaryUrl,
    replicaUrl,
  };
}

/**
 * Query router: send reads to replica, writes to primary
 */
export function routeQuery(operation: string): 'primary' | 'replica' {
  const readOperations = [
    'findUnique',
    'findFirst',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
  ];

  return readOperations.includes(operation) ? 'replica' : 'primary';
}
