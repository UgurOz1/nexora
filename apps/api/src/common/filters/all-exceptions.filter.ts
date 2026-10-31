import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

// Every error leaves the API in this shape, so clients only have to handle one format.
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
  path: string;
  requestId?: string;
  timestamp: string;
}

interface ResolvedError {
  statusCode: number;
  message: string | string[];
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    const { statusCode, message, details } = resolve(exception);
    // 5xx means our bug or a broken dependency: worth an error log. 4xx is the client's mistake.
    if (statusCode >= 500) {
      this.logger.error(exception);
    }

    const body: ErrorResponse = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      ...(details !== undefined && { details }),
      path: request.url,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }
}

function resolve(exception: unknown): ResolvedError {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return { statusCode: exception.getStatus(), message: payload };
    }
    const { message } = payload as { message?: string | string[] };
    return {
      statusCode: exception.getStatus(),
      message: message ?? exception.message,
      // Payloads without a message (e.g. the health check report) are passed through as details.
      details: message === undefined ? payload : undefined,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return { statusCode: HttpStatus.CONFLICT, message: 'Resource already exists' };
      case 'P2025':
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Resource not found' };
    }
  }

  // Unknown errors never leak internals (stack, SQL) to the client; they are logged instead.
  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
}
