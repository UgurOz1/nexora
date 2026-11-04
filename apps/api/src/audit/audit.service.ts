import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditActionName } from './audit-actions';

export interface AuditEntry {
  action: AuditActionName;
  organizationId?: string | null;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

// Values that come from the client are cut to a sane size before they are stored.
const MAX_USER_AGENT = 255;

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  // Writes one row. The structured log line comes FIRST and always: if the database is down at
  // that moment, the event is still in the application log (and from there in whatever collects
  // the logs). A failed write is logged and swallowed rather than undoing an action that has
  // already happened.
  async record(entry: AuditEntry): Promise<void> {
    this.logger.log({ audit: entry }, `audit ${entry.action}`);
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          organizationId: entry.organizationId ?? null,
          actorId: entry.actorId ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonObject | undefined,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'Could not write an audit log row');
    }
  }
}
