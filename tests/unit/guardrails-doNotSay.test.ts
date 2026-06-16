import { describe, it, expect } from "vitest";
import { findDoNotSayPhrase, assertNoDoNotSay, DoNotSayViolationError } from "../../worker/src/guardrails/doNotSay";

const LIST = ["guaranteed outcome", "all courts agree", "definitive", "proven fact"];

describe("guardrails/doNotSay.ts", () => {
  it("finds a forbidden phrase case-insensitively", () => {
    expect(findDoNotSayPhrase("This is a GUARANTEED OUTCOME for the client.", LIST)).toBe("guaranteed outcome");
  });

  it("returns null when no forbidden phrase is present", () => {
    expect(findDoNotSayPhrase("This is a measured, scoped statement.", LIST)).toBeNull();
  });

  it("assertNoDoNotSay passes for clean fields", () => {
    expect(() =>
      assertNoDoNotSay({ headline: "Court issues narrow ruling", body: ["Scoped paragraph one."] }, LIST),
    ).not.toThrow();
  });

  it("assertNoDoNotSay throws DoNotSayViolationError naming the offending field", () => {
    expect(() => assertNoDoNotSay({ headline: "This is a proven fact, say the filings." }, LIST)).toThrow(
      DoNotSayViolationError,
    );
  });

  it("assertNoDoNotSay checks every element of array fields", () => {
    expect(() =>
      assertNoDoNotSay({ body_paragraphs: ["Fine paragraph.", "All courts agree on this point."] }, LIST),
    ).toThrow(DoNotSayViolationError);
  });
});
