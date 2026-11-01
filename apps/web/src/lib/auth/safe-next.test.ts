import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('keeps same-site paths, including query and hash', () => {
    expect(safeNextPath('/orgs/123/projects/456?tab=tasks#top')).toBe(
      '/orgs/123/projects/456?tab=tasks#top',
    );
    expect(safeNextPath('/accept-invitation?token=abc')).toBe('/accept-invitation?token=abc');
  });

  it('falls back when nothing was given', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined, '/orgs')).toBe('/orgs');
    expect(safeNextPath('', '/orgs')).toBe('/orgs');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/login'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash trick browsers read as another host', '/\\evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a path without a leading slash', 'orgs'],
  ])('rejects %s (open redirect)', (_label, value) => {
    expect(safeNextPath(value, '/orgs')).toBe('/orgs');
  });
});
