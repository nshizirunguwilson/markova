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
  usePathname: () => "/admin/report-cards",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes, termResult } from "@/test/fixtures";

import ReportCardsPage from "./page";

/**
 * The report cards for one class.
 *
 * A card passes through four hands, and this is the one screen all of them
 * work on. What these tests hold is the division of labour that makes the
 * countersignature mean anything:
 *
 *   The class teacher writes about the work and only about the work.
 *   The head teacher writes their own comment and confirms the class.
 *   Neither writes in the other's box, because two people saying the same
 *   thing in two hands is one opinion rather than a check.
 *
 * And the suggestion is a suggestion: it fills a field, and the person whose
 * name goes under it decides what is saved.
 */

const rows = [
  { ...termResult, id: "tr-1", student: { ...termResult.student, id: "student-1" } },
  {
    ...termResult,
    id: "tr-2",
    rank: 4,
    teacherComment: null,
    headmasterComment: null,
    student: {
      ...termResult.student,
      id: "student-2",
      user: { firstName: "Jean Bosco", lastName: "Habimana" },
    },
  },
];

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/marks/term-results/class": rows,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
};

const button = (name: RegExp) =>
  screen.queryAllByRole("button").find((b) => name.test(b.textContent ?? ""));

const pick = async (label: RegExp, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

/**
 * Land on a class, which is what every question here is asked about.
 *
 * The two picks cannot run back to back: choosing a level fetches that
 * level's classes, and a select given a value it has no option for keeps the
 * one it had. So the class list is waited for in between.
 */
async function landOnAClass() {
  /* Waiting for the option, not the select: a select is painted before its
     levels arrive, and a change fired into that window is a change to a value
     the element has no option for, which it quietly keeps out. */
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/Class level/i) as HTMLSelectElement).textContent,
    ).toMatch(new RegExp(classLevel.name)),
  );
  await pick(/Class level/i, classLevel.id);
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/^Class$/i) as HTMLSelectElement).textContent,
    ).toMatch(new RegExp(classSection.name)),
  );
  await pick(/^Class$/i, classSection.id);
}

async function mount(
  role: "ADMIN" | "HEAD_TEACHER" | "TEACHER" = "HEAD_TEACHER",
) {
  renderPage(ReportCardsPage, { role });
  await landOnAClass();
  await waitFor(() =>
    expect(screen.getByText(/Jean Bosco Habimana/)).toBeInTheDocument(),
  );
}

describe("before a class is chosen", () => {
  it("asks for one rather than showing somebody else's roll", async () => {
    renderPage(ReportCardsPage, { role: "HEAD_TEACHER" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Pick a class/i),
    );
    expect(h.api.get).not.toHaveBeenCalledWith(
      "/marks/term-results/class",
      expect.anything(),
    );
  });

  it("says so when a class has no results worked out yet", async () => {
    serve(h.api, { ...routes, "/marks/term-results/class": [] });
    renderPage(ReportCardsPage, { role: "HEAD_TEACHER" });
    await landOnAClass();
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/No results have been worked out/i),
    );
  });

  it("does not go blank when the class fails to load", async () => {
    serveFailure(h.api);
    renderPage(ReportCardsPage, { role: "HEAD_TEACHER" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

/**
 * The pipeline, in the order it happens.
 *
 * "Ready" is a fact about four steps at once, and until they were on one
 * screen nobody could see it: marks lived on one page, comments nowhere, and
 * issuing on a third.
 */
describe("what the class is waiting on", () => {
  it("shows all four steps in the order they happen", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    for (const step of ["Marks", "Class teacher", "Head teacher", "Issued"]) {
      expect(text).toContain(step);
    }
  });

  it("counts the comments still to be written", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/1 of 2 written/);
  });

  it("says the marks are out when they are", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Released/);
  });
});

/**
 * Confirming is the head teacher's own act, and it is applied to a class
 * rather than to a card: what is being certified is that the set is
 * consistent, and half a confirmed class certifies nothing.
 */
describe("the head teacher's check", () => {
  it("is offered to the head teacher", async () => {
    await mount("HEAD_TEACHER");
    expect(button(/Confirm the class/)).toBeTruthy();
  });

  // The class teacher writes; they do not certify their own work.
  it("is not offered to the class teacher", async () => {
    await mount("TEACHER");
    expect(button(/Confirm the class/)).toBeFalsy();
    expect(button(/Hand back/)).toBeFalsy();
  });

  /**
   * A card with no comment on it is a card the class teacher has not
   * finished, and confirming it would put the head teacher's name to an
   * empty box. The API refuses it, so the button says so rather than
   * inviting the click and throwing.
   */
  it("waits until every card has been written on", async () => {
    await mount();
    const confirm = button(/Confirm the class/);
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute(
      "title",
      expect.stringMatching(/class teacher's comment first/i),
    );
  });

  it("confirms the whole class in one act", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": rows.map((r) => ({
        ...r,
        teacherComment: "Written.",
      })),
      "/marks/report-cards/confirm": {},
    });
    await mount();
    await click(button(/Confirm the class/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/marks/report-cards/confirm",
        expect.objectContaining({
          classSectionId: classSection.id,
          isConfirmed: true,
        }),
      ),
    );
  });

  /**
   * Handing a class back withdraws any card already issued from it, and
   * somebody about to do that is owed the sentence saying so.
   */
  it("says what handing a class back costs, before it happens", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": rows.map((r) => ({
        ...r,
        dosConfirmed: true,
      })),
    });
    await mount();
    await click(button(/Hand back/));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/already issued for this class is withdrawn/i);
  });

  it("hands it back when that is confirmed", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": rows.map((r) => ({
        ...r,
        dosConfirmed: true,
      })),
      "/marks/report-cards/confirm": {},
    });
    await mount();
    await click(button(/Hand back/));
    const dialog = await screen.findByRole("dialog");
    await click(
      [...dialog.querySelectorAll("button")].find((b) =>
        /Hand back/.test(b.textContent ?? ""),
      ),
    );
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/marks/report-cards/confirm",
        expect.objectContaining({ isConfirmed: false }),
      ),
    );
  });

  it("closes without handing anything back when cancelled", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": rows.map((r) => ({
        ...r,
        dosConfirmed: true,
      })),
    });
    await mount();
    await click(button(/Hand back/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

/**
 * The division of labour that makes the countersignature mean something.
 */
describe("who writes in which box", () => {
  it("lets the class teacher write about the work", async () => {
    await mount("TEACHER");
    const boxes = screen.getAllByText(/Class teacher's comment/);
    expect(boxes.length).toBe(2);
    expect(button(/^Write$/)).toBeTruthy();
  });

  it("keeps the class teacher out of the head teacher's box", async () => {
    await mount("TEACHER");
    expect(document.body.textContent).toMatch(
      /Only the head teacher writes here/,
    );
  });

  it("keeps the head teacher out of the class teacher's box", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [{ ...rows[1] }],
    });
    await mount("HEAD_TEACHER");
    expect(document.body.textContent).toMatch(
      /Only the class teacher writes here/,
    );
  });

  /**
   * A confirmed card is one the head teacher has put their name to. Changing
   * the comment under it afterwards would change what they signed.
   */
  it("locks the comment once the class has been confirmed", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [{ ...rows[1], dosConfirmed: true }],
    });
    await mount("TEACHER");
    expect(document.body.textContent).toMatch(/Ask for it to be handed back/i);
  });

  it("saves what was written against that student's result", async () => {
    serve(h.api, { ...routes, "/marks/term-results/tr-2/comment": {} });
    await mount("TEACHER");
    await click(button(/^Write$/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Class teacher's comment/i), {
        target: { value: "A patient term of steady work." },
      });
    });
    await click(button(/^Save$/));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/marks/term-results/tr-2/comment",
        { teacherComment: "A patient term of steady work." },
      ),
    );
  });

  it("closes without saving when cancelled", async () => {
    await mount("TEACHER");
    await click(button(/^Write$/));
    await click(button(/^Cancel$/));
    await waitFor(() => expect(button(/^Save$/)).toBeFalsy());
    expect(h.api.put).not.toHaveBeenCalled();
  });
});

/**
 * The draft.
 *
 * It fills a field and does nothing else, which is the whole promise: a
 * comment saved without being read is exactly the failure the draft exists to
 * fix rather than to automate.
 */
describe("drafting a comment", () => {
  const suggestion = {
    classTeacher: "Mathematics is Jean Bosco's strongest work this term.",
    headTeacher: "A sound term overall. Jean Bosco is placed 4 of 2.",
  };

  it("is offered only inside the editor", async () => {
    await mount("TEACHER");
    expect(button(/Suggest/)).toBeFalsy();
    await click(button(/^Write$/));
    expect(button(/Suggest/)).toBeTruthy();
  });

  it("asks for a draft for that child and that term", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/comment-suggestions": suggestion,
    });
    await mount("TEACHER");
    await click(button(/^Write$/));
    await click(button(/Suggest/));
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/reports/term/student-2/comment-suggestions",
        expect.objectContaining({ params: expect.objectContaining({ termId: expect.any(String) }) }),
      ),
    );
  });

  it("puts the class teacher's draft in the class teacher's box", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/comment-suggestions": suggestion,
    });
    await mount("TEACHER");
    await click(button(/^Write$/));
    await click(button(/Suggest/));
    await waitFor(() =>
      expect(screen.getByLabelText(/Class teacher's comment/i)).toHaveValue(
        suggestion.classTeacher,
      ),
    );
  });

  it("puts the head teacher's draft in the head teacher's box", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [rows[1]],
      "/reports/term/student-2/comment-suggestions": suggestion,
    });
    await mount("HEAD_TEACHER");
    await click(button(/^Write$/));
    await click(button(/Suggest/));
    await waitFor(() =>
      expect(screen.getByLabelText(/Head teacher's comment/i)).toHaveValue(
        suggestion.headTeacher,
      ),
    );
  });

  /**
   * Nothing is written to the record by asking for a draft. A suggestion
   * that saved itself would be a comment nobody read, under a name somebody
   * has to stand behind.
   */
  it("saves nothing by itself", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/comment-suggestions": suggestion,
    });
    await mount("TEACHER");
    await click(button(/^Write$/));
    await click(button(/Suggest/));
    await waitFor(() => expect(h.api.get).toHaveBeenCalled());
    expect(h.api.put).not.toHaveBeenCalled();
  });

  it("says on the page that a suggestion is only a draft", async () => {
    await mount("TEACHER");
    await click(button(/^Write$/));
    expect(document.body.textContent).toMatch(
      /Nothing is saved until you save it/i,
    );
  });

  it("leaves the box usable when a draft cannot be written", async () => {
    await mount("TEACHER");
    await click(button(/^Write$/));
    h.api.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });
    await click(button(/Suggest/));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(button(/^Save$/)).toBeTruthy();
  });
});
