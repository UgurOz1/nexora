import { CrossTenantError, scopeArgs } from './tenant-scope';

const ORG = 'org-a';
const OTHER = 'org-b';

describe('scopeArgs', () => {
  it('adds the organization filter to reads, keeping existing conditions', () => {
    expect(scopeArgs('findMany', { where: { status: 'TODO' } }, ORG)).toEqual({
      where: { status: 'TODO', organizationId: ORG },
    });
  });

  it('scopes reads that have no where clause at all', () => {
    expect(scopeArgs('findMany', {}, ORG)).toEqual({ where: { organizationId: ORG } });
    expect(scopeArgs('count', {}, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it('keeps an OR condition from escaping the tenant filter', () => {
    const scoped = scopeArgs('findMany', { where: { OR: [{ a: 1 }, { b: 2 }] } }, ORG);

    // Top-level keys are ANDed by Prisma: (a OR b) AND organizationId.
    expect(scoped).toEqual({ where: { OR: [{ a: 1 }, { b: 2 }], organizationId: ORG } });
  });

  it('scopes unique lookups, updates and deletes', () => {
    for (const operation of ['findUnique', 'update', 'delete', 'updateMany', 'deleteMany']) {
      expect(scopeArgs(operation, { where: { id: '1' } }, ORG)).toMatchObject({
        where: { id: '1', organizationId: ORG },
      });
    }
  });

  it('sets the organization on created rows', () => {
    expect(scopeArgs('create', { data: { title: 'x' } }, ORG)).toEqual({
      data: { title: 'x', organizationId: ORG },
    });
    expect(scopeArgs('createMany', { data: [{ t: 1 }, { t: 2 }] }, ORG)).toEqual({
      data: [
        { t: 1, organizationId: ORG },
        { t: 2, organizationId: ORG },
      ],
    });
  });

  it('scopes both sides of an upsert', () => {
    expect(
      scopeArgs('upsert', { where: { id: '1' }, create: { t: 1 }, update: { t: 2 } }, ORG),
    ).toEqual({
      where: { id: '1', organizationId: ORG },
      create: { t: 1, organizationId: ORG },
      update: { t: 2 },
    });
  });

  it('blocks queries that name another organization', () => {
    expect(() => scopeArgs('findMany', { where: { organizationId: OTHER } }, ORG)).toThrow(
      CrossTenantError,
    );
    expect(() => scopeArgs('create', { data: { organizationId: OTHER } }, ORG)).toThrow(
      CrossTenantError,
    );
  });

  it('blocks moving a row to another organization', () => {
    expect(() =>
      scopeArgs('update', { where: { id: '1' }, data: { organizationId: OTHER } }, ORG),
    ).toThrow(CrossTenantError);
    expect(() =>
      scopeArgs(
        'update',
        { where: { id: '1' }, data: { organization: { connect: { id: OTHER } } } },
        ORG,
      ),
    ).toThrow(CrossTenantError);
  });

  it('rejects the relation form of create, which could point at another organization', () => {
    expect(() =>
      scopeArgs('create', { data: { organization: { connect: { id: OTHER } } } }, ORG),
    ).toThrow(CrossTenantError);
  });

  it('fails closed on operations it does not know', () => {
    expect(() => scopeArgs('somethingNew', {}, ORG)).toThrow(CrossTenantError);
  });
});
