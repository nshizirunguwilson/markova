import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { mediaUrl } from "./utils";

describe("mediaUrl", () => {
  const original = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000/api";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = original;
  });

  it("returns undefined for empty input", () => {
    expect(mediaUrl(undefined)).toBeUndefined();
    expect(mediaUrl(null)).toBeUndefined();
    expect(mediaUrl("")).toBeUndefined();
  });

  it("points stored uploads at the API origin, not the web origin", () => {
    // This is the whole point: the web app runs on :3001 but the files are
    // served by the API on :3000, outside the /api prefix.
    expect(mediaUrl("/uploads/photos/abc.png")).toBe(
      "http://localhost:3000/uploads/photos/abc.png"
    );
  });

  it("strips the /api suffix rather than nesting it", () => {
    expect(mediaUrl("/uploads/branding/crest.png")).not.toContain("/api/");
  });

  it("tolerates a trailing slash on the configured API URL", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000/api/";
    expect(mediaUrl("/uploads/x.png")).toBe("http://localhost:3000/uploads/x.png");
  });

  it("adds the missing slash on a relative path", () => {
    expect(mediaUrl("uploads/x.png")).toBe("http://localhost:3000/uploads/x.png");
  });

  it("leaves absolute URLs and data URIs untouched", () => {
    expect(mediaUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png"
    );
    expect(mediaUrl("http://example.com/a.png")).toBe("http://example.com/a.png");
    expect(mediaUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(mediaUrl("blob:http://x/y")).toBe("blob:http://x/y");
  });
});
