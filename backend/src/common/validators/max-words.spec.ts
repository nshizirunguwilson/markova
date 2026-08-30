import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { UpdateTermResultCommentDto } from '../../modules/marks/dto';

/**
 * How long a comment may be.
 *
 * Counted in words rather than characters, because that is the unit the
 * constraint is actually in: the box on a printed report card is two inches
 * tall, and what has to fit it is a sentence somebody wrote. "Excellent" and
 * "A" cost the same line; forty short words overflow it where two hundred
 * characters of long ones may not.
 *
 * The same limit binds a typed comment and a drafted one, so a teacher cannot
 * get round it by writing their own.
 */

const errorsOn = (data: Record<string, unknown>) =>
  validateSync(plainToInstance(UpdateTermResultCommentDto, data), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

describe('a comment on a report card', () => {
  it('accepts one of twenty words', () => {
    expect(errorsOn({ teacherComment: words(20) })).toEqual([]);
  });

  it('refuses one of twenty-one', () => {
    expect(errorsOn({ teacherComment: words(21) })).toHaveLength(1);
  });

  it('holds the head teacher to the same limit', () => {
    expect(errorsOn({ headmasterComment: words(21) })).toHaveLength(1);
  });

  /**
   * Somebody four words over needs to know they are four over, not that they
   * are over. "Comment is too long" sends them counting.
   */
  it('says how many words were written and how many are allowed', () => {
    const [error] = errorsOn({ teacherComment: words(24) });
    const message = Object.values(error.constraints ?? {}).join(' ');
    expect(message).toContain('24 words');
    expect(message).toContain('20');
  });

  // Characters are the wrong unit: twenty long words are a legitimate
  // comment and would fail a character limit set low enough to matter.
  it('accepts twenty long words', () => {
    const long = Array.from({ length: 20 }, () => 'extraordinarily').join(' ');
    expect(errorsOn({ teacherComment: long })).toEqual([]);
  });

  it('does not count the spaces somebody typed twice', () => {
    expect(errorsOn({ teacherComment: 'one   two    three' })).toEqual([]);
  });

  /* Clearing a comment is a legitimate act: a class handed back has its
     comments rewritten, and one of them may be deleted rather than replaced. */
  it('accepts an empty comment', () => {
    expect(errorsOn({ teacherComment: '' })).toEqual([]);
  });

  it('accepts a request that carries no comment at all', () => {
    expect(errorsOn({})).toEqual([]);
  });

  it('refuses something that is not text', () => {
    expect(errorsOn({ teacherComment: 42 })).toHaveLength(1);
  });
});
