import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { TeacherDutiesCard } from "./teacher-duties-card";

const sections = [
  { id: "class-s2a", name: "A", classLevel: { name: "S2" } },
  { id: "class-s3b", name: "B", classLevel: { name: "S3" } },
];

const show = (duties: any[] = []) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TeacherDutiesCard teacherId="tch-aline" duties={duties} />
    </QueryClientProvider>,
  );

/* Only the seed could name class teachers, so a real school never could. */
describe("a teacher's duties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: sections });
    api.post.mockResolvedValue({ data: { replaced: null } });
    api.delete.mockResolvedValue({ data: {} });
  });

  it("names a teacher class teacher of the class chosen", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /add a duty/i }));
    await screen.findByRole("option", { name: "S2 A" });
    fireEvent.change(screen.getByLabelText("Class they lead"), { target: { value: "class-s2a" } });
    fireEvent.click(screen.getByRole("button", { name: "Add duty" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/academic/teachers/tch-aline/duties", {
        role: "CLASS_TEACHER",
        classSectionId: "class-s2a",
      }),
    );
  });

  it("will not save a class teacher without a class", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /add a duty/i }));
    expect(screen.getByRole("button", { name: "Add duty" })).toHaveProperty("disabled", true);
  });

  it("says who the class was handed over from", async () => {
    api.post.mockResolvedValue({ data: { replaced: "Jean Habimana" } });
    show();
    fireEvent.click(screen.getByRole("button", { name: /add a duty/i }));
    fireEvent.change(screen.getByLabelText("Duty"), { target: { value: "HOD" } });
    fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Sciences" } });
    fireEvent.click(screen.getByRole("button", { name: "Add duty" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Handed over from Jean Habimana"));
    expect(api.post.mock.calls[0][1]).toEqual({ role: "HOD", department: "Sciences" });
  });

  it("ends a duty", async () => {
    show([{ id: "duty-1", role: "DOS" }]);
    fireEvent.click(screen.getByRole("button", { name: "End duty: Director of Studies" }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/academic/teachers/tch-aline/duties/duty-1"),
    );
  });
});
