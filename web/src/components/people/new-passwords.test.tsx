import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NewPasswords } from "./new-passwords";

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Person ${i + 1}`,
    login: `p${i + 1}@markova.edu`,
    password: `Pw${i + 1}!abcd`,
  }));

afterEach(() => vi.restoreAllMocks());

describe("NewPasswords", () => {
  it("shows nothing when the import made nobody", () => {
    const { container } = render(<NewPasswords credentials={[]} fileName="x.csv" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists six and puts the rest in the file", () => {
    render(<NewPasswords credentials={people(8)} fileName="x.csv" />);
    expect(screen.getByText("Pw6!abcd")).toBeInTheDocument();
    expect(screen.queryByText("Pw7!abcd")).toBeNull();
    expect(screen.getByText(/2 more in the file/)).toBeInTheDocument();
  });

  it("downloads every password as a CSV under the name given", () => {
    const made: Blob[] = [];
    vi.spyOn(window.URL, "createObjectURL").mockImplementation((b) => {
      made.push(b as Blob);
      return "blob:x";
    });
    vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("teacher_credentials.csv");
    });
    render(<NewPasswords credentials={people(2)} fileName="teacher_credentials.csv" />);
    fireEvent.click(screen.getByRole("button", { name: /download credentials csv/i }));
    expect(click).toHaveBeenCalled();
    expect(made[0].type).toBe("text/csv");
  });
});
