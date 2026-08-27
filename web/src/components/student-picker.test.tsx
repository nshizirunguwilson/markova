import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() } };
});

vi.mock("@/lib/api", () => ({ default: h.api }));

import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/harness";
import { StudentPicker } from "./student-picker";

/**
 * Shaped like `GET /users?role=STUDENT`: the class hangs off `student`, not
 * off the user, and the id the picker emits is the Student record id rather
 * than the user id.
 */
const row = (
  id: string,
  firstName: string,
  lastName: string,
  className: string,
  idNumber: string,
) => ({
  id: `u-${id}`,
  firstName,
  lastName,
  role: "STUDENT",
  student: {
    id,
    studentIdNumber: idNumber,
    status: "ACTIVE",
    classSection: {
      name: className.slice(-1),
      classLevel: { name: className.slice(0, -2) },
      trade: null,
    },
  },
});

const keza = row("student-1", "Keza", "Mutesi", "Senior 2 A", "STD-2026-001");
const divine = row("student-2", "Divine", "Niyonkuru", "Senior 3 B", "STD-2026-002");

/** Answers /users, honouring the `search` term the picker sends. */
function serveStudents(all = [keza, divine]) {
  h.api.get.mockImplementation((url: string) => {
    const term = new URL(url, "http://x").searchParams.get("search");
    const data = term
      ? all.filter((u) =>
          `${u.firstName} ${u.lastName} ${u.student.studentIdNumber}`
            .toLowerCase()
            .includes(term.toLowerCase()),
        )
      : all;
    return Promise.resolve({
      data: { data, meta: { total: data.length, page: 1, limit: 8, totalPages: 1 } },
    });
  });
}

function mount(onChange = vi.fn(), value = "") {
  renderWithProviders(<StudentPicker value={value} onChange={onChange} />);
  return onChange;
}

const box = () => screen.getByRole("combobox", { name: /student/i });

beforeEach(() => {
  vi.clearAllMocks();
  serveStudents();
});

/**
 * Finding one student out of a school.
 *
 * This was three dependent dropdowns — Level, then Section, then Student —
 * so looking somebody up required knowing their class first.
 */
describe("picking a student by searching", () => {
  it("offers students as soon as the box is focused", async () => {
    mount();
    fireEvent.focus(box());
    expect(await screen.findByRole("option", { name: /Keza/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Divine/ })).toBeInTheDocument();
  });

  it("shows the class and the id next to each name", async () => {
    mount();
    fireEvent.focus(box());
    const option = await screen.findByRole("option", { name: /Keza/ });
    // Two students called Keza are told apart by their class, which is the
    // job the level and section dropdowns used to do.
    expect(option.textContent).toContain("Senior 2 A");
    expect(option.textContent).toContain("STD-2026-001");
  });

  it("narrows the list as the name is typed", async () => {
    mount();
    await userEvent.setup().type(box(), "Keza");
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /Divine/ })).toBeNull(),
    );
    expect(screen.getByRole("option", { name: /Keza/ })).toBeInTheDocument();
  });

  it("finds a student by their id number", async () => {
    mount();
    await userEvent.setup().type(box(), "STD-2026-002");
    expect(
      await screen.findByRole("option", { name: /Divine/ }),
    ).toBeInTheDocument();
  });

  it("emits the student record id, not the user id", async () => {
    const onChange = mount();
    fireEvent.focus(box());
    fireEvent.click(await screen.findByRole("option", { name: /Keza/ }));
    expect(onChange).toHaveBeenCalledWith("student-1");
  });

  it("shows who was chosen instead of the search box", async () => {
    const onChange = mount();
    fireEvent.focus(box());
    fireEvent.click(await screen.findByRole("option", { name: /Keza/ }));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/Keza Mutesi/)).toBeInTheDocument();
  });

  it("gives the choice back when it is cleared", async () => {
    const onChange = mount();
    fireEvent.focus(box());
    fireEvent.click(await screen.findByRole("option", { name: /Keza/ }));
    fireEvent.click(screen.getByRole("button", { name: /clear keza/i }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("combobox", { name: /student/i })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    mount();
    await userEvent.setup().type(box(), "Nobody");
    expect(await screen.findByText(/No student matches "Nobody"/)).toBeInTheDocument();
  });

  it("chooses with the keyboard alone", async () => {
    const onChange = mount();
    const input = box();
    fireEvent.focus(input);
    await screen.findByRole("option", { name: /Keza/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("student-2");
  });

  it("wraps around the ends of the list", async () => {
    const onChange = mount();
    const input = box();
    fireEvent.focus(input);
    await screen.findByRole("option", { name: /Keza/ });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("student-2");
  });

  it("closes on Escape without choosing", async () => {
    const onChange = mount();
    const input = box();
    fireEvent.focus(input);
    await screen.findByRole("option", { name: /Keza/ });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when the click lands somewhere else", async () => {
    mount();
    fireEvent.focus(box());
    await screen.findByRole("option", { name: /Keza/ });

    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  });

  it("only asks for students who are still enrolled", async () => {
    mount();
    fireEvent.focus(box());
    await screen.findByRole("option", { name: /Keza/ });
    const url = h.api.get.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("role=STUDENT");
    expect(url).toContain("studentStatus=ACTIVE");
  });

  it("leaves out a row with no student record behind it", async () => {
    serveStudents([keza, { ...divine, student: null } as never]);
    mount();
    fireEvent.focus(box());
    await screen.findByRole("option", { name: /Keza/ });
    expect(screen.queryByRole("option", { name: /Divine/ })).toBeNull();
  });
});
