import { beforeEach, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/student/homework",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { subject } from "@/test/fixtures";

import StudentHomeworkPage from "./page";

/**
 * What a student sees of their own homework.
 *
 * Four states, and each one has to be unmistakable: still to do, handed in,
 * marked, or past its date. A student who cannot tell "submitted" from "still
 * to do" hands the same work in twice or not at all.
 */

const teacher = { user: { firstName: "Aline", lastName: "Uwase" } };

/** One assignment. `submission` is singular here, one per student. */
function assignment(over: Record<string, unknown> = {}) {
  return {
    id: "hw-1",
    title: "Algebra sheet 3",
    description: "Questions 1 to 12",
    subject,
    teacher,
    dueDate: "2099-01-01T00:00:00.000Z",
    maxMarks: 20,
    submission: null,
    ...over,
  };
}

const todo = assignment();
const submitted = assignment({
  id: "hw-2",
  title: "Essay on Imigani",
  submission: { id: "sub-2", marks: null, isLate: false },
});
const late = assignment({
  id: "hw-3",
  title: "Science practical",
  submission: { id: "sub-3", marks: null, isLate: true },
});
const graded = assignment({
  id: "hw-4",
  title: "History timeline",
  submission: { id: "sub-4", marks: 17, isLate: false },
});
const overdue = assignment({
  id: "hw-5",
  title: "Kinyarwanda reading",
  dueDate: "2020-01-01T00:00:00.000Z",
});

const routes = {
  "/homework/student": [todo, submitted, late, graded, overdue],
  "/homework/submit": { id: "sub-9" },
};

const asStudent = {
  role: "STUDENT" as const,
  user: { id: "u-1", studentId: "student-1", classSectionId: "section-1" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(StudentHomeworkPage, asStudent);
  await waitFor(() => expect(screen.getByText(/Algebra sheet 3/)).toBeInTheDocument());
}

function cardFor(title: RegExp) {
  return screen.getByText(title).closest("div")!.parentElement!.parentElement!;
}

describe("the homework list", () => {
  it("lists every assignment", async () => {
    await mount();
    expect(screen.getByText(/Essay on Imigani/)).toBeInTheDocument();
    expect(screen.getByText(/History timeline/)).toBeInTheDocument();
  });

  it("names the subject and what to do", async () => {
    await mount();
    const card = cardFor(/Algebra sheet 3/);
    expect(card.textContent).toMatch(/Mathematics/);
    expect(card.textContent).toMatch(/Questions 1 to 12/);
  });

  // Who set it, so a student knows whom to ask.
  it("names the teacher who set it", async () => {
    await mount();
    expect(cardFor(/Algebra sheet 3/).textContent).toMatch(/Aline Uwase/);
  });

  it("shows the due date and what it is marked out of", async () => {
    await mount();
    const card = cardFor(/Algebra sheet 3/);
    expect(card.textContent).toMatch(/Due:/);
    expect(card.textContent).toMatch(/Max: 20/);
  });

  it("asks only for this student's own homework", async () => {
    await mount();
    const call = h.api.get.mock.calls.find(([url]: any[]) =>
      String(url).includes("/homework/student/"),
    );
    expect(call).toBeTruthy();
    expect(String(call![0])).toContain("student-1");
    expect((call![1] as any)?.params?.classSectionId).toBe("section-1");
  });

  it("says so when nothing has been set", async () => {
    serve(h.api, { ...routes, "/homework/student": [] });
    renderPage(StudentHomeworkPage, asStudent);
    await waitFor(() =>
      expect(screen.getByText(/no homework assigned/i)).toBeInTheDocument(),
    );
  });

  it("does not go blank when the list fails to load", async () => {
    serveFailure(h.api);
    renderPage(StudentHomeworkPage, asStudent);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("the state of each piece of work", () => {
  it("offers a Submit button on work still to do", async () => {
    await mount();
    const card = cardFor(/Algebra sheet 3/);
    expect(
      within(card)
        .getAllByRole("button")
        .find((b) => /submit/i.test(b.textContent ?? "")),
    ).toBeTruthy();
  });

  // Once handed in there is nothing more to do, so no button.
  it("says Submitted and offers no button once it is in", async () => {
    await mount();
    const card = cardFor(/Essay on Imigani/);
    expect(card.textContent).toMatch(/Submitted/);
    expect(
      within(card)
        .queryAllByRole("button")
        .find((b) => /submit/i.test(b.textContent ?? "")),
    ).toBeUndefined();
  });

  // Late work is marked down, so the student has to see that it was late.
  it("says when it was handed in late", async () => {
    await mount();
    expect(cardFor(/Science practical/).textContent).toMatch(/Late/);
  });

  it("does not call an on-time submission late", async () => {
    await mount();
    expect(cardFor(/Essay on Imigani/).textContent).not.toMatch(/Late/);
  });

  it("shows the mark once it has been graded", async () => {
    await mount();
    const card = cardFor(/History timeline/);
    expect(card.textContent).toMatch(/Graded/);
    expect(card.textContent).toMatch(/17\/20/);
  });

  // Past its date with nothing handed in is overdue, and there is no longer a
  // button, because submitting late is not something this page allows.
  it("marks work past its date as overdue", async () => {
    await mount();
    const card = cardFor(/Kinyarwanda reading/);
    expect(card.textContent).toMatch(/Overdue/);
    expect(
      within(card)
        .queryAllByRole("button")
        .find((b) => /submit/i.test(b.textContent ?? "")),
    ).toBeUndefined();
  });

  // A mark of zero is a real mark, not an ungraded submission.
  it("treats a mark of zero as graded", async () => {
    serve(h.api, {
      ...routes,
      "/homework/student": [
        assignment({ submission: { id: "sub-0", marks: 0, isLate: false } }),
      ],
    });
    renderPage(StudentHomeworkPage, asStudent);
    await waitFor(() => expect(screen.getByText(/Graded/)).toBeInTheDocument());
    expect(screen.getByText(/0\/20/)).toBeInTheDocument();
  });

  it("survives homework with no description or mark scheme", async () => {
    serve(h.api, {
      ...routes,
      "/homework/student": [assignment({ description: null, maxMarks: null })],
    });
    renderPage(StudentHomeworkPage, asStudent);
    await waitFor(() => expect(screen.getByText(/Algebra sheet 3/)).toBeInTheDocument());
  });
});

describe("handing work in", () => {
  it("submits that piece of work", async () => {
    await mount();
    const card = cardFor(/Algebra sheet 3/);
    const submit = within(card)
      .getAllByRole("button")
      .find((b) => /submit/i.test(b.textContent ?? ""))!;

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/homework/submit"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).homeworkId).toBe("hw-1");
    });
  });

  // The page stays put and says nothing was lost, so the student can try again.
  it("stays on the page when the submission is refused", async () => {
    await mount();
    const card = cardFor(/Algebra sheet 3/);
    const submit = within(card)
      .getAllByRole("button")
      .find((b) => /submit/i.test(b.textContent ?? ""))!;

    h.api.post.mockRejectedValue({ response: { status: 500 } });
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => expect(screen.getByText(/Algebra sheet 3/)).toBeInTheDocument());
  });
});
