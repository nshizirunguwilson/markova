import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as the page's only h1", () => {
    const { container } = render(<PageHeader title="Students" />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Students");
  });

  it("uses the foreground token, never a hardcoded brand hex", () => {
    // 14 pages used to hardcode #1B4F72 here, which ignored the school's own
    // colour. Everything goes through this component now.
    const { container } = render(<PageHeader title="Analytics" />);
    const cls = container.querySelector("h1")!.className;
    expect(cls).toContain("text-foreground");
    expect(cls).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it("renders a description when given one", () => {
    render(<PageHeader title="Students" description="412 students enrolled" />);
    expect(screen.getByText("412 students enrolled")).toBeTruthy();
  });

  it("omits the description element entirely when absent", () => {
    const { container } = render(<PageHeader title="Students" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renders actions alongside the title", () => {
    render(
      <PageHeader title="Students" actions={<button>Export</button>} />
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("accepts a node title so dashboards can greet by name", () => {
    render(<PageHeader title={<>Welcome back, <strong>Aline</strong></>} />);
    expect(screen.getByText("Aline")).toBeTruthy();
  });
});
