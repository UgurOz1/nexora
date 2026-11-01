import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board, TaskStatus } from './api/types';
import { taskKeys, useMoveTask } from './queries';

// What the typed client's POST is called with: a path and { params, body }.
const post = vi.fn<(path: string, options: { body: Record<string, unknown> }) => unknown>();

vi.mock('./api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/client')>()),
  api: { POST: (path: string, options: { body: Record<string, unknown> }) => post(path, options) },
}));
vi.mock('./auth/auth-provider', () => ({ useAuth: () => ({ status: 'authenticated' }) }));

const orgId = 'org';
const projectId = 'project';

function boardOf(columns: Record<TaskStatus, string[]>): Board {
  return {
    columns: (Object.keys(columns) as TaskStatus[]).map((status) => ({
      status,
      hasMore: false,
      tasks: columns[status].map((id) => ({ id, title: id, status })),
    })),
  } as unknown as Board;
}

const ids = (board: Board | undefined, status: TaskStatus) =>
  board?.columns.find((c) => c.status === status)?.tasks.map((t) => t.id);

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const original = boardOf({ TODO: ['a', 'b'], IN_PROGRESS: [], IN_REVIEW: [], DONE: ['c'] });
  queryClient.setQueryData(taskKeys.board(orgId, projectId), original);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMoveTask(orgId, projectId), { wrapper });
  const board = () => queryClient.getQueryData<Board>(taskKeys.board(orgId, projectId));
  return { result, board, original };
}

describe('useMoveTask', () => {
  beforeEach(() => post.mockReset());

  it('moves the card at once, before the server has answered', async () => {
    let answer!: (value: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result, board } = setup();

    act(() => result.current.mutate({ taskId: 'a', status: 'DONE', afterId: 'c' }));

    await waitFor(() => expect(ids(board(), 'DONE')).toEqual(['c', 'a']));
    expect(ids(board(), 'TODO')).toEqual(['b']);
    expect(result.current.isPending).toBe(true); // still waiting for the server

    await act(() => {
      answer({ data: {}, response: { ok: true, status: 200 } });
      return Promise.resolve();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('sends only where the card went, and leaves afterId out for the top of a column', async () => {
    post.mockResolvedValue({ data: {}, response: { ok: true, status: 200 } });
    const { result } = setup();

    await act(() => result.current.mutateAsync({ taskId: 'a', status: 'DONE', afterId: null }));
    await act(() => result.current.mutateAsync({ taskId: 'b', status: 'DONE', afterId: 'c' }));

    expect(post.mock.calls[0]![1]).toMatchObject({ body: { status: 'DONE' } });
    expect(post.mock.calls[0]![1].body).not.toHaveProperty('afterId');
    expect(post.mock.calls[1]![1]).toMatchObject({ body: { status: 'DONE', afterId: 'c' } });
  });

  it('puts the card back when the server refuses the move', async () => {
    post.mockResolvedValue({
      error: { message: 'This task is blocked' },
      response: { ok: false, status: 409 },
    });
    const { result, board, original } = setup();

    await act(async () => {
      await result.current
        .mutateAsync({ taskId: 'a', status: 'DONE', afterId: null })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(board()).toEqual(original);
  });
});
