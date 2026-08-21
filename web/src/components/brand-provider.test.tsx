import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { BrandProvider } from "./brand-provider";
import { useBrandStore } from "@/stores/brand-store";

const defaults = useBrandStore.getState();

beforeEach(() => {
  useBrandStore.setState(defaults, true);
  document.documentElement.style.cssText = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function serveBranding(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
}

/** setProperty preserves the case it was given, so compare case-insensitively. */
const read = (name: string) =>
  document.documentElement.style.getPropertyValue(name).toLowerCase();

describe("BrandProvider", () => {
  it("renders its children before the branding arrives", () => {
    serveBranding({});
    const { getByText } = render(
      <BrandProvider><span>dashboard</span></BrandProvider>,
    );
    expect(getByText("dashboard")).toBeInTheDocument();
  });

  it("paints the school's colour onto the CSS variables", async () => {
    serveBranding({ schoolName: "Groupe Scolaire Kigali", primaryColor: "#7D3C98" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--color-primary")).toBe("#7d3c98"));
  });

  // Light and dark variants are derived, so a school only ever supplies one
  // colour and still gets a usable set.
  it("derives a lighter and a darker variant from the one colour", async () => {
    serveBranding({ primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--color-primary-light")).not.toBe(""));
    expect(read("--color-primary-dark")).not.toBe("");
    expect(read("--color-primary-light")).not.toBe(read("--color-primary-dark"));
  });

  it("stores the school name for the rest of the shell", async () => {
    serveBranding({ schoolName: "Groupe Scolaire Kigali", primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() =>
      expect(useBrandStore.getState().schoolName).toBe("Groupe Scolaire Kigali"),
    );
  });

  // A school that has not set a colour, or an API that is down, must not leave
  // the dashboard unstyled.
  it("keeps the defaults when the request fails", async () => {
    serveBranding(null, false);
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(useBrandStore.getState().schoolName).toBe(defaults.schoolName));
  });

  it("keeps the defaults when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { getByText } = render(<BrandProvider><span>still here</span></BrandProvider>);
    await waitFor(() => expect(getByText("still here")).toBeInTheDocument());
  });

  it("ignores a colour that is not a hex triplet", async () => {
    serveBranding({ primaryColor: "not-a-colour" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(useBrandStore.getState()).toBeTruthy());
    expect(read("--color-primary-light")).not.toMatch(/NaN/);
  });

  it("re-applies the colour when settings change it later", async () => {
    serveBranding({ primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--color-primary")).toBe("#1b4f72"));
    useBrandStore.setState({ primaryColor: "#C0392B" });
    await waitFor(() => expect(read("--color-primary")).toBe("#c0392b"));
  });
});
