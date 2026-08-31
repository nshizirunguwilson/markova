-- Row level security on the tables that hold a child's record.
--
-- Everything that keeps one family from seeing another's data is currently a
-- `where` clause in TypeScript. That is enforced consistently today and well
-- tested, but the failure mode is silent: a new endpoint that forgets one
-- clause returns other families' rows with a 200 and no error anywhere.
--
-- This is the backstop underneath it, not a replacement for it. The service
-- layer still decides what a request may ask for; this makes a forgotten
-- filter return nothing instead of everything.
--
-- ── How it works ────────────────────────────────────────────────────────────
--
-- The application sets two settings at the start of each request's
-- transaction:
--
--   app.user_id   the signed-in user
--   app.role      their role
--
-- The policies read those. Staff roles are unrestricted here, because their
-- access is already decided by the route guards and encoding ten roles' worth
-- of rules in SQL would mean maintaining the same logic in two languages,
-- where the two can disagree. What the policies restrict is the case where a
-- leak actually matters and is easy to cause: a STUDENT or PARENT reading
-- somebody else's child.
--
-- ── Why the settings are read defensively ───────────────────────────────────
--
-- `current_setting(..., true)` returns NULL rather than raising when the
-- setting was never set. Anything running outside a request (the seed,
-- scheduled tasks, the render worker) therefore has no role, and the policies
-- treat that as unrestricted: those run as the owner and are trusted. A web
-- request always has one, because the middleware sets it before any query.

-- ── who a user is allowed to see ────────────────────────────────────────────
--
-- One function, so the same definition of "my child" is used by every policy
-- and cannot drift between them.
CREATE OR REPLACE FUNCTION app_may_see_student(student_row_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  ctx_role TEXT := current_setting('app.role', true);
  ctx_user TEXT := current_setting('app.user_id', true);
BEGIN
  -- No context: not a web request. The seed and the workers run this way.
  IF ctx_role IS NULL OR ctx_role = '' THEN
    RETURN TRUE;
  END IF;

  -- Staff. Their reach is decided by the route guards, which are tested
  -- directly, rather than duplicated here in a second language.
  IF ctx_role <> 'STUDENT' AND ctx_role <> 'PARENT' THEN
    RETURN TRUE;
  END IF;

  -- A student sees their own record.
  IF ctx_role = 'STUDENT' THEN
    RETURN EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_row_id AND s.user_id = ctx_user
    );
  END IF;

  -- A parent sees the children they are linked to. parent_students carries
  -- the user id directly, so there is no second join.
  RETURN EXISTS (
    SELECT 1 FROM parent_students ps
    WHERE ps.student_id = student_row_id AND ps.parent_user_id = ctx_user
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── the tables ──────────────────────────────────────────────────────────────
--
-- FORCE, not just ENABLE. Without FORCE the table's owner bypasses its own
-- policies, and the application connects as the owner, so ENABLE alone would
-- have done nothing at all.

ALTER TABLE "marks"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks"          FORCE  ROW LEVEL SECURITY;
CREATE POLICY marks_own ON "marks"
  USING (app_may_see_student(student_id));

ALTER TABLE "term_results"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "term_results"   FORCE  ROW LEVEL SECURITY;
CREATE POLICY term_results_own ON "term_results"
  USING (app_may_see_student(student_id));

ALTER TABLE "attendances"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances"    FORCE  ROW LEVEL SECURITY;
CREATE POLICY attendances_own ON "attendances"
  USING (app_may_see_student(student_id));

ALTER TABLE "clinic_visits"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_visits"  FORCE  ROW LEVEL SECURITY;
CREATE POLICY clinic_visits_own ON "clinic_visits"
  USING (app_may_see_student(student_id));

ALTER TABLE "discipline_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discipline_incidents" FORCE  ROW LEVEL SECURITY;
CREATE POLICY discipline_own ON "discipline_incidents"
  USING (app_may_see_student(student_id));
