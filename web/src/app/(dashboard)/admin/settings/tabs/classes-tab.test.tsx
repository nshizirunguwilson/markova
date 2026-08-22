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
  usePathname: () => "/admin/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";

import { ClassesTab } from "./classes-tab";

/**
 * The class structure tab in settings.
 *
 * This is where a school's levels and classes are created and deleted, and a
 * deletion here reaches students, marks and timetables. Everything destructive
 * on it goes through one confirm dialog, so what that dialog does is the part
 * worth pinning down.
 */

const oLevel = {
  id: "level-1",
  name: "Senior 1",
  stage: "O_LEVEL",
  order: 1,
  sections: [
    { id: "section-1", name: "A", _count: { students: 42 } },
    { id: "section-2", name: "B", _count: { students: 38 } },
  ],
};

const aLevel = {
  id: "level-2",
  name: "Level 4",
  stage: "A_LEVEL",
  order: 4,
  sections: [
    { id: "section-3", name: "A", trade: { code: "SOD" }, _count: { students: 30 } },
  ],
};

const trades = [
  { id: "trade-1", code: "SOD", name: "Software Development" },
  { id: "trade-2", code: "NIT", name: "Networking" },
];

const routes = {
  "/academic/class-levels": [oLevel, aLevel],
  "/academic/trades": trades,
  "/academic/sections": [],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  signIn("ADMIN");
  renderWithProviders(<ClassesTab />);
  // Not by level name: the card at the bottom carries the hint "O-Level holds
  // Senior 1-3", which is on screen before any level has loaded and would let
  // every test here run against an empty list.
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: /^delete$/i }).length).toBeGreaterThan(0),
  );
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

/** The card for one level, so a control is found on the right row. */
function levelCard(name: string) {
  const heading = screen.getByText(name);
  return heading.closest("div[class*='rounded']")?.parentElement ?? heading.parentElement!;
}

describe("what the tab shows", () => {
  it("lists every level the school runs", async () => {
    await mount();
    expect(screen.getByText(/Level 4/)).toBeInTheDocument();
  });

  // The head count is how an admin sees which class is overfull before adding
  // another one beside it.
  it("shows each class with how many students are in it", async () => {
    await mount();
    expect(screen.getByText(/A \(42\)/)).toBeInTheDocument();
    expect(screen.getByText(/B \(38\)/)).toBeInTheDocument();
  });

  // An A-Level class is identified by its trade, not just its letter.
  it("names the trade on an A-Level class", async () => {
    await mount();
    expect(screen.getByText(/SOD A \(30\)/)).toBeInTheDocument();
  });

  it("offers a trade picker only where a trade applies", async () => {
    await mount();
    const selects = Array.from(document.querySelectorAll("select"));
    const tradePickers = selects.filter((s) =>
      Array.from(s.options).some((o) => o.textContent?.includes("SOD")),
    );
    expect(tradePickers).toHaveLength(1);
  });
});

describe("adding a class to a level", () => {
  function sectionBoxes() {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>('input[placeholder*="New section"]'),
    );
  }

  it("creates it with the name that was typed", async () => {
    await mount();
    const [box] = sectionBoxes();
    await act(async () => {
      fireEvent.change(box, { target: { value: "C" } });
    });

    h.api.post.mockClear();
    const add = screen.getAllByRole("button", { name: /^add$/i })[0];
    await click(add);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/sections"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("C");
      expect((call![1] as any).classLevelId).toBe("level-1");
    });
  });

  // A class called "" would show as a blank badge nobody could pick.
  it("refuses an empty name", async () => {
    await mount();
    h.api.post.mockClear();
    const add = screen.getAllByRole("button", { name: /^add$/i })[0];
    await click(add);

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("ignores a name that is only spaces", async () => {
    await mount();
    const [box] = sectionBoxes();
    await act(async () => {
      fireEvent.change(box, { target: { value: "   " } });
    });

    h.api.post.mockClear();
    await click(screen.getAllByRole("button", { name: /^add$/i })[0]);
    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  // Typing a letter and pressing Enter is how this gets used, so it has to work
  // without reaching for the button.
  it("creates it on Enter", async () => {
    await mount();
    const [box] = sectionBoxes();
    await act(async () => {
      fireEvent.change(box, { target: { value: "D" } });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/sections"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("D");
    });
  });

  // An A-Level class with no trade is a class no timetable can place.
  it("refuses an A-Level class with no trade chosen", async () => {
    await mount();
    const box = sectionBoxes()[1];
    await act(async () => {
      fireEvent.change(box, { target: { value: "B" } });
    });

    h.api.post.mockClear();
    h.toast.error.mockClear();
    await click(screen.getAllByRole("button", { name: /^add$/i })[1]);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/trade/i)),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates an A-Level class once a trade is chosen", async () => {
    await mount();
    const tradePicker = Array.from(document.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent?.includes("SOD")),
    )!;
    await act(async () => {
      fireEvent.change(tradePicker, { target: { value: "trade-1" } });
    });

    const box = sectionBoxes()[1];
    await act(async () => {
      fireEvent.change(box, { target: { value: "B" } });
    });

    h.api.post.mockClear();
    await click(screen.getAllByRole("button", { name: /^add$/i })[1]);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/sections"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).tradeId).toBe("trade-1");
    });
  });

  // Each level's box is its own. Typing in one must not fill the others.
  it("keeps each level's box separate", async () => {
    await mount();
    const boxes = sectionBoxes();
    await act(async () => {
      fireEvent.change(boxes[0], { target: { value: "C" } });
    });
    expect(boxes[1].value).toBe("");
  });
});

describe("deleting", () => {
  function deleteButtons() {
    return screen.getAllByRole("button", { name: /^delete$/i });
  }

  // Nothing is deleted from the list itself. A misplaced tap on a phone would
  // otherwise remove a class of forty students.
  it("asks before deleting a level", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(deleteButtons()[0]);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("names what is about to be deleted", async () => {
    await mount();
    await click(deleteButtons()[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Senior 1/);
    expect(dialog.textContent).toMatch(/cannot be undone/i);
  });

  it("deletes nothing when the confirm is dismissed", async () => {
    await mount();
    await click(deleteButtons()[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    const cancel = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /^cancel$/i.test((b.textContent ?? "").trim()),
    );
    await click(cancel);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes the level once confirmed", async () => {
    await mount();
    await click(deleteButtons()[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /^confirm$/i.test((b.textContent ?? "").trim()),
    );
    await click(confirm);

    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/academic/class-levels/level-1"),
    );
  });

  // A level with students behind it cannot be removed, and the reason has to
  // reach the admin rather than a silent no-op.
  it("says why a level could not be deleted", async () => {
    await mount();
    // errorMessage only trusts a real axios error, so the flag has to be here
    // or the API's own reason is thrown away for the generic fallback.
    h.api.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Senior 1 still has students" } },
    });

    await click(deleteButtons()[0]);
    const dialog = await screen.findByRole("dialog");
    h.toast.error.mockClear();
    await click(
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        /^confirm$/i.test((b.textContent ?? "").trim()),
      ),
    );

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Senior 1 still has students"),
    );
  });

  it("says so when a level was deleted", async () => {
    await mount();
    h.api.delete.mockResolvedValue({ data: {} });
    await click(deleteButtons()[0]);
    const dialog = await screen.findByRole("dialog");
    await click(
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        /^confirm$/i.test((b.textContent ?? "").trim()),
      ),
    );

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
  });

  it("asks before deleting one class within a level", async () => {
    await mount();
    const sectionDelete = screen
      .getAllByRole("button", { name: /^delete$/i })
      .find((b) => b.querySelector("svg")?.classList.contains("h-3"));
    expect(sectionDelete).toBeTruthy();
    await click(sectionDelete);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/section/i);
  });

  it("deletes the class once confirmed", async () => {
    await mount();
    const sectionDelete = screen
      .getAllByRole("button", { name: /^delete$/i })
      .find((b) => b.querySelector("svg")?.classList.contains("h-3"))!;
    await click(sectionDelete);

    const dialog = await screen.findByRole("dialog");
    h.api.delete.mockClear();
    await click(
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        /^confirm$/i.test((b.textContent ?? "").trim()),
      ),
    );

    await waitFor(() => {
      const call = h.api.delete.mock.calls.find(([url]: any[]) =>
        String(url).includes("/sections/"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("says why a class could not be deleted", async () => {
    await mount();
    h.api.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: {} },
    });
    const sectionDelete = screen
      .getAllByRole("button", { name: /^delete$/i })
      .find((b) => b.querySelector("svg")?.classList.contains("h-3"))!;
    await click(sectionDelete);

    const dialog = await screen.findByRole("dialog");
    h.toast.error.mockClear();
    await click(
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        /^confirm$/i.test((b.textContent ?? "").trim()),
      ),
    );

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/students/i)),
    );
  });
});

describe("adding a class level", () => {
  function levelForm() {
    return screen.getByLabelText(/^name$/i).closest("form")!;
  }

  it("creates it with what was filled in", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Senior 4" } });
      fireEvent.change(screen.getByLabelText(/^order$/i), { target: { value: "4" } });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.submit(levelForm());
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/class-levels"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("Senior 4");
      expect((call![1] as any).order).toBe(4);
    });
  });

  // A level called "" would sit in every class picker in the school as a blank.
  it("refuses a level with no name", async () => {
    await mount();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.submit(levelForm());
    });

    await waitFor(() => expect(screen.getByText(/needs a name/i)).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a name that is only spaces", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "    " } });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.submit(levelForm());
    });

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  // The placeholder is the only hint that trade levels are numbered
  // differently from senior years.
  it("changes its example when the stage changes", async () => {
    await mount();
    const name = screen.getByLabelText(/^name$/i);
    expect(name.getAttribute("placeholder")).toMatch(/senior/i);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/stage/i), { target: { value: "A_LEVEL" } });
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/^name$/i).getAttribute("placeholder")).toMatch(/level/i),
    );
  });

  it("sends the stage that was chosen", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/stage/i), { target: { value: "A_LEVEL" } });
      fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Level 6" } });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.submit(levelForm());
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/class-levels"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).stage).toBe("A_LEVEL");
    });
  });
});

describe("a school with nothing set up yet", () => {
  it("still offers the form to start with", async () => {
    serve(h.api, { ...routes, "/academic/class-levels": [] });
    signIn("ADMIN");
    renderWithProviders(<ClassesTab />);

    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument());
    // No level cards, so nothing to delete.
    expect(screen.queryAllByRole("button", { name: /^delete$/i })).toHaveLength(0);
  });
});
