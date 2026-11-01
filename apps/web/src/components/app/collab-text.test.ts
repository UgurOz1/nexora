import { describe, expect, it } from 'vitest';
import type { ActivityItem, Notification } from '@/lib/api/types';
import { describeActivity } from './tasks/activity-feed';
import { notificationText } from './notification-bell';

const activity = (type: string, changes: object = {}) =>
  ({ type, changes, task: { title: 'T' }, actor: null }) as unknown as ActivityItem;

describe('describeActivity', () => {
  it('describes the kinds of events in words', () => {
    expect(describeActivity(activity('CREATED'))).toBe('created');
    expect(describeActivity(activity('COMMENT_ADDED'))).toBe('commented on');
    expect(describeActivity(activity('DEPENDENCY_ADDED'))).toBe('added a dependency to');
  });

  it('names the new status of a move, and the fields of other edits', () => {
    expect(
      describeActivity(activity('UPDATED', { status: { from: 'TODO', to: 'IN_PROGRESS' } })),
    ).toBe('moved to in progress:');
    expect(describeActivity(activity('UPDATED', { title: {}, priority: {} }))).toBe(
      'changed title, priority of',
    );
    expect(describeActivity(activity('UPDATED'))).toBe('updated');
  });
});

describe('notificationText', () => {
  const base = { actor: { name: 'Mia' }, task: { title: 'Design homepage' } };

  it('says who did what', () => {
    expect(notificationText({ ...base, type: 'MENTION' } as Notification)).toBe(
      'Mia mentioned you in "Design homepage"',
    );
    expect(notificationText({ ...base, type: 'ASSIGNED' } as Notification)).toBe(
      'Mia assigned you "Design homepage"',
    );
  });
});
