import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SickBay, feverTone, restingFor, type SickBayVisit } from "./sick-bay";

/**
 * Shaped like `GET /clinic/visits?inSickBay=true`: the student hangs off the
 * visit, the class off the student, and the name off the student's user.
 * Captured from a live response.
 */
const visit = (over: Partial<SickBayVisit> = {}): SickBayVisit => ({
  id: "v-1",
  complaint: "Toothache on the left side",
  severity: "MODERATE",
  temperature: 38.7,
  visitedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
  parentNotifiedAt: null,
  student: {
    id: "student-1",
    studentIdNumber: "STD-2026-001",
    isBoarder: true,
    user: { firstName: "Keza", lastName: "Mutesi" },
    classSection: {
      name: "A",
      classLevel: { name: "Senior 2" },
      trade: null,
    },
  },
  ...over,
});

describe("how long someone has been resting", () => {
  const now = new Date("2026-08-27T12:00:00Z");

  it("counts minutes under an hour", () => {
    expect(restingFor("2026-08-27T11:20:00Z", now)).toBe("40 min");
  });

  it("counts hours after that", () => {
    expect(restingFor("2026-08-27T09:00:00Z", now)).toBe("3h");
  });

  it("counts days once it has been that long", () => {
    expect(restingFor("2026-08-25T12:00:00Z", now)).toBe("2 days");
    expect(restingFor("2026-08-26T12:00:00Z", now)).toBe("1 day");
  });

  // A clock skew should read as "just now", not as a negative number.
  it("never counts backwards", () => {
    expect(restingFor("2026-08-27T12:05:00Z", now)).toBe("0 min");
  });

  it("says nothing for a time it cannot read", () => {
    expect(restingFor("not a time", now)).toBe("");
  });
});

/**
 * A temperature is the one number on this list that a matron acts on without
 * asking anyone, so it has to be legible at a glance.
 */
describe("marking a temperature worth acting on", () => {
  it("leaves a normal temperature quiet", () => {
    expect(feverTone(36.8)).toBe("text-muted");
    expect(feverTone(37.5)).toBe("text-muted");
  });

  it("warns from a mild fever", () => {
    expect(feverTone(37.9)).toBe("text-warning");
  });

  it("raises a high fever", () => {
    expect(feverTone(38.6)).toBe("text-danger");
  });

  it("says nothing when no temperature was taken", () => {
    expect(feverTone(null)).toBe("text-muted");
    expect(feverTone(undefined)).toBe("text-muted");
  });
});

describe("the sick bay list", () => {
  it("names who is resting, with their class", () => {
    render(<SickBay visits={[visit()]} />);
    expect(screen.getByText("Keza Mutesi")).toBeInTheDocument();
    expect(screen.getByText("Senior 2 A")).toBeInTheDocument();
    expect(screen.getByText(/Toothache/)).toBeInTheDocument();
  });

  it("counts them in the heading", () => {
    render(<SickBay visits={[visit(), visit({ id: "v-2" })]} />);
    expect(screen.getByText("2 students resting now")).toBeInTheDocument();
  });

  it("uses the singular for one", () => {
    render(<SickBay visits={[visit()]} />);
    expect(screen.getByText("1 student resting now")).toBeInTheDocument();
  });

  // An empty sick bay is good news and should read as good news, not as a
  // page that failed to load.
  it("says every bed is free when nobody is resting", () => {
    render(<SickBay visits={[]} />);
    expect(screen.getByText("Every bed is free")).toBeInTheDocument();
  });

  it("shows the temperature and how long they have been there", () => {
    render(<SickBay visits={[visit()]} />);
    expect(screen.getByText(/38\.7°/)).toBeInTheDocument();
    expect(screen.getByText(/1h/)).toBeInTheDocument();
  });

  it("names the severity rather than leaving it to a colour", () => {
    render(<SickBay visits={[visit({ severity: "SERIOUS" })]} />);
    expect(screen.getByText("Serious")).toBeInTheDocument();
  });

  it("treats an unknown severity as minor rather than crashing", () => {
    render(<SickBay visits={[visit({ severity: "WHO KNOWS" })]} />);
    expect(screen.getByText("Minor")).toBeInTheDocument();
  });

  it("marks a boarder, because that decides whose dormitory is short", () => {
    render(<SickBay visits={[visit()]} />);
    expect(screen.getByText("Boarder")).toBeInTheDocument();
  });

  it("leaves the boarder mark off a day student", () => {
    render(
      <SickBay
        visits={[visit({ student: { ...visit().student, isBoarder: false } })]}
      />,
    );
    expect(screen.queryByText("Boarder")).toBeNull();
  });

  // A student removed from the school still has visits on record.
  it("draws a visit whose student is gone", () => {
    render(<SickBay visits={[visit({ student: null })]} />);
    expect(screen.getByText("A student")).toBeInTheDocument();
  });

  it("says so when no complaint was written down", () => {
    render(<SickBay visits={[visit({ complaint: null })]} />);
    expect(screen.getByText("No complaint recorded")).toBeInTheDocument();
  });

  it("leaves the temperature out when none was taken", () => {
    render(<SickBay visits={[visit({ temperature: null })]} />);
    expect(screen.queryByText(/°/)).toBeNull();
  });

  it("shows it is still checking rather than claiming the ward is empty", () => {
    render(<SickBay visits={undefined} isLoading />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByText("Every bed is free")).toBeNull();
  });

  it("points at the clinic where the work is done", () => {
    render(<SickBay visits={[]} />);
    expect(screen.getByRole("link", { name: /the clinic/i })).toHaveAttribute(
      "href",
      "/admin/health",
    );
  });
});
