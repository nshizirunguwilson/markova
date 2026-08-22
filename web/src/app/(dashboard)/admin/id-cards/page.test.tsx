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
  usePathname: () => "/admin/id-cards",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes } from "@/test/fixtures";

import IdCardsPage from "./page";

/**
 * The student ID card registry.
 *
 * A card is a physical thing a child carries, so the two write actions here
 * are asymmetric: issuing one is cheap and reversible, revoking one leaves a
 * student at the gate without ID. Only the second asks first.
 */

const withCard = {
  id: "student-1",
  name: "Divine Niyonkuru",
  class: "Senior 1 A",
  studentIdNumber: "STD-2025-0001",
  hasCard: true,
  cardId: "NFC-0001",
  cardIssuedAt: "2026-08-01T09:00:00Z",
};

const withoutCard = {
  id: "student-2",
  name: "Keza Mutesi",
  class: "Senior 1 A",
  studentIdNumber: "STD-2025-0002",
  hasCard: false,
  cardId: null,
  cardIssuedAt: null,
};

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/reports/id-cards/registry": { items: [withCard, withoutCard] },
  "/reports/id-cards/issue": { ok: true },
  "/reports/id-cards/issue-bulk": { issued: 1 },
  "/reports/id-cards/revoke": { ok: true },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  // jsdom implements neither, and both are reached by this page.
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount() {
  renderPage(IdCardsPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

/** The filters the registry was last asked for. */
function lastRegistryQuery() {
  const call = [...h.api.get.mock.calls]
    .reverse()
    .find(([url]) => String(url).includes("id-cards/registry"));
  return (call?.[1] as any)?.params ?? {};
}

function rowFor(name: RegExp) {
  return screen.getByText(name).closest("tr")!;
}

describe("the registry", () => {
  it("lists every student with their class and number", async () => {
    await mount();
    const row = rowFor(/Divine Niyonkuru/);
    expect(row.textContent).toMatch(/Senior 1 A/);
    expect(row.textContent).toMatch(/STD-2025-0001/);
  });

  // The card number is what a gate scanner reads back.
  it("shows the card number of a student who has one", async () => {
    await mount();
    expect(rowFor(/Divine Niyonkuru/).textContent).toMatch(/NFC-0001/);
  });

  it("says plainly when a student has no card", async () => {
    await mount();
    expect(rowFor(/Keza Mutesi/).textContent).toMatch(/no card/i);
  });

  it("shows when a card was issued", async () => {
    await mount();
    expect(rowFor(/Divine Niyonkuru/).textContent).toMatch(/2026/);
  });

  it("leaves a dash where there is no issue date", async () => {
    await mount();
    expect(rowFor(/Keza Mutesi/).textContent).toMatch(/—/);
  });

  it("does not go blank when the registry fails to load", async () => {
    serveFailure(h.api);
    renderPage(IdCardsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives a registry that comes back with no items", async () => {
    serve(h.api, { ...routes, "/reports/id-cards/registry": {} });
    renderPage(IdCardsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("narrowing the registry", () => {
  it("filters to the students who still need a card", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^status$/i), {
        target: { value: "not_issued" },
      });
    });

    await waitFor(() => expect(lastRegistryQuery().status).toBe("not_issued"));
  });

  it("filters to the students who already have one", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^status$/i), {
        target: { value: "issued" },
      });
    });

    await waitFor(() => expect(lastRegistryQuery().status).toBe("issued"));
  });

  // Sections belong to a level, so the section picker waits for one.
  it("keeps the class picker shut until a level is chosen", async () => {
    await mount();
    expect(screen.getByLabelText(/class section/i)).toBeDisabled();
  });

  it("asks for one class once a level and class are chosen", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/class level/i), {
        target: { value: "level-1" },
      });
    });

    const section = screen.getByLabelText(/class section/i) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(section.options).some((o) => o.value)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(section, { target: { value: "section-1" } });
    });

    await waitFor(() => expect(lastRegistryQuery().classSectionId).toBe("section-1"));
  });

  it("searches by name once typing stops", async () => {
    await mount();
    const box = document.querySelector<HTMLInputElement>('input[type="text"]');
    expect(box).toBeTruthy();
    await act(async () => {
      fireEvent.change(box!, { target: { value: "keza" } });
    });

    await waitFor(() => expect(lastRegistryQuery().search).toBe("keza"), {
      timeout: 2000,
    });
  });
});

describe("issuing a card", () => {
  function generateFor(name: RegExp) {
    return within(rowFor(name))
      .getAllByRole("button")
      .find((b) => /generate/i.test(b.textContent ?? ""));
  }

  it("offers to generate one only where there is none", async () => {
    await mount();
    expect(generateFor(/Keza Mutesi/)).toBeTruthy();
    expect(generateFor(/Divine Niyonkuru/)).toBeUndefined();
  });

  it("issues it for that student", async () => {
    await mount();
    h.api.post.mockClear();
    await click(generateFor(/Keza Mutesi/));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("id-cards/issue"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).studentId).toBe("student-2");
    });
  });

  // Issuing one card is cheap and undoable, so it does not ask first.
  it("does not stop to ask", async () => {
    await mount();
    await click(generateFor(/Keza Mutesi/));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  // Only offered once a class is chosen: "everyone without a card" across the
  // whole school is not an action anyone means to take.
  it("does not offer a bulk issue until a class is chosen", async () => {
    await mount();
    expect(
      screen.queryAllByRole("button").find((b) => /issue all/i.test(b.textContent ?? "")),
    ).toBeUndefined();
  });

  it("issues for a whole class in one go", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/class level/i), {
        target: { value: "level-1" },
      });
    });
    const section = screen.getByLabelText(/class section/i) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(section.options).some((o) => o.value)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(section, { target: { value: "section-1" } });
    });

    h.api.post.mockClear();
    const bulk = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /issue all/i.test(b.textContent ?? ""));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(bulk);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("issue-bulk"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).classSectionId).toBe("section-1");
    });
  });
});

describe("revoking a card", () => {
  function revokeFor(name: RegExp) {
    return within(rowFor(name))
      .getAllByRole("button")
      .find((b) => /revoke/i.test(b.textContent ?? ""));
  }

  it("offers to revoke only where there is a card", async () => {
    await mount();
    expect(revokeFor(/Divine Niyonkuru/)).toBeTruthy();
    expect(revokeFor(/Keza Mutesi/)).toBeUndefined();
  });

  // Revoking leaves a child without ID at the gate, so it asks first and names
  // who it is about.
  it("asks before revoking, naming the student", async () => {
    await mount();
    await click(revokeFor(/Divine Niyonkuru/));

    expect(window.confirm).toHaveBeenCalled();
    expect(String((window.confirm as any).mock.calls[0][0])).toMatch(/Divine Niyonkuru/);
  });

  it("revokes nothing when the ask is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await mount();
    h.api.post.mockClear();
    await click(revokeFor(/Divine Niyonkuru/));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("revoke"),
      );
      expect(call).toBeUndefined();
    });
  });

  it("revokes that student's card once confirmed", async () => {
    await mount();
    h.api.post.mockClear();
    await click(revokeFor(/Divine Niyonkuru/));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("revoke"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).studentId).toBe("student-1");
    });
  });
});

describe("printing the cards", () => {
  function printButton() {
    return screen.queryAllByRole("button").find((b) => /print/i.test(b.textContent ?? ""));
  }

  it("sends the page to the printer", async () => {
    await mount();
    await click(printButton());

    await waitFor(() => expect(window.print).toHaveBeenCalled(), { timeout: 2000 });
  });

  // Printing a blank card for a student who has none wastes the stock.
  it("lays out only the students who have a card", async () => {
    await mount();
    await click(printButton());

    await waitFor(() => {
      const sheet = document.querySelector(".print\\:grid");
      expect(sheet).toBeTruthy();
      expect(sheet!.textContent).toMatch(/Divine Niyonkuru/);
      expect(sheet!.textContent).not.toMatch(/Keza Mutesi/);
    });
  });
});
