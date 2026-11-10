-- The analytics queries with EXPLAIN (ANALYZE, BUFFERS), for docs/PERFORMANCE.md.
-- Run against the load data (pnpm --filter @nexora/api seed:load):
--
--   docker exec -i nexora-postgres-1 psql -U nexora -d nexora < apps/api/scripts/explain-analytics.sql
--
-- Same SQL as src/analytics/analytics.service.ts, with a 30-day range and no project filter.
\pset pager off
SELECT id AS org FROM organizations WHERE slug = 'load-main' \gset
SELECT (now() AT TIME ZONE 'UTC')::timestamp(3) AS now_ts \gset
SELECT (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '29 days')::timestamp(3) AS from_ts \gset

\echo '=== open work ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT
  count(*) FILTER (WHERE t."status" = 'TODO')::int,
  count(*) FILTER (WHERE t."status" = 'IN_PROGRESS')::int,
  count(*) FILTER (WHERE t."status" = 'IN_REVIEW')::int,
  count(*) FILTER (WHERE t."dueDate" < :'now_ts')::int,
  count(*) FILTER (WHERE t."dueDate" >= :'now_ts' AND t."dueDate" < :'now_ts'::timestamp + interval '7 days')::int
FROM "tasks" t
WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."status" <> 'DONE';

\echo '=== done work ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT count(*)::int,
  count(*) FILTER (WHERE t."completedAt" >= :'from_ts')::int,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t."completedAt" - t."createdAt") / 3600)
    FILTER (WHERE t."completedAt" >= :'from_ts')
FROM "tasks" t
WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."completedAt" IS NOT NULL;

\echo '=== created ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT count(*)::int FROM "tasks" t
WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."createdAt" >= :'from_ts';

\echo '=== daily ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
WITH days AS (
  SELECT generate_series(:'from_ts'::date, :'now_ts'::date, interval '1 day')::date AS "day"
),
completed AS (
  SELECT t."completedAt"::date AS "day", count(*)::int AS "n" FROM "tasks" t
  WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL
    AND t."completedAt" IS NOT NULL AND t."completedAt" >= :'from_ts'
  GROUP BY 1
),
created AS (
  SELECT t."createdAt"::date AS "day", count(*)::int AS "n" FROM "tasks" t
  WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."createdAt" >= :'from_ts'
  GROUP BY 1
)
SELECT to_char(d."day", 'YYYY-MM-DD'), coalesce(c."n", 0), coalesce(r."n", 0)
FROM days d LEFT JOIN completed c ON c."day" = d."day" LEFT JOIN created r ON r."day" = d."day"
ORDER BY d."day";

\echo '=== projects ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
WITH open AS (
  SELECT t."projectId", count(*)::int AS "open", count(*) FILTER (WHERE t."dueDate" < :'now_ts')::int AS "overdue"
  FROM "tasks" t WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."status" <> 'DONE'
  GROUP BY t."projectId"
),
done AS (
  SELECT t."projectId", count(*)::int AS "done", count(*) FILTER (WHERE t."completedAt" >= :'from_ts')::int AS "completed"
  FROM "tasks" t WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."completedAt" IS NOT NULL
  GROUP BY t."projectId"
)
SELECT p."id", p."name", p."department", coalesce(o."open", 0) AS "open", coalesce(d."done", 0),
       coalesce(o."overdue", 0), coalesce(d."completed", 0)
FROM "projects" p LEFT JOIN open o ON o."projectId" = p."id" LEFT JOIN done d ON d."projectId" = p."id"
WHERE p."organizationId" = :'org' AND p."deletedAt" IS NULL
ORDER BY "open" DESC, p."name", p."id";

\echo '=== members ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
WITH open AS (
  SELECT t."assigneeId", count(*)::int AS "open", count(*) FILTER (WHERE t."dueDate" < :'now_ts')::int AS "overdue"
  FROM "tasks" t WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."status" <> 'DONE'
  GROUP BY t."assigneeId"
),
done AS (
  SELECT t."assigneeId", count(*)::int AS "completed",
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t."completedAt" - t."createdAt") / 3600) AS "median"
  FROM "tasks" t WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL
    AND t."completedAt" IS NOT NULL AND t."completedAt" >= :'from_ts'
  GROUP BY t."assigneeId"
)
SELECT u."id", u."name", m."role", coalesce(o."open", 0) AS "open", coalesce(o."overdue", 0),
       coalesce(d."completed", 0) AS "completed", d."median"
FROM "memberships" m JOIN "users" u ON u."id" = m."userId"
LEFT JOIN open o ON o."assigneeId" = m."userId" LEFT JOIN done d ON d."assigneeId" = m."userId"
WHERE m."organizationId" = :'org'
ORDER BY "completed" DESC, "open" DESC, u."name", u."id";

\echo '=== unassigned ==='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT count(*)::int, count(*) FILTER (WHERE t."dueDate" < :'now_ts')::int
FROM "tasks" t
WHERE t."organizationId" = :'org' AND t."deletedAt" IS NULL AND t."status" <> 'DONE'
  AND (t."assigneeId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "memberships" m WHERE m."organizationId" = :'org' AND m."userId" = t."assigneeId"));
