/**
 * The rules an application moves by.
 *
 * Kept apart from the database because they are the part that decides whether
 * a child gets a place. A rule that consequential should be readable end to
 * end and testable without a schema, the same reason the fee arithmetic sits
 * in `fees.ts`.
 */

export type ApplicationState =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INFO_REQUESTED'
  | 'WAITLISTED'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'ENROLLED'
  | 'REJECTED'
  | 'WITHDRAWN';

/**
 * What may follow what.
 *
 * Written as a table rather than as branching code so the whole state machine
 * can be read in one screen, and so a transition nobody thought about is a
 * missing entry rather than a fall-through.
 */
export const TRANSITIONS: Record<ApplicationState, ApplicationState[]> = {
  // Arrived. Picking it up, or the family changing their mind.
  SUBMITTED: ['UNDER_REVIEW', 'INFO_REQUESTED', 'REJECTED', 'WITHDRAWN'],
  // Somebody has it, and every decision is open from here.
  UNDER_REVIEW: [
    'INFO_REQUESTED',
    'WAITLISTED',
    'OFFERED',
    'REJECTED',
    'WITHDRAWN',
  ],
  // Waiting on the family. Back to review when it arrives.
  INFO_REQUESTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  // Good enough, no place. Forward when one opens.
  WAITLISTED: ['OFFERED', 'REJECTED', 'WITHDRAWN'],
  /*
    A place is held. The family answers, the school withdraws it, or it runs
    out. `UNDER_REVIEW` is reachable again because a revoked offer puts the
    application back in the pile rather than ending it.
  */
  OFFERED: ['ACCEPTED', 'UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  // Said yes. The office still has to enrol them, or they can still pull out.
  ACCEPTED: ['ENROLLED', 'WITHDRAWN'],
  // A student record exists. Nothing follows: the application is frozen.
  ENROLLED: [],
  // Ends, both of them. Reopening is a new application, not a state change.
  REJECTED: [],
  WITHDRAWN: [],
};

/** Nothing follows these. The application is over, one way or the other. */
export const TERMINAL: ApplicationState[] = [
  'ENROLLED',
  'REJECTED',
  'WITHDRAWN',
];

/**
 * States a decision has to be explained for.
 *
 * Anything the family could be told about. "Why was my child turned away" is a
 * question the school will be asked, sometimes a year later, and an
 * unexplained decision is indistinguishable from a mistake.
 */
export const NEEDS_REASON: ApplicationState[] = [
  'INFO_REQUESTED',
  'WAITLISTED',
  'REJECTED',
  'WITHDRAWN',
];

export function canMove(from: ApplicationState, to: ApplicationState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(state: ApplicationState): boolean {
  return TERMINAL.includes(state);
}

export function needsReason(to: ApplicationState): boolean {
  return NEEDS_REASON.includes(to);
}

/**
 * Why a move is refused, or null when it is allowed.
 *
 * Returns a sentence rather than a boolean because every one of these ends up
 * in front of somebody at a desk, and "Forbidden" tells them nothing about
 * what to do instead.
 */
export function refuseMove(
  from: ApplicationState,
  to: ApplicationState,
  reason?: string | null,
): string | null {
  if (from === to) {
    return `This application is already ${label(to).toLowerCase()}.`;
  }
  if (isTerminal(from)) {
    return `This application was ${label(from).toLowerCase()} and cannot be changed. A family who wants to be reconsidered applies again.`;
  }
  if (!canMove(from, to)) {
    return `An application that is ${label(from).toLowerCase()} cannot go straight to ${label(to).toLowerCase()}.`;
  }
  if (needsReason(to) && !reason?.trim()) {
    return `Say why. An unexplained decision cannot be answered when the family asks about it.`;
  }
  return null;
}

/** What a state is called in front of a person. */
export const STATE_LABEL: Record<ApplicationState, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  INFO_REQUESTED: 'Waiting on the family',
  WAITLISTED: 'Waitlisted',
  OFFERED: 'Offered a place',
  ACCEPTED: 'Place accepted',
  ENROLLED: 'Enrolled',
  REJECTED: 'Not offered a place',
  WITHDRAWN: 'Withdrawn',
};

function label(state: ApplicationState): string {
  return STATE_LABEL[state] ?? state;
}

// ── What a complete application looks like ─────────────────────────────────

export type EntryPoint = 'SENIOR_ONE' | 'ADVANCED_LEVEL' | 'TRANSFER';

export type DocumentKind =
  | 'BIRTH_CERTIFICATE'
  | 'NATIONAL_EXAM_RESULT'
  | 'PREVIOUS_REPORT_CARD'
  | 'TRANSFER_LETTER'
  | 'PASSPORT_PHOTO'
  | 'PARENT_ID'
  | 'MEDICAL_FORM'
  | 'INSURANCE_CARD'
  | 'BURSARY_LETTER'
  | 'OTHER';

/**
 * What each door has to arrive with.
 *
 * Different by entry point on purpose: a transfer has no national exam slip to
 * give, and asking for one would put every transfer permanently at "missing a
 * document". A Senior 1 entrant has no transfer letter, for the same reason.
 */
export const REQUIRED_DOCUMENTS: Record<EntryPoint, DocumentKind[]> = {
  SENIOR_ONE: [
    'BIRTH_CERTIFICATE',
    'NATIONAL_EXAM_RESULT',
    'PREVIOUS_REPORT_CARD',
    'PASSPORT_PHOTO',
    'PARENT_ID',
  ],
  ADVANCED_LEVEL: [
    'BIRTH_CERTIFICATE',
    'NATIONAL_EXAM_RESULT',
    'PREVIOUS_REPORT_CARD',
    'PASSPORT_PHOTO',
    'PARENT_ID',
  ],
  TRANSFER: [
    'BIRTH_CERTIFICATE',
    'TRANSFER_LETTER',
    'PREVIOUS_REPORT_CARD',
    'PASSPORT_PHOTO',
    'PARENT_ID',
  ],
};

/** Asked of a boarder on top of the rest: the sick bay needs both on day one. */
export const BOARDER_DOCUMENTS: DocumentKind[] = [
  'MEDICAL_FORM',
  'INSURANCE_CARD',
];

/** Asked when the family says somebody else is paying. */
export const FUNDED_DOCUMENT: DocumentKind = 'BURSARY_LETTER';

export function requiredDocuments(
  entryPoint: EntryPoint,
  opts: { isBoarder?: boolean; funded?: boolean } = {},
): DocumentKind[] {
  return [
    ...(REQUIRED_DOCUMENTS[entryPoint] ?? []),
    ...(opts.isBoarder ? BOARDER_DOCUMENTS : []),
    ...(opts.funded ? [FUNDED_DOCUMENT] : []),
  ];
}

export interface Completeness {
  required: DocumentKind[];
  present: DocumentKind[];
  missing: DocumentKind[];
  /** Attached but not yet opened and confirmed by the office. */
  unverified: DocumentKind[];
  complete: boolean;
  /** How far through, for the bar on the queue. */
  fraction: number;
}

/**
 * What is still missing, and what is merely unchecked.
 *
 * The distinction matters at the desk: a missing document is the family's to
 * find, an unverified one is the office's to open. Collapsing them into one
 * number sends the wrong person chasing.
 */
export function completeness(
  entryPoint: EntryPoint,
  attached: { kind: DocumentKind; verifiedAt?: Date | string | null }[],
  opts: { isBoarder?: boolean; funded?: boolean } = {},
): Completeness {
  const required = requiredDocuments(entryPoint, opts);
  const have = new Set(attached.map((d) => d.kind));
  const verified = new Set(
    attached.filter((d) => d.verifiedAt).map((d) => d.kind),
  );

  const present = required.filter((k) => have.has(k));
  const missing = required.filter((k) => !have.has(k));
  const unverified = present.filter((k) => !verified.has(k));

  return {
    required,
    present,
    missing,
    unverified,
    complete: missing.length === 0,
    fraction: required.length === 0 ? 1 : present.length / required.length,
  };
}

/** What a document is called when the school asks a family for it. */
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  BIRTH_CERTIFICATE: 'Birth certificate',
  NATIONAL_EXAM_RESULT: 'National examination results slip',
  PREVIOUS_REPORT_CARD: 'Last report card',
  TRANSFER_LETTER: 'Transfer letter from the previous school',
  PASSPORT_PHOTO: 'Passport photograph',
  PARENT_ID: "Parent or guardian's national ID",
  MEDICAL_FORM: 'Medical form',
  INSURANCE_CARD: 'Mutuelle de Sante or RSSB card',
  BURSARY_LETTER: 'Bursary or sponsorship letter',
  OTHER: 'Other document',
};

// ── References ─────────────────────────────────────────────────────────────

/**
 * The next application reference, from the last one issued.
 *
 * `APP-<year>-<n>`, the shape every identifier in the system takes. A family
 * quotes this back for months, so it is unique across the school and never
 * reused - and it is deliberately not a student number, because holding one of
 * those would imply they got in.
 */
export function nextReference(
  lastIssued: string | null | undefined,
  year: number,
): string {
  const prefix = `APP-${year}-`;
  const seq =
    lastIssued && lastIssued.startsWith(prefix)
      ? Number(lastIssued.slice(prefix.length))
      : 0;
  const next = Number.isFinite(seq) && seq > 0 ? seq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// ── Places ─────────────────────────────────────────────────────────────────

/**
 * How many places an intake has left.
 *
 * An outstanding offer is a place spent, not a place free. Counting only
 * enrolled students is how a school offers the same forty places twice and
 * finds out in January.
 */
export function placesLeft(
  places: number,
  counts: { offered: number; accepted: number; enrolled: number },
): number {
  return Math.max(
    0,
    places - counts.offered - counts.accepted - counts.enrolled,
  );
}
