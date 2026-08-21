import { describe, expect, it } from "vitest";
import { apiError, fixtures, mockApi, signIn, signOut } from "./harness";
import { useAuthStore } from "@/stores/auth-store";

describe("test harness", () => {
  it("signs a user in and out of the auth store", () => {
    const user = signIn("TEACHER");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.role).toBe("TEACHER");
    expect(user.email).toContain("@markova.edu");
    signOut();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("serves a declared route", async () => {
    const api = mockApi({ "/academic/years": [fixtures.academicYear] });
    await expect(api.get("/academic/years")).resolves.toMatchObject({
      data: [fixtures.academicYear],
    });
  });

  it("prefers the longest matching route", async () => {
    const api = mockApi({ "/marks": "short", "/marks/term-results": "long" });
    const res = await api.get("/marks/term-results/student/1");
    expect(res.data).toBe("long");
  });

  it("rejects a url nothing declared, rather than hanging", async () => {
    const api = mockApi({});
    await expect(api.get("/nowhere")).rejects.toThrow(/No mock route/);
  });

  it("passes the request body to a function handler", async () => {
    const api = mockApi({ "/academic/years": (body: unknown) => body });
    const res = await api.post("/academic/years", { name: "2027-2028" });
    expect(res.data).toEqual({ name: "2027-2028" });
  });

  it("builds an axios shaped error", () => {
    const err = apiError(403, "Forbidden");
    expect(err.response.status).toBe(403);
    expect(err.response.data.message).toBe("Forbidden");
  });

  it("keeps fixtures Rwandan, matching the seed", () => {
    expect(fixtures.student.user.firstName).toBe("Divine");
    expect(fixtures.teacher.user.email).toMatch(/@markova\.edu$/);
  });
});
