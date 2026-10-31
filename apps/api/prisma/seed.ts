import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, TaskPriority, TaskStatus } from '../src/generated/prisma/client';

// Demo data for local development. Safe to run repeatedly: everything is upserted by a fixed key.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: 'owner@nexora.test' },
    update: {},
    create: { email: 'owner@nexora.test', name: 'Demo Owner', emailVerifiedAt: new Date() },
  });
  const member = await prisma.user.upsert({
    where: { email: 'member@nexora.test' },
    update: {},
    create: { email: 'member@nexora.test', name: 'Demo Member', emailVerifiedAt: new Date() },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Software', slug: 'acme' },
  });

  for (const [user, role] of [
    [owner, Role.OWNER],
    [member, Role.MEMBER],
  ] as const) {
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      update: { role },
      create: { userId: user.id, organizationId: org.id, role },
    });
  }

  const existingProject = await prisma.project.findFirst({
    where: { organizationId: org.id, name: 'Website Redesign' },
  });
  if (existingProject) {
    console.log('Seed data already present, skipping projects and tasks.');
    return;
  }

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'Website Redesign',
      description: 'New marketing site for Q1',
    },
  });

  const tasks = [
    { title: 'Collect requirements', status: TaskStatus.DONE, priority: TaskPriority.HIGH },
    { title: 'Design homepage', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH },
    { title: 'Set up CMS', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM },
    { title: 'Write launch blog post', status: TaskStatus.TODO, priority: TaskPriority.LOW },
  ];
  for (const [index, task] of tasks.entries()) {
    await prisma.task.create({
      data: {
        ...task,
        organizationId: org.id,
        projectId: project.id,
        createdById: owner.id,
        assigneeId: index % 2 === 0 ? owner.id : member.id,
        position: `a${index}`,
      },
    });
  }

  console.log(`Seeded organization "${org.name}" with ${tasks.length} tasks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
