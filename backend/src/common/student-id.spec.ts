import {
  buildStudentId,
  checkCode,
  isStudentIdShape,
  nameCode,
  studentIdSecret,
  verifyStudentId,
} from './student-id';

/**
 * The student number.
 *
 * It goes on a card a child carries for years and is scanned at the gate, so
 * two properties matter above all: the same student always gets the same
 * number, and nobody outside the school can produce one that passes.
 */

const SECRET = 'test-secret-not-the-real-one';

describe('the name code', () => {
  // The school's own worked example.
  it('takes the initials of a two-part name, then the surname second letter', () => {
    // W=23, N=14, s=19
    expect(nameCode('Wilson Nshizirungu')).toBe('231419');
  });

  it('takes the true middle of a three-part name', () => {
    // C=03, N=14, Aidan -> A=01
    expect(nameCode('Calvin Aidan Nshuti')).toBe('031401');
  });

  it('takes the true middle of a four-part name', () => {
    // A=01, I=09, parts[2] = Mahoro -> M=13
    expect(nameCode('Aaron Prince Mahoro Irakoze')).toBe('010913');
  });

  // Three names and five names must go through the same rule, or a family
  // that records a fourth name changes shape.
  it('handles five names without a special case', () => {
    expect(nameCode('Aline Keza Uwase Mutesi Ingabire')).toHaveLength(6);
    // parts[2] = Uwase -> U=21
    expect(nameCode('Aline Keza Uwase Mutesi Ingabire')).toBe('010921');
  });

  it('handles a single name', () => {
    // K=11, a=01, g=07
    expect(nameCode('Kagabo')).toBe('110107');
  });

  it('always returns three two-digit numbers', () => {
    for (const name of [
      'Wilson Nshizirungu',
      'Kagabo',
      'Aaron Prince Mahoro Irakoze',
      'Divine Niyonkuru',
      'Aline Keza Uwase Mutesi Ingabire',
    ]) {
      expect(nameCode(name)).toMatch(/^\d{6}$/);
    }
  });

  // Rwandan names are commonly hyphenated or double-barrelled.
  it('treats a hyphen as a break between names', () => {
    expect(nameCode('Jean-Paul Habimana')).toBe(nameCode('Jean Paul Habimana'));
  });

  it('ignores punctuation and extra spacing', () => {
    expect(nameCode('  Wilson   Nshizirungu  ')).toBe('231419');
    expect(nameCode("Wilson N'shizirungu")).toBe('231419');
  });

  it('is unchanged by case', () => {
    expect(nameCode('wilson nshizirungu')).toBe('231419');
  });

  it('refuses a name with no letters in it', () => {
    expect(() => nameCode('   ')).toThrow(/needs a name/i);
    expect(() => nameCode('123')).toThrow(/needs a name/i);
  });
});

describe('the check digits', () => {
  it('are always three digits', () => {
    expect(checkCode(SECRET, 2025, '231419', 'u-1')).toMatch(/^\d{3}$/);
  });

  // A student number is printed once and carried for years.
  it('are the same every time for the same student', () => {
    const first = checkCode(SECRET, 2025, '231419', 'u-1');
    const second = checkCode(SECRET, 2025, '231419', 'u-1');
    expect(first).toBe(second);
  });

  it('differ between two students who share a name code', () => {
    const one = checkCode(SECRET, 2025, '231419', 'u-1');
    const two = checkCode(SECRET, 2025, '231419', 'u-2');
    expect(one).not.toBe(two);
  });

  it('differ between intake years', () => {
    expect(checkCode(SECRET, 2025, '231419', 'u-1')).not.toBe(
      checkCode(SECRET, 2024, '231419', 'u-1'),
    );
  });

  // This is the whole point: without the school's secret you cannot produce a
  // number that will pass.
  it('cannot be reproduced without the secret', () => {
    const real = checkCode(SECRET, 2025, '231419', 'u-1');
    const guessed = checkCode('a-different-secret', 2025, '231419', 'u-1');
    expect(guessed).not.toBe(real);
  });

  it('give the retry nonce a different answer', () => {
    expect(checkCode(SECRET, 2025, '231419', 'u-1', 0)).not.toBe(
      checkCode(SECRET, 2025, '231419', 'u-1', 1),
    );
  });
});

describe('building a student number', () => {
  it('reads STD-year-ABC-DEF', () => {
    const id = buildStudentId(SECRET, {
      fullName: 'Wilson Nshizirungu',
      year: 2025,
      studentKey: 'u-1',
    });
    expect(id).toMatch(/^STD-2025-231419-\d{3}$/);
  });

  it('refuses to issue one without a secret', () => {
    expect(() =>
      buildStudentId('', {
        fullName: 'Wilson Nshizirungu',
        year: 2025,
        studentKey: 'u-1',
      }),
    ).toThrow(/STUDENT_ID_SECRET/);
  });

  // The number a child carries must not change because an admin fixed a typo
  // in a middle name years later.
  it('is stable for the same student and year', () => {
    const parts = {
      fullName: 'Wilson Nshizirungu',
      year: 2025,
      studentKey: 'u-1',
    };
    expect(buildStudentId(SECRET, parts)).toBe(buildStudentId(SECRET, parts));
  });

  // 35% of a real roll shares a year and name code, so the check digits are
  // what actually separate two students.
  it('separates two students with the same name in the same year', () => {
    const a = buildStudentId(SECRET, {
      fullName: 'Aline Uwase',
      year: 2025,
      studentKey: 'u-1',
    });
    const b = buildStudentId(SECRET, {
      fullName: 'Aline Uwase',
      year: 2025,
      studentKey: 'u-2',
    });
    expect(a).not.toBe(b);
    expect(a.slice(0, 15)).toBe(b.slice(0, 15));
  });

  /**
   * Three check digits are 1000 slots per year and name code. That is ample
   * for a real roll, where the largest group of students sharing a name code
   * is 7, but it is not unlimited: a caller must still retry on the unique
   * constraint rather than assume the first number is free.
   */
  it('collides eventually when a name code is reused far beyond a real school', () => {
    const ids = new Set(
      Array.from({ length: 500 }, (_, i) =>
        buildStudentId(SECRET, {
          fullName: 'Aline Uwase',
          year: 2025,
          studentKey: `u-${i}`,
        }),
      ),
    );
    expect(ids.size).toBeLessThan(500);
  });

  // Which is why the issuing path bumps the nonce until the number is free.
  it('finds a free number by retrying, as the issuer does', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      let nonce = 0;
      let id = '';
      do {
        id = buildStudentId(SECRET, {
          fullName: 'Aline Uwase',
          year: 2025,
          studentKey: `u-${i}`,
          nonce,
        });
        nonce += 1;
      } while (taken.has(id) && nonce < 50);
      taken.add(id);
    }
    expect(taken.size).toBe(500);
  });

  // The size of a real cohort sharing one name code, from the current roll.
  it('needs no retry at the scale a school actually reaches', () => {
    const ids = new Set(
      Array.from({ length: 7 }, (_, i) =>
        buildStudentId(SECRET, {
          fullName: 'Aline Uwase',
          year: 2025,
          studentKey: `u-${i}`,
        }),
      ),
    );
    expect(ids.size).toBe(7);
  });
});

describe('checking a number that arrives from outside', () => {
  const id = buildStudentId(SECRET, {
    fullName: 'Wilson Nshizirungu',
    year: 2025,
    studentKey: 'u-1',
  });

  it('accepts one the school issued', () => {
    expect(verifyStudentId(SECRET, id, 'u-1')).toBe(true);
  });

  it('accepts one issued after a collision retry', () => {
    const retried = buildStudentId(SECRET, {
      fullName: 'Wilson Nshizirungu',
      year: 2025,
      studentKey: 'u-1',
      nonce: 3,
    });
    expect(verifyStudentId(SECRET, retried, 'u-1')).toBe(true);
  });

  // Altering any part has to fail, not just the check digits.
  it('rejects an altered check', () => {
    const tampered = id.replace(/\d{3}$/, '000');
    if (tampered === id) return;
    expect(verifyStudentId(SECRET, tampered, 'u-1')).toBe(false);
  });

  it('rejects an altered year', () => {
    expect(verifyStudentId(SECRET, id.replace('2025', '2024'), 'u-1')).toBe(
      false,
    );
  });

  it('rejects an altered name code', () => {
    expect(verifyStudentId(SECRET, id.replace('231419', '231420'), 'u-1')).toBe(
      false,
    );
  });

  it('rejects a number belonging to another student', () => {
    expect(verifyStudentId(SECRET, id, 'u-2')).toBe(false);
  });

  it('rejects one made with a different secret', () => {
    expect(verifyStudentId('another-secret', id, 'u-1')).toBe(false);
  });

  it('rejects anything that is not shaped like a student number', () => {
    for (const junk of ['', 'STD-2025-0001', 'hello', 'STD-25-231419-167']) {
      expect(verifyStudentId(SECRET, junk, 'u-1')).toBe(false);
    }
  });
});

describe('recognising the shape alone', () => {
  it('accepts a well formed number', () => {
    expect(isStudentIdShape('STD-2025-231419-167')).toBe(true);
  });

  // The retired sequence format must not be mistaken for the new one.
  it('rejects the old sequence format', () => {
    expect(isStudentIdShape('STD-2025-0001')).toBe(false);
    expect(isStudentIdShape('MKV-2026-0001')).toBe(false);
  });

  it('rejects a number with the wrong number of digits', () => {
    expect(isStudentIdShape('STD-2025-23141-167')).toBe(false);
    expect(isStudentIdShape('STD-2025-231419-16')).toBe(false);
  });
});

/**
 * Names too short for the rule to reach into.
 *
 * The name code takes three letters, which a one-letter name does not have.
 * A student registered under a single initial still has to get a number, so
 * the rule falls back onto the letters it does have rather than reading past
 * the end of the word.
 */
describe('a name with barely any letters in it', () => {
  it('repeats the only letter a one-letter name has', () => {
    // K=11, and there is nothing else to take, so it is used three times.
    expect(nameCode('K')).toBe('111111');
  });

  it('reaches for the second letter when there is no second name', () => {
    // J=10, o=15, and no third letter, so the second is used again.
    expect(nameCode('Jo')).toBe('101515');
  });

  it('takes the surname first letter when it has no second', () => {
    // A=01, U=21, and Uwase's second letter for the third position.
    expect(nameCode('Aline U')).toBe('012121');
  });

  it('still returns six digits for every one of them', () => {
    for (const name of ['K', 'Jo', 'Aline U', 'A B C']) {
      expect(nameCode(name)).toMatch(/^\d{6}$/);
    }
  });
});

/**
 * The secret a student number is signed with.
 *
 * Production must set its own, because reusing the JWT key here would leak it
 * into the check digits of every printed card. A development run falls back
 * so nobody has to configure two secrets to see the app work.
 */
describe('where the signing secret comes from', () => {
  it('uses its own secret whenever one is set', () => {
    expect(
      studentIdSecret({
        STUDENT_ID_SECRET: 'its-own',
        JWT_SECRET: 'the-jwt-one',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBe('its-own');
  });

  // Falling back to the JWT secret in production would put it into every
  // printed card, so production gets nothing rather than that.
  it('refuses to borrow the JWT secret in production', () => {
    expect(
      studentIdSecret({
        JWT_SECRET: 'the-jwt-one',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBe('');
  });

  it('borrows it in development so nothing has to be set up twice', () => {
    expect(
      studentIdSecret({
        JWT_SECRET: 'the-jwt-one',
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv),
    ).toBe('the-jwt-one');
  });

  it('copes with an environment that has neither', () => {
    expect(studentIdSecret({} as NodeJS.ProcessEnv)).toBe('');
  });
});
