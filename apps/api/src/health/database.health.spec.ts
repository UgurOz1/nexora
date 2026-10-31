import { HealthIndicatorService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';
import type { PrismaService } from '../prisma/prisma.service';

describe('DatabaseHealthIndicator', () => {
  const healthIndicatorService = new HealthIndicatorService();
  const prismaWith = (queryRaw: jest.Mock) =>
    ({ $queryRaw: queryRaw }) as unknown as Pick<PrismaService, '$queryRaw'>;

  it('reports up when SELECT 1 succeeds', async () => {
    const indicator = new DatabaseHealthIndicator(
      prismaWith(jest.fn().mockResolvedValue([{ '?column?': 1 }])),
      healthIndicatorService,
    );

    await expect(indicator.isHealthy()).resolves.toEqual({ database: { status: 'up' } });
  });

  it('reports down with the error message when the query fails', async () => {
    const indicator = new DatabaseHealthIndicator(
      prismaWith(jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))),
      healthIndicatorService,
    );

    await expect(indicator.isHealthy()).resolves.toEqual({
      database: { status: 'down', message: 'ECONNREFUSED' },
    });
  });
});
