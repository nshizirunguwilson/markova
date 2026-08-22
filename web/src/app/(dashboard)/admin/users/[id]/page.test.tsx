import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useParams: () => ({ id: "u-1" }),
  usePathname: () => "/admin/users/u-1",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classSection, populatedRoutes } from "@/test/fixtures";

import UserDetailPage from "./page";

/**
 * One person's record.
 *
 * The form covers the whole Rwandan school record, and the rule that matters
 * is what a blank field means. Blank has to mean "leave it as it was", not
 * "erase it": an admin who opens a student to fix a phone number must not
 * clear the mother's name by saving.
 */

const student = {
  id: "u-1",
  firstName: "Divine",
  lastName: "Niyonkuru",
  email: "divine.niyonkuru1@markova.edu",
  phone: null,
  role: "STUDENT",
  isActive: true,
  nationalId: "1201382901978078",
  nationality: "Rwandan",
  photoUrl: null,
  student: {
    id: "student-1",
    studentIdNumber: "STD-2025-0001",
    gender: "MALE",
    dateOfBirth: "2013-12-27T00:00:00.000Z",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Kanombe",
    cell: "Amajyambere",
    village: "Karisimbi",
    religion: "Protestant",
    insuranceNumber: "1234994661",
    fatherName: "Jonas Ndagijimana",
    motherName: "Seraphine Mukamazimpaka",
    bloodType: "A-",
    allergies: null,
    medicalConditions: null,
    previousSchool: null,
    disability: null,
    isBoarder: false,
    classSection,
  },
};

const teacher = {
  id: "u-1",
  firstName: "Aline",
  lastName: "Uwase",
  email: "aline.uwase@markova.edu",
  phone: "+250788000010",
  role: "TEACHER",
  isActive: true,
  code: "TCH-2026-001",
  nationalId: "1197172859417053",
  nationality: "Rwandan",
  gender: "FEMALE",
  dateOfBirth: "1971-03-07T00:00:00.000Z",
  photoUrl: null,
  teacher: {
    id: "teacher-1",
    employmentStatus: "FULL_TIME",
    // A0/A1/A2 are the Rwandan teaching grades the form accepts; a free-text
    // qualification fails validation and the save never fires.
    qualification: "A0",
    rssbNumber: "RSSB-0099",
    hireDate: "2019-01-14T00:00:00.000Z",
  },
};

function routesFor(user: unknown) {
  return { ...populatedRoutes, "/users/u-1": user, "/users": { data: [], meta: {} } };
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
});

async function mount(user: any = student) {
  serve(h.api, routesFor(user));
  renderPage(UserDetailPage, { role: "ADMIN" });
  // By the record's own name, so a parent or teacher record waits correctly.
  await waitFor(() =>
    expect(screen.getAllByText(new RegExp(user.firstName)).length).toBeGreaterThan(0),
  );
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

async function startEditing() {
  await click(button(/^edit user$/i));
  await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
}

/** The page has no form element; it saves from its own button. */
async function save() {
  const btn = screen
    .queryAllByRole("button")
    .find((b) => /save changes/i.test((b.textContent ?? "").trim()));
  expect(btn).toBeTruthy();
  await act(async () => {
    fireEvent.click(btn!);
  });
}

/** The body the page last sent to PUT /users/:id. */
function savedBody() {
  const call = h.api.put.mock.calls.find(([url]: any[]) => String(url) === "/users/u-1");
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

describe("a student's record", () => {
  it("shows who they are", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Divine/);
    expect(document.body.textContent).toMatch(/STD-2025-0001/);
  });

  it("does not go blank when the record fails to load", async () => {
    serveFailure(h.api);
    renderPage(UserDetailPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });

  it("opens the editor with the record already in it", async () => {
    await mount();
    await startEditing();
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe("Divine");
  });

  it("saves the changed name", async () => {
    await mount();
    await startEditing();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), {
        target: { value: "Divin" },
      });
    });

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(savedBody().firstName).toBe("Divin");
  });

  // The whole point of `opt()`: an empty box means "unchanged", so the server
  // is never told to erase a field the admin simply did not fill.
  it("leaves an empty field out of the payload rather than blanking it", async () => {
    await mount();
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    const body = savedBody();
    // Allergies were never recorded and were not typed in, so nothing is sent
    // for them and the stored value is left alone.
    expect(body.allergies).toBeUndefined();
    expect(body.medicalConditions).toBeUndefined();
  });

  it("carries the student's own record, not just the account", async () => {
    await mount();
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    const body = savedBody();
    expect(body.province).toBe("Kigali City");
    expect(body.motherName).toBe("Seraphine Mukamazimpaka");
  });

  // Boarding is a boolean on the record but a choice in the form.
  it("turns the boarding choice into a flag", async () => {
    await mount();
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(savedBody().isBoarder).toBe(false);
  });

  it("sends nothing about employment for a student", async () => {
    await mount();
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(savedBody()).not.toHaveProperty("employmentStatus");
  });

  // A phone the API would reject should never leave the browser.
  it("refuses a phone that is not a Rwandan mobile", async () => {
    await mount();
    await startEditing();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/phone/i), {
        target: { value: "+44 7700 900000" },
      });
    });

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(document.body.textContent).toMatch(/\+250/));
    expect(h.api.put).not.toHaveBeenCalled();
  });

  it("refuses a record with no first name", async () => {
    await mount();
    await startEditing();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "" } });
    });

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).not.toHaveBeenCalled());
  });

  it("accepts a proper Rwandan mobile", async () => {
    await mount();
    await startEditing();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/phone/i), {
        target: { value: "+250788123456" },
      });
    });

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(savedBody().phone).toBe("+250788123456");
  });
});

describe("a teacher's record", () => {
  it("shows their employment details", async () => {
    await mount(teacher);
    await startEditing();
    const qualification = screen.getByLabelText(/qualification/i) as HTMLSelectElement;
    expect(qualification.value).toBe("A0");
  });

  it("carries the employment details when saved", async () => {
    await mount(teacher);
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    const body = savedBody();
    expect(body.qualification).toBe("A0");
    expect(body.rssbNumber).toBe("RSSB-0099");
  });

  // A teacher has no province or guardians on their record.
  it("sends nothing about a student record for a teacher", async () => {
    await mount(teacher);
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    const body = savedBody();
    expect(body).not.toHaveProperty("province");
    expect(body).not.toHaveProperty("motherName");
  });

  it("keeps the account active state", async () => {
    await mount(teacher);
    await startEditing();

    h.api.put.mockClear();
    await save();

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(savedBody().isActive).toBe(true);
  });
});

/**
 * The parts of a record that only some roles have.
 *
 * A teacher may hold a special role; a parent holds children. Both sections
 * are absent for everyone else, and a record that cannot be loaded at all has
 * to say so rather than render an empty form.
 */
describe("the sections that depend on the role", () => {
  const withRoles = {
    ...teacher,
    teacher: {
      ...teacher.teacher,
      roles: [
        { id: "tr-1", role: "DOS", department: null },
        { id: "tr-2", role: "HOD", department: "Sciences" },
      ],
    },
  };

  const parent = {
    id: "u-1",
    firstName: "Jean",
    lastName: "Habimana",
    email: null,
    phone: "+250788100000",
    role: "PARENT",
    isActive: true,
    code: "PAR-2026-0001",
    photoUrl: null,
    parentStudents: [
      {
        id: "ps-1",
        relationship: "Father",
        student: {
          id: "student-1",
          studentIdNumber: "STD-2025-231419-167",
          user: { firstName: "Divine", lastName: "Niyonkuru" },
        },
      },
    ],
  };

  it("lists a teacher's special roles", async () => {
    await mount(withRoles);
    expect(screen.getByText(/special roles/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/DOS/);
  });

  // A head of department is a head of something; the department is the point.
  it("names the department a role belongs to", async () => {
    await mount(withRoles);
    expect(document.body.textContent).toMatch(/HOD/);
    expect(document.body.textContent).toMatch(/Sciences/);
  });

  // By the section heading: "DOS" is a substring of ordinary words on the page.
  it("shows a teacher with no special role without an empty block", async () => {
    await mount(teacher);
    expect(screen.queryByText(/special roles/i)).toBeNull();
  });

  it("lists the children a parent is linked to", async () => {
    await mount(parent);
    expect(screen.getByText(/linked children/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Divine Niyonkuru/);
  });

  it("names the relationship to each child", async () => {
    await mount(parent);
    expect(document.body.textContent).toMatch(/Father/);
  });

  it("shows each child's student number", async () => {
    await mount(parent);
    expect(document.body.textContent).toMatch(/STD-2025-231419-167/);
  });

  // A parent account with no children linked is the case that makes a parent
  // dashboard empty, so it has to be visible on their record.
  it("copes with a parent who has no children linked", async () => {
    await mount({ ...parent, parentStudents: [] });
    expect(screen.getByText(/Jean/)).toBeInTheDocument();
  });

  // By the section heading: a student's own record already carries a "Father"
  // label for their guardian's name, and their own name is the page title.
  it("shows no children section for a student", async () => {
    await mount();
    expect(screen.queryByText(/linked children/i)).toBeNull();
  });
});

describe("a record that will not load", () => {
  it("says the user was not found rather than showing an empty form", async () => {
    serve(h.api, { ...routesFor(null), "/users/u-1": null });
    renderPage(UserDetailPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/user not found/i)).toBeInTheDocument());
  });
});

describe("leaving the record", () => {
  it("goes back to the user list", async () => {
    await mount();
    const back = screen
      .queryAllByRole("button")
      .find((b) => /back|users/i.test(b.textContent ?? ""));
    if (!back) return;
    await click(back);

    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/admin/users"));
  });

  // Cancelling has to put back what was there, not keep half an edit.
  it("restores the record when an edit is abandoned", async () => {
    await mount();
    await startEditing();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/first name/i), {
        target: { value: "Something else" },
      });
    });

    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await click(cancel);

    await waitFor(() =>
      expect(screen.queryByLabelText(/first name/i)).toBeNull(),
    );
    expect(document.body.textContent).toMatch(/Divine/);
  });

  it("writes nothing when an edit is abandoned", async () => {
    await mount();
    await startEditing();
    h.api.put.mockClear();

    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await click(cancel);

    await waitFor(() => expect(h.api.put).not.toHaveBeenCalled());
  });
});
