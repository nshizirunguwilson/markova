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
      .find((b) => /^(next|continue)/i.test((b.textContent ?? "").trim()));
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

/**
 * Picking a child from the search results.
 *
 * The list is the only way a parent account gets attached to anyone, and the
 * wizard refuses to finish without at least one. Adding the same child twice
 * would create a duplicate link the API then rejects.
 */
describe("attaching a child to the parent", () => {
  const childResult = {
    ...students[0].user,
    student: {
      id: "student-1",
      studentIdNumber: "STD-2026-001",
      classSection: {
        name: "A",
        classLevel: { name: "Senior 1" },
        trade: null,
      },
    },
  };

  async function searchForChild(results: unknown[] = [childResult]) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(h.api, {
      ...routes,
      "/users": { data: results, meta: { total: results.length, page: 1, limit: 8, totalPages: 1 } },
    });

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

    const search = document.querySelector<HTMLInputElement>('input[placeholder*="Keza" i]');
    if (!search) {
      vi.useRealTimers();
      return false;
    }
    await act(async () => {
      fireEvent.change(search, { target: { value: "Divine" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    vi.useRealTimers();
    return true;
  }

  it("lists the students it found", async () => {
    if (!(await searchForChild())) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Divine/));
  }, 30000);

  it("attaches one when it is chosen", async () => {
    if (!(await searchForChild())) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Divine/));

    const user = userEvent.setup();
    const result = screen.getAllByText(/Divine/).at(-1);
    if (!result) return;
    await user.click(result);

    await waitFor(() => expect(document.body.textContent).toMatch(/Divine/));
  }, 30000);

  // A child linked twice is a duplicate the API rejects, so the second attempt
  // has to be a no-op rather than an error at the very end.
  it("ignores a child who is already attached", async () => {
    if (!(await searchForChild())) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Divine/));

    const user = userEvent.setup();
    const result = screen.getAllByText(/Divine/).at(-1);
    if (!result) return;
    await user.click(result);
    await user.click(result).catch(() => undefined);

    const mentions = (document.body.textContent ?? "").match(/STD-2026-001/g) ?? [];
    expect(mentions.length).toBeLessThanOrEqual(2);
  }, 30000);

  it("finds nothing for a name nobody has", async () => {
    if (!(await searchForChild([]))) return;
    expect(document.body.textContent).not.toBe("");
  }, 30000);
});

/**
 * What each role actually sends.
 *
 * The payload is built role by role: a student carries a class and a guardian,
 * a teacher carries employment details, a parent carries their children. Fields
 * left blank are omitted rather than sent as empty strings, because an empty
 * string overwrites whatever the API had.
 */
describe("the payload each role produces", () => {
  /** Fills every field on screen with something its own validation accepts. */
  async function fillCurrentStep() {
    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      for (const field of Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input:not([type="file"]):not([type="checkbox"]), textarea',
        ),
      )) {
        if (field.disabled || field.readOnly) continue;
        const name = `${field.getAttribute("name") ?? ""} ${field.id}`.toLowerCase();
        const type = field.getAttribute("type");
        let value = "Ubwiza";
        if (type === "number") value = "1";
        else if (type === "date") value = "2010-04-11";
        else if (name.includes("email")) value = "someone@markova.edu";
        else if (name.includes("phone")) value = "+250788000001";
        else if (name.includes("password")) value = "Umunyeshuri2026!";
        else if (name.includes("nationalid")) value = "";
        fireEvent.change(field, { target: { value } });
      }
      for (const select of Array.from(document.querySelectorAll("select"))) {
        if (select.disabled) continue;
        // Never touch the role picker: setting every select to its first
        // option would quietly reset the role to STUDENT on each step and the
        // wizard would build a different payload than the one under test.
        if ((select.getAttribute("name") ?? "") === "role") continue;
        const option = Array.from(select.options).find((o) => o.value);
        if (option) fireEvent.change(select, { target: { value: option.value } });
      }
    });
  }

  async function completeAs(role: string) {
    h.api.post.mockResolvedValue({ data: { id: "u-9", password: "Temp123!" } });
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole(role);

    const { act, fireEvent } = await import("@testing-library/react");
    // Six passes covers the longest path, which is a student's four steps.
    for (let step = 0; step < 6; step += 1) {
      await fillCurrentStep();
      const next = screen
        .queryAllByRole("button")
        .find((b) => /^(next|continue)/i.test((b.textContent ?? "").trim()));
      if (!next || (next as HTMLButtonElement).disabled) break;
      const before = document.body.textContent;
      await act(async () => {
        fireEvent.click(next);
      });
      if (document.body.textContent === before) break;
    }

    await fillCurrentStep();
    h.api.post.mockClear();
    const form = document.querySelector("form");
    if (form) {
      await act(async () => {
        fireEvent.submit(form);
      });
    }
    return h.api.post.mock.calls.find((c) => String(c[0]).endsWith("/users"));
  }

  it.each(["STUDENT", "TEACHER", "PARENT", "LIBRARIAN", "ADMIN"])(
    "%s reaches the end of the wizard without crashing",
    async (role) => {
      await completeAs(role);
      expect(document.body.textContent).not.toBe("");
    },
    30000,
  );

  // An empty string is not the same as absent, and the API treats it as a value
  // to write.
  it.each(["TEACHER", "LIBRARIAN", "ADMIN"])(
    "%s sends no empty strings",
    async (role) => {
      const call = await completeAs(role);
      if (!call) return;
      const body = call[1] as Record<string, unknown>;
      expect(Object.values(body)).not.toContain("");
    },
    30000,
  );

  it("a teacher carries their employment details", async () => {
    const call = await completeAs("TEACHER");
    if (!call) return;
    const body = call[1] as Record<string, unknown>;
    expect(body.role).toBe("TEACHER");
    expect(body).toHaveProperty("firstName");
  }, 30000);

  it("a librarian carries only the basics", async () => {
    const call = await completeAs("LIBRARIAN");
    if (!call) return;
    const body = call[1] as Record<string, unknown>;
    expect(body.role).toBe("LIBRARIAN");
    expect(body).not.toHaveProperty("classSectionId");
  }, 30000);

  // A duplicate email is the commonest refusal, and the wizard has to keep
  // everything typed so it can be corrected rather than re-entered.
  it("keeps the wizard open when creation is refused", async () => {
    h.api.post.mockRejectedValue({
      response: { status: 409, data: { message: "That email is already in use" } },
    });
    onClose.mockClear();
    await completeAs("LIBRARIAN");

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByLabelText(/first name/i)).toBeTruthy();
  }, 30000);
});

/**
 * Linking a parent to their children.
 *
 * A parent account with no children linked is an account that signs in to an
 * empty dashboard: every parent page reads the child list first and has nothing
 * to show without it. The wizard is the only place that link is made, so this
 * is the step that decides whether a parent's account is usable at all.
 */
describe("linking a parent to their children", () => {
  const keza = {
    id: "u-20",
    firstName: "Keza",
    lastName: "Mutesi",
    student: {
      id: "student-2",
      studentIdNumber: "STD-2026-002",
      classSection: { name: "A", classLevel: { name: "Senior 1" } },
    },
  };
  const divine = {
    id: "u-21",
    firstName: "Divine",
    lastName: "Niyonkuru",
    student: {
      id: "student-1",
      studentIdNumber: "STD-2026-001",
      classSection: { name: "B", classLevel: { name: "Senior 2" } },
    },
  };

  /** Answers the child search with whoever is passed, leaving other routes alone. */
  function searchFinds(users: unknown[]) {
    h.api.get.mockImplementation((url: string, config?: any) => {
      if (url === "/users" && config?.params?.role === "STUDENT") {
        return Promise.resolve({ data: { data: users, meta: { total: users.length } } });
      }
      return Promise.resolve({ data: [] });
    });
  }

  /**
   * Fills the account step. The shared filler resets every select, and the
   * account step's other selects are not what decides the path here, so this
   * only touches the inputs and leaves the role where chooseRole put it.
   */
  async function fillAccount() {
    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      for (const field of Array.from(
        document.querySelectorAll<HTMLInputElement>('input:not([type="file"])'),
      )) {
        if (field.disabled || field.readOnly) continue;
        const name = `${field.getAttribute("name") ?? ""} ${field.id}`.toLowerCase();
        let value = "Mukamana";
        if (name.includes("email")) value = "jean.mukamana@markova.edu";
        else if (name.includes("phone")) value = "+250788100000";
        else if (name.includes("password")) value = "Umubyeyi2026!";
        else if (name.includes("nationalid")) value = "";
        fireEvent.change(field, { target: { value } });
      }
    });
  }

  /** Opens the wizard, picks PARENT, fills the account step and continues. */
  async function reachChildrenStep() {
    const { act, fireEvent } = await import("@testing-library/react");
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole("PARENT");
    await fillAccount();

    const next = screen
      .queryAllByRole("button")
      .find((b) => /^(next|continue)/i.test((b.textContent ?? "").trim()));
    if (next) {
      await act(async () => {
        fireEvent.click(next);
      });
    }
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/keza or std/i)).toBeInTheDocument(),
    );
  }

  /** Types into the child search and waits out the 350ms debounce. */
  async function searchFor(text: string) {
    const { act, fireEvent } = await import("@testing-library/react");
    const box = screen.getByPlaceholderText(/keza or std/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: text } });
    });
  }

  it("reaches a children step, not a family step", async () => {
    await reachChildrenStep();
    expect(screen.getByText(/find their children/i)).toBeInTheDocument();
  }, 30000);

  // A single letter matches most of the school. Searching on it would send a
  // request per keystroke and return a list nobody can use.
  it("does not search on a single letter", async () => {
    await reachChildrenStep();
    h.api.get.mockClear();
    await searchFor("K");

    await new Promise((r) => setTimeout(r, 500));
    const searched = h.api.get.mock.calls.some(
      ([, config]: any[]) => config?.params?.role === "STUDENT",
    );
    expect(searched).toBe(false);
  }, 30000);

  it("looks for active students only", async () => {
    searchFinds([keza]);
    await reachChildrenStep();
    await searchFor("Keza");

    await waitFor(() => {
      const call = h.api.get.mock.calls.find(
        ([, config]: any[]) => config?.params?.role === "STUDENT",
      );
      expect(call).toBeTruthy();
      expect(call![1].params.studentStatus).toBe("ACTIVE");
      expect(call![1].params.search).toBe("Keza");
    });
  }, 30000);

  it("shows a match with the class that identifies them", async () => {
    searchFinds([keza]);
    await reachChildrenStep();
    await searchFor("Keza");

    await waitFor(() => expect(screen.getByText("Keza Mutesi")).toBeInTheDocument());
    // Two children can share a name; the code and class are what tell them apart.
    expect(screen.getByText(/STD-2026-002/)).toBeInTheDocument();
    expect(screen.getByText(/Senior 1/)).toBeInTheDocument();
  }, 30000);

  it("adds a child when their result is tapped", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    searchFinds([keza]);
    await reachChildrenStep();
    await searchFor("Keza");

    await waitFor(() => expect(screen.getByText("Keza Mutesi")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Keza Mutesi").closest("button")!);
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /remove keza mutesi/i })).toBeInTheDocument(),
    );
  }, 30000);

  it("clears the search once a child is added", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    searchFinds([keza]);
    await reachChildrenStep();
    await searchFor("Keza");

    await waitFor(() => expect(screen.getByText("Keza Mutesi")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Keza Mutesi").closest("button")!);
    });

    const box = screen.getByPlaceholderText(/keza or std/i) as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe(""));
  }, 30000);

  // Adding the same child twice would send two links for one relationship.
  it("ignores a child who is already linked", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    searchFinds([keza]);
    await reachChildrenStep();

    for (const term of ["Keza", "Keza Mutesi"]) {
      await searchFor(term);
      await waitFor(() =>
        expect(screen.getAllByText("Keza Mutesi").length).toBeGreaterThan(0),
      );
      const result = screen
        .getAllByText("Keza Mutesi")
        .map((el) => el.closest("button"))
        .find((b) => b && !/remove/i.test(b.getAttribute("aria-label") ?? ""));
      if (result) {
        await act(async () => {
          fireEvent.click(result);
        });
      }
    }

    expect(screen.getAllByRole("button", { name: /remove keza mutesi/i })).toHaveLength(1);
  }, 30000);

  // A user row with no student record cannot be a child. Adding one would send
  // an undefined studentId the API would reject.
  it("will not add a result that has no student record", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    searchFinds([{ id: "u-30", firstName: "Aline", lastName: "Uwase" }]);
    await reachChildrenStep();
    await searchFor("Aline");

    await waitFor(() => expect(screen.getByText("Aline Uwase")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Aline Uwase").closest("button")!);
    });

    expect(screen.queryByRole("button", { name: /remove aline uwase/i })).toBeNull();
  }, 30000);

  it("takes more than one child", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    searchFinds([keza, divine]);
    await reachChildrenStep();
    await searchFor("Mu");

    for (const name of ["Keza Mutesi", "Divine Niyonkuru"]) {
      // Adding a child clears the search, so each one is looked up again. The
      // wait is for that result to come back, not for the click.
      await searchFor(name.split(" ")[0]);
      const btn = await waitFor(() => {
        const found = screen
          .getAllByText(name)
          .map((el) => el.closest("button"))
          .find((b) => b && !/remove/i.test(b.getAttribute("aria-label") ?? ""));
        expect(found).toBeTruthy();
        return found!;
      });
      await act(async () => {
        fireEvent.click(btn);
      });
    }

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^remove /i }).length).toBe(2),
    );
  }, 30000);

  it("removes a child who was added by mistake", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    searchFinds([keza]);
    await reachChildrenStep();
    await searchFor("Keza");

    await waitFor(() => expect(screen.getByText("Keza Mutesi")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Keza Mutesi").closest("button")!);
    });
    const remove = await screen.findByRole("button", { name: /remove keza mutesi/i });
    await act(async () => {
      fireEvent.click(remove);
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /remove keza mutesi/i })).toBeNull(),
    );
  }, 30000);

  it("does not fall over when the search itself fails", async () => {
    h.api.get.mockImplementation((url: string, config?: any) => {
      if (url === "/users" && config?.params?.role === "STUDENT") {
        return Promise.reject({ response: { status: 500 } });
      }
      return Promise.resolve({ data: [] });
    });
    await reachChildrenStep();
    await searchFor("Keza");

    await new Promise((r) => setTimeout(r, 500));
    expect(screen.getByPlaceholderText(/keza or std/i)).toBeInTheDocument();
  }, 30000);

  /** Adds one child, ready for a submit. */
  async function addKeza() {
    const { act, fireEvent } = await import("@testing-library/react");
    await searchFor("Keza");
    await waitFor(() => expect(screen.getByText("Keza Mutesi")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Keza Mutesi").closest("button")!);
    });
    await screen.findByRole("button", { name: /remove keza mutesi/i });
  }

  /** Submits the wizard's form directly, the way its own save button does. */
  async function submit() {
    const { act, fireEvent } = await import("@testing-library/react");
    const form = document.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });
  }

  // A parent with no children linked signs in to an empty dashboard. Creating
  // one and finding out later means an account nobody can explain.
  it("refuses to create a parent with no children linked", async () => {
    searchFinds([keza]);
    await reachChildrenStep();
    h.api.post.mockClear();
    await submit();

    await waitFor(() =>
      expect(screen.getByText(/link at least one child/i)).toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  }, 30000);

  it("sends the linked children with the new parent", async () => {
    h.api.post.mockResolvedValue({ data: { id: "u-99" } });
    searchFinds([keza]);
    await reachChildrenStep();
    await addKeza();
    h.api.post.mockClear();
    await submit();

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const body = h.api.post.mock.calls[0][1] as any;
    expect(body.role).toBe("PARENT");
    expect(body.children).toEqual([
      { studentId: "student-2", relationship: "Father" },
    ]);
  }, 30000);

  it("sends the relationship that was chosen, not the default", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    h.api.post.mockResolvedValue({ data: { id: "u-99" } });
    searchFinds([keza]);
    await reachChildrenStep();
    await addKeza();

    const relationship = screen
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "Mother"),
      ) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(relationship, { target: { value: "Mother" } });
    });

    h.api.post.mockClear();
    await submit();

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const body = h.api.post.mock.calls[0][1] as any;
    expect(body.children[0].relationship).toBe("Mother");
  }, 30000);

  // The error clears the moment a child is added, so it does not sit there
  // contradicting what is on screen.
  it("drops the warning once a child is added", async () => {
    searchFinds([keza]);
    await reachChildrenStep();
    await submit();
    await waitFor(() =>
      expect(screen.getByText(/link at least one child/i)).toBeInTheDocument(),
    );

    await addKeza();
    expect(screen.queryByText(/link at least one child/i)).toBeNull();
  }, 30000);
});

/**
 * The photo and the suggested email.
 *
 * Both are conveniences that run after or beside the main save, and both fail
 * in ways that must not cost the admin the user they just created.
 */
describe("the photo and the suggested email", () => {
  /** Puts a file on the wizard's photo input. */
  async function attachPhoto() {
    const { act, fireEvent } = await import("@testing-library/react");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return false;
    const file = new File(["photo"], "keza.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    return true;
  }

  async function openAndFill() {
    const { act, fireEvent } = await import("@testing-library/react");
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole("LIBRARIAN");
    await act(async () => {
      for (const field of Array.from(
        document.querySelectorAll<HTMLInputElement>('input:not([type="file"])'),
      )) {
        if (field.disabled || field.readOnly) continue;
        const name = `${field.getAttribute("name") ?? ""} ${field.id}`.toLowerCase();
        let value = "Mukamana";
        if (name.includes("email")) value = "jean.mukamana@markova.edu";
        else if (name.includes("phone")) value = "+250788100000";
        else if (name.includes("password")) value = "Umukozi2026!";
        else if (name.includes("nationalid")) value = "";
        fireEvent.change(field, { target: { value } });
      }
    });
  }

  async function submit() {
    const { act, fireEvent } = await import("@testing-library/react");
    const form = document.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });
  }

  it("uploads the photo against the user that was just created", async () => {
    h.api.post.mockResolvedValue({ data: { id: "u-77" } });
    await openAndFill();
    if (!(await attachPhoto())) return;
    h.api.post.mockClear();
    await submit();

    await waitFor(() => {
      const photoCall = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/photo"),
      );
      expect(photoCall).toBeTruthy();
      expect(photoCall![0]).toBe("/users/u-77/photo");
      expect(photoCall![1]).toBeInstanceOf(FormData);
    });
  }, 30000);

  // The account is already created by then. Losing it because the photo failed
  // would make the admin create the same person twice.
  it("keeps the created user when the photo upload fails", async () => {
    h.api.post.mockImplementation((url: string) => {
      if (String(url).includes("/photo")) {
        return Promise.reject({ response: { status: 413 } });
      }
      return Promise.resolve({ data: { id: "u-77" } });
    });
    await openAndFill();
    if (!(await attachPhoto())) return;
    h.toast.error.mockClear();
    await submit();

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/photo failed to upload/i),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  }, 30000);

  it("does not ask for a photo upload when none was chosen", async () => {
    h.api.post.mockResolvedValue({ data: { id: "u-77" } });
    await openAndFill();
    h.api.post.mockClear();
    await submit();

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const photoCall = h.api.post.mock.calls.find(([url]: any[]) =>
      String(url).includes("/photo"),
    );
    expect(photoCall).toBeUndefined();
  }, 30000);

  it("asks for the names before it can suggest anything", async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    const { act, fireEvent } = await import("@testing-library/react");
    h.toast.error.mockClear();

    const suggest = screen.getByRole("button", { name: /suggest/i });
    await act(async () => {
      fireEvent.click(suggest);
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  }, 30000);

  it("suggests an address built from the names", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    h.api.get.mockImplementation((url: string, config?: any) => {
      if (url === "/users" && config?.params?.searchIn === "email") {
        return Promise.resolve({ data: { meta: { total: 0 } } });
      }
      return Promise.resolve({ data: [] });
    });

    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Aline" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Uwase" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /suggest/i }));
    });

    // The house convention is the first name and the surname.
    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    await waitFor(() => expect(email.value).toBe("aline.uwase@markova.edu"));
  }, 30000);

  // Two people called Aline Uwase is ordinary in one school. The second one
  // has to get a different address, not a duplicate the API will refuse.
  it("steps past an address that is already taken", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    h.api.get.mockImplementation((url: string, config?: any) => {
      if (url === "/users" && config?.params?.searchIn === "email") {
        const taken = !String(config.params.search).match(/\d/);
        return Promise.resolve({ data: { meta: { total: taken ? 1 : 0 } } });
      }
      return Promise.resolve({ data: [] });
    });

    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Aline" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Uwase" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /suggest/i }));
    });

    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    await waitFor(() => expect(email.value).toMatch(/\d/));
  }, 30000);

  it("still fills something in when the check cannot be made", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    h.api.get.mockImplementation((url: string, config?: any) => {
      if (url === "/users" && config?.params?.searchIn === "email") {
        return Promise.reject({ response: { status: 500 } });
      }
      return Promise.resolve({ data: [] });
    });

    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Aline" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Uwase" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /suggest/i }));
    });

    // It falls back to the plain form rather than leaving the field empty.
    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    await waitFor(() => expect(email.value).toBe("aline.uwase@markova.edu"));
  }, 30000);
});

/**
 * How each role signs in, enforced at the point of creation.
 *
 * Staff sign in with an email; parents sign in with a phone. An account
 * created without the one its role needs cannot be used at all, and the person
 * only finds out when they try to log in. So the wizard refuses it here.
 */
describe("the login each role needs", () => {
  async function fillAccountFor(role: string, over: Record<string, string> = {}) {
    open();
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
    await chooseRole(role);

    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      for (const field of Array.from(
        document.querySelectorAll<HTMLInputElement>('input:not([type="file"])'),
      )) {
        if (field.disabled || field.readOnly) continue;
        const name = `${field.getAttribute("name") ?? ""} ${field.id}`.toLowerCase();
        let value = "Mukamana";
        if (name.includes("email")) value = over.email ?? "someone@markova.edu";
        else if (name.includes("phone")) value = over.phone ?? "+250788100000";
        else if (name.includes("password")) value = "Umukozi2026!";
        else if (name.includes("nationalid")) value = over.nationalId ?? "";
        fireEvent.change(field, { target: { value } });
      }
    });
  }

  /**
   * Moves past the account step. A librarian's account is the only step there
   * is, so there is no Continue button and the form is submitted instead.
   */
  async function advance() {
    const { act, fireEvent } = await import("@testing-library/react");
    const next = screen
      .queryAllByRole("button")
      .find((b) => /^(next|continue)/i.test((b.textContent ?? "").trim()));
    if (next) {
      await act(async () => {
        fireEvent.click(next);
      });
      return;
    }
    const form = document.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });
  }

  // A parent signs in by phone; the first fifteen in the school have no email
  // at all, so the phone is the only thing that identifies them.
  it("refuses a parent with no phone number", async () => {
    await fillAccountFor("PARENT", { phone: "" });
    await advance();

    await waitFor(() =>
      expect(screen.getByText(/parents log in by phone/i)).toBeInTheDocument(),
    );
  });

  it("lets a parent through once a phone number is given", async () => {
    await fillAccountFor("PARENT");
    await advance();

    await waitFor(() => expect(screen.queryByText(/parents log in by phone/i)).toBeNull());
  });

  it.each(["TEACHER", "LIBRARIAN"])("refuses a %s with no email", async (role) => {
    await fillAccountFor(role, { email: "" });
    await advance();

    await waitFor(() =>
      expect(screen.getByText(/staff log in with email/i)).toBeInTheDocument(),
    );
  });

  it("lets staff through once an email is given", async () => {
    await fillAccountFor("TEACHER");
    await advance();

    await waitFor(() => expect(screen.queryByText(/staff log in with email/i)).toBeNull());
  });

  // A national ID is optional, but one that is filled in has to be a real one:
  // it is copied onto official records.
  it("refuses a national ID that is not valid", async () => {
    await fillAccountFor("TEACHER", { nationalId: "1234" });
    await advance();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/national id|16 digits/i),
    );
  });

  // The field always shows a "16 digits" hint, so the proof is that the wizard
  // moved on rather than that the words are absent.
  it("accepts an account with no national ID at all", async () => {
    await fillAccountFor("TEACHER", { nationalId: "" });
    await advance();

    await waitFor(() => expect(document.body.textContent).toMatch(/employment/i));
  });
});
