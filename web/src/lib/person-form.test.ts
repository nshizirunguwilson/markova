import { describe, it, expect } from "vitest";
import {
  formatNid,
  nidDigits,
  validateNid,
  generatePassword,
  suggestEmail,
} from "./person-form";

describe("national ID mask", () => {
  it("groups digits as printed on the card", () => {
    expect(formatNid("1201270123456012")).toBe("1 2012 7 0123456 0 12");
  });
  it("strips everything but digits and caps at 16", () => {
    expect(nidDigits("1 2012-7 0123456 0 12 999")).toBe("1201270123456012");
  });
  it("formats partial input while typing", () => {
    expect(formatNid("120")).toBe("1 20");
  });
});

describe("national ID validation", () => {
  it("accepts a valid female ID matching gender and DOB", () => {
    expect(validateNid("1201270123456012", "FEMALE", "2012-05-15")).toBeNull();
  });
  it("rejects wrong length", () => {
    expect(validateNid("12012")).toMatch(/16 digits/);
  });
  it("rejects a bad status digit", () => {
    expect(validateNid("9201270123456012")).toMatch(/First digit/);
  });
  it("rejects an impossible birth year", () => {
    expect(validateNid("1189970123456012")).toMatch(/1899/);
  });
  it("rejects a male digit for a female profile", () => {
    expect(validateNid("1201280123456012", "FEMALE")).toMatch(/male digit/);
  });
  it("rejects a year that contradicts the date of birth", () => {
    expect(validateNid("1201070123456012", "FEMALE", "2012-01-01")).toMatch(
      /2010/,
    );
  });
});

describe("password generator", () => {
  it("always satisfies the backend policy", () => {
    const policy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).toMatch(policy);
    }
  });
});

describe("email suggestion", () => {
  it("builds the school convention from the first tokens", () => {
    expect(suggestEmail("Keza Ineza", "Uwase Mahoro")).toBe(
      "keza.uwase@markova.edu",
    );
  });
  it("returns empty when a name is missing", () => {
    expect(suggestEmail("", "Uwase")).toBe("");
  });
});
