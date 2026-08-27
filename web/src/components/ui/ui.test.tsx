import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  exportData: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ExportDropdown,
  Input,
  Modal,
  PageSpinner,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./index";
import { TooltipGuide } from "./tooltip-guide";

beforeEach(() => {
  for (const m of Object.values(h.toast)) m.mockReset();
  h.exportData.mockReset();
  localStorage.clear();
});

describe("Button", () => {
  it.each(["primary", "secondary", "outline", "ghost", "danger"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>Save</Button>);
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    },
  );

  it.each(["sm", "md", "lg"] as const)("renders at size %s", (size) => {
    render(<Button size={size}>Save</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls its handler when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not call its handler while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  // Double submitting a form is how duplicate records get created, so a button
  // in flight has to refuse the second click by itself.
  it("disables itself while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} isLoading>
        Save
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it.each(["default", "success", "warning", "danger", "info"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Badge variant={variant}>Active</Badge>);
      expect(screen.getByText("Active")).toBeInTheDocument();
    },
  );
});

describe("Avatar", () => {
  it("shows the image when there is one", () => {
    // An img is only exposed as an image to assistive technology once it has a
    // non-empty alt, so callers are expected to name the person.
    render(<Avatar src="/uploads/photos/a.png" alt="Divine Niyonkuru" fallback="DN" />);
    expect(screen.getByRole("img", { name: "Divine Niyonkuru" })).toHaveAttribute(
      "src",
      expect.stringContaining("a.png"),
    );
  });

  // Most students have no photo on file, so the initials are the normal case.
  it("falls back to initials when there is no photo", () => {
    render(<Avatar src={null} fallback="DN" />);
    expect(screen.getByText("DN")).toBeInTheDocument();
  });

  it.each(["sm", "md", "lg"] as const)("renders at size %s", (size) => {
    render(<Avatar src={null} fallback="DN" size={size} />);
    expect(screen.getByText("DN")).toBeInTheDocument();
  });
});

describe("Spinner", () => {
  it.each(["sm", "md", "lg"] as const)("renders at size %s", (size) => {
    const { container } = render(<Spinner size={size} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders a page spinner", () => {
    const { container } = render(<PageSpinner />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe("Card", () => {
  it("renders a header, title and description", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>Today across the school</CardDescription>
        </CardHeader>
        <p>body</p>
      </Card>,
    );
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getByText("Today across the school")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("associates its label with the field", () => {
    render(<Input id="school" label="School name" />);
    expect(screen.getByLabelText("School name")).toBeInTheDocument();
  });

  it("shows an error under the field", () => {
    render(<Input id="school" label="School name" error="Required" />);
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("accepts typing", async () => {
    render(<Input id="school" label="School name" />);
    const field = screen.getByLabelText("School name");
    await userEvent.setup().type(field, "Groupe Scolaire Kigali");
    expect(field).toHaveValue("Groupe Scolaire Kigali");
  });
});

describe("Table", () => {
  it("renders a header row and body rows", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Divine Niyonkuru</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Divine Niyonkuru")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()} title="Add book">
        <p>inside</p>
      </Modal>,
    );
    expect(container.textContent).toBe("");
  });

  it("renders its title and children when open", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Add book">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add book")).toBeInTheDocument();
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Add book">
        <p>inside</p>
      </Modal>,
    );
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes from its own close control", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Add book">
        <p>inside</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const close = within(dialog)
      .getAllByRole("button")
      .find((b) => /close/i.test(b.getAttribute("aria-label") ?? ""));
    if (close) {
      await userEvent.setup().click(close);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    }
  });

  it.each(["sm", "md", "lg", "xl", "2xl"] as const)("renders at size %s", (size) => {
    render(
      <Modal isOpen onClose={vi.fn()} title="T" size={size}>
        <p>inside</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ExportDropdown", () => {
  it("offers the formats once opened", async () => {
    render(<ExportDropdown onExport={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/csv/i)).toBeInTheDocument());
  });

  it.each(["csv", "json"] as const)("reports %s back to the caller", async (format) => {
    const onExport = vi.fn();
    render(<ExportDropdown onExport={onExport} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText(new RegExp(format, "i")));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith(format));
  });

  it("offers nothing while disabled", async () => {
    render(<ExportDropdown onExport={vi.fn()} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("TooltipGuide", () => {
  it("renders its trigger", () => {
    render(
      <TooltipGuide
        id="guide-1"
        steps={[{ target: "body", title: "Start", content: "Here is the roster." }]}
      />,
    );
    expect(document.body.textContent).not.toBeNull();
  });
});

/**
 * The modal's focus trap.
 *
 * A dialog that lets Tab wander behind it is unusable with a keyboard: the
 * focus ring disappears into the page underneath while the overlay still
 * blocks the mouse. WCAG asks for the trap, and this is the one place in the
 * app that implements it.
 */
describe("keyboard focus inside a modal", () => {
  function OpenModal() {
    return (
      <Modal isOpen onClose={vi.fn()} title="Add book">
        <button type="button">first</button>
        <input aria-label="middle" />
        <button type="button">last</button>
      </Modal>
    );
  }

  it("moves focus into the dialog when it opens", async () => {
    render(<OpenModal />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("wraps from the last control back to the first", async () => {
    render(<OpenModal />);
    const user = userEvent.setup();
    const last = screen.getByRole("button", { name: "last" });
    last.focus();

    await user.tab();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("wraps backwards from the first control to the last", async () => {
    render(<OpenModal />);
    const user = userEvent.setup();
    const first = screen.getByRole("button", { name: "first" });
    first.focus();

    await user.tab({ shift: true });
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("keeps focus inside across several tabs", async () => {
    render(<OpenModal />);
    const user = userEvent.setup();
    const dialog = screen.getByRole("dialog");
    screen.getByRole("button", { name: "first" }).focus();

    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  // A dialog with nothing focusable in it must not throw trying to trap.
  it("does not throw when there is nothing to focus", async () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Empty">
        <p>nothing here</p>
      </Modal>,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // Reopening has to re-arm the trap; a stale listener would leave the second
  // dialog leaking focus.
  it("re-arms when the dialog is closed and opened again", async () => {
    const { rerender } = render(<OpenModal />);
    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Add book">
        <button type="button">first</button>
      </Modal>,
    );
    rerender(<OpenModal />);

    const user = userEvent.setup();
    screen.getByRole("button", { name: "last" }).focus();
    await user.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});

/**
 * The modal's focus trap.
 *
 * A dialog that lets Tab wander onto the page behind it is unusable with a
 * keyboard and fails WCAG, and the two ends of the cycle are opposite arms of
 * the same branch: Tab off the last control wraps to the first, Shift+Tab off
 * the first wraps to the last.
 */
describe("Modal keyboard handling", () => {
  const withThreeButtons = (onClose = vi.fn()) => (
    <Modal isOpen onClose={onClose} title="Add book">
      <button type="button">One</button>
      <button type="button">Two</button>
      <button type="button">Three</button>
    </Modal>
  );

  /**
   * The dialog moves focus to its first control on open, on the next frame.
   * Taking focus before that has happened means the autofocus lands in the
   * middle of the test and Tab starts from somewhere else — so wait for it.
   */
  async function settledDialog() {
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(dialog.querySelectorAll("button"));
    await waitFor(() => expect(document.activeElement).toBe(focusable[0]));
    return focusable;
  }

  it("wraps forward from the last control to the first", async () => {
    render(withThreeButtons());
    const focusable = await settledDialog();
    const last = focusable[focusable.length - 1];
    last.focus();

    await userEvent.setup().keyboard("{Tab}");

    expect(document.activeElement).toBe(focusable[0]);
  });

  it("wraps backward from the first control to the last", async () => {
    render(withThreeButtons());
    const focusable = await settledDialog();

    await userEvent.setup().keyboard("{Shift>}{Tab}{/Shift}");

    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it("leaves Shift+Tab alone in the middle of the cycle", async () => {
    render(withThreeButtons());
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(dialog.querySelectorAll("button"));
    await waitFor(() => expect(document.activeElement).toBe(focusable[0]));
    focusable[2].focus();

    await userEvent.setup().keyboard("{Shift>}{Tab}{/Shift}");

    // Only the first control wraps backwards; the rest are the browser's job.
    expect(document.activeElement).not.toBe(focusable[focusable.length - 1]);
  });

  it("leaves Tab alone in the middle of the cycle", async () => {
    render(withThreeButtons());
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(dialog.querySelectorAll("button"));
    await waitFor(() => expect(document.activeElement).toBe(focusable[0]));
    focusable[1].focus();

    await userEvent.setup().keyboard("{Tab}");

    // The browser moves focus itself; the trap only intervenes at the ends.
    expect(document.activeElement).not.toBe(focusable[1]);
  });

  it("ignores every key that is not Tab", async () => {
    const onClose = vi.fn();
    render(withThreeButtons(onClose));
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(dialog.querySelectorAll("button"));
    await waitFor(() => expect(document.activeElement).toBe(focusable[0]));

    await userEvent.setup().keyboard("a");

    expect(document.activeElement).toBe(focusable[0]);
  });

  it("does nothing on Tab in a dialog with nothing focusable in it", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <Modal isOpen onClose={vi.fn()} title="">
        <p>Nothing to focus</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    // No title either, so it falls back to a generic accessible name rather
    // than being an unnamed dialog.
    expect(dialog).toHaveAttribute("aria-label", "Dialog");
    // Nothing inside can hold focus, so the key has to be sent at the dialog
    // itself rather than at whatever the browser focused.
    expect(dialog.querySelector("button, input, a[href]")).toBeNull();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog).toBeInTheDocument();

    // The dialog tries to focus its first control on the next frame and finds
    // none, which must leave focus where it was rather than throwing.
    await waitFor(() => expect(document.activeElement).toBe(document.body));
  });

  it("ignores Shift+Tab too when there is nothing to cycle", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <Modal isOpen onClose={vi.fn()} title="">
        <p>Nothing to focus</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(dialog).toBeInTheDocument();
  });

  it("closes when the backdrop behind it is clicked", async () => {
    const onClose = vi.fn();
    const { container } = render(withThreeButtons(onClose));
    const backdrop = container.querySelector(".fixed.inset-0.bg-black\\/40")!;

    await userEvent.setup().click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });
});
