import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AllExceptionsFilter, ErrorResponse } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn<void, [ErrorResponse]>();
  const status = jest.fn<{ json: typeof json }, [number]>().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/v1/things', id: 'req-1' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation());

  it('formats HTTP exceptions with path and request id', () => {
    const { status, body } = run(new NotFoundException('Project not found'));

    expect(status).toBe(404);
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Project not found',
      path: '/api/v1/things',
      requestId: 'req-1',
    });
  });

  it('keeps the list of validation messages', () => {
    const { body } = run(new BadRequestException(['name must be a string', 'email is invalid']));

    expect(body.message).toEqual(['name must be a string', 'email is invalid']);
  });

  it('passes through payloads without a message as details', () => {
    const report = { status: 'error', error: { database: { status: 'down' } } };
    const { status, body } = run(new ServiceUnavailableException(report));

    expect(status).toBe(503);
    expect(body.details).toEqual(report);
  });

  it('maps a Prisma unique constraint violation to 409', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

    const { status, body } = run(error);

    expect(status).toBe(409);
    expect(body.message).toBe('Resource already exists');
  });

  it('hides the details of unknown errors', () => {
    const { status, body } = run(new Error('relation "users" does not exist'));

    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('relation');
  });
});
