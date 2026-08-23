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
  usePathname: () => "/admin/announcements",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes } from "@/test/fixtures";

import AnnouncementsPage from "./page";

/**
 * Telling everyone at once.
 *
 * The two things that make this safe to put in front of a head teacher are
 * that the count is shown before the send rather than after it, and that the
 * audience is described in the school's own terms. Both are what these tests
 * hold in place.
 */

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/messaging/broadcast/preview": { count: 143 },
  "/messaging/broadcast": { recipients: 143, conversation: { id: "conv-1" } },
  "/messaging/attachments": {
    fileUrl: "/uploads/attachments/abc.pdf",
    fileName: "Trip letter.pdf",
    size: 1024,
  },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => name.test((b.textContent ?? "").trim()));
}

async function mount() {
  renderPage(AnnouncementsPage, { role: "ADMIN" });
  await waitFor(() =>
    expect(screen.getByLabelText("Audience")).toBeInTheDocument(),
  );
}

/** Chooses the one year level the fixtures provide. */
async function pickLevel() {
  await waitFor(() =>
    expect(screen.getByText(classLevel.name)).toBeInTheDocument(),
  );
  await act(async () => {
    fireEvent.click(
      screen.getByText(classLevel.name).closest("label")!.querySelector("input")!,
    );
  });
}

async function writeMessage() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "School closes early on Friday" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Buses leave at midday." },
    });
  });
}

describe("choosing who needs to know", () => {
  it("opens on the audience a school needs most", async () => {
    await mount();
    expect(screen.getByLabelText("Audience")).toHaveValue("PARENTS_OF_LEVELS");
    expect(screen.getByText(/everyone in Senior 1's family/i)).toBeInTheDocument();
  });

  it("asks for year levels only when the audience needs them", async () => {
    await mount();
    expect(screen.getByText("Year levels")).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Audience"), {
        target: { value: "ALL_PARENTS" },
      });
    });
    expect(screen.queryByText("Year levels")).not.toBeInTheDocument();
  });

  it("asks for classes when the audience is a class one", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Audience"), {
        target: { value: "PARENTS_OF_CLASSES" },
      });
    });
    expect(screen.getByText("Classes")).toBeInTheDocument();
    expect(screen.getByLabelText("Level")).toBeInTheDocument();
  });

  // Half an audience is not an audience, and asking the API for a count of one
  // would answer a question nobody asked.
  it("asks for no count until the audience is fully described", async () => {
    await mount();
    expect(
      h.api.post.mock.calls.filter((c: any[]) =>
        String(c[0]).includes("/broadcast/preview"),
      ),
    ).toHaveLength(0);
    expect(screen.getByText(/finish choosing the audience/i)).toBeInTheDocument();
  });

  it("forgets the chosen levels when the audience changes", async () => {
    await mount();
    await pickLevel();
    await waitFor(() => expect(screen.getByText("143")).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Audience"), {
        target: { value: "PARENTS_OF_CLASSES" },
      });
    });
    expect(screen.getByText(/finish choosing the audience/i)).toBeInTheDocument();
  });
});

/**
 * Nobody should find out they addressed four hundred families by doing it.
 */
describe("the count before the send", () => {
  it("shows how many it will reach", async () => {
    await mount();
    await pickLevel();
    await waitFor(() => expect(screen.getByText("143")).toBeInTheDocument());
  });

  it("asks the API with the audience actually chosen", async () => {
    await mount();
    await pickLevel();
    await waitFor(() => {
      const call = h.api.post.mock.calls.find((c: any[]) =>
        String(c[0]).includes("/broadcast/preview"),
      );
      expect(call?.[1]).toEqual({
        audience: "PARENTS_OF_LEVELS",
        classLevelIds: [classLevel.id],
      });
    });
  });

  it("says so when the audience matches nobody, and blocks the send", async () => {
    serve(h.api, { ...routes, "/messaging/broadcast/preview": { count: 0 } });
    await mount();
    await pickLevel();
    await writeMessage();
    await waitFor(() =>
      expect(screen.getByText(/nobody to tell/i)).toBeInTheDocument(),
    );
    expect(button(/send the announcement/i)).toBeDisabled();
  });
});

describe("sending it", () => {
  it("will not send without a subject and a message", async () => {
    await mount();
    await pickLevel();
    await waitFor(() => expect(screen.getByText("143")).toBeInTheDocument());
    expect(button(/send the announcement/i)).toBeDisabled();
  });

  it("sends the audience, the subject and the message together", async () => {
    await mount();
    await pickLevel();
    await writeMessage();
    await waitFor(() =>
      expect(button(/send the announcement/i)).not.toBeDisabled(),
    );
    await click(button(/send the announcement/i));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/messaging/broadcast", {
        audience: "PARENTS_OF_LEVELS",
        classLevelIds: [classLevel.id],
        title: "School closes early on Friday",
        message: "Buses leave at midday.",
      }),
    );
  });

  it("says how many it reached", async () => {
    await mount();
    await pickLevel();
    await writeMessage();
    await waitFor(() =>
      expect(button(/send the announcement/i)).not.toBeDisabled(),
    );
    await click(button(/send the announcement/i));
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("Sent to 143 people"),
    );
  });

  it("clears the form afterwards, so it is not sent twice", async () => {
    await mount();
    await pickLevel();
    await writeMessage();
    await waitFor(() =>
      expect(button(/send the announcement/i)).not.toBeDisabled(),
    );
    await click(button(/send the announcement/i));
    await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue(""));
  });

  it("says why the API refused", async () => {
    await mount();
    await pickLevel();
    await writeMessage();
    await waitFor(() =>
      expect(button(/send the announcement/i)).not.toBeDisabled(),
    );
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "Nobody matches that audience, so there is nobody to tell" },
      },
    });
    await click(button(/send the announcement/i));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Nobody matches that audience, so there is nobody to tell",
      ),
    );
  });

  // An announcement is not a thread, and the person sending it should know
  // that before four hundred families cannot reply.
  it("says plainly that people cannot reply and it cannot be unsent", async () => {
    await mount();
    expect(screen.getByText(/cannot reply into it/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be unsent/i)).toBeInTheDocument();
  });

  it("previews what it will look like as it is typed", async () => {
    await mount();
    await writeMessage();
    expect(screen.getByText(/how it will look/i)).toBeInTheDocument();
    expect(screen.getAllByText("Buses leave at midday.").length).toBeGreaterThan(0);
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(AnnouncementsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText("Announcements")).toBeInTheDocument(),
    );
  });
});

describe("attaching a file", () => {
  const pdf = () =>
    new File(["letter"], "Trip letter.pdf", { type: "application/pdf" });

  it("uploads it and shows the name a person recognises", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: { files: [pdf()] },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
    expect(h.api.post).toHaveBeenCalledWith(
      "/messaging/attachments",
      expect.any(FormData),
      expect.objectContaining({
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  });

  it("sends the stored url alongside the name", async () => {
    await mount();
    await pickLevel();
    await writeMessage();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: { files: [pdf()] },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
    await click(button(/send the announcement/i));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/messaging/broadcast",
      );
      expect(call?.[1]).toMatchObject({
        fileUrl: "/uploads/attachments/abc.pdf",
        fileName: "Trip letter.pdf",
      });
    });
  });

  it("can be taken off again", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: { files: [pdf()] },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
    await click(screen.getByLabelText(/remove the file/i));
    expect(screen.queryByText("Trip letter.pdf")).not.toBeInTheDocument();
  });

  // The API decides what may be sent; the page just says what it was told.
  it("says why a file was refused", async () => {
    await mount();
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "That kind of file cannot be sent" },
      },
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: {
          files: [new File(["<script>"], "x.svg", { type: "image/svg+xml" })],
        },
      });
    });
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "That kind of file cannot be sent",
      ),
    );
  });
});
