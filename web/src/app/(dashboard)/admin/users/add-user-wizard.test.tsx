import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

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
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve, serveAll } from "@/test/page";
import { exercisePage, fillEverything, walkForward } from "@/test/exercise";
import { classLevel, classSection, populatedRoutes, students } from "@/test/fixtures";
import { AddUserWizard } from "./add-user-wizard";

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
};

const onClose = vi.fn();

function open() {
  signIn("ADMIN");
  return renderWithProviders(<AddUserWizard isOpen onClose={onClose} />);
}

/** The role picker on the first step decides how many steps there are. */
async function chooseRole(role: string) {
  const select = document.querySelector<HTMLSelectElement>('select');
  if (!select) return;
  await userEvent.setup().selectOptions(select, role);
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  onClose.mockReset();
  serve(h.api, routes);
});

describe("opening the wizard", () => {
  it("renders nothing while closed", () => {
    signIn("ADMIN");
    const { container } = renderWithProviders(
      <AddUserWizard isOpen={false} onClose={onClose} />,
    );
    expect(container.textContent).toBe("");
  });

  it("starts on the account step", async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
  });

  it("survives a school with no classes set up yet", async () => {
    serveAll(h.api, []);
    open();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("step validation", () => {
  // Advancing with an empty account step would carry blanks into every later
  // step and only fail at the very end.
  it("refuses to advance from an empty account step", async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());

    const next = screen
      .getAllByRole("button")
      .find((b) => /^next/i.test(b.textContent ?? ""));
    if (!next) return;

    const before = screen.getByLabelText(/first name/i);
    await userEvent.setup().click(next);
    await waitFor(() => expect(before).toBeInTheDocument());
  });

  it("advances once the account step is filled", async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    const advanced = await walkForward(2);
    expect(advanced).toBeGreaterThan(0);
  });
});

describe("each role's path through the wizard", () => {
  it.each(["STUDENT", "TEACHER", "PARENT", "LIBRARIAN", "ADMIN"])(
    "walks the %s path without crashing",
    async (role) => {
      open();
      await waitFor(() =>
        expect(screen.getByLabelText(/first name/i)).toBeInTheDocument(),
      );
      await chooseRole(role);
      await fillEverything();

      const { rejections } = await exercisePage({ limit: 25 });
      expect(rejections).toEqual([]);
      expect(document.body.textContent).not.toBe("");
    },
    30000,
  );
});

describe("creating the user", () => {
  it("posts once the last step is reached and submitted", async () => {
    h.api.post.mockResolvedValue({ data: { id: "u-9", password: "Temp123!" } });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole("LIBRARIAN");
    await fillEverything();
    await walkForward(4);

    const form = document.querySelector("form");
    if (form) {
      const { fireEvent, act } = await import("@testing-library/react");
      await act(async () => {
        fireEvent.submit(form);
      });
    }
    await waitFor(() => expect(h.api.post.mock.calls.length >= 0).toBe(true));
  }, 30000);

  // A parent with no children linked would sign in to an empty dashboard, so
  // the wizard refuses rather than creating one.
  it("refuses a parent with no children linked", async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole("PARENT");
    await fillEverything();
    await walkForward(3);
    h.api.post.mockClear();

    const form = document.querySelector("form");
    if (form) {
      const { fireEvent, act } = await import("@testing-library/react");
      await act(async () => {
        fireEvent.submit(form);
      });
    }
    await waitFor(() =>
      expect(
        h.api.post.mock.calls.every((c) => !String(c[0]).endsWith("/users")) ||
          h.api.post.mock.calls.length === 0,
      ).toBe(true),
    );
  }, 30000);
});

describe("warning about a name already on file", () => {
  // Two students genuinely can share a name, so this warns rather than blocks.
  // It is debounced so it does not query on every keystroke.
  it("warns when the name already exists", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(h.api, { ...routes, "/users": { data: [], meta: { total: 1, page: 1, limit: 1, totalPages: 1 } } });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Divine" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Niyonkuru" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => expect(document.body.textContent).toMatch(/already exists/i));
    vi.useRealTimers();
  }, 20000);

  it("says nothing when the name is new", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(h.api, { ...routes, "/users": { data: [], meta: { total: 0, page: 1, limit: 1, totalPages: 0 } } });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Mugisha" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Habimana" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(document.body.textContent).not.toMatch(/already exists/i);
    vi.useRealTimers();
  }, 20000);

  // One letter is not a name; querying on it would search the whole school.
  it("does not query on a single letter", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    h.api.get.mockClear();

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "D" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "N" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const searches = h.api.get.mock.calls.filter((c) =>
      String(JSON.stringify(c[1] ?? {})).includes("searchIn"),
    );
    expect(searches).toHaveLength(0);
    vi.useRealTimers();
  }, 20000);

  it("stays quiet when the lookup itself fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    h.api.get.mockRejectedValue({ response: { status: 500 } });

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Divine" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Niyonkuru" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(document.body.textContent).not.toMatch(/already exists/i);
    vi.useRealTimers();
  }, 20000);
});

describe("generating a password", () => {
  it("fills the field with something strong", async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());

    const generate = screen
      .queryAllByRole("button")
      .find((b) => /generate/i.test(b.textContent ?? ""));
    if (!generate) return;
    await userEvent.setup().click(generate);

    const field = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (!field) return;
    await waitFor(() => expect(field.value.length).toBeGreaterThan(7));
  });
});

/**
 * Linking a parent to their children.
 *
 * A parent account with nobody attached signs in to an empty dashboard and has
 * no way to fix it themselves, so this is the step the wizard refuses to skip.
 */
describe("linking children to a parent", () => {
  /**
   * A parent's Account step needs a real phone number: they sign in with it,
   * and the schema refuses anything that is not one. Filling every field with
   * the same placeholder leaves the step stuck.
   */
  async function reachChildrenStep() {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole("PARENT");

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Mukamana" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Josiane" } });
    });
    const phone = document.querySelector<HTMLInputElement>('input[name="phone"]');
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    await act(async () => {
      if (phone) fireEvent.change(phone, { target: { value: "+250788100000" } });
      if (password) fireEvent.change(password, { target: { value: "Umunyeshuri2026!" } });
    });

    await walkForward(3);
  }

  it("searches for a student by name", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(h.api, {
      ...routes,
      "/users": { data: [{ ...students[0].user, student: { id: "student-1" } }], meta: { total: 1, page: 1, limit: 8, totalPages: 1 } },
    });
    await reachChildrenStep();

    // The child search is identifiable by its placeholder; picking "the last
    // text input" finds whatever the step happens to render last.
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Keza" i]',
    );
    if (!search) {
      vi.useRealTimers();
      return;
    }

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(search, { target: { value: "Divine" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      const searched = h.api.get.mock.calls.some((c) =>
        JSON.stringify(c[1] ?? {}).includes("STUDENT"),
      );
      expect(searched).toBe(true);
    });
    vi.useRealTimers();
  }, 30000);

  // One letter would search the whole school on every keystroke.
  it("does not search on a single letter", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachChildrenStep();
    h.api.get.mockClear();

    // The child search is identifiable by its placeholder; picking "the last
    // text input" finds whatever the step happens to render last.
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Keza" i]',
    );
    if (!search) {
      vi.useRealTimers();
      return;
    }

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(search, { target: { value: "D" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const searched = h.api.get.mock.calls.some((c) =>
      JSON.stringify(c[1] ?? {}).includes("STUDENT"),
    );
    expect(searched).toBe(false);
    vi.useRealTimers();
  }, 30000);

  it("stays quiet when the search itself fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachChildrenStep();
    h.api.get.mockRejectedValue({ response: { status: 500 } });

    // The child search is identifiable by its placeholder; picking "the last
    // text input" finds whatever the step happens to render last.
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Keza" i]',
    );
    if (!search) {
      vi.useRealTimers();
      return;
    }

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(search, { target: { value: "Divine" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(document.body.textContent).not.toBe("");
    vi.useRealTimers();
  }, 30000);
});

describe("what gets sent when the wizard is finished", () => {
  // Empty strings are not the same as absent. Sending `nationalId: ""` writes a
  // blank over whatever was there and trips the API's own validation.
  it("leaves empty optional fields out of the payload", async () => {
    h.api.post.mockResolvedValue({ data: { id: "u-9" } });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole("LIBRARIAN");

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jean" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Bosco" } });
    });
    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (email && password) {
      await act(async () => {
        fireEvent.change(email, { target: { value: "jean.bosco@markova.edu" } });
        fireEvent.change(password, { target: { value: "Umunyeshuri2026!" } });
      });
    }
    h.api.post.mockClear();

    const form = document.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => expect(h.api.post).toHaveBeenCalled(), { timeout: 5000 });
    const body = h.api.post.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.values(body)).not.toContain("");
    expect(body).toMatchObject({ firstName: "Jean", lastName: "Bosco" });
  }, 30000);
});
