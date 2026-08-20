import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Logo } from "./logo";
import { useBrandStore } from "@/stores/brand-store";

const resetBrand = () =>
  useBrandStore.setState({
    schoolName: "Markova",
    schoolMotto: "",
    primaryColor: "#1B4F72",
    logoUrl: "",
  });

describe("Logo", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000/api";
    resetBrand();
  });

  it("falls back to Markova's own mark when no crest is uploaded", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/brand/logo-mark.png"
    );
  });

  it("renders the school's crest once one is uploaded", () => {
    useBrandStore.setState({ logoUrl: "/uploads/branding/crest.png" });

    const { container } = render(<Logo />);
    const img = container.querySelector("img");

    expect(img).toBeTruthy();
    // Resolved against the API origin — the reason logos were blank before.
    expect(img?.getAttribute("src")).toBe(
      "http://localhost:3000/uploads/branding/crest.png"
    );
  });

  it("shows the school name beside the mark in the lockup variant", () => {
    useBrandStore.setState({ schoolName: "Groupe Scolaire Kigali" });
    render(<Logo variant="lockup" />);
    expect(screen.getByText("Groupe Scolaire Kigali")).toBeTruthy();
  });

  it("omits the wordmark in the default mark variant", () => {
    useBrandStore.setState({ schoolName: "Groupe Scolaire Kigali" });
    render(<Logo />);
    expect(screen.queryByText("Groupe Scolaire Kigali")).toBeNull();
  });

  it("honours the requested size", () => {
    const { container } = render(<Logo size={64} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("width")).toBe("64");
    expect(img?.getAttribute("height")).toBe("64");
  });

  it("names the image for screen readers", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Markova");

    useBrandStore.setState({ logoUrl: "/uploads/branding/crest.png" });
    const withCrest = render(<Logo />);
    expect(
      withCrest.container.querySelector("img")?.getAttribute("alt")
    ).toContain("logo");
  });

  it("falls back to the Markova mark when a school crest fails to load", () => {
    // Uploaded logos can point at a file that no longer exists.
    useBrandStore.setState({ logoUrl: "/uploads/branding/missing.png" });
    const { container } = render(<Logo />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/brand/logo-mark.png"
    );
  });

  it("ignores a school crest when asked for the product mark only", () => {
    useBrandStore.setState({ logoUrl: "/uploads/branding/crest.png" });
    const { container } = render(<Logo productOnly />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/brand/logo-mark.png"
    );
  });
});
