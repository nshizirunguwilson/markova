import { afterEach, describe, expect, it, vi } from "vitest";
import { displayableError } from "./error-display";

const withEnv = (value: string) => {
  vi.stubEnv("NODE_ENV", value);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("what a caught error is allowed to say", () => {
  // A render error carries whatever the throwing code said, which is routinely
  // a file path or a query. That belongs in a log, not on a classroom screen.
  it("hides the raw message outside development", () => {
    withEnv("production");
    const { message } = displayableError(
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.4:5432"), { digest: "d1" }),
    );
    expect(message).not.toContain("ECONNREFUSED");
    expect(message).not.toContain("10.0.0.4");
    expect(message).toMatch(/unexpected error/i);
  });

  it("shows the real message in development, where it is useful", () => {
    withEnv("development");
    const { message } = displayableError(new Error("Cannot read properties of undefined"));
    expect(message).toContain("Cannot read properties");
  });

  it("says something sensible for an error with no message", () => {
    withEnv("development");
    const { message } = displayableError(new Error(""));
    expect(message).toMatch(/unexpected error/i);
  });

  // The digest is the one thing worth showing: it is what someone quotes when
  // they report the problem, and it maps to the log entry.
  it("passes the digest through as a reference", () => {
    withEnv("production");
    const { reference } = displayableError(
      Object.assign(new Error("boom"), { digest: "9f2c1a" }),
    );
    expect(reference).toBe("9f2c1a");
  });

  it("copes with an error that has no digest", () => {
    withEnv("production");
    expect(displayableError(new Error("boom")).reference).toBeUndefined();
  });
});
