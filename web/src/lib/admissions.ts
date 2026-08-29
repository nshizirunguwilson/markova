/**
 * How an application is named and shown.
 *
 * The rules themselves live on the API, in `common/admissions.ts`. What is
 * here is presentation: the words a reviewer reads, the colours a state takes,
 * and the two or three shapes that make a queue scannable.
 */

export type ApplicationStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INFO_REQUESTED"
  | "WAITLISTED"
  | "OFFERED"
  | "ACCEPTED"
  | "ENROLLED"
  | "REJECTED"
  | "WITHDRAWN";

export type EntryPoint = "SENIOR_ONE" | "ADVANCED_LEVEL" | "TRANSFER";

export type DocumentKind =
  | "BIRTH_CERTIFICATE"
  | "NATIONAL_EXAM_RESULT"
  | "PREVIOUS_REPORT_CARD"
  | "TRANSFER_LETTER"
  | "PASSPORT_PHOTO"
  | "PARENT_ID"
  | "MEDICAL_FORM"
  | "INSURANCE_CARD"
  | "BURSARY_LETTER"
  | "OTHER";

export type Funding =
  | "FAMILY"
  | "DISTRICT_BURSARY"
  | "GOVERNMENT_SPONSORED"
  | "NGO_SPONSOR"
  | "FARG"
  | "STAFF_CHILD";

/** What a state is called in front of a person. */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  INFO_REQUESTED: "Waiting on the family",
  WAITLISTED: "Waitlisted",
  OFFERED: "Offered a place",
  ACCEPTED: "Place accepted",
  ENROLLED: "Enrolled",
  REJECTED: "Not offered a place",
  WITHDRAWN: "Withdrawn",
};

/**
 * How a state looks, as one of the badge variants the rest of the app uses.
 *
 * The two waiting states are amber because they are somebody's outstanding
 * work; the two endings are separated on purpose - a family who withdrew is
 * not a family the school turned away, and colouring them alike is how a
 * school comes to believe it rejects more children than it does.
 */
export const STATUS_VARIANT: Record<
  ApplicationStatus,
  "default" | "primary" | "success" | "warning" | "danger" | "info"
> = {
  SUBMITTED: "info",
  UNDER_REVIEW: "primary",
  INFO_REQUESTED: "warning",
  WAITLISTED: "warning",
  OFFERED: "success",
  ACCEPTED: "success",
  ENROLLED: "success",
  REJECTED: "danger",
  WITHDRAWN: "default",
};

/**
 * The piles a reviewer actually thinks in.
 *
 * Questions rather than states: somebody opening the desk wants their pile,
 * not a taxonomy. The states are still there underneath, in each row's badge.
 */
export const BUCKETS: { value: string; label: string }[] = [
  { value: "TO_DECIDE", label: "Needs a decision" },
  { value: "WAITING", label: "Waiting on family" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "OFFERED", label: "Offered" },
  { value: "DECIDED", label: "Decided" },
];

export const ENTRY_LABEL: Record<EntryPoint, string> = {
  SENIOR_ONE: "Senior 1",
  ADVANCED_LEVEL: "A-Level or trade",
  TRANSFER: "Transfer",
};

/** What a document is called when the school asks a family for it. */
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  BIRTH_CERTIFICATE: "Birth certificate",
  NATIONAL_EXAM_RESULT: "National examination results slip",
  PREVIOUS_REPORT_CARD: "Last report card",
  TRANSFER_LETTER: "Transfer letter from the previous school",
  PASSPORT_PHOTO: "Passport photograph",
  PARENT_ID: "Parent or guardian's national ID",
  MEDICAL_FORM: "Medical form",
  INSURANCE_CARD: "Mutuelle de Sante or RSSB card",
  BURSARY_LETTER: "Bursary or sponsorship letter",
  OTHER: "Other document",
};

export const FUNDING_LABEL: Record<Funding, string> = {
  FAMILY: "The family is paying",
  DISTRICT_BURSARY: "District bursary",
  GOVERNMENT_SPONSORED: "Government sponsored",
  NGO_SPONSOR: "Sponsored by an NGO",
  FARG: "FARG",
  STAFF_CHILD: "Staff child",
};

export interface Completeness {
  required: DocumentKind[];
  present: DocumentKind[];
  missing: DocumentKind[];
  unverified: DocumentKind[];
  complete: boolean;
  fraction: number;
}

/**
 * The completeness of an application, in one line.
 *
 * "5 of 7, missing 2" is the thing that decides whether an application can be
 * acted on at all, which is why it sits beside the name rather than three
 * clicks in.
 */
export function completenessLine(c: Completeness | null | undefined): string {
  if (!c || c.required.length === 0) return "Nothing to send";
  const total = c.required.length;
  if (c.complete) {
    return c.unverified.length > 0
      ? `${total} of ${total}, ${c.unverified.length} to check`
      : `${total} of ${total} documents`;
  }
  return `${c.present.length} of ${total}, missing ${c.missing.length}`;
}

/** The colour of the completeness bar, which matches the row's own state. */
export function completenessTone(
  c: Completeness | null | undefined,
  status: ApplicationStatus,
): string {
  if (status === "REJECTED" || status === "WITHDRAWN") return "bg-danger";
  if (!c || !c.complete) return "bg-warning";
  return "bg-success";
}

/**
 * How long something has been sitting, in the words a reviewer would use.
 *
 * The clock matters more than the state on its own: "waiting on the family"
 * says nothing about whether to chase, and "asked 9 days ago" says everything.
 */
export function waitingFor(since: string | Date | null | undefined): string {
  if (!since) return "";
  const days = Math.floor(
    (Date.now() - new Date(since).getTime()) / 86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/**
 * How long an offer has left.
 *
 * Counted down rather than shown as a date, because a held place is capacity
 * spent and the question is always how long the school is holding it for.
 */
export function expiresIn(when: string | Date | null | undefined): string {
  if (!when) return "";
  const end = new Date(when);
  if (Number.isNaN(end.getTime())) return "";
  if (end.getTime() < Date.now()) return "expired";

  /*
    Counted in calendar days, not in hours. An offer running out at three this
    afternoon is eight hours away, and rounding that up reads as "expires
    tomorrow" on the very day the place is lost.
  */
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(end) - startOfDay(new Date())) / 86_400_000,
  );

  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** An applicant's age today, which is what decides whether a level fits. */
export function ageOf(dateOfBirth: string | Date | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  const age = now.getFullYear() - dob.getFullYear();
  const before =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  return before ? age - 1 : age;
}

/** The mark as the school writes it: "68 / 100". */
export function examLine(
  mark: number | null | undefined,
  total: number | null | undefined,
): string | null {
  if (mark == null) return null;
  return total ? `${mark} / ${total}` : String(mark);
}
