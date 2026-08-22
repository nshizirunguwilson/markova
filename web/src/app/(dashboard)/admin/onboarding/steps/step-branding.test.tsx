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
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";

import { StepBranding } from "./step-branding";

/**
 * The branding step of first-run setup.
 *
 * A school setting itself up has nothing uploaded yet, so this step's job is
 * to make the three missing assets obvious and to say clearly whether each
 * upload landed. Getting a stamp in wrong here surfaces a whole term later, on
 * the report cards.
 */

const routes = {
  "/school-config": { map: {} },
  "/school-config/bulk": { ok: true },
  "/school-config/upload/logo": { url: "/uploads/branding/logo.png" },
  "/school-config/upload/stamp": { url: "/uploads/branding/stamp.png" },
  "/school-config/upload/signature": { url: "/uploads/branding/signature.png" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(config: unknown = { map: {} }) {
  serve(h.api, { ...routes, "/school-config": config });
  signIn("ADMIN");
  renderWithProviders(<StepBranding />);
  await waitFor(() =>
    expect(screen.getByLabelText(/primary color/i)).toBeInTheDocument(),
  );
}

/** The hidden file input for one of the three assets, in listed order. */
function fileInputs() {
  return screen.getAllByLabelText(/upload image file/i) as HTMLInputElement[];
}

async function upload(input: HTMLInputElement, name: string) {
  const file = new File(["image-bytes"], name, { type: "image/png" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe("what the step asks for", () => {
  it("asks for all three assets", async () => {
    await mount();
    expect(screen.getByText(/School Logo/i)).toBeInTheDocument();
    expect(screen.getByText(/School Stamp/i)).toBeInTheDocument();
    expect(screen.getByText(/School Signature/i)).toBeInTheDocument();
  });

  it("gives each one its own picker", async () => {
    await mount();
    expect(fileInputs()).toHaveLength(3);
  });

  // A new school has nothing yet, so nothing should claim to be uploaded.
  it("shows nothing as uploaded on a fresh school", async () => {
    await mount();
    expect(screen.queryByText(/^Uploaded$/)).toBeNull();
  });

  it("marks an asset that is already in place", async () => {
    await mount({ map: { logo_url: "/uploads/branding/logo.png" } });
    await waitFor(() => expect(screen.getByText(/^Uploaded$/)).toBeInTheDocument());
    expect(screen.getByAltText(/current school logo/i)).toBeInTheDocument();
  });

  it("says what the file may be", async () => {
    await mount();
    expect(screen.getAllByText(/PNG, JPG or SVG/i).length).toBeGreaterThan(0);
  });
});

describe("uploading an asset", () => {
  it("sends the logo to the logo endpoint", async () => {
    await mount();
    h.api.post.mockClear();
    await upload(fileInputs()[0], "logo.png");

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/school-config/upload/logo"),
      );
      expect(call).toBeTruthy();
      expect(call![1]).toBeInstanceOf(FormData);
    });
  });

  // Three pickers, three endpoints. Crossing them would put the signature
  // where the stamp belongs on every report card.
  it("sends each asset to its own endpoint", async () => {
    await mount();
    h.api.post.mockClear();
    await upload(fileInputs()[1], "stamp.png");
    await upload(fileInputs()[2], "signature.png");

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map(([u]: any[]) => String(u));
      expect(urls.some((u) => u.endsWith("/upload/stamp"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/upload/signature"))).toBe(true);
    });
  });

  it("sends it as multipart", async () => {
    await mount();
    h.api.post.mockClear();
    await upload(fileInputs()[0], "logo.png");

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/upload/"),
      );
      expect((call![2] as any)?.headers?.["Content-Type"]).toBe("multipart/form-data");
    });
  });

  it("says so once it is in", async () => {
    await mount();
    await upload(fileInputs()[0], "logo.png");

    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(expect.stringMatching(/logo/i)),
    );
  });

  // Silence here means a school finishes setup believing it has a stamp.
  it("says so when the upload fails, naming the asset", async () => {
    await mount();
    h.api.post.mockRejectedValue({ response: { status: 413 } });
    h.toast.error.mockClear();
    await upload(fileInputs()[1], "stamp.png");

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/stamp/i)),
    );
  });

  it("uploads nothing when the picker is dismissed", async () => {
    await mount();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.change(fileInputs()[0], { target: { files: [] } });
    });

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });
});

describe("the school colour", () => {
  it("saves what was picked", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/primary color/i), {
        target: { value: "#0f6b3c" },
      });
    });

    h.api.post.mockClear();
    h.api.put.mockClear();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/primary color/i).closest("form")!);
    });

    await waitFor(() => {
      const calls = [...h.api.post.mock.calls, ...h.api.put.mock.calls];
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls[0])).toMatch(/0f6b3c/i);
    });
  });

  it("opens on the colour the school already chose", async () => {
    await mount({ map: { primary_color: "#0f6b3c" } });
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/primary color/i) as HTMLInputElement).value,
      ).toBe("#0f6b3c"),
    );
  });
});
