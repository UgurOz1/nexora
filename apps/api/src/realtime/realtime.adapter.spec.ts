import { realtimeOrigins } from './realtime.adapter';

describe('realtimeOrigins', () => {
  it('allows only the web app in production', () => {
    expect(realtimeOrigins('https://app.nexora.dev/some/path', 'production')).toEqual([
      'https://app.nexora.dev',
    ]);
  });

  it('also allows the other spelling of localhost while developing', () => {
    expect(realtimeOrigins('http://localhost:3000', 'development')).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    expect(realtimeOrigins('http://127.0.0.1:3000', 'test')).toEqual([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ]);
  });
});
