import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { contrastRatio } from "@/lib/brand-color";
import { BrandProvider } from "./brand-provider";
import { useBrandStore } from "@/stores/brand-store";
import { useAuthStore } from "@/stores/auth-store";

const defaults = useBrandStore.getState();

beforeEach(() => {
  useBrandStore.setState(defaults, true);
  document.documentElement.style.cssText = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null, isAuthenticated: false });
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
    serveBranding({ primaryColor: "#1F5C86" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary-light")).not.toBe(""));
    expect(read("--brand-primary-dark")).not.toBe("");
    expect(read("--brand-primary-light")).not.toBe(read("--brand-primary-dark"));
  });

  /**
   * Solid brand fills (the unread badge in Messages) carry this as their text
   * colour, and it is chosen against the fill the palette actually paints -
   * which for a bright colour is the darkened, readable form of it, not the
   * raw hex the school typed.
   */
  it("picks text that reads on the fill it will be drawn on", async () => {
    serveBranding({ primaryColor: "#F1C40F" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-on-primary")).not.toBe(""));
    const fill = read("--brand-primary");
    const text = read("--brand-on-primary");
    expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * `--brand-primary` is the colour of every link and label in the app, on a
   * white card. A school choosing a mid-green would otherwise fail AA on
   * every page at once, without ever being told.
   */
  it("keeps the school's colour readable as text on a card", async () => {
    serveBranding({ primaryColor: "#2A8D50" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).not.toBe(""));
    expect(contrastRatio(read("--brand-primary"), "#FFFFFF")).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("leaves a colour that already reads exactly as it was given", async () => {
    serveBranding({ primaryColor: "#1F5C86" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).toBe("#1f5c86"));
  });

  it("uses white on a dark school colour", async () => {
    serveBranding({ primaryColor: "#1F5C86" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() =>
      expect(read("--brand-on-primary").toLowerCase()).toBe("#ffffff"),
    );
  });

  it("stores the school name for the rest of the shell", async () => {
    serveBranding({ schoolName: "Groupe Scolaire Kigali", primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() =>
      expect(useBrandStore.getState().schoolName).toBe("Groupe Scolaire Kigali"),
    );
  });

  /* Signed in, the person's own school: switching to their other school
     changes the name and colour with it. */
  it("asks for the branding of the school that is open", async () => {
    serveBranding({ schoolName: "G.S. Umucyo" });
    useAuthStore.setState({
      user: {
        id: "u-2",
        role: "PARENT",
        firstName: "Aline",
        lastName: "Uwase",
        email: null,
        phone: null,
        photoUrl: null,
        forcePasswordChange: false,
        school: { id: "s-2", name: "G.S. Umucyo", slug: "gs-umucyo" },
      },
      isAuthenticated: true,
    });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/school-config/public"),
        { headers: { "X-School": "gs-umucyo" } },
      ),
    );
  });

  it("names no school before anybody signs in", async () => {
    serveBranding({ schoolName: "Markova Academy" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/school-config/public"),
        { headers: undefined },
      ),
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
   * designed - so the derived tints are only set when the colour differs.
   */
  it("derives the washes from a custom colour", async () => {
    serveBranding({ primaryColor: "#7D3C98" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-accent")).not.toBe(""));
    expect(read("--brand-accent-light")).not.toBe(read("--brand-accent"));
    expect(read("--brand-info")).toBe("#7d3c98");
  });

  /**
   * The untouched install sets nothing at all, and that is load-bearing now
   * rather than tidy.
   *
   * These are inline styles, which beat every rule in a stylesheet including
   * the dark palette's. Re-asserting the designed navy here would win over
   * the dark block and leave a near-invisible navy on a dark card - on the
   * one install nobody has customised. Removing them hands the colour back
   * to tokens.css, which has a value for each theme.
   */
  it("hands the default colour back to the stylesheet", async () => {
    serveBranding({ primaryColor: "#1B4F72" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() =>
      expect(useBrandStore.getState().primaryColor).toBe("#1B4F72"),
    );
    for (const name of [
      "--brand-primary",
      "--brand-primary-light",
      "--brand-primary-dark",
      "--brand-on-primary",
      "--brand-accent",
      "--brand-accent-light",
      "--brand-info-wash",
    ]) {
      expect(read(name)).toBe("");
    }
  });

  /* And a school that has chosen its own colour still gets it inline, which
     is what makes the school's colour beat the designed one. */
  it("sets a school's own colour inline so it wins", async () => {
    serveBranding({ primaryColor: "#7D3C98" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).toBe("#7d3c98"));
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

  /**
   * A colour with no room for a readable wash is darkened until it has room,
   * rather than being handed the designed neutrals - which are a pale blue,
   * checked once against the designed navy. A school that chose green was
   * getting green-on-blue at 3.7:1 on every sidebar item in the app.
   */
  it("gives even a weak colour washes of its own", async () => {
    serveBranding({ primaryColor: "#767676" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-accent")).not.toBe(""));
    expect(
      contrastRatio(read("--brand-primary"), read("--brand-accent")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("re-applies the colour when settings change it later", async () => {
    serveBranding({ primaryColor: "#1F5C86" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary")).toBe("#1f5c86"));
    useBrandStore.setState({ primaryColor: "#C0392B" });
    await waitFor(() => expect(read("--brand-primary")).toBe("#c0392b"));
  });
});

/**
 * The fill behind the secondary button.
 *
 * `primaryLight` is not only a hover tint: a secondary button is a solid fill
 * of it carrying `onPrimary` as text. Lightening the school's colour by a
 * fixed 18% and hoping is what this did, and a school choosing a mid-green
 * got white on #448D74 at 3.95:1 across every page with a secondary button on
 * it, with no way of knowing.
 */
describe("a school's colour as a solid fill", () => {
  it.each(["#1B7456", "#2A8D50", "#7D3C98", "#C0392B", "#B7950B"])(
    "keeps the text on the lighter variant readable for %s",
    async (brand) => {
      serveBranding({ primaryColor: brand });
      render(<BrandProvider><span>x</span></BrandProvider>);
      await waitFor(() => expect(read("--brand-primary-light")).not.toBe(""));
      expect(
        contrastRatio(read("--brand-primary-light"), read("--brand-on-primary")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  /* It has to stay lighter than the base, or it is not a lighter variant. The
     walk stops at the base itself, which is the worst acceptable answer. */
  it("is still a lift rather than the same colour back", async () => {
    serveBranding({ primaryColor: "#7D3C98" });
    render(<BrandProvider><span>x</span></BrandProvider>);
    await waitFor(() => expect(read("--brand-primary-light")).not.toBe(""));
    expect(read("--brand-primary-light")).not.toBe(read("--brand-primary"));
  });
});
