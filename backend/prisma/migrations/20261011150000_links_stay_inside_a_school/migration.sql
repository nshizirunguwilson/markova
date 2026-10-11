-- A row may only point at rows of its own school.
-- Step 3, part 5 of docs/MULTI-SCHOOL-DESIGN.md.
--
-- The wall between schools (school_wall) decides which rows a school can see
-- and write. It does not cover a foreign key: Postgres checks that the row a
-- foreign key points at exists, and that check ignores row level security. So
-- a request inside Kigali Hill could create a class in one of Lycee's class
-- levels, a mark for one of Lycee's students, a parent link to one of Lycee's
-- children, by naming the other school's id. Nothing would be shown across,
-- but the two schools' records would be tied together.
--
-- This adds the missing rule for every foreign key between two school tables:
-- after a statement inserts or updates rows, the rows it wrote are checked
-- against the rows they point at, and any whose school differs is refused.
-- Once per statement, as a set, so a bulk insert of marks pays for one join
-- per foreign key rather than one lookup per row.
--
-- The check has to see the other school's rows to find them, so it switches
-- the wall off for itself (app.bypass) and puts the caller's settings back.
-- It only ever answers "these two schools differ"; nothing it reads leaves it.

CREATE OR REPLACE FUNCTION app_same_school() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  i int;
  col text;
  parent text;
  parent_col text;
  bad text;
  was_bypass text := current_setting('app.bypass', true);
  was_role text := current_setting('app.role', true);
BEGIN
  PERFORM set_config('app.bypass', 'on', true);
  PERFORM set_config('app.role', '', true);
  FOR i IN 0 .. TG_NARGS / 3 - 1 LOOP
    col := TG_ARGV[i * 3];
    parent := TG_ARGV[i * 3 + 1];
    parent_col := TG_ARGV[i * 3 + 2];
    EXECUTE format(
      'SELECT n.%I::text FROM new_rows n JOIN %I p ON p.%I = n.%I
       WHERE p.school_id IS DISTINCT FROM n.school_id LIMIT 1',
      col, parent, parent_col, col)
    INTO bad;
    IF bad IS NOT NULL THEN
      PERFORM set_config('app.bypass', coalesce(was_bypass, ''), true);
      PERFORM set_config('app.role', coalesce(was_role, ''), true);
      RAISE EXCEPTION 'A row in % cannot point at another school''s % (%.% = %)',
        TG_TABLE_NAME, parent, TG_TABLE_NAME, col, bad
        USING ERRCODE = '23503';
    END IF;
  END LOOP;
  PERFORM set_config('app.bypass', coalesce(was_bypass, ''), true);
  PERFORM set_config('app.role', coalesce(was_role, ''), true);
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  child record;
  args text;
BEGIN
  FOR child IN
    SELECT tc.table_name AS child_table,
           string_agg(
             quote_literal(kcu.column_name) || ', ' ||
             quote_literal(ccu.table_name) || ', ' ||
             quote_literal(ccu.column_name),
             ', ' ORDER BY kcu.column_name) AS pairs
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name <> 'schools'
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public'
                    AND c.table_name = tc.table_name
                    AND c.column_name = 'school_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public'
                    AND c.table_name = ccu.table_name
                    AND c.column_name = 'school_id')
    GROUP BY tc.table_name
  LOOP
    args := child.pairs;
    EXECUTE format(
      'CREATE TRIGGER same_school_insert AFTER INSERT ON %I
         REFERENCING NEW TABLE AS new_rows
         FOR EACH STATEMENT EXECUTE FUNCTION app_same_school(%s)',
      child.child_table, args);
    EXECUTE format(
      'CREATE TRIGGER same_school_update AFTER UPDATE ON %I
         REFERENCING NEW TABLE AS new_rows
         FOR EACH STATEMENT EXECUTE FUNCTION app_same_school(%s)',
      child.child_table, args);
  END LOOP;
END;
$$;
