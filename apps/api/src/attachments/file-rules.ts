export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_ATTACHMENTS_PER_TASK = 25;
// How many bytes are read from the start of a file to check what it really is.
export const SNIFF_BYTES = 512;

// An ALLOW list: only these types can be attached. Everything that a browser could run or render
// as a page (HTML, SVG, scripts, XML) is simply not here, so such a file cannot even be announced.
export const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
] as const;

export type AllowedType = (typeof ALLOWED_TYPES)[number];

export const isAllowedType = (value: string): value is AllowedType =>
  (ALLOWED_TYPES as readonly string[]).includes(value);

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

// Does the start of the file look like what it claims to be? The browser's idea of the type
// (the Content-Type header, the file extension) is chosen by whoever uploads, so it proves
// nothing; the first bytes of a real PNG, PDF, ... are fixed by the format. Text types have no
// signature, so for them we only require that it is not binary (no NUL byte).
export function matchesContent(type: AllowedType, bytes: Uint8Array): boolean {
  switch (type) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'));
    case 'image/webp':
      return startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8);
    case 'application/pdf':
      return startsWith(bytes, ascii('%PDF-'));
    // .docx and .xlsx are zip archives.
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case 'text/plain':
    case 'text/csv':
    case 'application/json':
      return bytes.length > 0 && !bytes.includes(0x00);
  }
}

// A file name as it is shown and offered for download. Not a path and not trusted: separators,
// control characters and the characters that are special on common systems are removed, leading
// dots (hidden files, "..") and spaces trimmed, and the length limited.
const MAX_NAME_LENGTH = 200;

export function sanitizeFileName(input: string): string {
  const cleaned = input
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^[.\s]+|[\s.]+$/g, '');
  const name = cleaned.slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : 'file';
}
