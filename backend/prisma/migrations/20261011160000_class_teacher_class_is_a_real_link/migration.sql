-- The class a class teacher leads becomes a real link.
-- Step 3, part 5 of docs/MULTI-SCHOOL-DESIGN.md.
--
-- teacher_roles.class_section_id was a plain column with no foreign key, so
-- nothing checked it: the cross-school sweep (test/no-way-across.e2e-spec.ts)
-- found a school could record one of its teachers as class teacher of another
-- school's class. With a foreign key, the same-school check covers it too.

-- Duties naming a class that no longer exists have nothing to point at.
DELETE FROM "teacher_roles" r
WHERE r."class_section_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "class_sections" c WHERE c."id" = r."class_section_id");

ALTER TABLE "teacher_roles" ADD CONSTRAINT "teacher_roles_class_section_id_fkey"
    FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Installing the same-school checks, as a function any later migration can
-- call after it adds a foreign key: it drops and recreates the two triggers
-- on every school table from the foreign keys as they are now. The wall test
-- ("checks every link between two school tables") fails if one is missed.
CREATE OR REPLACE FUNCTION app_install_same_school_checks() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  child record;
BEGIN
  FOR child IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS same_school_insert ON %I', child.table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS same_school_update ON %I', child.table_name);
  END LOOP;

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
    EXECUTE format(
      'CREATE TRIGGER same_school_insert AFTER INSERT ON %I
         REFERENCING NEW TABLE AS new_rows
         FOR EACH STATEMENT EXECUTE FUNCTION app_same_school(%s)',
      child.child_table, child.pairs);
    EXECUTE format(
      'CREATE TRIGGER same_school_update AFTER UPDATE ON %I
         REFERENCING NEW TABLE AS new_rows
         FOR EACH STATEMENT EXECUTE FUNCTION app_same_school(%s)',
      child.child_table, child.pairs);
  END LOOP;
END;
$$;

SELECT app_install_same_school_checks();
