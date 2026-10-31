import { createTestApp, type TestContext, type TestUser } from './helpers';

interface Org {
  id: string;
  name: string;
}
interface Invitation {
  id: string;
  email: string;
  role: string;
}
interface Member {
  role: string;
  user: { id: string; email: string };
}

describe('organizations: tenant isolation and roles (e2e)', () => {
  let ctx: TestContext;
  let ada: TestUser; // OWNER of Acme
  let ann: TestUser; // ADMIN of Acme
  let max: TestUser; // MANAGER of Acme
  let mia: TestUser; // MEMBER of Acme
  let grace: TestUser; // OWNER of Globex, a different company
  let acme: Org;
  let globex: Org;

  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
  const get = (user: TestUser, path: string) => ctx.http().get(`/api/v1${path}`).set(auth(user));
  const post = (user: TestUser, path: string, body: object) =>
    ctx.http().post(`/api/v1${path}`).set(auth(user)).send(body);
  const patch = (user: TestUser, path: string, body: object) =>
    ctx.http().patch(`/api/v1${path}`).set(auth(user)).send(body);
  const del = (user: TestUser, path: string) => ctx.http().delete(`/api/v1${path}`).set(auth(user));

  // Invites `invitee` through the real flow and returns the token from the email.
  async function invite(owner: TestUser, org: Org, invitee: TestUser, role: string) {
    const res = await post(owner, `/organizations/${org.id}/invitations`, {
      email: invitee.email,
      role,
    }).expect(201);
    return {
      invitation: res.body as Invitation,
      token: ctx.mailToken(invitee.email, 'invited you'),
    };
  }

  async function join(owner: TestUser, org: Org, user: TestUser, role: string) {
    const { token } = await invite(owner, org, user, role);
    await post(user, '/invitations/accept', { token }).expect(200);
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    [ada, ann, max, mia, grace] = await Promise.all(
      ['ada', 'ann', 'max', 'mia', 'grace'].map((name) => ctx.signUp(name)),
    );

    acme = (await post(ada, '/organizations', { name: 'Acme' }).expect(201)).body as Org;
    globex = (await post(grace, '/organizations', { name: 'Globex' }).expect(201)).body as Org;

    await join(ada, acme, ann, 'ADMIN');
    await join(ada, acme, max, 'MANAGER');
    await join(ada, acme, mia, 'MEMBER');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('tenant isolation', () => {
    it('rejects requests without a token', async () => {
      await ctx.http().get(`/api/v1/organizations/${acme.id}`).expect(401);
    });

    it('hides other companies: every route answers 404 to outsiders, as if they did not exist', async () => {
      const base = `/organizations/${acme.id}`;

      await get(grace, base).expect(404);
      await get(grace, `${base}/members`).expect(404);
      await get(grace, `${base}/invitations`).expect(404);
      await post(grace, `${base}/invitations`, { email: 'x@example.com', role: 'MEMBER' }).expect(
        404,
      );
      await patch(grace, base, { name: 'Hacked' }).expect(404);
      await patch(grace, `${base}/members/${mia.id}`, { role: 'ADMIN' }).expect(404);
      await del(grace, `${base}/members/${mia.id}`).expect(404);
      await del(grace, base).expect(404);

      // Nothing changed.
      const still = await get(ada, base).expect(200);
      expect(still.body).toMatchObject({ name: 'Acme', memberCount: 4 });
    });

    it('answers outsiders the same way for a real company and a made-up id', async () => {
      const real = await get(grace, `/organizations/${acme.id}`);
      const fake = await get(grace, '/organizations/00000000-0000-4000-8000-000000000000');

      expect(real.status).toBe(fake.status);
      expect((real.body as { message: string }).message).toBe(
        (fake.body as { message: string }).message,
      );
    });

    it('lists only the organizations the caller belongs to', async () => {
      const adaOrgs = (await get(ada, '/organizations').expect(200)).body as Org[];
      const graceOrgs = (await get(grace, '/organizations').expect(200)).body as Org[];

      expect(adaOrgs.map((o) => o.id)).toEqual([acme.id]);
      expect(graceOrgs.map((o) => o.id)).toEqual([globex.id]);
    });

    it("cannot reach another company's invitation by id through your own company's route", async () => {
      const { invitation } = await invite(grace, globex, await ctx.signUp('victor'), 'MEMBER');

      // Ann is an ADMIN of Acme and uses a route of her own company with Globex's invitation id.
      await del(ann, `/organizations/${acme.id}/invitations/${invitation.id}`).expect(404);

      const pending = (await get(grace, `/organizations/${globex.id}/invitations`).expect(200))
        .body as Invitation[];
      expect(pending.map((i) => i.id)).toContain(invitation.id);
    });

    it("cannot manage someone who is not in your company, even with the owner's rights", async () => {
      await patch(ada, `/organizations/${acme.id}/members/${grace.id}`, { role: 'MEMBER' }).expect(
        404,
      );
      await del(ada, `/organizations/${acme.id}/members/${grace.id}`).expect(404);

      const members = (await get(grace, `/organizations/${globex.id}/members`).expect(200))
        .body as Member[];
      expect(members.map((m) => m.user.id)).toEqual([grace.id]);
    });

    it('does not show members of one company in the list of another', async () => {
      const members = (await get(ada, `/organizations/${acme.id}/members`).expect(200))
        .body as Member[];

      expect(members.map((m) => m.user.id).sort()).toEqual([ada.id, ann.id, max.id, mia.id].sort());
    });
  });

  describe('roles', () => {
    it('lets every member read, but only admins and above invite or rename', async () => {
      const base = `/organizations/${acme.id}`;

      await get(mia, base).expect(200);
      await get(mia, `${base}/members`).expect(200);

      for (const user of [mia, max]) {
        await post(user, `${base}/invitations`, {
          email: 'new@example.com',
          role: 'MEMBER',
        }).expect(403);
        await get(user, `${base}/invitations`).expect(403);
        await patch(user, base, { name: 'Renamed' }).expect(403);
      }
      await patch(ann, base, { name: 'Acme Inc' }).expect(200);
      await patch(ann, base, { name: 'Acme' }).expect(200);
    });

    it('only the owner can delete the organization', async () => {
      await del(ann, `/organizations/${acme.id}`).expect(403);
      await get(ada, `/organizations/${acme.id}`).expect(200);
    });

    it('an admin can invite managers and members, but not admins or owners', async () => {
      const base = `/organizations/${acme.id}/invitations`;

      await post(ann, base, { email: 'a@example.com', role: 'MANAGER' }).expect(201);
      await post(ann, base, { email: 'b@example.com', role: 'MEMBER' }).expect(201);
      await post(ann, base, { email: 'c@example.com', role: 'ADMIN' }).expect(403);
      await post(ann, base, { email: 'd@example.com', role: 'OWNER' }).expect(400);
      await post(ada, base, { email: 'e@example.com', role: 'ADMIN' }).expect(201);
    });

    it('changes roles only below your own rank', async () => {
      const members = `/organizations/${acme.id}/members`;

      await patch(ann, `${members}/${max.id}`, { role: 'ADMIN' }).expect(403); // cannot promote to own rank
      await patch(ann, `${members}/${ada.id}`, { role: 'MEMBER' }).expect(403); // cannot touch the owner
      await patch(ann, `${members}/${ann.id}`, { role: 'MEMBER' }).expect(403); // cannot change self
      await patch(ada, `${members}/${mia.id}`, { role: 'OWNER' }).expect(400); // ownership is never granted
      await patch(mia, `${members}/${max.id}`, { role: 'MEMBER' }).expect(403); // members cannot manage

      await patch(ann, `${members}/${mia.id}`, { role: 'MANAGER' }).expect(200);
      await patch(ann, `${members}/${mia.id}`, { role: 'MEMBER' }).expect(200);
    });

    it('rejects unknown fields so roles cannot be smuggled in', async () => {
      await patch(ada, `/organizations/${acme.id}`, { name: 'Acme', role: 'OWNER' }).expect(400);
      await post(ada, '/organizations', { name: 'Evil', ownerId: grace.id }).expect(400);
    });

    it('keeps the owner in place: nobody removes them, and they cannot leave', async () => {
      const members = `/organizations/${acme.id}/members`;

      await del(ann, `${members}/${ada.id}`).expect(403);
      await del(ada, `${members}/${ada.id}`).expect(403);
    });

    it('lets members leave, and then the company disappears for them', async () => {
      await del(mia, `/organizations/${acme.id}/members/${mia.id}`).expect(204);

      await get(mia, `/organizations/${acme.id}`).expect(404);
      expect(((await get(mia, '/organizations').expect(200)).body as Org[]).length).toBe(0);
    });

    it('lets an admin remove a manager but not another admin', async () => {
      const members = `/organizations/${acme.id}/members`;

      await del(ann, `${members}/${max.id}`).expect(204);
      await get(max, `/organizations/${acme.id}`).expect(404);

      const bob = await ctx.signUp('bob');
      await join(ada, acme, bob, 'ADMIN');
      await del(ann, `${members}/${bob.id}`).expect(403);
    });
  });

  describe('accepting invitations', () => {
    it('works only for the invited, verified email address', async () => {
      const invitee = await ctx.signUp('iris');
      const { token } = await invite(ada, acme, invitee, 'MEMBER');

      // A different signed-in user cannot use a forwarded link.
      await post(grace, '/invitations/accept', { token }).expect(403);
      const accepted = await post(invitee, '/invitations/accept', { token }).expect(200);
      expect(accepted.body).toMatchObject({ id: acme.id, role: 'MEMBER' });
    });

    it('is single use', async () => {
      const invitee = await ctx.signUp('jules');
      const { token } = await invite(ada, acme, invitee, 'MEMBER');

      await post(invitee, '/invitations/accept', { token }).expect(200);
      await post(invitee, '/invitations/accept', { token }).expect(400);
    });

    it('is refused when the invited email was never verified', async () => {
      const unverified = await ctx.signUp('kai', { verified: false });
      const { token } = await invite(ada, acme, unverified, 'MEMBER');

      await post(unverified, '/invitations/accept', { token }).expect(403);
    });

    it('a new invitation to the same address replaces the old link', async () => {
      const invitee = await ctx.signUp('lena');
      const first = await invite(ada, acme, invitee, 'MEMBER');
      const second = await invite(ada, acme, invitee, 'MANAGER');

      await post(invitee, '/invitations/accept', { token: first.token }).expect(400);
      const accepted = await post(invitee, '/invitations/accept', { token: second.token }).expect(
        200,
      );
      expect(accepted.body).toMatchObject({ role: 'MANAGER' });
    });

    it('rejects inviting someone who is already a member', async () => {
      await post(ada, `/organizations/${acme.id}/invitations`, {
        email: ann.email,
        role: 'MEMBER',
      }).expect(409);
    });

    it('can be revoked by an admin', async () => {
      const invitee = await ctx.signUp('milo');
      const { invitation, token } = await invite(ann, acme, invitee, 'MEMBER');

      await del(ann, `/organizations/${acme.id}/invitations/${invitation.id}`).expect(204);
      await post(invitee, '/invitations/accept', { token }).expect(400);
    });
  });

  it('deleting an organization removes it for its members and leaves other companies alone', async () => {
    const temp = (await post(grace, '/organizations', { name: 'Temp Co' }).expect(201)).body as Org;

    await del(grace, `/organizations/${temp.id}`).expect(204);

    await get(grace, `/organizations/${temp.id}`).expect(404);
    await get(grace, `/organizations/${globex.id}`).expect(200);
  });
});
