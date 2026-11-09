-- When a task was finished, for the analytics dashboard ("completed per day", cycle time).
--
-- A trigger keeps the column right instead of the application: a status can change through the
-- edit form, a drag on the board, a recurring task, a seed script or plain SQL, and all of them
-- pass through here. The rule:
--   * becomes DONE (insert, or update from another status) -> now(), unless a value was given
--   * stays DONE -> unchanged
--   * is not DONE -> null
ALTER TABLE "tasks" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE FUNCTION "tasks_set_completed_at"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'DONE' THEN
    -- A task that was not DONE has no completion time, so a value here was given on purpose
    -- (seed data, an import); otherwise it is now.
    IF TG_OP = 'INSERT' OR OLD."status" <> 'DONE' THEN
      NEW."completedAt" := coalesce(NEW."completedAt", now());
    ELSE
      NEW."completedAt" := coalesce(NEW."completedAt", OLD."completedAt");
    END IF;
  ELSE
    NEW."completedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tasks_completed_at"
  BEFORE INSERT OR UPDATE OF "status", "completedAt" ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION "tasks_set_completed_at"();

-- Tasks that are already DONE: the time of the last history entry that moved them to DONE, or
-- their last change when there is none.
UPDATE "tasks" t
SET "completedAt" = coalesce(
  (SELECT max(e."createdAt") FROM "task_events" e
   WHERE e."taskId" = t."id" AND e."changes" -> 'status' ->> 'to' = 'DONE'),
  t."updatedAt")
WHERE t."status" = 'DONE';
