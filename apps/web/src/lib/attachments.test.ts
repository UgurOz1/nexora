import { describe, expect, it, vi } from 'vitest';
import type { Attachment, CreatedAttachment } from './api/types';
import {
  contentTypeOf,
  formatBytes,
  MAX_FILE_BYTES,
  problemWith,
  uploadAttachment,
  type UploadSteps,
} from './attachments';

// A File that reports the size we want without holding that many bytes (File.size is read-only).
const file = (name: string, size: number, type = '') => {
  const made = new File([new Uint8Array(Math.min(size, 8))], name, { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};

describe('contentTypeOf', () => {
  it('trusts a type we accept, and falls back to the extension', () => {
    expect(contentTypeOf({ name: 'a.bin', type: 'image/png' })).toBe('image/png');
    expect(contentTypeOf({ name: 'data.CSV', type: 'application/vnd.ms-excel' })).toBe('text/csv');
    expect(contentTypeOf({ name: 'photo.jpeg', type: '' })).toBe('image/jpeg');
  });

  it('has no answer for what cannot be attached', () => {
    expect(contentTypeOf({ name: 'page.html', type: 'text/html' })).toBeNull();
    expect(contentTypeOf({ name: 'logo.svg', type: 'image/svg+xml' })).toBeNull();
    expect(contentTypeOf({ name: 'noextension', type: '' })).toBeNull();
  });
});

describe('problemWith', () => {
  it('accepts an ordinary file and explains the rest', () => {
    expect(problemWith({ name: 'a.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(problemWith({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toMatch(/empty/);
    expect(
      problemWith({ name: 'a.pdf', size: MAX_FILE_BYTES + 1, type: 'application/pdf' }),
    ).toMatch(/larger than 10\.0 MB/);
    expect(problemWith({ name: 'a.exe', size: 10, type: '' })).toMatch(/cannot be attached/);
    expect(
      problemWith({ name: 'a.pdf', size: MAX_FILE_BYTES, type: 'application/pdf' }),
    ).toBeNull();
  });
});

describe('formatBytes', () => {
  it('uses a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});

describe('uploadAttachment', () => {
  const created = {
    attachment: { id: 'att-1' },
    upload: { url: 'http://storage/x', method: 'PUT', headers: {}, expiresAt: '' },
  } as unknown as CreatedAttachment;
  const finished = { id: 'att-1' } as Attachment;

  const steps = (): UploadSteps & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      announce: vi.fn((f: { name: string; size: number; contentType: string }) => {
        calls.push(`announce ${f.name} ${f.size} ${f.contentType}`);
        return Promise.resolve(created);
      }),
      send: vi.fn((_upload: unknown, _file: Blob, onProgress: (fraction: number) => void) => {
        calls.push('send');
        onProgress(0.5);
        return Promise.resolve();
      }),
      complete: vi.fn((id: string) => {
        calls.push(`complete ${id}`);
        return Promise.resolve(finished);
      }),
    };
  };

  it('announces, sends, then completes, in that order', async () => {
    const s = steps();
    const progress: number[] = [];

    const result = await uploadAttachment(s, file('notes.txt', 20, 'text/plain'), (p) =>
      progress.push(p),
    );

    expect(s.calls).toEqual(['announce notes.txt 20 text/plain', 'send', 'complete att-1']);
    expect(progress).toEqual([0.5]);
    expect(result).toBe(finished);
  });

  it('never completes a file that was not sent', async () => {
    const s = steps();
    s.send = vi.fn(() => Promise.reject(new Error('refused')));

    await expect(uploadAttachment(s, file('a.txt', 5, 'text/plain'))).rejects.toThrow('refused');

    expect(s.complete).not.toHaveBeenCalled();
  });

  it('does not even announce a file that cannot be attached', async () => {
    const s = steps();

    await expect(uploadAttachment(s, file('virus.exe', 5))).rejects.toThrow(/cannot be attached/);
    await expect(
      uploadAttachment(s, file('big.pdf', MAX_FILE_BYTES + 1, 'application/pdf')),
    ).rejects.toThrow(/larger/);

    expect(s.announce).not.toHaveBeenCalled();
  });
});
