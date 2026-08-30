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
import {
  classLevel,
  classSection,
  populatedRoutes,
  term,
  termResult,
} from "@/test/fixtures";

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
  /* The classes this person may write on, already narrowed by the API: a
     class teacher leads one class, and a picker offering twenty-eight that
     then refuses twenty-seven teaches people the system is broken. */
  "/marks/report-cards/classes": [
    { ...classSection, classLevel, trade: null },
    { ...classSection, id: "section-2", name: "B", classLevel, trade: null },
  ],
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
 * Waiting for the option rather than the select: a select is painted before
 * its classes arrive, and a change fired into that window sets a value the
 * element has no option for, which it quietly keeps out.
 */
async function landOnAClass() {
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/^Class$/i) as HTMLSelectElement).options.length,
    ).toBeGreaterThan(1),
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
/**
 * The rows themselves, and what they say when the record is thin.
 */
describe("each child's row", () => {
  it("carries the figures a comment is written against", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/82\.4%/);
    expect(document.body.textContent).toMatch(/A · 3 of 2/);
  });

  /*
    A student with nothing worked out yet still gets a row: their comment is
    the one most likely to be missing, and a row that vanishes is a child
    nobody notices was left out.
  */
  it("shows a student whose figures are not worked out yet", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [
        {
          ...rows[1],
          average: null,
          letterGrade: null,
          rank: null,
          isPublished: false,
        },
      ],
    });
    await mount();
    expect(screen.getByText(/Jean Bosco Habimana/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/null|NaN/);
  });

  // A row with no name is a row nobody can act on, so it says so.
  it("names a student the API sent nothing for", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [{ ...rows[1], student: undefined }],
    });
    renderPage(ReportCardsPage, { role: "HEAD_TEACHER" });
    await landOnAClass();
    await waitFor(() =>
      expect(screen.getByText(/Unnamed student/)).toBeInTheDocument(),
    );
  });

  it("counts the marks still to be released", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [rows[0], { ...rows[1], isPublished: false }],
    });
    await mount();
    expect(document.body.textContent).toMatch(/1 of 2 released/);
  });

  it("counts the cards already issued", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [
        { ...rows[0], dosConfirmed: true },
        { ...rows[1], dosConfirmed: true, reportCardPublished: false },
      ],
    });
    await mount();
    expect(document.body.textContent).toMatch(/1 of 2 issued/);
  });

  it("says the cards have gone out when they all have", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": rows.map((r) => ({
        ...r,
        dosConfirmed: true,
        reportCardPublished: true,
      })),
    });
    await mount();
    expect(document.body.textContent).toMatch(/Issued to families/);
  });
});

/**
 * A head teacher is as often looking back at last term as at this one, so the
 * term the page opens on is a default rather than a fixture.
 */
/**
 * The card itself, without leaving the page.
 *
 * Somebody writing thirty comments is reading thirty sheets, and the sheet is
 * where the facts are: which subject fell away, whether the conduct mark
 * explains the average. Sending them to another screen and back for each one
 * is what makes a comment get written from the average alone.
 */
describe("reading the card while writing about it", () => {
  it("offers it on every row", async () => {
    await mount();
    expect(
      screen.getAllByLabelText(/report card$/i).length,
    ).toBe(rows.length);
  });

  it("asks for that child's sheet, for the term on screen", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/html": "<html><body>A card</body></html>",
    });
    await mount();
    await click(screen.getByLabelText(/View Jean Bosco Habimana's report card/i));
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/reports/term/student-2/html",
        expect.objectContaining({
          params: expect.objectContaining({ termId: expect.any(String) }),
        }),
      ),
    );
  });

  it("shows it in a box over the page rather than navigating away", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/html": "<html><body>A card</body></html>",
    });
    await mount();
    await click(screen.getByLabelText(/View Jean Bosco Habimana's report card/i));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Jean Bosco Habimana/);
    expect(h.router.push).not.toHaveBeenCalled();
  });

  /**
   * The sheet carries its own global styles - it sets `body` width, page
   * size and its own type scale - so it is handed to the preview component
   * to isolate rather than injected into this page. Injecting it directly is
   * the tempting simplification, and it would rewrite the dashboard's own
   * stylesheet the moment somebody opened a card.
   *
   * The frame itself is A4Preview's contract and is tested there; what this
   * page owes is not putting the markup into its own document.
   */
  it("never injects the sheet into the page around it", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/html":
        "<html><style>body{width:210mm}</style><body>A card</body></html>",
    });
    await mount();
    await click(screen.getByLabelText(/View Jean Bosco Habimana's report card/i));
    await screen.findByRole("dialog");
    expect(document.body.innerHTML).not.toContain("width:210mm");
    expect(document.body.textContent).not.toContain("A card");
  });

  it("says so when the card cannot be loaded", async () => {
    await mount();
    h.api.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });
    await click(screen.getByLabelText(/View Jean Bosco Habimana's report card/i));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/could not be loaded/i),
      ),
    );
  });

  it("closes without leaving the class", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-2/html": "<html><body>A card</body></html>",
    });
    await mount();
    await click(screen.getByLabelText(/View Jean Bosco Habimana's report card/i));
    await screen.findByRole("dialog");
    await click(screen.getByLabelText(/Close dialog/i));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Jean Bosco Habimana/)).toBeInTheDocument();
  });
});

/**
 * Which classes a person is offered.
 *
 * Asked for rather than filtered here, so the picker never offers a class
 * whose save would be refused.
 */
describe("the classes on offer", () => {
  it("lists only what the API says this person may write on", async () => {
    await mount();
    const picker = screen.getByLabelText(/^Class$/i) as HTMLSelectElement;
    expect(picker.options.length).toBe(3);
  });

  /* A choice of one is not a choice, and a page that opens on a dropdown
     rather than on the work has wasted a click on everybody who has one
     class. */
  it("picks the only class for a teacher who leads one", async () => {
    serve(h.api, {
      ...routes,
      "/marks/report-cards/classes": [
        { ...classSection, classLevel, trade: null },
      ],
    });
    renderPage(ReportCardsPage, { role: "TEACHER" });
    await waitFor(() =>
      expect(screen.getByText(/Jean Bosco Habimana/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("option", { name: /Select class/i }),
    ).not.toBeInTheDocument();
  });

  it("asks for a class where there are several to choose from", async () => {
    renderPage(ReportCardsPage, { role: "HEAD_TEACHER" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Pick a class/i),
    );
  });
});

describe("narrowing to a term", () => {
  it("asks for the term that was chosen", async () => {
    serve(h.api, {
      ...routes,
      "/academic/terms": [
        { ...term, id: "term-1", name: "Term 1", isCurrent: true },
        { ...term, id: "term-2", name: "Term 2", isCurrent: false },
      ],
    });
    await mount();
    h.api.get.mockClear();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Term$/i), {
        target: { value: "term-2" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/marks/term-results/class",
        expect.objectContaining({
          params: expect.objectContaining({ termId: "term-2" }),
        }),
      ),
    );
  });

  it("opens on the term the school is in", async () => {
    await mount();
    expect(screen.getByLabelText(/^Term$/i)).toHaveValue("term-1");
  });
});

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

  it("saves the head teacher's comment in their own box", async () => {
    serve(h.api, {
      ...routes,
      "/marks/term-results/class": [rows[1]],
      "/marks/term-results/tr-2/comment": {},
    });
    await mount("HEAD_TEACHER");
    await click(button(/^Write$/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Head teacher's comment/i), {
        target: { value: "A sound term. Promoted." },
      });
    });
    await click(button(/^Save$/));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/marks/term-results/tr-2/comment",
        { headmasterComment: "A sound term. Promoted." },
      ),
    );
  });

  it("closes the head teacher's box without saving when cancelled", async () => {
    serve(h.api, { ...routes, "/marks/term-results/class": [rows[1]] });
    await mount("HEAD_TEACHER");
    await click(button(/^Write$/));
    await click(button(/^Cancel$/));
    await waitFor(() => expect(button(/^Save$/)).toBeFalsy());
    expect(h.api.put).not.toHaveBeenCalled();
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

/**
 * Whose move it is, on the banner above the list.
 *
 * It said "waiting on your check" whatever the state, so a class with ten
 * comments still to write told the DOS it was waiting on them. They are the
 * one person who cannot write those comments: the API refuses a class
 * teacher's comment from anybody whose role is not TEACHER.
 */
describe("who the class is waiting on", () => {
  const written = rows.map((r) => ({ ...r, teacherComment: "Good term." }));

  it("names the class teacher while any comment is missing", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/waiting on the class teacher/i);
    expect(document.body.textContent).toMatch(/Only they can write it/i);
  });

  it("counts how many are still to be written", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/1 of 2 cards still need/i);
  });

  it("names the reader's own check once every comment is written", async () => {
    serve(h.api, { ...routes, "/marks/term-results/class": written });
    await mount();
    expect(document.body.textContent).toMatch(/waiting on your check/i);
    expect(document.body.textContent).not.toMatch(/waiting on the class teacher/i);
  });
});
