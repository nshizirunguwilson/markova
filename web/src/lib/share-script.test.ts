import { describe, expect, it } from "vitest";

// @ts-expect-error — a plain .mjs script, imported here for its two helpers.
import { apiUrlFrom, setEnv } from "../../../scripts/share.mjs";

/**
 * `scripts/share.mjs` points both halves of Markova at a forwarded address.
 *
 * The web app is not self-contained: the browser it runs in calls the API
 * directly, so forwarding 3001 alone gives a visitor a login page whose every
 * request goes to *their* localhost:3000. Getting the derived API address
 * wrong produces exactly that failure, silently, on somebody else's machine —
 * which is the worst place to find out.
 */
describe("working out the API address from the forwarded web one", () => {
  it("swaps the port in a dev tunnel hostname", () => {
    expect(apiUrlFrom("https://v0k7pbb7-3001.inc1.devtunnels.ms")).toBe(
      "https://v0k7pbb7-3000.inc1.devtunnels.ms/api",
    );
  });

  it("ignores a trailing slash", () => {
    expect(apiUrlFrom("https://v0k7pbb7-3001.inc1.devtunnels.ms/")).toBe(
      "https://v0k7pbb7-3000.inc1.devtunnels.ms/api",
    );
  });

  it("handles the same shape from other tunnels", () => {
    expect(apiUrlFrom("https://abc-3001.ngrok.io")).toBe(
      "https://abc-3000.ngrok.io/api",
    );
  });

  it("handles a real port rather than one in the hostname", () => {
    expect(apiUrlFrom("http://localhost:3001")).toBe("http://localhost:3000/api");
    expect(apiUrlFrom("http://192.168.1.20:3001")).toBe(
      "http://192.168.1.20:3000/api",
    );
  });

  /**
   * Guessing here would be worse than refusing: a wrong API address is a
   * visitor staring at "Cannot reach the server" with nothing to go on.
   */
  it("refuses to guess when the port is nowhere to be found", () => {
    expect(apiUrlFrom("https://school.example.com")).toBeNull();
  });

  it("refuses anything that is not an address", () => {
    expect(apiUrlFrom("not a url")).toBeNull();
    expect(apiUrlFrom("")).toBeNull();
  });

  // A tunnel that forwards some other port is not this app's web server.
  it("leaves an unrelated port alone", () => {
    expect(apiUrlFrom("https://v0k7pbb7-8080.inc1.devtunnels.ms")).toBeNull();
  });
});

/**
 * Both settings live in files that hold other things — JWT secrets, the
 * database URL. Rewriting them wholesale would take somebody's whole
 * configuration with it.
 */
describe("writing one setting into an env file", () => {
  it("replaces the line that is already there", () => {
    const before = "DATABASE_URL=postgres://x\nCORS_ORIGINS=http://localhost:3001\nJWT_SECRET=s\n";
    const after = setEnv(before, "CORS_ORIGINS", "https://tunnel");
    expect(after).toContain("CORS_ORIGINS=https://tunnel");
    expect(after).toContain("DATABASE_URL=postgres://x");
    expect(after).toContain("JWT_SECRET=s");
    expect(after).not.toContain("http://localhost:3001");
  });

  it("adds the line when the file has no such setting", () => {
    const after = setEnv("DATABASE_URL=postgres://x\n", "CORS_ORIGINS", "https://tunnel");
    expect(after).toContain("DATABASE_URL=postgres://x");
    expect(after).toContain("CORS_ORIGINS=https://tunnel");
  });

  it("works on an empty file", () => {
    expect(setEnv("", "NEXT_PUBLIC_API_URL", "https://x/api")).toBe(
      "\nNEXT_PUBLIC_API_URL=https://x/api\n",
    );
  });

  // A key that is a prefix of another must not be mistaken for it.
  it("does not touch a setting whose name merely starts the same", () => {
    const before = "CORS_ORIGINS_EXTRA=keep\nCORS_ORIGINS=replace\n";
    const after = setEnv(before, "CORS_ORIGINS", "new");
    expect(after).toContain("CORS_ORIGINS_EXTRA=keep");
    expect(after).toContain("CORS_ORIGINS=new");
  });
});
