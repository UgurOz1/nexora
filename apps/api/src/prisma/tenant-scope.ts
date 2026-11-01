import type { PrismaClient } from '../generated/prisma/client';

// Models that carry an organizationId column. Everything else (users, organizations, tokens)
// is global and must be used through the regular PrismaService.
const TENANT_MODELS = new Set([
  'Membership',
  'Invitation',
  'Project',
  'Task',
  'TaskDependency',
  'TaskEvent',
  'RecurringTask',
  'Comment',
  'Notification',
]);

const WHERE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

type Args = Record<string, unknown>;

export class CrossTenantError extends Error {}

function assertSameTenant(value: unknown, organizationId: string, where: string): void {
  if (value !== undefined && value !== organizationId) {
    throw new CrossTenantError(`${where} targets another organization`);
  }
}

function scopeWhere(where: unknown, organizationId: string): Args {
  const current = (where ?? {}) as Args;
  assertSameTenant(current.organizationId, organizationId, 'where');
  return { ...current, organizationId };
}

function scopeData(data: unknown, organizationId: string): Args {
  const current = data as Args;
  assertSameTenant(current.organizationId, organizationId, 'data');
  if ('organization' in current) {
    throw new CrossTenantError('Set organizationId directly, not the organization relation');
  }
  return { ...current, organizationId };
}

// Rewrites the arguments of a query so it can only see and touch rows of one organization.
// Unknown operations are rejected (fail closed) instead of silently running unscoped.
export function scopeArgs(operation: string, args: Args, organizationId: string): Args {
  switch (operation) {
    case 'create':
      return { ...args, data: scopeData(args.data, organizationId) };
    case 'createMany':
    case 'createManyAndReturn':
      return {
        ...args,
        data: Array.isArray(args.data)
          ? args.data.map((row) => scopeData(row, organizationId))
          : scopeData(args.data, organizationId),
      };
    case 'upsert':
      return {
        ...args,
        where: scopeWhere(args.where, organizationId),
        create: scopeData(args.create, organizationId),
        update: guardUpdateData(args.update, organizationId),
      };
    default:
      if (!WHERE_OPERATIONS.has(operation)) {
        throw new CrossTenantError(`Operation ${operation} is not allowed on tenant clients`);
      }
      return {
        ...args,
        where: scopeWhere(args.where, organizationId),
        ...(args.data !== undefined && { data: guardUpdateData(args.data, organizationId) }),
      };
  }
}

// An update must not move a row into another organization.
function guardUpdateData(data: unknown, organizationId: string): unknown {
  if (data && typeof data === 'object') {
    const current = data as Args;
    assertSameTenant(current.organizationId, organizationId, 'data');
    if ('organization' in current) {
      throw new CrossTenantError('Cannot reassign the organization of a row');
    }
  }
  return data;
}

// The client returned by forTenant, and the one handed to a callback inside its $transaction.
export type TenantClient = ReturnType<typeof forTenant>;
export type TenantTx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

export function forTenant(client: PrismaClient, organizationId: string) {
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            throw new CrossTenantError(
              `${model} is not tenant-scoped; use the regular PrismaService for it`,
            );
          }
          return query(scopeArgs(operation, args, organizationId));
        },
      },
    },
  });
}
