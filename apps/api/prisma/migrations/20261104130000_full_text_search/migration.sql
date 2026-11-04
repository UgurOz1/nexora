-- Full-text search for tasks and projects.
--
-- A generated column holds the search vector and Postgres recomputes it on every INSERT and
-- UPDATE of the source columns, so the application can never forget to (or get it wrong).
-- 'simple' instead of a language such as 'english': no stemming and no stop words, so Turkish and
-- English text (and names, codes, ticket ids) are all indexed as written. Titles weigh more than
-- descriptions (A over B) when ranking.
--
-- A GIN index maps every word to the rows containing it, so a search reads the few matching
-- rows. "title LIKE '%word%'" cannot use an ordinary index (the pattern starts with a wildcard)
-- and reads every row.

ALTER TABLE "tasks" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B')
  ) STORED;

ALTER TABLE "projects" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("department", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'C')
  ) STORED;

CREATE INDEX "tasks_search_idx" ON "tasks" USING GIN ("searchVector");
CREATE INDEX "projects_search_idx" ON "projects" USING GIN ("searchVector");
