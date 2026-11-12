-- A class's figures for a term, without anybody's row.
--
-- A report card prints the child's place in the class ("5 of 27") and the
-- class average. Read by the child or their parent, the term_results policy
-- rightly shows only the child's own row, so the count came out as 1 and the
-- "class average" was the child's own: "position 16 of 1".
--
-- This hands back two numbers for the whole class and nothing else, so a
-- family can be told the size and the average of the class without being
-- able to read anybody else's result. It runs as the owner, below the
-- policies, so it names the school itself: only the school the request is in,
-- or every school on the platform pass.
CREATE OR REPLACE FUNCTION app_class_term_figures(p_class_section_id TEXT, p_term_id TEXT)
RETURNS TABLE (total INTEGER, average DOUBLE PRECISION) AS $$
  SELECT
    COUNT(*)::INTEGER,
    AVG(COALESCE(tr.average, 0))::DOUBLE PRECISION
  FROM term_results tr
  WHERE tr.class_section_id = p_class_section_id
    AND tr.term_id = p_term_id
    AND (
      tr.school_id = current_setting('app.school_id', true)
      OR current_setting('app.bypass', true) = 'on'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION app_class_term_figures(TEXT, TEXT) TO markova_app;
