import { canMove, completeness, requiredDocuments } from './admissions';
import { conductRemark } from './conduct';
import { gradeFor, overallGrade } from './grading';
import { labelForRole } from './role-labels';
import { tooLargeMessage } from './attachment-limits';

/**
 * What the small helpers answer for a value they were not written for.
 *
 * Each of these has a fallback for the record that does not fit: a state a
 * newer client sends, a score below every band, a role added after the label
 * list was written. The fallbacks were never exercised, so a typo in one would
 * have shown up as a blank on a report card or an error at a desk.
 */
describe('the fallbacks in the small helpers', () => {
  it('allows no move out of a state it does not know', () => {
    expect(canMove('ARCHIVED' as never, 'SUBMITTED' as never)).toBe(false);
  });

  it('asks for nothing at an entry point it does not know, and calls that complete', () => {
    expect(requiredDocuments('NOWHERE' as never)).toEqual([]);
    expect(completeness('NOWHERE' as never, []).fraction).toBe(1);
  });

  it('puts a score below every band in the lowest one', () => {
    const lowest = gradeFor('O_CORE' as never, -1);
    expect(lowest).toEqual(gradeFor('O_CORE' as never, 0));
    expect(overallGrade(-1)).toEqual(overallGrade(0));
  });

  it('gives the lowest conduct remark below zero', () => {
    expect(conductRemark(-5)).toBe('Poor');
  });

  it('names a role it has no label for by the role itself', () => {
    expect(labelForRole('ALUMNUS' as never)).toBe('ALUMNUS');
  });

  it('calls a file of no known kind a document', () => {
    expect(tooLargeMessage('application/x-unknown', 60 * 1024 * 1024)).toMatch(
      /^A document/,
    );
  });
});
