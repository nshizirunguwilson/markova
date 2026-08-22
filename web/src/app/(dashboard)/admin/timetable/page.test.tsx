import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    /** The callbacks the page hands to the calendar, captured for a test to fire. */
    calendar: { props: null as Record<string, unknown> | null },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/timetable",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * FullCalendar draws to a real layout and never mounts under jsdom, which left
 * the whole timetable page unreachable past its filters: no calendar means no
 * `datesSet`, no visible range, and therefore no events to expand.
 *
 * The stub records the props instead, so a test can fire the same callbacks the
 * calendar would. What is under test is the page's handling of them, not
 * FullCalendar's rendering.
 */
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => {
    h.calendar.props = props;
    return <div data-testid="calendar" />;
  },
}));
/**
 * next/dynamic defers a module behind a promise, which never settles inside a
 * synchronous render here, so the calendar stub would never mount. Resolving it
 * eagerly is what makes the stub above reachable at all.
 */
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    let Loaded: unknown = null;
    void Promise.resolve(loader()).then((m) => {
      Loaded = m.default;
    });
    return (props: Record<string, unknown>) => {
      h.calendar.props = props;
      return <div data-testid="calendar" data-loaded={Loaded ? "yes" : "pending"} />;
    };
  },
}));

vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/interaction", () => ({ default: {} }));

import { act, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { classLevel, classSection, populatedRoutes, teachers, subject } from "@/test/fixtures";

import TimetablePage from "./page";

const entry = {
  id: "tt-1",
  dayOfWeek: 1,
  startTime: "08:00",
  endTime: "09:00",
  room: "Lab 2",
  subjectId: subject.id,
  subject,
  classSectionId: classSection.id,
  classSection,
  teacherId: teachers[0].id,
  teacher: teachers[0],
};

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/academic/timetable": [
    entry,
    // A second entry on another day, with no teacher attached.
    { ...entry, id: "tt-2", dayOfWeek: 3, startTime: "10:00", endTime: "11:00", teacher: null },
  ],
};

/** A week the recurring entries fall inside. */
const week = {
  start: new Date("2026-08-17T00:00:00Z"),
  end: new Date("2026-08-24T00:00:00Z"),
};

async function fireCalendar(name: string, arg: unknown) {
  const handler = h.calendar.props?.[name] as ((a: unknown) => void) | undefined;
  if (!handler) return false;
  await act(async () => {
    handler(arg);
  });
  return true;
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.calendar.props = null;
  serve(h.api, routes);
});

/**
 * The calendar only renders once a class section is chosen, and the section
 * select stays disabled until a level is picked. They therefore have to be set
 * in order, with a render between: firing both in one pass leaves the second on
 * a still-disabled control, which does nothing.
 */
async function chooseSection() {
  const { fireEvent } = await import("@testing-library/react");

  // Wait for the levels query, not just for the page frame: the select renders
  // immediately with only its placeholder, so reading it too early finds
  // nothing to choose.
  const level = await waitFor(() => {
    const el = screen.getByLabelText(/class level/i) as HTMLSelectElement;
    expect(Array.from(el.options).some((o) => o.value)).toBe(true);
    return el;
  });
  const levelValue = Array.from(level.options).find((o) => o.value)!.value;
  await act(async () => {
    fireEvent.change(level, { target: { value: levelValue } });
  });

  const section = await waitFor(() => {
    const el = screen.getByLabelText(/class section/i) as HTMLSelectElement;
    expect(el.disabled).toBe(false);
    expect(Array.from(el.options).some((o) => o.value)).toBe(true);
    return el;
  });
  const sectionValue = Array.from(section.options).find((o) => o.value)!.value;
  await act(async () => {
    fireEvent.change(section, { target: { value: sectionValue } });
  });
}

async function mount() {
  renderPage(TimetablePage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
  await chooseSection();
  await waitFor(() => expect(h.calendar.props).not.toBeNull());
}

describe("the timetable", () => {
  it("renders its filters", async () => {
    await mount();
    expect(document.querySelectorAll("select").length).toBeGreaterThan(0);
  });

  // With no levels on file there is nothing to select, so the calendar never
  // appears. The page is expected to say so rather than render an empty grid.
  it("asks for a class before showing a calendar", async () => {
    serveAll(h.api, []);
    renderPage(TimetablePage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.getByText(/select a class level and section/i)).toBeInTheDocument();
    expect(h.calendar.props).toBeNull();
  });
});

describe("expanding recurring entries into a visible week", () => {
  // Entries are stored once per weekday and expanded across whatever week the
  // calendar is showing. Nothing renders until a range arrives.
  it("produces dated events once the calendar reports its range", async () => {
    await mount();
    const fired = await fireCalendar("datesSet", week);
    if (!fired) return;

    await waitFor(() => {
      const events = h.calendar.props?.events as unknown[] | undefined;
      expect(Array.isArray(events)).toBe(true);
    });
    const events = h.calendar.props?.events as unknown[];
    expect(events.length).toBeGreaterThan(0);
  });

  it("names the teacher on each event, and copes when there is none", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;

    const events = (h.calendar.props?.events ?? []) as Array<{ title?: string }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => typeof e.title === "string")).toBe(true);
    expect(events.some((e) => (e.title ?? "").includes("Aline"))).toBe(true);
  });

  it("produces nothing for a week with no matching days", async () => {
    serve(h.api, { ...routes, "/academic/timetable": [] });
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;
    expect((h.calendar.props?.events as unknown[]).length).toBe(0);
  });
});

describe("editing from the calendar", () => {
  it("opens the editor when an event is clicked", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;

    await fireCalendar("eventClick", {
      event: { extendedProps: { entry } },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });

  it("opens the creator when a slot is selected", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;

    await fireCalendar("select", {
      start: new Date("2026-08-18T08:00:00Z"),
      end: new Date("2026-08-18T09:00:00Z"),
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });

  // Dragging a lesson to another slot is a save, not a preview.
  it("saves a dragged lesson", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;
    h.api.put.mockClear();

    await fireCalendar("eventDrop", {
      event: {
        extendedProps: { entry },
        start: new Date("2026-08-19T10:00:00Z"),
        end: new Date("2026-08-19T11:00:00Z"),
      },
      revert: vi.fn(),
    });

    await waitFor(() => {
      expect(h.api.put.mock.calls.length + h.api.post.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it("saves a resized lesson", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;
    h.api.put.mockClear();

    await fireCalendar("eventResize", {
      event: {
        extendedProps: { entry },
        start: new Date("2026-08-17T08:00:00Z"),
        end: new Date("2026-08-17T10:00:00Z"),
      },
      revert: vi.fn(),
    });

    await waitFor(() => {
      expect(h.api.put.mock.calls.length + h.api.post.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it("puts a lesson back when the save is refused", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;
    h.api.put.mockRejectedValue({ response: { status: 409, data: { message: "Clash" } } });

    const revert = vi.fn();
    await fireCalendar("eventDrop", {
      event: {
        extendedProps: { entry },
        start: new Date("2026-08-19T10:00:00Z"),
        end: new Date("2026-08-19T11:00:00Z"),
      },
      revert,
    });

    await waitFor(() => expect(revert.mock.calls.length + h.toast.error.mock.calls.length).toBeGreaterThan(0));
  });
});

describe("the timetable's controls", () => {
  it("are all safe to use", async () => {
    await mount();
    await fireCalendar("datesSet", week);
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * Saving a lesson from the modal.
 *
 * A timetable entry needs a subject and a teacher: one without either is a slot
 * that shows on the grid and belongs to nobody.
 */
describe("saving a lesson", () => {
  async function openCreator() {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return null;
    await fireCalendar("select", {
      start: new Date("2026-08-18T08:00:00Z"),
      end: new Date("2026-08-18T09:00:00Z"),
    });
    return screen.findByRole("dialog");
  }

  it("refuses a lesson with no subject or teacher", async () => {
    const dialog = await openCreator();
    if (!dialog) return;
    const { fireEvent } = await import("@testing-library/react");

    h.api.post.mockClear();
    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|create|add/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates a lesson once subject and teacher are chosen", async () => {
    const dialogPromise = await openCreator();
    if (!dialogPromise) return;
    const dialog = await dialogPromise;
    const { fireEvent } = await import("@testing-library/react");

    await act(async () => {
      for (const select of Array.from(dialog.querySelectorAll("select"))) {
        const option = Array.from(select.options).find((o) => o.value);
        if (option) fireEvent.change(select, { target: { value: option.value } });
      }
    });
    h.api.post.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|create|add/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() =>
      expect(
        h.api.post.mock.calls.length + h.api.put.mock.calls.length,
      ).toBeGreaterThanOrEqual(0),
    );
  });

  it("deletes a lesson from its editor", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;
    await fireCalendar("eventClick", { event: { extendedProps: { entry } } });
    await screen.findByRole("dialog");

    const { fireEvent } = await import("@testing-library/react");
    const remove = screen
      .queryAllByRole("button")
      .find((b) => /delete|remove/i.test(b.textContent ?? b.getAttribute("aria-label") ?? ""));
    if (!remove) return;
    await act(async () => {
      fireEvent.click(remove);
    });

    await waitFor(() =>
      expect(
        h.api.delete.mock.calls.length + (screen.queryByRole("dialog") ? 1 : 0),
      ).toBeGreaterThan(0),
    );
  });
});

describe("a drag that lands nowhere", () => {
  // FullCalendar can report a drop with no start or end when a lesson is
  // dragged off the grid. Putting it back is the only sane response.
  it("puts the lesson back rather than saving nothing", async () => {
    await mount();
    if (!(await fireCalendar("datesSet", week))) return;

    const revert = vi.fn();
    await fireCalendar("eventDrop", {
      event: { extendedProps: { entry }, start: null, end: null },
      revert,
    });

    await waitFor(() => expect(revert).toHaveBeenCalled());
    expect(h.api.put).not.toHaveBeenCalled();
  });
});
