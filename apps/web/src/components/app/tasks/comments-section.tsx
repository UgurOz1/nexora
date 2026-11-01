'use client';

import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api/errors';
import type { Comment, Role } from '@/lib/api/types';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useUpdateComment,
} from '@/lib/collab-queries';
import { mentionToken, splitMentions } from '@/lib/mentions';
import { useMe, useMembers } from '@/lib/queries';
import { hasAtLeast } from '@/lib/roles';

const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

interface CommentsSectionProps {
  orgId: string;
  projectId: string;
  taskId: string;
  role: Role | undefined;
}

export function CommentsSection({ orgId, projectId, taskId, role }: CommentsSectionProps) {
  const { data, error } = useComments(orgId, taskId);
  const { data: me } = useMe();

  return (
    <section className="grid gap-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Comments{data ? ` (${data.items.length})` : ''}</h3>
      {error && <p className="text-sm text-destructive">Could not load the comments.</p>}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {data && data.items.length > 0 && (
        <ul className="grid gap-3">
          {data.items.map((comment) => (
            <CommentItem
              key={comment.id}
              orgId={orgId}
              taskId={taskId}
              comment={comment}
              // Same rules as the API: only the author edits, the author or a manager deletes.
              canEdit={comment.author.id === me?.id}
              canDelete={comment.author.id === me?.id || hasAtLeast(role, 'MANAGER')}
            />
          ))}
        </ul>
      )}
      {data?.nextCursor && (
        <p className="text-xs text-muted-foreground">
          Showing the first {data.items.length} comments.
        </p>
      )}
      <NewComment orgId={orgId} projectId={projectId} taskId={taskId} />
    </section>
  );
}

// Plain text with the mentions highlighted. React escapes text, so a comment can never inject HTML.
export function CommentBody({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {splitMentions(body).map((segment, index) =>
        segment.type === 'mention' ? (
          <span key={index} className="rounded bg-primary/10 px-1 font-medium text-primary">
            @{segment.name}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

function CommentItem({
  orgId,
  taskId,
  comment,
  canEdit,
  canDelete,
}: {
  orgId: string;
  taskId: string;
  comment: Comment;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const update = useUpdateComment(orgId, taskId);
  const remove = useDeleteComment(orgId, taskId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    update.mutate(
      { commentId: comment.id, body },
      {
        onSuccess: () => setEditing(false),
        onError: (saveError) => toast.error(errorMessage(saveError, 'Could not save the comment')),
      },
    );
  };

  return (
    <li className="grid gap-1 rounded-lg bg-muted/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{comment.author.name}</span>
          {' · '}
          <time dateTime={comment.createdAt}>{time.format(new Date(comment.createdAt))}</time>
          {comment.editedAt && ' · edited'}
        </span>
        {!editing && (canEdit || canDelete) && (
          <span className="flex items-center gap-1">
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
            {canDelete &&
              (confirmDelete ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(comment.id, {
                        onError: (deleteError) => toast.error(errorMessage(deleteError)),
                      })
                    }
                  >
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete comment by ${comment.author.name}`}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              ))}
          </span>
        )}
      </div>
      {editing ? (
        <form method="post" onSubmit={save} className="grid gap-2">
          <Textarea
            autoFocus
            aria-label="Edit comment"
            rows={3}
            maxLength={5000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={update.isPending || !draft.trim()}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <CommentBody body={comment.body} />
      )}
    </li>
  );
}

function NewComment({
  orgId,
  projectId,
  taskId,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
}) {
  const add = useAddComment(orgId, projectId, taskId);
  const { data: members } = useMembers(orgId);
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  // Picking a member puts their mention at the end of what was typed so far.
  const insertMention = (userId: string) => {
    const member = members?.find((m) => m.user.id === userId);
    if (!member) return;
    setText(
      (current) =>
        `${current}${current && !/\s$/.test(current) ? ' ' : ''}${mentionToken(member.user.name, member.user.id)} `,
    );
    field.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    add.mutate(body, {
      onSuccess: () => setText(''),
      onError: (addError) => toast.error(errorMessage(addError, 'Could not post the comment')),
    });
  };

  return (
    <form method="post" onSubmit={submit} className="grid gap-2">
      <Textarea
        ref={field}
        aria-label="New comment"
        placeholder="Write a comment"
        rows={3}
        maxLength={5000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={add.isPending || !text.trim()}>
          {add.isPending ? 'Posting…' : 'Comment'}
        </Button>
        <NativeSelect
          aria-label="Mention a member"
          className="w-auto"
          value=""
          onChange={(event) => insertMention(event.target.value)}
        >
          <option value="">Mention someone…</option>
          {members?.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </form>
  );
}
