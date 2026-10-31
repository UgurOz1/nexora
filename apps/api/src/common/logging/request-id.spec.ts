import type { IncomingMessage, ServerResponse } from 'node:http';
import { genRequestId, REQUEST_ID_HEADER } from './request-id';

function call(headerValue?: string) {
  const req = { headers: headerValue ? { [REQUEST_ID_HEADER]: headerValue } : {} };
  const res = { setHeader: jest.fn() };
  const id = genRequestId(req as IncomingMessage, res as unknown as ServerResponse);
  return { id, res };
}

describe('genRequestId', () => {
  it('reuses a safe incoming id and echoes it in the response', () => {
    const { id, res } = call('lb-abc_123');

    expect(id).toBe('lb-abc_123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'lb-abc_123');
  });

  it('generates a UUID when no id is sent', () => {
    expect(call().id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces ids that could inject content into logs', () => {
    expect(call('bad\nid {"level":60}').id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
