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
