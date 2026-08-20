import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("falls back to the inline Markova mark when no crest is uploaded", () => {
    const { container } = render(<Logo />);
    // Inlined, so it cannot 404 and costs no request.
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
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
    expect(container.querySelector("svg")).toBeNull();
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
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("64");
    expect(svg?.getAttribute("height")).toBe("64");
  });

  it("is hidden from screen readers — the school name carries the meaning", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });
});
