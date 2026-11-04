import { contentDisposition } from '../storage/storage.service';
import { ALLOWED_TYPES, isAllowedType, matchesContent, sanitizeFileName } from './file-rules';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('isAllowedType', () => {
  it('allows documents and images, and nothing a browser could run', () => {
    expect(isAllowedType('image/png')).toBe(true);
    expect(isAllowedType('application/pdf')).toBe(true);
    for (const dangerous of [
      'text/html',
      'image/svg+xml',
      'application/javascript',
      'text/javascript',
      'application/xml',
      'application/x-msdownload',
      'application/octet-stream',
      '',
      'IMAGE/PNG',
    ]) {
      expect(isAllowedType(dangerous)).toBe(false);
    }
  });
});

describe('matchesContent', () => {
  it('recognises the first bytes of real files', () => {
    expect(
      matchesContent('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1)),
    ).toBe(true);
    expect(matchesContent('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesContent('image/gif', text('GIF89a....'))).toBe(true);
    expect(matchesContent('image/webp', text('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
    expect(matchesContent('application/pdf', text('%PDF-1.7\n'))).toBe(true);
    expect(matchesContent('application/zip', bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe(true);
    expect(
      matchesContent(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes(0x50, 0x4b, 0x03, 0x04),
      ),
    ).toBe(true);
  });

  it('refuses a file that is something else than it says', () => {
    expect(matchesContent('image/png', text('<html><script>alert(1)</script></html>'))).toBe(false);
    expect(
      matchesContent('application/pdf', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe(false);
    expect(matchesContent('image/jpeg', text('MZ\x90\x00'))).toBe(false); // a Windows program
    expect(matchesContent('image/webp', text('RIFF\0\0\0\0WAVEfmt '))).toBe(false); // RIFF, but audio
    expect(matchesContent('application/zip', text('not a zip'))).toBe(false);
  });

  it('accepts text that is text, and refuses binary data or nothing at all', () => {
    for (const type of ['text/plain', 'text/csv', 'application/json'] as const) {
      expect(matchesContent(type, text('hello, world\n1,2,3'))).toBe(true);
      expect(matchesContent(type, bytes(0x68, 0x00, 0x69))).toBe(false);
      expect(matchesContent(type, bytes())).toBe(false);
    }
  });

  it('has a rule for every allowed type', () => {
    for (const type of ALLOWED_TYPES) {
      expect(() => matchesContent(type, bytes(1, 2, 3))).not.toThrow();
    }
  });
});

describe('sanitizeFileName', () => {
  it('keeps an ordinary name, including spaces and other alphabets', () => {
    expect(sanitizeFileName('Quarterly report (final).pdf')).toBe('Quarterly report (final).pdf');
    expect(sanitizeFileName('Çalışma planı.docx')).toBe('Çalışma planı.docx');
  });

  it('cannot be a path', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeFileName('C:\\Windows\\system32\\cmd.exe')).toBe('C__Windows_system32_cmd.exe');
    expect(sanitizeFileName('..')).toBe('file');
    expect(sanitizeFileName('.hidden')).toBe('hidden');
  });

  it('drops control characters and characters that are special on common systems', () => {
    expect(sanitizeFileName('a\u0000b\nc\td.txt')).toBe('abcd.txt');
    expect(sanitizeFileName('what?*<is>|this".txt')).toBe('what___is__this_.txt');
  });

  it('never returns an empty name, and bounds the length', () => {
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('   ')).toBe('file');
    expect(sanitizeFileName('x'.repeat(500))).toHaveLength(200);
  });
});

describe('contentDisposition', () => {
  it('always says attachment, with an ASCII fallback and the real name encoded', () => {
    expect(contentDisposition('report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
    const header = contentDisposition('Çalışma "planı".docx');
    expect(header).toContain("filename*=UTF-8''%C3%87al%C4%B1%C5%9Fma%20%22plan%C4%B1%22.docx");
    expect(header).toMatch(/^attachment; filename="[ -~]*"; /); // ASCII only in the fallback
  });

  it('cannot be broken out of with quotes or line breaks', () => {
    const header = contentDisposition('evil".txt\r\nSet-Cookie: x=1');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header.split('"').length).toBe(3); // exactly one quoted value
  });
});
