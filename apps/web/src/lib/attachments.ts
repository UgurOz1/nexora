import type { Attachment, CreatedAttachment } from './api/types';

// The same limits as the API (which enforces them; this only saves a round trip and gives a
// clear message before anything is sent).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const ALLOWED = new Set(Object.values(TYPE_BY_EXTENSION));

// The `accept` attribute of the file picker.
export const ACCEPT = Object.keys(TYPE_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',');

// Browsers often report no type, or an odd one (Windows says a .csv is "application/vnd.ms-excel"),
// so the type is taken from the browser when it is one we accept and from the extension otherwise.
export function contentTypeOf(file: { name: string; type: string }): string | null {
  if (ALLOWED.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[extension] ?? null;
}

// A message when the file cannot be attached, otherwise null.
export function problemWith(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_FILE_BYTES) return `This file is larger than ${formatBytes(MAX_FILE_BYTES)}.`;
  if (!contentTypeOf(file)) {
    return 'This type of file cannot be attached. Images, PDF, text, CSV, JSON, ZIP, Word and Excel files can.';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface UploadSteps {
  // Step 1: tell the API about the file, get the signed link.
  announce: (file: {
    name: string;
    size: number;
    contentType: string;
  }) => Promise<CreatedAttachment>;
  // Step 2: send the file itself to the link (straight to storage, not through the API).
  send: (
    upload: CreatedAttachment['upload'],
    file: Blob,
    onProgress: (fraction: number) => void,
  ) => Promise<void>;
  // Step 3: tell the API it is there, so it can check it.
  complete: (id: string) => Promise<Attachment>;
}

// The three steps in order. Nothing is "completed" unless the file really was sent.
export async function uploadAttachment(
  steps: UploadSteps,
  file: File,
  onProgress: (fraction: number) => void = () => undefined,
): Promise<Attachment> {
  const problem = problemWith(file);
  const contentType = contentTypeOf(file);
  if (problem || !contentType) throw new Error(problem ?? 'This file cannot be attached.');

  const created = await steps.announce({ name: file.name, size: file.size, contentType });
  await steps.send(created.upload, file, onProgress);
  return steps.complete(created.attachment.id);
}

// Sends the file with XMLHttpRequest, the one browser API that reports upload progress.
export function sendWithProgress(
  upload: CreatedAttachment['upload'],
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`The upload was refused (${request.status}).`));
    request.onerror = () => reject(new Error('The upload could not reach the file server.'));
    request.send(file);
  });
}
