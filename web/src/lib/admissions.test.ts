import { describe, expect, it, vi, afterEach } from "vitest";
import {
  BUCKETS,
  DOCUMENT_LABEL,
  ENTRY_LABEL,
  FUNDING_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  ageOf,
  completenessLine,
  completenessTone,
  examLine,
  expiresIn,
  waitingFor,
  type Completeness,
} from "./admissions";

const c = (over: Partial<Completeness> = {}): Completeness => ({
  required: ["BIRTH_CERTIFICATE", "PASSPORT_PHOTO", "PARENT_ID"],
  present: ["BIRTH_CERTIFICATE", "PASSPORT_PHOTO", "PARENT_ID"],
  missing: [],
  unverified: [],
  complete: true,
  fraction: 1,
  ...over,
});

describe("naming a state", () => {
  it("names every one of the nine", () => {
    expect(Object.keys(STATUS_LABEL)).toHaveLength(9);
    expect(Object.keys(STATUS_VARIANT)).toHaveLength(9);
  });

  /**
   * A family who withdrew is not a family the school turned away. Colouring
   * them alike is how a school comes to believe it rejects more children than
   * it does.
   */
  it("does not paint a withdrawal as a rejection", () => {
    expect(STATUS_VARIANT.WITHDRAWN).not.toBe(STATUS_VARIANT.REJECTED);
  });

  it("marks both waiting states as somebody's outstanding work", () => {
    expect(STATUS_VARIANT.INFO_REQUESTED).toBe("warning");
    expect(STATUS_VARIANT.WAITLISTED).toBe("warning");
  });

  it("says waiting on the family rather than naming the state", () => {
    expect(STATUS_LABEL.INFO_REQUESTED).toMatch(/waiting on the family/i);
  });
});

/*
  The tabs are questions a reviewer asks, not a taxonomy: somebody opening the
  desk wants their pile.
*/
describe("the piles", () => {
  it("leads with the one a reviewer opens the page for", () => {
    expect(BUCKETS[0]).toEqual({ value: "TO_DECIDE", label: "Needs a decision" });
  });

  it("covers every pile the API groups into", () => {
    expect(BUCKETS.map((b) => b.value)).toEqual([
      "TO_DECIDE",
      "WAITING",
      "WAITLISTED",
      "OFFERED",
      "DECIDED",
    ]);
  });
});

describe("naming the rest", () => {
  it("names each door", () => {
    expect(ENTRY_LABEL.SENIOR_ONE).toBe("Senior 1");
    expect(ENTRY_LABEL.TRANSFER).toBe("Transfer");
  });

  // Named the way a family will go looking for them, not by the enum.
  it("names every document a family could be asked for", () => {
    expect(Object.keys(DOCUMENT_LABEL)).toHaveLength(10);
    expect(DOCUMENT_LABEL.INSURANCE_CARD).toMatch(/Mutuelle/);
    expect(DOCUMENT_LABEL.NATIONAL_EXAM_RESULT).toMatch(/results slip/i);
  });

  it("names every way a place is paid for", () => {
    expect(Object.keys(FUNDING_LABEL)).toHaveLength(6);
    expect(FUNDING_LABEL.FAMILY).toMatch(/family is paying/i);
  });
});

/**
 * What decides whether an application can be acted on at all.
 */
describe("how complete it is, in one line", () => {
  it("says how many are missing", () => {
    expect(
      completenessLine(
        c({
          present: ["BIRTH_CERTIFICATE"],
          missing: ["PASSPORT_PHOTO", "PARENT_ID"],
          complete: false,
        }),
      ),
    ).toBe("1 of 3, missing 2");
  });

  it("says it is all there when it is", () => {
    expect(completenessLine(c())).toBe("3 of 3 documents");
  });

  /*
    A missing document is the family's to find; an unchecked one is the
    office's to open. The line says which, so the right person chases.
  */
  it("says how many are still to be checked", () => {
    expect(completenessLine(c({ unverified: ["PARENT_ID"] }))).toBe(
      "3 of 3, 1 to check",
    );
  });

  it("copes with an application nothing was asked of", () => {
    expect(completenessLine(c({ required: [] }))).toBe("Nothing to send");
    expect(completenessLine(null)).toBe("Nothing to send");
  });
});

describe("the colour of the bar", () => {
  it("is green when everything is in", () => {
    expect(completenessTone(c(), "UNDER_REVIEW")).toBe("bg-success");
  });

  it("is amber while something is outstanding", () => {
    expect(completenessTone(c({ complete: false }), "SUBMITTED")).toBe(
      "bg-warning",
    );
  });

  // A decided application is not a job half done, whatever its documents say.
  it("is red on an application that ended badly", () => {
    expect(completenessTone(c(), "REJECTED")).toBe("bg-danger");
    expect(completenessTone(c(), "WITHDRAWN")).toBe("bg-danger");
  });
});

/**
 * The clock matters more than the state on its own: "waiting on the family"
 * says nothing about whether to chase.
 */
describe("how long something has been sitting", () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    return iso;
  };

  it("counts the days", () => {
    expect(waitingFor(at("2026-06-11T12:00:00Z"))).toBe("9 days ago");
  });

  it("says one day rather than 1 days", () => {
    expect(waitingFor(at("2026-06-19T12:00:00Z"))).toBe("1 day ago");
  });

  it("says today for something that happened this morning", () => {
    expect(waitingFor(at("2026-06-20T08:00:00Z"))).toBe("today");
  });

  it("says nothing when there is no date", () => {
    expect(waitingFor(null)).toBe("");
  });
});

/**
 * A held place is capacity spent, so the question is always how much longer
 * the school is holding it.
 */
describe("how long an offer has left", () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    return iso;
  };

  it("counts down", () => {
    expect(expiresIn(at("2026-06-24T12:00:00Z"))).toBe("expires in 4 days");
  });

  it("says tomorrow rather than in 1 days", () => {
    expect(expiresIn(at("2026-06-21T12:00:00Z"))).toBe("expires tomorrow");
  });

  it("says today on the last day", () => {
    expect(expiresIn(at("2026-06-20T15:00:00Z"))).toBe("expires today");
  });

  // An expired offer still shows: the place is not held any more, and the
  // reviewer needs to know that rather than see a blank.
  it("says so once it has run out", () => {
    expect(expiresIn(at("2026-06-18T12:00:00Z"))).toBe("expired");
  });

  it("says nothing when there is no offer", () => {
    expect(expiresIn(null)).toBe("");
  });

  it("says nothing for a date it cannot read", () => {
    expect(expiresIn("last Tuesday")).toBe("");
  });
});

/** What decides whether a level fits. */
describe("an applicant's age", () => {
  afterEach(() => vi.useRealTimers());

  it("counts whole years", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    expect(ageOf("2013-04-02")).toBe(13);
  });

  // A birthday still to come this year has not happened yet.
  it("does not count a birthday that has not arrived", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    expect(ageOf("2013-09-02")).toBe(12);
  });

  // A birthday earlier this month has already happened; one later has not.
  it("counts a birthday already past this month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    expect(ageOf("2013-06-02")).toBe(13);
    expect(ageOf("2013-06-28")).toBe(12);
  });

  it("gives nothing for a date it cannot read", () => {
    expect(ageOf("last Tuesday")).toBeNull();
    expect(ageOf(null)).toBeNull();
  });
});

describe("the exam mark", () => {
  it("writes it out of what it was marked from", () => {
    expect(examLine(68, 100)).toBe("68 / 100");
  });

  it("writes it alone when the total is unknown", () => {
    expect(examLine(68, null)).toBe("68");
  });

  // A transfer has no national exam mark, and printing "0" would be a lie.
  it("gives nothing when there is no mark", () => {
    expect(examLine(null, 100)).toBeNull();
  });
});
