import { describe, expect, it } from "vitest";

import { describeOutcome, needsFinality } from "./tx";

/**
 * The shape of a real receipt on Studio Dev, copied from an actual successful
 * write against the deployed contract rather than invented. Note which fields
 * are snake_case and which are camelCase: guessing that wrong silently reads
 * an always-missing value.
 */
const REAL_SUCCESS = {
  status: "FINALIZED",
  result_name: "MAJORITY_AGREE",
  txExecutionResultName: "FINISHED_WITH_RETURN",
};

describe("describeOutcome", () => {
  it("accepts a real successful receipt", () => {
    const o = describeOutcome(REAL_SUCCESS);
    expect(o.ok).toBe(true);
    expect(o.state).toBe("success");
  });

  it("treats a missing consensus result as failure, not success", () => {
    // The whole point of a whitelist. Written as `consensus === undefined ||
    // ...` this guard skipped itself precisely when the field was absent.
    const { result_name, ...noConsensus } = REAL_SUCCESS;
    void result_name;
    const o = describeOutcome(noConsensus);
    expect(o.ok).toBe(false);
  });

  it("treats a missing execution result as failure", () => {
    const { txExecutionResultName, ...noExec } = REAL_SUCCESS;
    void txExecutionResultName;
    expect(describeOutcome(noExec).ok).toBe(false);
  });

  it("rejects an unknown future status rather than assuming it is fine", () => {
    expect(describeOutcome({ ...REAL_SUCCESS, status: "SOME_NEW_STATE" }).ok).toBe(false);
  });

  it("rejects a validator result that is not an agreement", () => {
    for (const r of ["DISAGREE", "TIMEOUT", "DETERMINISTIC_VIOLATION", "NO_MAJORITY", "IDLE"]) {
      expect(describeOutcome({ ...REAL_SUCCESS, result_name: r }).ok).toBe(false);
    }
  });

  it("reports validator disagreement before the execution result", () => {
    // This case reads as a clean success if the execution result is checked
    // first: the code ran, it just persisted nothing.
    const o = describeOutcome({ ...REAL_SUCCESS, result_name: "DISAGREE" });
    expect(o.state).toBe("no-consensus");
    expect(o.settled).toBe(true);
  });

  it("treats terminal-but-failed statuses as failures, not as done", () => {
    expect(describeOutcome({ ...REAL_SUCCESS, status: "CANCELED" }).state).toBe("cancelled");
    expect(
      describeOutcome({ ...REAL_SUCCESS, txExecutionResultName: "LEADER_TIMEOUT" }).state,
    ).toBe("timeout");
    expect(
      describeOutcome({ ...REAL_SUCCESS, txExecutionResultName: "FINISHED_WITH_ERROR" }).state,
    ).toBe("reverted");
  });

  it("does not call an ACCEPTED value transfer done until it is FINALIZED", () => {
    const accepted = { ...REAL_SUCCESS, status: "ACCEPTED" };
    expect(describeOutcome(accepted, false).ok).toBe(true);
    const strict = describeOutcome(accepted, true);
    expect(strict.ok).toBe(false);
    expect(strict.settled).toBe(false);
  });

  it("is not settled while the transaction can still move", () => {
    const o = describeOutcome({ ...REAL_SUCCESS, status: "PENDING" });
    expect(o.settled).toBe(false);
    expect(o.state).toBe("confirming");
  });

  it("an absent receipt is pending, never success", () => {
    expect(describeOutcome(null).ok).toBe(false);
    expect(describeOutcome({}).ok).toBe(false);
  });
});

describe("needsFinality", () => {
  it("requires finality for the value transfer", () => {
    expect(needsFinality("claim")).toBe(true);
  });
  it("does not require it for a reversible record", () => {
    expect(needsFinality("revoke")).toBe(false);
  });
});
