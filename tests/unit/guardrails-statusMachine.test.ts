import { describe, it, expect } from "vitest";
import {
  canTransitionOutputStatus,
  assertOutputStatusTransition,
  applyApprovalAction,
  canTransitionInboxStatus,
  assertInboxStatusTransition,
  InvalidStatusTransitionError,
} from "../../worker/src/guardrails/statusMachine";

describe("guardrails/statusMachine.ts — output status", () => {
  it("allows HOLD -> approved", () => {
    expect(canTransitionOutputStatus("HOLD — pending approval", "approved")).toBe(true);
  });

  it("allows HOLD -> archived", () => {
    expect(canTransitionOutputStatus("HOLD — pending approval", "archived")).toBe(true);
  });

  it("rejects approved -> anything (terminal state)", () => {
    expect(canTransitionOutputStatus("approved", "archived")).toBe(false);
    expect(() => assertOutputStatusTransition("approved", "archived")).toThrow(InvalidStatusTransitionError);
  });

  it("applyApprovalAction maps approve/archive correctly from HOLD", () => {
    expect(applyApprovalAction("HOLD — pending approval", "approve")).toBe("approved");
    expect(applyApprovalAction("HOLD — pending approval", "archive")).toBe("archived");
  });

  it("applyApprovalAction throws if the output is no longer in HOLD", () => {
    expect(() => applyApprovalAction("approved", "approve")).toThrow(InvalidStatusTransitionError);
  });
});

describe("guardrails/statusMachine.ts — inbox status", () => {
  it("allows fetched -> selected -> ingested", () => {
    expect(canTransitionInboxStatus("fetched", "selected")).toBe(true);
    expect(canTransitionInboxStatus("selected", "ingested")).toBe(true);
  });

  it("allows fetched -> rejected", () => {
    expect(canTransitionInboxStatus("fetched", "rejected")).toBe(true);
  });

  it("rejects fetched -> ingested directly (must pass through selected)", () => {
    expect(canTransitionInboxStatus("fetched", "ingested")).toBe(false);
    expect(() => assertInboxStatusTransition("fetched", "ingested")).toThrow(InvalidStatusTransitionError);
  });

  it("rejects any transition out of ingested or rejected (terminal states)", () => {
    expect(canTransitionInboxStatus("ingested", "selected")).toBe(false);
    expect(canTransitionInboxStatus("rejected", "selected")).toBe(false);
  });
});
