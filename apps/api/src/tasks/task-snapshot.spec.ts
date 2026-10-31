import { diffSnapshots, snapshotOf, type TaskSnapshot } from './task-snapshot';

const base: TaskSnapshot = {
  title: 'Design homepage',
  description: null,
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: null,
  labels: ['ui', 'web'],
  assigneeId: null,
};

describe('snapshotOf', () => {
  it('converts dates to ISO strings and copies the labels', () => {
    const labels = ['a'];
    const snapshot = snapshotOf({
      ...base,
      labels,
      dueDate: new Date('2026-12-01T10:00:00.000Z'),
    });

    expect(snapshot.dueDate).toBe('2026-12-01T10:00:00.000Z');
    expect(snapshot.labels).not.toBe(labels);
  });
});

describe('diffSnapshots', () => {
  it('reports only the fields that changed, with before and after', () => {
    const after = { ...base, status: 'DONE' as const, assigneeId: 'u1' };

    expect(diffSnapshots(base, after)).toEqual({
      status: { from: 'TODO', to: 'DONE' },
      assigneeId: { from: null, to: 'u1' },
    });
  });

  it('is empty when nothing changed', () => {
    expect(diffSnapshots(base, { ...base })).toEqual({});
  });

  it('does not count reordered labels as a change, but does count added ones', () => {
    expect(diffSnapshots(base, { ...base, labels: ['web', 'ui'] })).toEqual({});
    expect(diffSnapshots(base, { ...base, labels: ['ui', 'web', 'new'] })).toEqual({
      labels: { from: ['ui', 'web'], to: ['ui', 'web', 'new'] },
    });
  });

  it('treats a new task as changed from nothing, skipping fields that are empty', () => {
    expect(diffSnapshots(null, base)).toEqual({
      title: { from: null, to: 'Design homepage' },
      status: { from: null, to: 'TODO' },
      priority: { from: null, to: 'MEDIUM' },
      labels: { from: null, to: ['ui', 'web'] },
    });
  });

  it('shows how an old version differs from a newer one (comparing any two versions)', () => {
    const v1 = { ...base };
    const v3 = { ...base, title: 'Design landing page', priority: 'HIGH' as const };

    expect(diffSnapshots(v1, v3)).toEqual({
      title: { from: 'Design homepage', to: 'Design landing page' },
      priority: { from: 'MEDIUM', to: 'HIGH' },
    });
  });
});
