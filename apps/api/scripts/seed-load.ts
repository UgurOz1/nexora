import { resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client';

// A large data set for EXPLAIN ANALYZE and the k6 load test (docs/PERFORMANCE.md).
//
//   pnpm --filter @nexora/api seed:load            (200 000 tasks + 4 x 200 000 in other orgs)
//   LOAD_TASKS=50000 LOAD_NOISE_ORGS=1 pnpm ...    (smaller)
//
// LOCAL DEVELOPMENT ONLY: it deletes every organization whose slug starts with "load-" and every
// user whose email starts with "load." first. The other organizations ("noise") matter: with
// only one organization in the table, "WHERE organizationId = ..." would match every row and no
// index on it would ever look useful.
//
// Rows are generated inside Postgres (generate_series), not sent one by one: a million INSERTs
// from Node would take many minutes, this takes seconds.
if (!process.env.DATABASE_URL) {
  process.loadEnvFile(resolve(__dirname, '../../../.env'));
}

const TASKS = Number(process.env.LOAD_TASKS ?? 200_000);
const NOISE_ORGS = Number(process.env.LOAD_NOISE_ORGS ?? 4);
const PASSWORD = process.env.LOAD_PASSWORD ?? 'load-test-password';
const USERS = 20;
const PROJECTS = 40;
const DEPARTMENTS = ['Engineering', 'Marketing', 'Sales', 'Support', 'Operations'];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function insertTasks(
  organizationId: string,
  projectIds: string[],
  assigneeIds: string[],
  createdById: string,
  count: number,
) {
  // Spread over the last 120 days. 45% DONE (finished up to 10 days after creation), 20% in
  // progress, 10% in review, 25% to do; 70% have a due date; 10% have no assignee.
  // Positions are valid board keys (lowercase base 36, not ending in "0"), in creation order.
  await prisma.$executeRaw`
    WITH src AS (
      SELECT i, random() AS r1, random() AS r2, random() AS r3,
             (now() - random() * interval '120 days')::timestamp(3) AS created
      FROM generate_series(1, ${count}::int) AS i
    )
    INSERT INTO "tasks" ("id", "organizationId", "projectId", "title", "description", "status",
      "priority", "dueDate", "assigneeId", "createdById", "position", "createdAt", "updatedAt",
      "completedAt")
    SELECT gen_random_uuid()::text, ${organizationId},
      (${projectIds}::text[])[1 + i % ${projectIds.length}::int],
      'Load task ' || i,
      CASE WHEN i % 3 = 0 THEN 'Generated description for task ' || i END,
      (CASE WHEN r1 < 0.45 THEN 'DONE' WHEN r1 < 0.65 THEN 'IN_PROGRESS'
            WHEN r1 < 0.75 THEN 'IN_REVIEW' ELSE 'TODO' END)::"TaskStatus",
      (ARRAY['LOW', 'MEDIUM', 'HIGH', 'URGENT'])[1 + floor(r2 * 4)::int]::"TaskPriority",
      CASE WHEN r3 < 0.7 THEN created + r3 * interval '40 days' END,
      CASE WHEN r2 < 0.9 THEN (${assigneeIds}::text[])[1 + i % ${assigneeIds.length}::int] END,
      ${createdById}, 'i' || lpad(i::text, 8, '0') || '1', created, created,
      CASE WHEN r1 < 0.45 THEN least(created + r2 * interval '10 days', now()) END
    FROM src`;
}

async function main() {
  console.log('Removing earlier load data ...');
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'load-' } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'load.' } } });

  const passwordHash = await hash(PASSWORD);
  const users = await Promise.all(
    Array.from({ length: USERS }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return prisma.user.create({
        data: {
          email: `load.user${n}@nexora.test`,
          name: `Load User ${n}`,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
      });
    }),
  );
  const owner = users[0];

  const org = await prisma.organization.create({
    data: { name: 'Load Test Co', slug: 'load-main' },
  });
  await prisma.membership.createMany({
    data: users.map((user, i) => ({
      userId: user.id,
      organizationId: org.id,
      role: i === 0 ? Role.OWNER : i < 4 ? Role.MANAGER : Role.MEMBER,
    })),
  });
  const projects = await Promise.all(
    Array.from({ length: PROJECTS }, (_, i) =>
      prisma.project.create({
        data: {
          organizationId: org.id,
          name: `Project ${String(i + 1).padStart(2, '0')}`,
          department: DEPARTMENTS[i % DEPARTMENTS.length],
        },
      }),
    ),
  );

  let started = Date.now();
  await insertTasks(
    org.id,
    projects.map((p) => p.id),
    users.map((u) => u.id),
    owner.id,
    TASKS,
  );
  console.log(`Inserted ${TASKS} tasks into "${org.name}" in ${Date.now() - started} ms`);

  for (let n = 1; n <= NOISE_ORGS; n++) {
    const noise = await prisma.organization.create({
      data: { name: `Load Noise ${n}`, slug: `load-noise-${n}` },
    });
    await prisma.membership.create({
      data: { userId: owner.id, organizationId: noise.id, role: Role.OWNER },
    });
    const project = await prisma.project.create({
      data: { organizationId: noise.id, name: 'Noise' },
    });
    started = Date.now();
    await insertTasks(noise.id, [project.id], [owner.id], owner.id, TASKS);
    console.log(`Inserted ${TASKS} tasks into "${noise.name}" in ${Date.now() - started} ms`);
  }

  // Fresh statistics, so the planner knows how the new rows are distributed, and an up-to-date
  // visibility map, without which an index-only scan still has to visit the table (autovacuum
  // does this on its own, later). PARALLEL 0: parallel workers need shared memory, and Docker
  // gives a container only 64 MB of it by default.
  await prisma.$executeRawUnsafe(
    'VACUUM (ANALYZE, PARALLEL 0) "tasks", "projects", "memberships", "users"',
  );
  console.log(
    `Done. Organization id: ${org.id}\nSign in as load.user01@nexora.test (OWNER) with LOAD_PASSWORD.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
