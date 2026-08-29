import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import { errorMessage } from "./errors";

/** An axios error with no response - the shape of a refused connection. */
const transportError = (code?: string) => {
  const e = new AxiosError("Network Error", code);
  return e;
};

/** An axios error carrying a real HTTP response. */
const httpError = (status: number, message?: string | string[]) => {
  const e = new AxiosError("Request failed");
  e.response = {
    status,
    data: message === undefined ? {} : { message },
    statusText: "",
    headers: {},
    config: {} as never,
  };
  return e;
};

describe("errorMessage", () => {
  it("never blames credentials when the server is unreachable", () => {
    // The whole point: a refused connection is not a rejected password, and
    // saying so sends people hunting for the wrong problem.
    const msg = errorMessage(transportError(), "Login failed");
    expect(msg).toContain("Cannot reach the server");
    expect(msg).not.toContain("Login failed");
  });

  it("says so when the request timed out", () => {
    expect(errorMessage(transportError("ECONNABORTED"), "Login failed")).toContain(
      "took too long"
    );
  });

  it("does not surface a 500 as a credential problem either", () => {
    const msg = errorMessage(httpError(500), "Login failed");
    expect(msg).toContain("server encountered an error");
  });

  it("prefers the API's own message for a real 4xx", () => {
    expect(errorMessage(httpError(401, "Invalid email or password"), "Login failed")).toBe(
      "Invalid email or password"
    );
  });

  it("unwraps a validation array to its first entry", () => {
    expect(
      errorMessage(httpError(400, ["password must be longer", "email is required"]), "x")
    ).toBe("password must be longer");
  });

  it("falls back when a 4xx carries no message", () => {
    expect(errorMessage(httpError(401), "Login failed")).toBe("Login failed");
  });

  it("falls back for a non-axios error", () => {
    expect(errorMessage(new Error("boom"), "Login failed")).toBe("Login failed");
    expect(errorMessage(null, "Login failed")).toBe("Login failed");
  });
});
