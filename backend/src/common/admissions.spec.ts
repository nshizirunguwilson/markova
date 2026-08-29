import {
  TERMINAL,
  canMove,
  completeness,
  isTerminal,
  needsReason,
  nextReference,
  placesLeft,
  refuseMove,
  requiredDocuments,
  type ApplicationState,
} from './admissions';

/**
 * The rules an application moves by.
 *
 * These decide whether a child gets a place, so what is checked here is not
 * the happy path but the ways the machine must refuse: skipping a stage,
 * reopening something that ended, and deciding without saying why.
 */
describe('what may follow what', () => {
  it('takes a new application through review to an offer', () => {
    expect(canMove('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canMove('UNDER_REVIEW', 'OFFERED')).toBe(true);
    expect(canMove('OFFERED', 'ACCEPTED')).toBe(true);
    expect(canMove('ACCEPTED', 'ENROLLED')).toBe(true);
  });

  /**
   * The whole point of the offer being its own record: a place is held, and
   * enrolling somebody who never accepted it skips the family entirely.
   */
  it('will not enrol somebody who has not accepted a place', () => {
    expect(canMove('OFFERED', 'ENROLLED')).toBe(false);
    expect(canMove('UNDER_REVIEW', 'ENROLLED')).toBe(false);
    expect(canMove('SUBMITTED', 'ENROLLED')).toBe(false);
  });

  it('lets a family that was asked for something come back to review', () => {
    expect(canMove('INFO_REQUESTED', 'UNDER_REVIEW')).toBe(true);
  });

  // A waitlisted family is one the school would take. That is the list it
  // needs the day somebody declines.
  it('lets a waitlisted family be offered a place later', () => {
    expect(canMove('WAITLISTED', 'OFFERED')).toBe(true);
  });

  /*
    A revoked offer puts the application back in the pile rather than ending
    it. The family did nothing wrong.
  */
  it('returns a withdrawn offer to the review pile', () => {
    expect(canMove('OFFERED', 'UNDER_REVIEW')).toBe(true);
  });

  it('lets a family pull out at any point before they are enrolled', () => {
    for (const from of [
      'SUBMITTED',
      'UNDER_REVIEW',
      'INFO_REQUESTED',
      'WAITLISTED',
      'OFFERED',
      'ACCEPTED',
    ] as ApplicationState[]) {
      expect(canMove(from, 'WITHDRAWN')).toBe(true);
    }
  });

  describe('what has ended has ended', () => {
    it.each(TERMINAL)('nothing follows %s', (state) => {
      expect(isTerminal(state)).toBe(true);
      for (const to of [
        'UNDER_REVIEW',
        'OFFERED',
        'ACCEPTED',
      ] as ApplicationState[]) {
        expect(canMove(state, to)).toBe(false);
      }
    });

    // Reopening is a new application. Editing an old decision would rewrite
    // what the school actually did.
    it('refuses to reopen a rejection, and says why', () => {
      expect(refuseMove('REJECTED', 'UNDER_REVIEW')).toMatch(
        /cannot be changed.*applies again/i,
      );
    });
  });
});

/**
 * Every refusal ends up in front of somebody at a desk, so it says what is
 * wrong rather than that something is.
 */
describe('refusing a move', () => {
  it('allows a proper move', () => {
    expect(refuseMove('SUBMITTED', 'UNDER_REVIEW')).toBeNull();
  });

  it('says so when the application is already there', () => {
    expect(refuseMove('OFFERED', 'OFFERED')).toMatch(/already/i);
  });

  it('names both ends when the step is not allowed', () => {
    const why = refuseMove('SUBMITTED', 'ACCEPTED');
    expect(why).toMatch(/submitted/i);
    expect(why).toMatch(/accepted/i);
  });

  /**
   * "Why was my child turned away" is a question the school will be asked,
   * sometimes a year later.
   */
  it.each(['INFO_REQUESTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'])(
    'will not move to %s without a reason',
    (to) => {
      expect(needsReason(to as ApplicationState)).toBe(true);
      expect(refuseMove('UNDER_REVIEW', to as ApplicationState)).toMatch(
        /say why/i,
      );
      expect(
        refuseMove('UNDER_REVIEW', to as ApplicationState, 'Below the mark'),
      ).toBeNull();
    },
  );

  it('treats a reason of only spaces as no reason at all', () => {
    expect(refuseMove('UNDER_REVIEW', 'REJECTED', '   ')).toMatch(/say why/i);
  });

  // An offer is good news and explains itself. Demanding a reason for it is
  // friction with nothing behind it.
  it('does not demand a reason for an offer', () => {
    expect(needsReason('OFFERED')).toBe(false);
    expect(refuseMove('UNDER_REVIEW', 'OFFERED')).toBeNull();
  });
});

/**
 * The three doors ask for different things. Asking a transfer applicant for a
 * national exam slip they do not have would leave every transfer permanently
 * incomplete.
 */
describe('what each door has to arrive with', () => {
  it('asks a Senior 1 applicant for their national exam slip', () => {
    expect(requiredDocuments('SENIOR_ONE')).toContain('NATIONAL_EXAM_RESULT');
    expect(requiredDocuments('SENIOR_ONE')).not.toContain('TRANSFER_LETTER');
  });

  it('asks a transfer for a transfer letter instead', () => {
    expect(requiredDocuments('TRANSFER')).toContain('TRANSFER_LETTER');
    expect(requiredDocuments('TRANSFER')).not.toContain('NATIONAL_EXAM_RESULT');
  });

  // The sick bay needs both of these on the day a boarder arrives.
  it('asks a boarder for a medical form and an insurance card', () => {
    const docs = requiredDocuments('SENIOR_ONE', { isBoarder: true });
    expect(docs).toContain('MEDICAL_FORM');
    expect(docs).toContain('INSURANCE_CARD');
  });

  it('asks for a sponsorship letter only when somebody else is paying', () => {
    expect(requiredDocuments('SENIOR_ONE')).not.toContain('BURSARY_LETTER');
    expect(requiredDocuments('SENIOR_ONE', { funded: true })).toContain(
      'BURSARY_LETTER',
    );
  });
});

/**
 * A missing document is the family's to find; an unverified one is the
 * office's to open. One number for both sends the wrong person chasing.
 */
describe('how complete an application is', () => {
  const all = [
    { kind: 'BIRTH_CERTIFICATE' as const, verifiedAt: new Date() },
    { kind: 'NATIONAL_EXAM_RESULT' as const, verifiedAt: new Date() },
    { kind: 'PREVIOUS_REPORT_CARD' as const, verifiedAt: new Date() },
    { kind: 'PASSPORT_PHOTO' as const, verifiedAt: new Date() },
    { kind: 'PARENT_ID' as const, verifiedAt: new Date() },
  ];

  it('is complete when everything asked for is there', () => {
    const c = completeness('SENIOR_ONE', all);
    expect(c).toMatchObject({ complete: true, missing: [], fraction: 1 });
  });

  it('names exactly what is missing', () => {
    const c = completeness('SENIOR_ONE', all.slice(0, 3));
    expect(c.missing).toEqual(['PASSPORT_PHOTO', 'PARENT_ID']);
    expect(c.complete).toBe(false);
  });

  it('counts an attached but unopened document as present, and flags it', () => {
    const c = completeness('SENIOR_ONE', [
      ...all.slice(0, 4),
      { kind: 'PARENT_ID' as const, verifiedAt: null },
    ]);
    expect(c.complete).toBe(true);
    expect(c.unverified).toEqual(['PARENT_ID']);
  });

  it('reports how far through it is', () => {
    expect(completeness('SENIOR_ONE', all.slice(0, 3)).fraction).toBeCloseTo(
      0.6,
    );
  });

  it('counts a boarder against the longer list', () => {
    const c = completeness('SENIOR_ONE', all, { isBoarder: true });
    expect(c.complete).toBe(false);
    expect(c.missing).toEqual(['MEDICAL_FORM', 'INSURANCE_CARD']);
  });

  // Anything the family sent that was not asked for is theirs to send; it does
  // not make the application more complete than it is.
  it('ignores a document nobody asked for', () => {
    const c = completeness('SENIOR_ONE', [
      ...all,
      { kind: 'OTHER' as const, verifiedAt: null },
    ]);
    expect(c.fraction).toBe(1);
    expect(c.present).not.toContain('OTHER');
  });

  it('calls an application with nothing asked of it complete', () => {
    expect(
      completeness('SENIOR_ONE', [], { isBoarder: false }).required.length,
    ).toBeGreaterThan(0);
    expect(completeness('TRANSFER', []).complete).toBe(false);
  });
});

/**
 * A family quotes this back for months, so it is unique and never reused.
 */
describe('numbering an application', () => {
  it('starts the year at one', () => {
    expect(nextReference(null, 2026)).toBe('APP-2026-0001');
  });

  it('follows on from the last one issued', () => {
    expect(nextReference('APP-2026-0416', 2026)).toBe('APP-2026-0417');
  });

  it('starts again in a new year', () => {
    expect(nextReference('APP-2026-0416', 2027)).toBe('APP-2027-0001');
  });

  it('starts at one when the last one cannot be read', () => {
    expect(nextReference('APP-2026-oops', 2026)).toBe('APP-2026-0001');
  });

  it('keeps counting past four digits rather than wrapping', () => {
    expect(nextReference('APP-2026-9999', 2026)).toBe('APP-2026-10000');
  });
});

/**
 * An outstanding offer is a place spent. Counting only enrolled students is
 * how a school offers the same forty places twice and finds out in January.
 */
describe('how many places are left', () => {
  it('counts an outstanding offer against the intake', () => {
    expect(placesLeft(40, { offered: 10, accepted: 0, enrolled: 0 })).toBe(30);
  });

  it('counts accepted and enrolled too', () => {
    expect(placesLeft(40, { offered: 5, accepted: 5, enrolled: 20 })).toBe(10);
  });

  it('never reports fewer than none left', () => {
    expect(placesLeft(40, { offered: 30, accepted: 20, enrolled: 10 })).toBe(0);
  });

  it('reports the lot when nothing has gone out', () => {
    expect(placesLeft(80, { offered: 0, accepted: 0, enrolled: 0 })).toBe(80);
  });
});
