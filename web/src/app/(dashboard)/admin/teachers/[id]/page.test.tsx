import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useParams: () => ({ id: "u-1" }),
  usePathname: () => "/admin/teachers/u-1",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import TeacherDetailPage, { currentLesson } from "./page";

/**
 * One teacher's own page.
 *
 * The staff list answers "who teaches what" and stops there. This answers the
 * questions a head teacher actually asks about a person: which classes are
 * theirs, which one are they class teacher of, where are they this period, and
 * what are their own details.
 */

const section = (id: string, level: string, name: string, students = 30) => ({
  id,
  name,
  classLevel: { name: level },
  trade: null,
  _count: { students },
});

const senior2B = section("sec-2b", "Senior 2", "B", 28);
const senior1A = section("sec-1a", "Senior 1", "A", 32);

const assignment = (id: string, subjectName: string, classSection: any) => ({
  id,
  subject: { id: `sub-${subjectName}`, name: subjectName, category: "Sciences" },
  classSection,
  academicYear: { id: "year-1", name: "2025-2026", isCurrent: true },
});

const period = (
  id: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  subjectName: string,
  classSection: any,
  room?: string,
) => ({
  id,
  dayOfWeek,
  startTime,
  endTime,
  room,
  subject: { name: subjectName },
  classSection,
});

const teacher = {
  id: "u-1",
  role: "TEACHER",
  firstName: "Aline",
  lastName: "Uwase",
  email: "aline.uwase@markova.edu",
  phone: "+250788000010",
  code: "TCH-2026-001",
  photoUrl: null,
  isActive: true,
  forcePasswordChange: false,
  lastLoginAt: "2026-08-25T07:00:00.000Z",
  createdAt: "2024-01-08T07:00:00.000Z",
  nationalId: "1198570123456012",
  nationality: "Rwandan",
  gender: "FEMALE",
  dateOfBirth: "1985-06-14T00:00:00.000Z",
  teacher: {
    id: "teacher-1",
    employmentStatus: "FULL_TIME",
    qualification: "A0",
    rssbNumber: "RSSB-99120",
    hireDate: "2024-01-08T00:00:00.000Z",
    roles: [
      { id: "r-1", role: "CLASS_TEACHER", department: null, classSection: senior2B },
      { id: "r-2", role: "HOD", department: "Sciences", classSection: null },
    ],
    teacherSubjectClasses: [
      assignment("a-1", "Mathematics", senior2B),
      assignment("a-2", "Physics", senior2B),
      assignment("a-3", "Mathematics", senior1A),
    ],
    timetables: [
      period("p-1", 3, "08:00", "09:00", "Mathematics", senior2B, "Lab 2"),
      period("p-2", 3, "10:00", "11:00", "Physics", senior2B),
      period("p-3", 5, "08:00", "09:00", "Mathematics", senior1A),
    ],
  },
};

const routes = { ...populatedRoutes, "/users/u-1": teacher };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  // Wednesday 08:30, which is inside the first period.
  vi.setSystemTime(new Date("2026-08-26T08:30:00"));
});

// The clock is mocked, so it has to be handed back or every later file in the
// same worker starts in August 2026.
afterEach(() => {
  vi.useRealTimers();
});

async function mount(user: unknown = teacher) {
  serve(h.api, { ...routes, "/users/u-1": user });
  renderPage(TeacherDetailPage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("who this teacher is", () => {
  it("names them and their staff number", async () => {
    await mount();
    expect(await screen.findByText(/Aline Uwase/)).toBeInTheDocument();
    expect(screen.getByText("TCH-2026-001")).toBeInTheDocument();
  });

  // A special role attached to a class has to name the class. It was stored
  // as a bare id, so it could only ever have been shown as a uuid.
  it("says which class they are class teacher of", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getAllByText(/Class Teacher — Senior 2 B/).length).toBeGreaterThan(0);
  });

  it("names a department role that belongs to no class", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/Head of Department — Sciences/)).toBeInTheDocument();
  });

  // Every one of these is optional on the record, and a half-filled staff
  // profile must not render "undefined" or a broken date.
  it("draws dashes rather than undefined for a sparse record", async () => {
    await mount({
      id: "u-1",
      role: "TEACHER",
      firstName: "Aline",
      lastName: "Uwase",
      isActive: false,
      createdAt: "2024-01-08T07:00:00.000Z",
      teacher: {
        id: "teacher-1",
        employmentStatus: "PART_TIME",
        roles: [],
        teacherSubjectClasses: [],
        timetables: [],
      },
    });
    await screen.findByText(/Aline Uwase/);
    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows where they live when the record says", async () => {
    await mount({
      ...teacher,
      province: "Kigali City",
      district: "Gasabo",
      sector: "Kacyiru",
    });
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/Kigali City · Gasabo · Kacyiru/)).toBeInTheDocument();
  });

  it("shows their own details, not just their teaching", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText("aline.uwase@markova.edu")).toBeInTheDocument();
    expect(screen.getByText("+250788000010")).toBeInTheDocument();
    expect(screen.getByText("Rwandan")).toBeInTheDocument();
    expect(screen.getByText("RSSB-99120")).toBeInTheDocument();
    // Spaced the way it is printed on the card.
    expect(screen.getByText(/1 1985 7 0123456 0 12/)).toBeInTheDocument();
  });
});

describe("what they teach", () => {
  /**
   * Assignments are stored per subject per class, so a flat list shows the
   * same class three times and never answers "which classes do they teach".
   */
  it("groups the subjects under each class rather than repeating it", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    const rows = screen.getAllByRole("row").filter((r) => /Senior 2 B/.test(r.textContent ?? ""));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/Mathematics/);
    expect(rows[0].textContent).toMatch(/Physics/);
  });

  it("counts the classes and the subjects", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    const classes = screen.getByText(/^Classes taught$/).closest("div")?.parentElement;
    expect(within(classes as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("carries the class size from the roll", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    const row = screen
      .getAllByRole("row")
      .find((r) => /Senior 1 A/.test(r.textContent ?? ""));
    expect(row?.textContent).toMatch(/32/);
  });

  it("marks the class they are class teacher of in the list too", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    const row = screen
      .getAllByRole("row")
      .find((r) => /Senior 2 B/.test(r.textContent ?? ""));
    expect(row?.textContent).toMatch(/Class teacher/);
  });

  // The API returns an assignment with its class attached; one without has
  // nothing to group by and nothing to name, so it is dropped rather than
  // drawn as a blank row.
  it("skips an assignment with no class on it", async () => {
    await mount({
      ...teacher,
      teacher: {
        ...teacher.teacher,
        teacherSubjectClasses: [
          assignment("a-1", "Mathematics", senior2B),
          { id: "a-9", subject: { name: "Physics" }, classSection: null },
        ],
      },
    });
    await screen.findByText(/Aline Uwase/);
    const rows = screen
      .getAllByRole("row")
      .filter((r) => /Mathematics|Physics/.test(r.textContent ?? ""));
    expect(rows).toHaveLength(1);
  });

  it("counts a class whose roll the API did not send as empty", async () => {
    await mount({
      ...teacher,
      teacher: {
        ...teacher.teacher,
        teacherSubjectClasses: [
          assignment("a-1", "Mathematics", {
            id: "sec-x",
            name: "C",
            classLevel: { name: "Senior 3" },
            trade: null,
          }),
        ],
      },
    });
    await screen.findByText(/Aline Uwase/);
    const row = screen
      .getAllByRole("row")
      .find((r) => /Senior 3 C/.test(r.textContent ?? ""));
    expect(row?.textContent).toMatch(/—/);
  });

  // The same subject taught to the same class twice — two assignments in two
  // academic years — is one badge, not two.
  it("does not repeat a subject within a class", async () => {
    await mount({
      ...teacher,
      teacher: {
        ...teacher.teacher,
        teacherSubjectClasses: [
          assignment("a-1", "Mathematics", senior2B),
          assignment("a-2", "Mathematics", senior2B),
        ],
      },
    });
    await screen.findByText(/Aline Uwase/);
    const row = screen
      .getAllByRole("row")
      .find((r) => /Senior 2 B/.test(r.textContent ?? ""))!;
    expect(within(row).getAllByText("Mathematics")).toHaveLength(1);
  });

  it("says so plainly when nobody has given them a class", async () => {
    await mount({
      ...teacher,
      teacher: { ...teacher.teacher, teacherSubjectClasses: [], timetables: [] },
    });
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/not assigned to any class/i)).toBeInTheDocument();
    expect(screen.getByText(/no periods on the timetable/i)).toBeInTheDocument();
  });
});

/**
 * Where the teacher is right now, which is the question the front office asks
 * when a parent turns up unannounced.
 */
describe("the class they are in", () => {
  it("names the lesson in progress", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    const now = screen.getByText(/^Right now$/).closest("div")?.parentElement;
    expect(now?.textContent).toMatch(/Teaching/);
    expect(now?.textContent).toMatch(/Lab 2/);
  });

  it("says what is next after it", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/Next: Physics/)).toBeInTheDocument();
  });

  it("says nothing is on when the day is over", async () => {
    vi.setSystemTime(new Date("2026-08-26T18:00:00"));
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/not scheduled to be teaching/i)).toBeInTheDocument();
  });

  // A period with no room booked reads as a lesson, not as "in undefined".
  it("leaves the room out when none is booked", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/Next: Physics/).textContent).not.toMatch(
      /undefined/,
    );
    expect(screen.getByText(/Next: Physics/).textContent).not.toMatch(/ in /);
  });

  // Between the last lesson of the day and the end of it, there is neither a
  // lesson in progress nor one coming.
  it("says the day is done rather than going silent", async () => {
    vi.setSystemTime(new Date("2026-08-26T12:00:00"));
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText(/nothing further on the timetable today/i))
      .toBeInTheDocument();
  });

  it("marks the period in progress in the week below", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  it("lays the week out day by day", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("Friday")).toBeInTheDocument();
  });
});

/**
 * The arithmetic on its own. The schema counts Monday as 1 through Sunday as
 * 7, and JavaScript counts Sunday as 0 — the classic off-by-one here sends
 * somebody to the wrong classroom.
 */
describe("working out which period it is", () => {
  const week = [
    period("p-1", 3, "08:00", "09:00", "Mathematics", senior2B),
    period("p-2", 3, "10:00", "11:00", "Physics", senior2B),
    period("p-4", 7, "09:00", "10:00", "Chemistry", senior1A),
  ];

  it("finds the lesson the clock is inside", () => {
    expect(currentLesson(week, new Date("2026-08-26T08:30:00")).now?.id).toBe("p-1");
  });

  it("counts the last minute of a period as over", () => {
    expect(currentLesson(week, new Date("2026-08-26T09:00:00")).now).toBeNull();
  });

  it("counts the first minute of a period as started", () => {
    expect(currentLesson(week, new Date("2026-08-26T08:00:00")).now?.id).toBe("p-1");
  });

  it("offers the next lesson during the break", () => {
    const at = currentLesson(week, new Date("2026-08-26T09:30:00"));
    expect(at.now).toBeNull();
    expect(at.next?.id).toBe("p-2");
  });

  // Sunday is 0 in JavaScript and 7 in the schema.
  it("reads Sunday as the schema's day 7", () => {
    expect(currentLesson(week, new Date("2026-08-30T09:30:00")).now?.id).toBe("p-4");
  });

  it("finds nothing on a day with no periods", () => {
    const at = currentLesson(week, new Date("2026-08-25T09:30:00"));
    expect(at.now).toBeNull();
    expect(at.next).toBeNull();
  });

  it("survives a timetable that is not there at all", () => {
    expect(currentLesson(undefined as never).now).toBeNull();
  });

  it("ignores a period whose times are nonsense rather than throwing", () => {
    const broken = [period("p-x", 3, "", "", "Mathematics", senior2B)];
    expect(currentLesson(broken, new Date("2026-08-26T08:30:00")).now).toBeNull();
  });
});

describe("getting somewhere else from here", () => {
  it("goes back to the staff list", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/go back/i));
    });
    expect(h.router.push).toHaveBeenCalledWith("/admin/teachers");
  });

  it("hands editing to the profile page rather than duplicating the form", async () => {
    await mount();
    await screen.findByText(/Aline Uwase/);
    const edit = screen
      .getAllByRole("button")
      .find((b) => /edit details/i.test(b.textContent ?? ""));
    await act(async () => {
      fireEvent.click(edit!);
    });
    expect(h.router.push).toHaveBeenCalledWith("/admin/users/u-1");
  });

  // The route takes a user id, and nothing stops somebody pasting a student's.
  it("says so when the id belongs to somebody who is not a teacher", async () => {
    await mount({ ...teacher, role: "STUDENT", teacher: null });
    expect(await screen.findByText(/is not a teacher/i)).toBeInTheDocument();
  });

  it("does not go blank for an id that matches nobody", async () => {
    h.api.get.mockRejectedValue({ response: { status: 404 } });
    renderPage(TeacherDetailPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/teacher not found/i)).toBeInTheDocument(),
    );
  });
});
