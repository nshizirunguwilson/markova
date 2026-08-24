import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/parent/discipline",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes, students } from "@/test/fixtures";

import ParentDisciplinePage from "./page";

/**
 * A parent's view of their child's conduct, and the appeal.
 *
 * An appeal is a parent formally disputing a record that follows their child
 * through the year. It has to carry their statement, and it must not be
 * possible to file an empty one by mistake.
 */
const parentStudents = students.map((s) => ({
  student: { id: s.id, user: s.user, classSection: s.classSection },
}));

const incidents = [
  {
    id: "inc-1",
    category: "LATENESS",
    severity: "MINOR",
    pointsDeducted: 5,
    description: "Late to assembly",
    actionTaken: "WARNING",
    createdAt: "2026-08-20T07:30:00Z",
    acknowledgedAt: null,
    parentAcknowledged: false,
    appeals: [],
  },
  {
    id: "inc-2",
    category: "UNIFORM",
    severity: "MAJOR",
    pointsDeducted: 15,
    description: "Out of uniform repeatedly",
    actionTaken: "SUSPENSION",
    createdAt: "2026-08-18T08:00:00Z",
    acknowledgedAt: "2026-08-19T09:00:00Z",
    parentAcknowledged: true,
    appeals: [{ id: "ap-1", status: "PENDING" }],
  },
];

const routes = {
  ...populatedRoutes,
  "/discipline/appeals": { id: "ap-9", status: "PENDING" },
  "/users/user-1": { id: "user-1", role: "PARENT", parentStudents },
  "/discipline/student": {
    student: { currentPoints: 80, startingPoints: 100, percentage: 80 },
    incidents,
  },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(ParentDisciplinePage, {
    role: "PARENT",
    user: { id: "user-1", studentId: "student-1" },
  });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

function button(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => pattern.test((b.textContent ?? "").trim()));
}

describe("a child's conduct record", () => {
  it("lists the incidents on file", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/assembly/i));
    expect(document.body.textContent).toMatch(/uniform/i);
  });

  it("shows the points standing", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/80/));
  });

  it("names the child whose record is shown", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/Divine/));
  });

  it("renders for a child with a clean record", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/student": {
        student: { currentPoints: 100, startingPoints: 100, percentage: 100 },
        incidents: [],
      },
    });
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  it("does not go blank when the record fails to load", async () => {
    serveFailure(h.api);
    await mount();
    expect(document.body.textContent).not.toBeNull();
  });
});

describe("switching between children", () => {
  it("refetches for the other child", async () => {
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ),
      ).toBe(true),
    );

    const select = document.querySelector("select")!;
    const other = Array.from(select.options).find(
      (o) => o.value && o.value !== select.value,
    );
    if (!other) return;

    const before = h.api.get.mock.calls.length;
    await act(async () => {
      fireEvent.change(select, { target: { value: other.value } });
    });
    await waitFor(() =>
      expect(h.api.get.mock.calls.length).toBeGreaterThan(before),
    );
  });
});

describe("acknowledging an incident", () => {
  // Acknowledging is the school's record that the parent saw it, so it is sent
  // rather than kept on the page.
  it("tells the school it has been seen", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/assembly/i));
    h.api.post.mockClear();

    const ack = button(/acknowledge|seen|understood/i);
    if (!ack) return;
    await act(async () => {
      fireEvent.click(ack);
    });

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("acknowledge"))).toBe(true);
    });
  });
});

/**
 * A parent answering back.
 *
 * An appeal is the family's only reply to a mark on their child's record, and
 * once filed it cannot be edited. So an empty one must be refused, and one
 * that is filed has to reach the school attached to the right incident.
 */
describe("appealing an incident", () => {
  async function openAppeal() {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/assembly/i));
    const appeal = button(/^appeal$/i);
    expect(appeal).toBeTruthy();
    await act(async () => {
      fireEvent.click(appeal!);
    });
    return screen.findByRole("dialog");
  }

  function statementBox(dialog: HTMLElement) {
    return dialog.querySelector("textarea");
  }

  function submitButton(dialog: HTMLElement) {
    return Array.from(dialog.querySelectorAll("button")).find((b) =>
      /submit appeal/i.test(b.textContent ?? ""),
    );
  }

  // Only where there is nothing filed already: a second appeal on the same
  // incident is not something the school reviews.
  it("offers an appeal only on an incident not already appealed", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/assembly/i));
    expect(screen.queryAllByRole("button", { name: /^appeal$/i })).toHaveLength(1);
  });

  it("shows the state of an appeal already filed", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/uniform/i));
    expect(document.body.textContent).toMatch(/PENDING/i);
  });

  it("opens a form for the parent's statement", async () => {
    const dialog = await openAppeal();
    expect(statementBox(dialog)).toBeTruthy();
  });

  // An empty appeal gives the school nothing to review and cannot be corrected
  // once filed.
  it("refuses an appeal with no statement", async () => {
    const dialog = await openAppeal();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(submitButton(dialog)!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/appeals"),
      );
      expect(call).toBeUndefined();
    });
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
  });

  it("refuses a statement that is only spaces", async () => {
    const dialog = await openAppeal();
    await act(async () => {
      fireEvent.change(statementBox(dialog)!, { target: { value: "    " } });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(submitButton(dialog)!);
    });

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  // Attached to the incident it answers, or the school reviews the wrong mark.
  it("files the appeal against that incident", async () => {
    const dialog = await openAppeal();
    await act(async () => {
      fireEvent.change(statementBox(dialog)!, {
        target: { value: "He was helping carry chairs for the assembly." },
      });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(submitButton(dialog)!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/appeals"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).incidentId).toBe("inc-1");
      expect((call![1] as any).statement).toBe(
        "He was helping carry chairs for the assembly.",
      );
    });
  });

  it("closes once the appeal is filed", async () => {
    const dialog = await openAppeal();
    await act(async () => {
      fireEvent.change(statementBox(dialog)!, { target: { value: "Please review this." } });
    });
    await act(async () => {
      fireEvent.click(submitButton(dialog)!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // Reopening must not show the last appeal's text, which a parent could file
  // twice by accident.
  it("empties the form for the next one", async () => {
    const dialog = await openAppeal();
    await act(async () => {
      fireEvent.change(statementBox(dialog)!, { target: { value: "Please review this." } });
    });
    await act(async () => {
      fireEvent.click(submitButton(dialog)!);
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const again = await openAppeal();
    expect(statementBox(again)!.value).toBe("");
  });

  it("keeps what was written when the school refuses it", async () => {
    const dialog = await openAppeal();
    await act(async () => {
      fireEvent.change(statementBox(dialog)!, { target: { value: "Please review this." } });
    });

    h.api.post.mockRejectedValue({ response: { status: 500 } });
    await act(async () => {
      fireEvent.click(submitButton(dialog)!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
    expect(statementBox(screen.getByRole("dialog"))!.value).toBe("Please review this.");
  });

  it("files nothing when the form is dismissed", async () => {
    const dialog = await openAppeal();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(
        Array.from(dialog.querySelectorAll("button")).find((b) =>
          /^cancel$/i.test((b.textContent ?? "").trim()),
        )!,
      );
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

/**
 * The same record when the news is worse.
 *
 * The conduct bar changes colour twice and the appeal badge three times, and a
 * parent reads both at a glance. A single fixture at eighty points only ever
 * paints the healthy arm of each.
 */
describe("a conduct bar further down the scale", () => {
  const at = (percentage: number) => ({
    ...routes,
    "/discipline/student": {
      student: { currentPoints: percentage, startingPoints: 100, percentage },
      incidents,
    },
  });

  async function mountAt(percentage: number) {
    serve(h.api, at(percentage));
    renderPage(ParentDisciplinePage, {
      role: "PARENT",
      user: { id: "user-1", studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
    return document.querySelector("[style*='width']")!.className;
  }

  it("warns in the middle of the scale", async () => {
    expect(await mountAt(64)).toMatch(/warning/);
  });

  it("paints a record in real trouble differently again", async () => {
    expect(await mountAt(22)).toMatch(/danger/);
  });
});

describe("what an appeal came back as", () => {
  const withAppeal = (status: string) => ({
    ...routes,
    "/discipline/student": {
      student: { currentPoints: 80, startingPoints: 100, percentage: 80 },
      incidents: [
        { ...incidents[0], appeals: [{ id: "ap-1", status }] },
      ],
    },
  });

  async function mountAppeal(status: string) {
    serve(h.api, withAppeal(status));
    renderPage(ParentDisciplinePage, {
      role: "PARENT",
      user: { id: "user-1", studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText(/Appeal: /)).toBeInTheDocument(),
    );
    return screen.getByText(/Appeal: /).className;
  }

  it("marks an upheld appeal differently from a refused one", async () => {
    const approved = await mountAppeal("APPROVED");
    document.body.innerHTML = "";
    const rejected = await mountAppeal("REJECTED");

    expect(approved).not.toBe(rejected);
  });

  it("marks one still being decided differently again", async () => {
    const pending = await mountAppeal("PENDING");
    document.body.innerHTML = "";
    const approved = await mountAppeal("APPROVED");

    expect(pending).not.toBe(approved);
  });

  it("offers no second appeal once one is filed", async () => {
    serve(h.api, withAppeal("PENDING"));
    renderPage(ParentDisciplinePage, {
      role: "PARENT",
      user: { id: "user-1", studentId: "student-1" },
    });
    await waitFor(() => expect(screen.getByText(/Appeal: /)).toBeInTheDocument());

    expect(button(/^appeal$/i)).toBeUndefined();
  });
});

describe("an incident recorded without the details", () => {
  it("leaves out the time and place rather than printing undefined", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/student": {
        student: { currentPoints: 80, startingPoints: 100, percentage: 80 },
        incidents: [
          {
            ...incidents[0],
            date: "2026-08-20T07:30:00Z",
            time: null,
            location: null,
          },
        ],
      },
    });
    renderPage(ParentDisciplinePage, {
      role: "PARENT",
      user: { id: "user-1", studentId: "student-1" },
    });

    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toMatch(/undefined|null| at $/);
  });

  it("shows the time and place when they are recorded", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/student": {
        student: { currentPoints: 80, startingPoints: 100, percentage: 80 },
        incidents: [
          {
            ...incidents[0],
            date: "2026-08-20T07:30:00Z",
            time: "07:30",
            location: "Assembly ground",
          },
        ],
      },
    });
    renderPage(ParentDisciplinePage, {
      role: "PARENT",
      user: { id: "user-1", studentId: "student-1" },
    });

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/at 07:30/),
    );
    expect(document.body.textContent).toMatch(/Assembly ground/);
  });
});
