'use client';

import { PaperclipIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import type { Role } from '@/lib/api/types';
import {
  openDownload,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from '@/lib/attachment-queries';
import { ACCEPT, formatBytes, problemWith } from '@/lib/attachments';
import { useMe } from '@/lib/queries';
import { hasAtLeast } from '@/lib/roles';

const day = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

interface AttachmentsSectionProps {
  orgId: string;
  taskId: string;
  role: Role | undefined;
}

export function AttachmentsSection({ orgId, taskId, role }: AttachmentsSectionProps) {
  const { data: me } = useMe();
  const { data, error } = useAttachments(orgId, taskId);
  const upload = useUploadAttachment(orgId, taskId);
  const remove = useDeleteAttachment(orgId, taskId);
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; fraction: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const attach = (file: File) => {
    const problem = problemWith(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setProgress({ name: file.name, fraction: 0 });
    upload.mutate(
      { file, onProgress: (fraction) => setProgress({ name: file.name, fraction }) },
      {
        onError: (uploadError) => toast.error(errorMessage(uploadError, 'The upload failed')),
        onSettled: () => setProgress(null),
      },
    );
  };

  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">Attachments{data ? ` (${data.length})` : ''}</h3>
      {error && <p className="text-sm text-destructive">Could not load the attachments.</p>}
      {data && data.length === 0 && !progress && (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-1">
          {data.map((file) => {
            // Same rule as the API: who attached it, or a manager.
            const canRemove = file.uploadedBy.id === me?.id || hasAtLeast(role, 'MANAGER');
            return (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0">
                  <button
                    type="button"
                    className="truncate text-left font-medium hover:underline"
                    onClick={() =>
                      void openDownload(orgId, file.id).catch((e: unknown) =>
                        toast.error(errorMessage(e, 'Could not download the file')),
                      )
                    }
                  >
                    {file.fileName}
                  </button>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatBytes(file.size)} · {file.uploadedBy.name} ·{' '}
                    {day.format(new Date(file.createdAt))}
                  </span>
                </span>
                {canRemove &&
                  (confirmId === file.id ? (
                    <span className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(file.id, {
                            onSuccess: () => setConfirmId(null),
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        Remove
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmId(null)}
                      >
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${file.fileName}`}
                      onClick={() => setConfirmId(file.id)}
                    >
                      Remove
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {progress && (
        <div className="grid gap-1" role="status" aria-live="polite">
          <span className="text-xs text-muted-foreground">
            Uploading {progress.name}… {Math.round(progress.fraction * 100)}%
          </span>
          <progress
            className="h-1.5 w-full"
            value={progress.fraction}
            max={1}
            aria-label={`Uploading ${progress.name}`}
          />
        </div>
      )}

      <div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose a file to attach"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset, so choosing the same file again still counts as a change.
            event.target.value = '';
            if (file) attach(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          <PaperclipIcon aria-hidden />
          Attach a file
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Images, PDF, text, CSV, JSON, ZIP, Word and Excel files, up to 10 MB.
        </p>
      </div>
    </section>
  );
}
