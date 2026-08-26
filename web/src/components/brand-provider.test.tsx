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

/**
 * setProperty preserves the case it was given, so compare case-insensitively.
 *
 * The names are `--brand-*` rather than `--color-*`: the Tailwind theme block
 * is `@theme inline`, which bakes each token's value into the utilities, so
 * overriding `--color-primary` at runtime repainted nothing. tokens.css now
 * declares the brand colours on `:root` and the theme resolves through them.
 */
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
    await waitFor(() => expect(read("--brand-primary")).toBe("#7d3c98"));
  });

  // Light and dark variants are derived, so a school only ever supplies one
  // colour and still gets a usable set.
  it("derives a lighter and a darker variant from the one colour", async () => {
    serveBranding({ primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary-light")).not.toBe(""));
    expect(read("--brand-primary-dark")).not.toBe("");
    expect(read("--brand-primary-light")).not.toBe(read("--brand-primary-dark"));
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
    expect(read("--brand-primary-light")).not.toMatch(/NaN/);
  });

  /**
   * A school that picks its own colour should not be left with Markova's blue
   * washes behind it, but one that never changes it must look exactly as
   * designed — so the derived tints are only set when the colour differs.
   */
  it("derives the washes from a custom colour", async () => {
    serveBranding({ primaryColor: "#7D3C98" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-accent")).not.toBe(""));
    expect(read("--brand-accent-light")).not.toBe(read("--brand-accent"));
    expect(read("--brand-info")).toBe("#7d3c98");
  });

  it("leaves the designed washes alone on the default colour", async () => {
    serveBranding({ primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).toBe("#1b4f72"));
    expect(read("--brand-accent")).toBe("");
    expect(read("--brand-accent-light")).toBe("");
  });

  /**
   * A fixed mix toward white does not hold across hues: the 86% that leaves a
   * navy at 7:1 leaves a mid-green at 4.23:1, which is below AA and was
   * showing up on badge text across every page once the brand colour started
   * being applied at all.
   */
  it("derives washes the school's own colour still reads on", async () => {
    serveBranding({ primaryColor: "#25741b" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-accent")).not.toBe(""));

    const { contrastRatio } = await import("@/lib/brand-color");
    for (const wash of ["--brand-accent", "--brand-accent-light"]) {
      expect(contrastRatio("#25741b", read(wash))).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Nothing paler than white exists, so a colour that only just reads on it
  // cannot carry a wash. The designed neutrals stay rather than a failing pair
  // being applied.
  it("keeps the designed washes for a colour too weak to carry one", async () => {
    serveBranding({ primaryColor: "#767676" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).toBe("#767676"));
    expect(read("--brand-accent")).toBe("");
    expect(read("--brand-accent-light")).toBe("");
  });

  it("re-applies the colour when settings change it later", async () => {
    serveBranding({ primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).toBe("#1b4f72"));
    useBrandStore.setState({ primaryColor: "#C0392B" });
    await waitFor(() => expect(read("--brand-primary")).toBe("#c0392b"));
  });
});
