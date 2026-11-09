import { rangeStart, roundHours, summarizeDepartments } from './analytics.service';

describe('summarizeDepartments', () => {
  const project = (department: string | null, open: number, overdue = 0, completed = 0) => ({
    id: `${department}-${open}`,
    name: 'P',
    department,
    open,
    done: 0,
    overdue,
    completed,
  });

  it('sums the projects of each department, most open work first, none last', () => {
    expect(
      summarizeDepartments([
        project('Sales', 1, 1, 2),
        project(null, 9),
        project('Engineering', 3, 0, 1),
        project('Sales', 4, 2, 0),
        project('Marketing', 3),
      ]),
    ).toEqual([
      { department: null, projects: 1, open: 9, overdue: 0, completed: 0 },
      { department: 'Sales', projects: 2, open: 5, overdue: 3, completed: 2 },
      { department: 'Engineering', projects: 1, open: 3, overdue: 0, completed: 1 },
      { department: 'Marketing', projects: 1, open: 3, overdue: 0, completed: 0 },
    ]);
  });

  it('puts projects without a department after a named one with as much open work', () => {
    const result = summarizeDepartments([project(null, 2), project('Ops', 2)]);
    expect(result.map((d) => d.department)).toEqual(['Ops', null]);
  });

  it('is empty without projects', () => {
    expect(summarizeDepartments([])).toEqual([]);
  });
});

describe('rangeStart', () => {
  it('is UTC midnight of the first day, today counted as one of the days', () => {
    const now = new Date('2026-11-09T22:30:00Z');
    expect(rangeStart(now, 1).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(rangeStart(now, 7).toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(rangeStart(now, 30).toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });

  it('crosses month and year boundaries', () => {
    expect(rangeStart(new Date('2027-01-02T00:00:01Z'), 7).toISOString()).toBe(
      '2026-12-27T00:00:00.000Z',
    );
  });
});

describe('roundHours', () => {
  it('keeps one decimal and passes null through', () => {
    expect(roundHours(4.26)).toBe(4.3);
    expect(roundHours(0)).toBe(0);
    expect(roundHours(null)).toBeNull();
  });
});
