import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import type { AuthenticatedRequest } from '../common/auth/current-user.decorator';
import { AUDITED_KEY, type AuditContext, type AuditedOptions } from './audited.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!options || context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      // Success: record after the handler finished, and wait for the write so the entry exists
      // by the time the client gets its answer.
      mergeMap(async (result: unknown) => {
        await this.write(options, options.action, { request, result });
        return result;
      }),
      catchError((error: unknown) => {
        // Only a refusal of the caller's identity or rights is an audit event. A validation
        // error or a missing record is not.
        const refused =
          error instanceof UnauthorizedException || error instanceof ForbiddenException;
        if (options.failureAction && refused) {
          // Write the entry, then let the original error continue to the client.
          return from(this.write(options, options.failureAction, { request, error })).pipe(
            mergeMap(() => throwError(() => error)),
          );
        }
        return throwError(() => error);
      }),
    );
  }

  private async write(
    options: AuditedOptions,
    action: AuditedOptions['action'],
    context: AuditContext,
  ): Promise<void> {
    const { request } = context;
    const targetId =
      (options.target?.param ? request.params[options.target.param] : undefined) ??
      (options.target?.resultField
        ? stringField(context.result, options.target.resultField)
        : undefined);

    await this.audit.record({
      action,
      actorId: request.user?.id ?? options.actor?.(context),
      organizationId:
        options.organization !== undefined
          ? options.organization(context)
          : (request.membership?.organizationId ?? null),
      targetType: options.target?.type,
      targetId: typeof targetId === 'string' ? targetId : undefined,
      metadata: options.metadata?.(context),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}

function stringField(value: unknown, field: string): string | undefined {
  const found = (value as Record<string, unknown> | null | undefined)?.[field];
  return typeof found === 'string' ? found : undefined;
}
