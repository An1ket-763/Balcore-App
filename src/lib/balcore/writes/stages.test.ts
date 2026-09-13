/**
 * Unit tests for the deposit stage machine.
 *
 * "Skips approvals that already suffice" is a promise to the user — every
 * avoidable approval is a signature and a gas fee for nothing — so it is pinned
 * here rather than left to be read out of a hook body.
 *
 * The other property worth pinning is the ORDER. In `usdcOnly` the router
 * approval and the swap come FIRST, before the bank approvals, because the
 * tokenA leg does not exist until the swap has filled. A plan that approved the
 * bank for tokenA first would be approving an amount nobody holds yet.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isBusyStage, nextStage, planDepositStages, type WriteStage } from "./stages.ts";

const ONE_BTC = 100_000_000n;
const USDC_78K = 78_000_000_000n;

/** The tail every plan ends with, once the approvals are dealt with. */
const TAIL: WriteStage[] = ["preparing", "signing", "confirming", "done"];

describe("planDepositStages — both-tokens mode", () => {
  test("no allowance at all: approve tokenA, approve USDC, then deposit", () => {
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: 0n,
      usdcAllowance: 0n,
    });
    assert.deepEqual(plan, ["approvingTokenA", "approvingUsdc", ...TAIL]);
  });

  test("both allowances already sufficient: NO approval stages at all", () => {
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: USDC_78K,
    });
    assert.deepEqual(plan, TAIL);
  });

  test("an allowance EXACTLY equal to the amount is sufficient — no re-approve", () => {
    // The contract's check is `allowance >= amount`, so equality must not
    // trigger another signature.
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: USDC_78K,
    });
    assert.ok(!plan.includes("approvingTokenA"));
    assert.ok(!plan.includes("approvingUsdc"));
  });

  test("one atom short of the amount DOES need an approval", () => {
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC - 1n,
      usdcAllowance: USDC_78K,
    });
    assert.deepEqual(plan, ["approvingTokenA", ...TAIL]);
  });

  test("a generous standing allowance is respected", () => {
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC * 1000n,
      usdcAllowance: USDC_78K * 1000n,
    });
    assert.deepEqual(plan, TAIL);
  });

  test("only the USDC leg needs approving", () => {
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: 0n,
    });
    assert.deepEqual(plan, ["approvingUsdc", ...TAIL]);
  });

  test("a zero leg needs no approval for itself", () => {
    // A zero leg is blocked by checkDeposit, but the plan must not invent an
    // approval for an amount of nothing.
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: 0n,
      usdcAmount: USDC_78K,
      tokenAAllowance: 0n,
      usdcAllowance: 0n,
    });
    assert.deepEqual(plan, ["approvingUsdc", ...TAIL]);
  });

  test("both-tokens mode NEVER plans a swap", () => {
    const plan = planDepositStages({
      mode: "both",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: 0n,
      usdcAllowance: 0n,
      // Even if a stale split value is passed in, `both` must ignore it.
      swapUsdc: 500_000_000n,
      swapAllowance: 0n,
    });
    assert.ok(!plan.includes("swapping"));
  });
});

describe("planDepositStages — usdcOnly mode", () => {
  test("the swap and its router approval come FIRST, before the bank approvals", () => {
    const plan = planDepositStages({
      mode: "usdcOnly",
      // After the split: half bought, half kept.
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: 0n,
      usdcAllowance: 0n,
      swapUsdc: USDC_78K,
      swapAllowance: 0n,
    });
    assert.deepEqual(plan, [
      "approvingUsdc", // the ROUTER's allowance
      "swapping",
      "approvingTokenA", // then the BANK's, for what the swap delivered
      "approvingUsdc",
      ...TAIL,
    ]);
    // The ordering property, stated as an assertion.
    assert.ok(
      plan.indexOf("swapping") < plan.indexOf("approvingTokenA"),
      "tokenA cannot be approved before it has been bought",
    );
  });

  test("a router allowance that already covers the swap skips that approval", () => {
    const plan = planDepositStages({
      mode: "usdcOnly",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: USDC_78K,
      swapUsdc: USDC_78K,
      swapAllowance: USDC_78K,
    });
    assert.deepEqual(plan, ["swapping", ...TAIL]);
  });

  test("the router approval is a DIFFERENT spender from the bank's", () => {
    // A user fully approved to the bank still needs the router's allowance, so
    // the plan must contain the approval even though the bank ones are skipped.
    const plan = planDepositStages({
      mode: "usdcOnly",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC * 10n,
      usdcAllowance: USDC_78K * 10n,
      swapUsdc: USDC_78K,
      swapAllowance: 0n,
    });
    assert.deepEqual(plan, ["approvingUsdc", "swapping", ...TAIL]);
  });

  test("nothing to swap means no swap stage", () => {
    const plan = planDepositStages({
      mode: "usdcOnly",
      tokenAAmount: 0n,
      usdcAmount: 0n,
      tokenAAllowance: 0n,
      usdcAllowance: 0n,
      swapUsdc: 0n,
      swapAllowance: 0n,
    });
    assert.deepEqual(plan, TAIL);
  });

  test("a missing swapAllowance read is treated as zero, not as sufficient", () => {
    // `undefined` means "not read yet". Defaulting it to sufficient would skip a
    // needed approval and fail at the router.
    const plan = planDepositStages({
      mode: "usdcOnly",
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: USDC_78K,
      swapUsdc: USDC_78K,
    });
    assert.equal(plan[0], "approvingUsdc");
  });
});

describe("every plan", () => {
  // `label` rather than JSON.stringify: these inputs are bigints, which
  // JSON.stringify throws on — a failure message that crashes is no message.
  const variants = [
    { label: "both, no allowance", mode: "both" as const, tokenAAllowance: 0n, usdcAllowance: 0n },
    {
      label: "both, fully approved",
      mode: "both" as const,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: USDC_78K,
    },
    {
      label: "usdcOnly, no allowance",
      mode: "usdcOnly" as const,
      tokenAAllowance: 0n,
      usdcAllowance: 0n,
    },
    {
      label: "usdcOnly, bank approved",
      mode: "usdcOnly" as const,
      tokenAAllowance: ONE_BTC,
      usdcAllowance: USDC_78K,
    },
  ];

  const planFor = (v: (typeof variants)[number]) =>
    planDepositStages({
      mode: v.mode,
      tokenAAmount: ONE_BTC,
      usdcAmount: USDC_78K,
      tokenAAllowance: v.tokenAAllowance,
      usdcAllowance: v.usdcAllowance,
      swapUsdc: USDC_78K,
      swapAllowance: 0n,
    });

  test("ends with the deposit tail, whatever the approvals", () => {
    for (const v of variants) {
      assert.deepEqual(planFor(v).slice(-4), TAIL, `tail wrong for ${v.label}`);
    }
  });

  test("never contains 'idle' or 'error' — those are states, not steps", () => {
    for (const v of variants) {
      const plan = planFor(v);
      assert.ok(!plan.includes("idle"), v.label);
      assert.ok(!plan.includes("error"), v.label);
    }
  });
});

describe("nextStage", () => {
  const plan: WriteStage[] = ["approvingTokenA", "approvingUsdc", ...TAIL];

  test("walks the plan in order and stops at the end", () => {
    const walked: (WriteStage | null)[] = [];
    let cur: WriteStage | null = plan[0] ?? null;
    for (let i = 0; i < 10 && cur; i++) {
      walked.push(cur);
      cur = nextStage(plan, cur);
    }
    assert.deepEqual(walked, plan);
    assert.equal(nextStage(plan, "done"), null);
  });

  test("a stage outside the plan restarts at the first step", () => {
    // `idle` and `error` are not in any plan, so asking from there means "begin".
    assert.equal(nextStage(plan, "idle"), "approvingTokenA");
    assert.equal(nextStage(plan, "error"), "approvingTokenA");
  });

  test("an empty plan has no next stage", () => {
    assert.equal(nextStage([], "idle"), null);
  });
});

describe("isBusyStage", () => {
  test("every in-flight stage is busy", () => {
    for (const s of [
      "swapping",
      "approvingTokenA",
      "approvingUsdc",
      "preparing",
      "signing",
      "confirming",
    ] as WriteStage[]) {
      assert.equal(isBusyStage(s), true, `${s} should be busy`);
    }
  });

  test("idle, done and error are NOT busy — the user may act again", () => {
    for (const s of ["idle", "done", "error"] as WriteStage[]) {
      assert.equal(isBusyStage(s), false, `${s} should not be busy`);
    }
  });
});
