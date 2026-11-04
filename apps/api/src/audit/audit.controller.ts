import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import { decodeCursor, toPage } from '../common/pagination/cursor';
import { Prisma, Role } from '../generated/prisma/client';
import { MinRole } from '../organizations/roles';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogPageResponseDto, ListAuditLogsQueryDto } from './dto/audit.dto';

// Only OWNER and ADMIN may read the audit log. It is read-only here: nothing in the API can
// change or delete a row.
@ApiTags('audit')
@ApiBearerAuth()
@Controller('organizations/:orgId/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @MinRole(Role.ADMIN)
  @ApiOkResponse({ type: AuditLogPageResponseDto })
  async list(@CurrentMembership() actor: OrgMembership, @Query() query: ListAuditLogsQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const afterCursor: Prisma.AuditLogWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.value) } },
            { createdAt: new Date(cursor.value), id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.forTenant(actor.organizationId).auditLog.findMany({
      where: {
        AND: [
          {
            ...(query.action && { action: query.action }),
            ...(query.actorId && { actorId: query.actorId }),
          },
          afterCursor,
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        action: true,
        createdAt: true,
        targetType: true,
        targetId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        actor: { select: { id: true, name: true } },
      },
    });
    return toPage(rows, query.limit, (row) => ({
      value: row.createdAt.toISOString(),
      id: row.id,
    }));
  }
}
