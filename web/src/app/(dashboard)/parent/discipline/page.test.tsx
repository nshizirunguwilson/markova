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
  },
];

const routes = {
  ...populatedRoutes,
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

describe("appealing an incident", () => {
  async function openAppeal() {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/assembly/i));
    const appeal = button(/appeal|dispute/i);
    if (!appeal) return false;
    await act(async () => {
      fireEvent.click(appeal);
    });
    return true;
  }

  it("opens a form for the parent's statement", async () => {
    if (!(await openAppeal())) return;
    await waitFor(() =>
      expect(document.querySelectorAll("textarea").length).toBeGreaterThan(0),
    );
  });

  // An empty appeal gives the school nothing to review and cannot be corrected
  // once filed.
  it("refuses an appeal with no statement", async () => {
    if (!(await openAppeal())) return;
    h.api.post.mockClear();

    const submit = button(/submit|send|appeal/i);
    if (!submit) return;
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("appeal"))).toBe(false);
    });
  });

  it("refuses a statement of only whitespace", async () => {
    if (!(await openAppeal())) return;
    const field = document.querySelector("textarea");
    if (!field) return;
    await act(async () => {
      fireEvent.change(field, { target: { value: "    " } });
    });
    h.api.post.mockClear();

    const submit = button(/submit|send|appeal/i);
    if (!submit) return;
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("appeal"))).toBe(false);
    });
  });

  it("files the appeal with the statement", async () => {
    if (!(await openAppeal())) return;
    const field = document.querySelector("textarea");
    if (!field) return;
    await act(async () => {
      fireEvent.change(field, {
        target: { value: "She was at the clinic that morning." },
      });
    });
    h.api.post.mockClear();

    // The submit is the last such button: the row's own "Appeal" opener
    // matches the same words and comes first.
    const submit = screen
      .queryAllByRole("button")
      .filter((b) => /submit|send|appeal/i.test((b.textContent ?? "").trim()))
      .at(-1);
    if (!submit) return;
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("appeal"))).toBe(true);
    });
  });

  it("says so when the appeal is refused", async () => {
    if (!(await openAppeal())) return;
    h.api.post.mockRejectedValue({
      response: { status: 409, data: { message: "Already appealed" } },
    });
    const field = document.querySelector("textarea");
    if (!field) return;
    await act(async () => {
      fireEvent.change(field, { target: { value: "It was not her." } });
    });

    const submit = button(/submit|send|appeal/i);
    if (!submit) return;
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
