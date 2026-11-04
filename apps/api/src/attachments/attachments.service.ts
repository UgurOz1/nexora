import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OrgMembership } from '../common/auth/current-user.decorator';
import { DomainEvents } from '../events/domain-events';
import { AttachmentStatus } from '../generated/prisma/client';
import { canDeleteAttachment } from '../organizations/policies';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CreateAttachmentDto } from './dto/attachments.dto';
import {
  isAllowedType,
  matchesContent,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_FILE_BYTES,
  sanitizeFileName,
  SNIFF_BYTES,
} from './file-rules';

// An upload nobody confirmed within this time is abandoned and cleaned up.
export const PENDING_TTL_MS = 60 * 60 * 1000;

const attachmentSelect = {
  id: true,
  fileName: true,
  contentType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

// Attaching a file takes three steps, and the file never passes through this server:
//   1. create     we check the announced name, type and size, store a PENDING row, and hand out a
//                 signed link that lets the browser PUT exactly that file to exactly that place;
//   2. (upload)   the browser sends the file straight to storage;
//   3. complete   we look at what arrived (size, first bytes) and only then mark it READY.
// A file is never trusted because the browser said so: only what step 3 sees counts.
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEvents,
  ) {}

  async list(organizationId: string, taskId: string) {
    await this.assertTask(organizationId, taskId);
    return this.prisma.forTenant(organizationId).attachment.findMany({
      where: { taskId, status: AttachmentStatus.READY },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: attachmentSelect,
    });
  }

  async create(
    organizationId: string,
    actor: OrgMembership,
    taskId: string,
    dto: CreateAttachmentDto,
  ) {
    // The DTO already checked these; the service does not rely on a controller to have done it.
    if (!isAllowedType(dto.contentType) || dto.size < 1 || dto.size > MAX_FILE_BYTES) {
      throw new BadRequestException('This file type or size is not allowed');
    }
    await this.assertTask(organizationId, taskId);
    const tenant = this.prisma.forTenant(organizationId);

    const taken = await tenant.attachment.count({
      where: {
        taskId,
        OR: [
          { status: AttachmentStatus.READY },
          {
            status: AttachmentStatus.PENDING,
            createdAt: { gt: new Date(Date.now() - PENDING_TTL_MS) },
          },
        ],
      },
    });
    if (taken >= MAX_ATTACHMENTS_PER_TASK) {
      throw new ConflictException(
        `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`,
      );
    }

    // Built by us from ids and a random value: nothing the user typed is part of the path.
    const storageKey = `orgs/${organizationId}/tasks/${taskId}/${randomUUID()}`;
    const row = await tenant.attachment.create({
      data: {
        organizationId,
        taskId,
        uploadedById: actor.userId,
        fileName: sanitizeFileName(dto.fileName),
        contentType: dto.contentType,
        size: dto.size,
        storageKey,
      },
      select: attachmentSelect,
    });

    const upload = await this.storage.presignUpload({
      key: storageKey,
      contentType: dto.contentType,
      size: dto.size,
    });
    return {
      attachment: row,
      upload: {
        url: upload.url,
        method: 'PUT' as const,
        headers: upload.headers,
        expiresAt: upload.expiresAt,
      },
    };
  }

  async complete(organizationId: string, actor: OrgMembership, id: string) {
    const tenant = this.prisma.forTenant(organizationId);
    const row = await tenant.attachment.findFirst({
      where: { id, task: { deletedAt: null } },
      select: {
        ...attachmentSelect,
        status: true,
        storageKey: true,
        uploadedById: true,
        taskId: true,
        task: { select: { projectId: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Attachment not found');
    }
    if (row.uploadedById !== actor.userId) {
      throw new ForbiddenException('Only the person who started the upload can finish it');
    }
    if (row.status === AttachmentStatus.READY) {
      return toResponse(row); // finishing twice is harmless
    }

    const stored = await this.storage.head(row.storageKey);
    if (!stored) {
      throw new ConflictException('The file has not been uploaded yet');
    }
    // Storage already refuses a different size (it is part of the signed link); this is the
    // second line of defence, and the one that holds if storage were ever configured differently.
    if (stored.size !== row.size || stored.size > MAX_FILE_BYTES) {
      await this.discard(organizationId, row.id, row.storageKey);
      throw new BadRequestException('The uploaded file does not have the announced size');
    }
    const start = await this.storage.readStart(row.storageKey, Math.min(row.size, SNIFF_BYTES));
    if (!isAllowedType(row.contentType) || !matchesContent(row.contentType, start)) {
      await this.discard(organizationId, row.id, row.storageKey);
      throw new BadRequestException('The content of the file does not match its type');
    }

    // Conditional: two simultaneous "complete" calls cannot both be the one that marks it.
    await tenant.attachment.updateMany({
      where: { id, status: AttachmentStatus.PENDING },
      data: { status: AttachmentStatus.READY, completedAt: new Date() },
    });
    await this.events.publish('task.changed', {
      organizationId,
      actorId: actor.userId,
      taskId: row.taskId,
      projectId: row.task.projectId,
      kind: 'attachment',
    });
    return toResponse(row);
  }

  // A link that downloads the file as an attachment (never displayed in the page).
  async download(organizationId: string, id: string) {
    const row = await this.prisma.forTenant(organizationId).attachment.findFirst({
      where: { id, status: AttachmentStatus.READY, task: { deletedAt: null } },
      select: { storageKey: true, fileName: true, contentType: true },
    });
    if (!row) {
      throw new NotFoundException('Attachment not found');
    }
    return this.storage.presignDownload({
      key: row.storageKey,
      fileName: row.fileName,
      contentType: row.contentType,
    });
  }

  async remove(organizationId: string, actor: OrgMembership, id: string): Promise<void> {
    const tenant = this.prisma.forTenant(organizationId);
    const row = await tenant.attachment.findFirst({
      where: { id, task: { deletedAt: null } },
      select: {
        storageKey: true,
        uploadedById: true,
        taskId: true,
        task: { select: { projectId: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Attachment not found');
    }
    if (!canDeleteAttachment(actor.role, row, actor.userId)) {
      throw new ForbiddenException('Only the person who attached it or a manager can remove it');
    }

    await tenant.attachment.deleteMany({ where: { id } });
    await this.deleteObject(row.storageKey);
    await this.events.publish('task.changed', {
      organizationId,
      actorId: actor.userId,
      taskId: row.taskId,
      projectId: row.task.projectId,
      kind: 'attachment',
    });
  }

  // Clears uploads that were announced but never confirmed. Not tenant-scoped on purpose: it is
  // a system job that serves every organization, like the recurring-task generator.
  async purgeStaleUploads(now: Date = new Date()): Promise<number> {
    const stale = await this.prisma.attachment.findMany({
      where: {
        status: AttachmentStatus.PENDING,
        createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) },
      },
      select: { id: true, storageKey: true },
      take: 500,
    });
    let purged = 0;
    for (const { id, storageKey } of stale) {
      // Conditional: if the person confirmed it a moment ago, it is not stale any more.
      const { count } = await this.prisma.attachment.deleteMany({
        where: { id, status: AttachmentStatus.PENDING },
      });
      if (count === 1) {
        await this.deleteObject(storageKey);
        purged++;
      }
    }
    return purged;
  }

  private async discard(organizationId: string, id: string, storageKey: string) {
    await this.prisma.forTenant(organizationId).attachment.deleteMany({ where: { id } });
    await this.deleteObject(storageKey);
  }

  // A file that cannot be deleted from storage right now must not make the request fail: the row
  // is gone, and the leftover is logged.
  private async deleteObject(storageKey: string) {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.error({ err: error, storageKey }, 'Could not delete a file from storage');
    }
  }

  private async assertTask(organizationId: string, taskId: string) {
    const task = await this.prisma.forTenant(organizationId).task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}

// Only what the API shows; the row we loaded also has storage details that stay on the server.
function toResponse(row: AttachmentRow): AttachmentRow {
  const { id, fileName, contentType, size, createdAt, uploadedBy } = row;
  return { id, fileName, contentType, size, createdAt, uploadedBy };
}
