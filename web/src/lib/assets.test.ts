import { describe, expect, it } from "vitest";

import { resolveUploadUrl } from "./assets";

/**
 * Uploaded files live on the API's origin, not the web app's, so a bare
 * `/uploads/...` path has to be pointed there - and nothing else touched.
 */
describe("resolveUploadUrl", () => {
  it("answers null for nothing", () => {
    expect(resolveUploadUrl(null)).toBeNull();
    expect(resolveUploadUrl(undefined)).toBeNull();
    expect(resolveUploadUrl("")).toBeNull();
  });

  it("leaves an absolute URL and a data URI alone", () => {
    expect(resolveUploadUrl("https://cdn.example.rw/x.png")).toBe(
      "https://cdn.example.rw/x.png",
    );
    expect(resolveUploadUrl("//cdn.example.rw/x.png")).toBe(
      "//cdn.example.rw/x.png",
    );
    expect(resolveUploadUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("points an uploads path at the API origin, with one slash", () => {
    const resolved = resolveUploadUrl("/uploads/branding/logo.png");
    expect(resolved).toMatch(/\/uploads\/branding\/logo\.png$/);
    expect(resolved).not.toContain("//uploads");

    const bare = resolveUploadUrl("uploads/branding/logo.png");
    expect(bare).toMatch(/\/uploads\/branding\/logo\.png$/);
  });
});
