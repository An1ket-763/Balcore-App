/**
 * Unit tests for the revert decoder.
 *
 * THE IMPORTANT PROPERTY, and the reason these tests exist at all: the selectors
 * asserted on are DERIVED FROM THE GENERATED ABI, never hardcoded. If an
 * upstream contract renames or re-types an error, its selector changes, and a
 * test that had the old hex written into it would keep passing while the app
 * silently stopped recognising the revert. Deriving them means the rename fails
 * here instead.
 *
 * Reverts are built with viem's `encodeErrorResult`, so the bytes under test are
 * the bytes a node would return — not a hand-written approximation of them.
 *
 * Runner: `node --test` with `--experimental-strip-types` (`npm run test`).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encodeErrorResult, toFunctionSelector, type Abi } from "viem";

import {
  balcoreErrorMessage,
  decodeBalcoreError,
  erc20ErrorAbi,
  knownErrorSelectors,
  walletMessage,
} from "./errors.ts";
import { balcoreBankAbi } from "./abi/bank.ts";
import { balcoreVaultAbi } from "./abi/vault.ts";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Selector of an error NAME, looked up in whichever ABI declares it. */
function selectorOf(abi: Abi, name: string): string {
  const item = abi.find((e) => e.type === "error" && e.name === name);
  assert.ok(item, `${name} is not in this ABI — did the contract rename it?`);
  const inputs = (item as { inputs?: readonly { type: string }[] }).inputs ?? [];
  return toFunctionSelector(`${name}(${inputs.map((i) => i.type).join(",")})` as never);
}

/**
 * An error object shaped the way a provider hands revert bytes back.
 *
 * viem's typed path is covered separately; this shape is the one that matters
 * for the trader's selectors, which viem CANNOT name from the bank ABI.
 */
function rawRevert(data: string) {
  return Object.assign(new Error("execution reverted"), { data });
}

function encoded(abi: Abi, name: string, args?: readonly unknown[]) {
  return encodeErrorResult({
    abi,
    errorName: name,
    ...(args ? { args } : {}),
  } as never);
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

describe("selector index", () => {
  test("covers every error in the bank fragment", () => {
    const known = knownErrorSelectors();
    const bankErrors = balcoreBankAbi.filter((e) => e.type === "error");
    assert.ok(
      bankErrors.length > 20,
      `only ${bankErrors.length} bank errors — ABI looks truncated`,
    );
    for (const e of bankErrors) {
      const sel = selectorOf(balcoreBankAbi as unknown as Abi, e.name).toLowerCase();
      assert.ok(known.has(sel), `bank error ${e.name} (${sel}) is not in the index`);
    }
  });

  test("covers every error in the vault fragment", () => {
    const known = knownErrorSelectors();
    const vaultErrors = balcoreVaultAbi.filter((e) => e.type === "error");
    // The vault fragment only started carrying errors when the oracle reverts
    // had to be nameable; if this is zero the generator regressed.
    assert.ok(
      vaultErrors.length > 20,
      `only ${vaultErrors.length} vault errors — regenerate the ABI`,
    );
    for (const e of vaultErrors) {
      const sel = selectorOf(balcoreVaultAbi as unknown as Abi, e.name).toLowerCase();
      assert.ok(known.has(sel), `vault error ${e.name} (${sel}) is not in the index`);
    }
  });

  test("the oracle errors are present — they reach the user through bank writes", () => {
    const known = knownErrorSelectors();
    for (const name of ["StalePriceData", "OracleOutOfBounds", "OraclePriceDeviation"]) {
      const sel = selectorOf(balcoreVaultAbi as unknown as Abi, name).toLowerCase();
      assert.equal(known.get(sel), name);
    }
  });

  test("the six user writes' own errors are all present", () => {
    const known = knownErrorSelectors();
    const required = [
      "DepositRatioOutOfBounds",
      "TVLCapExceeded",
      "DepositAlreadyQueued",
      "WithdrawRequestAlreadyExists",
      "NoWithdrawRequest",
      "WithdrawNotReady",
      "NotHeadOfQueue",
      "NothingToClaim",
      "FastTrackSuspendedDuringRun",
      "FastTrackDailyLimitReached",
      "FastTrackPoolInsufficient",
      "ZeroAmount",
      "EnforcedPause",
    ];
    for (const name of required) {
      const sel = selectorOf(balcoreBankAbi as unknown as Abi, name).toLowerCase();
      assert.equal(known.get(sel), name, `${name} missing from the index`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

describe("decodeBalcoreError", () => {
  test("names a zero-argument bank error and writes a sentence", () => {
    const d = decodeBalcoreError(
      rawRevert(encoded(balcoreBankAbi as unknown as Abi, "FastTrackSuspendedDuringRun")),
      "fastTrack",
    );
    assert.equal(d.name, "FastTrackSuspendedDuringRun");
    assert.equal(d.known, true);
    assert.equal(d.noRevertData, false);
    assert.equal(
      d.selector,
      selectorOf(balcoreBankAbi as unknown as Abi, "FastTrackSuspendedDuringRun").toLowerCase(),
    );
    // Says what happened AND what still works — a dead end is not a message.
    assert.match(d.message, /switched off/i);
    assert.match(d.message, /queue/i);
    assert.match(d.message, /7-day withdrawal/);
    // Never leaks the identifier to the user.
    assert.ok(!d.message.includes("FastTrackSuspendedDuringRun"));
  });

  test("decodes arguments and folds them into the message", () => {
    // cap 100,000 USDC, 99,500 already in → 500 of room.
    const data = encoded(balcoreBankAbi as unknown as Abi, "TVLCapExceeded", [
      99_500_000_000n,
      100_000_000_000n,
    ]);
    const d = decodeBalcoreError(rawRevert(data), "deposit");
    assert.equal(d.name, "TVLCapExceeded");
    assert.deepEqual(d.args, [99_500_000_000n, 100_000_000_000n]);
    assert.match(d.message, /\$500 of room/);
  });

  test("a cap with no room left says so instead of '$0 of room'", () => {
    const data = encoded(balcoreBankAbi as unknown as Abi, "TVLCapExceeded", [
      100_000_000_000n,
      100_000_000_000n,
    ]);
    assert.match(decodeBalcoreError(rawRevert(data), "deposit").message, /reached its deposit cap/);
  });

  test("WithdrawNotReady renders the ready time from its argument", () => {
    // Wallet B's live readyAt, runsheet "Tue Sep 8 as executed".
    const data = encoded(balcoreBankAbi as unknown as Abi, "WithdrawNotReady", [
      1_789_449_517n,
      1_789_000_000n,
    ]);
    const d = decodeBalcoreError(rawRevert(data), "executeWithdraw");
    assert.equal(d.name, "WithdrawNotReady");
    assert.match(d.message, /Not ready yet/);
    // The date is rendered, not the raw seconds.
    assert.ok(!d.message.includes("1789449517"));
  });

  test("DepositRatioOutOfBounds quotes both legs in dollars", () => {
    const data = encoded(balcoreBankAbi as unknown as Abi, "DepositRatioOutOfBounds", [
      1_000_000_000n, // $1,000 of tokenA
      900_000_000n, // $900 of USDC
    ]);
    const d = decodeBalcoreError(rawRevert(data), "deposit");
    assert.match(d.message, /\$1,000/);
    assert.match(d.message, /\$900/);
    assert.match(d.message, /within 1%/);
  });

  /* ---- the case the vault ABI was extended for ---- */

  test("a TRADER oracle revert out of a BANK call is still named", () => {
    const d = decodeBalcoreError(
      rawRevert(encoded(balcoreVaultAbi as unknown as Abi, "StalePriceData")),
      "deposit",
    );
    assert.equal(d.name, "StalePriceData");
    assert.equal(d.known, true);
    assert.match(d.message, /price feed/i);
    assert.match(d.message, /Nothing was sent/);
  });

  test("OraclePriceDeviation is named and explained", () => {
    const data = encoded(balcoreVaultAbi as unknown as Abi, "OraclePriceDeviation", [
      7_900_000_000_000n,
      7_800_000_000_000n,
      2000n,
    ]);
    const d = decodeBalcoreError(rawRevert(data), "deposit");
    assert.equal(d.name, "OraclePriceDeviation");
    assert.match(d.message, /moved further/i);
  });

  /* ---- ERC-20 ---- */

  test("ERC-20 allowance and balance errors are named", () => {
    const allowance = decodeBalcoreError(
      rawRevert(
        encoded(erc20ErrorAbi as unknown as Abi, "ERC20InsufficientAllowance", [
          "0x55Ae400c5432CdeAe5aa6D7d4826588e4db83365",
          0n,
          1_000_000n,
        ]),
      ),
      "deposit",
    );
    assert.equal(allowance.name, "ERC20InsufficientAllowance");
    assert.match(allowance.message, /not approved/i);

    const balance = decodeBalcoreError(
      rawRevert(
        encoded(erc20ErrorAbi as unknown as Abi, "ERC20InsufficientBalance", [
          "0x4EF4f6Bf10e5B9B22c77048332d460930a629365",
          5n,
          10n,
        ]),
      ),
      "deposit",
    );
    assert.equal(balance.name, "ERC20InsufficientBalance");
    assert.match(balance.message, /short/i);
  });

  /* ---- solc ---- */

  test("a require-string revert surfaces the string itself", () => {
    const data = encodeErrorResult({
      abi: [{ type: "error", name: "Error", inputs: [{ name: "m", type: "string" }] }] as const,
      errorName: "Error",
      args: ["LBRouter__InsufficientAmountOut"],
    });
    const d = decodeBalcoreError(rawRevert(data), "swap");
    assert.equal(d.name, "Error");
    assert.equal(d.message, "LBRouter__InsufficientAmountOut");
  });

  test("Panic is named rather than shown as a hex blob", () => {
    const data = encodeErrorResult({
      abi: [{ type: "error", name: "Panic", inputs: [{ name: "c", type: "uint256" }] }] as const,
      errorName: "Panic",
      args: [0x11n],
    });
    assert.equal(decodeBalcoreError(rawRevert(data), "deposit").name, "Panic");
  });

  /* ---- the rule about unknowns ---- */

  test("an unrecognised selector is reported WITH the selector, never as 'unknown'", () => {
    const d = decodeBalcoreError(rawRevert("0xdeadbeef"), "deposit");
    assert.equal(d.known, false);
    assert.equal(d.name, null);
    assert.equal(d.selector, "0xdeadbeef");
    assert.ok(d.message.includes("0xdeadbeef"), "the selector must be in the message");
    assert.ok(!/unknown/i.test(d.message), "must not say 'unknown'");
  });

  test("no revert data at all falls back to wallet wording, not a contract claim", () => {
    const d = decodeBalcoreError(new Error("User rejected the request"), "deposit");
    assert.equal(d.noRevertData, true);
    assert.equal(d.selector, null);
    assert.match(d.message, /Rejected in your wallet/);
  });

  test("never returns an empty message, whatever it is handed", () => {
    for (const input of [null, undefined, 0, "", {}, new Error(""), rawRevert("0x")]) {
      const d = decodeBalcoreError(input, "deposit");
      assert.ok(d.message.length > 0, `empty message for ${JSON.stringify(input)}`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Context sensitivity                                                 */
/* ------------------------------------------------------------------ */

describe("the same selector, different writes", () => {
  test("ZeroAmount means 'fill in the boxes' on deposit and 'no position' on exit", () => {
    const data = rawRevert(encoded(balcoreBankAbi as unknown as Abi, "ZeroAmount"));
    const onDeposit = balcoreErrorMessage(data, "deposit");
    const onRequest = balcoreErrorMessage(data, "requestWithdraw");
    const onFast = balcoreErrorMessage(data, "fastTrack");

    assert.match(onDeposit, /both/i);
    assert.match(onRequest, /no position/i);
    assert.equal(onRequest, onFast);
    assert.notEqual(onDeposit, onRequest);
  });

  test("DepositAlreadyQueued explains the deposit case and the cancel case differently", () => {
    const data = rawRevert(encoded(balcoreBankAbi as unknown as Abi, "DepositAlreadyQueued"));
    const onDeposit = balcoreErrorMessage(data, "deposit");
    const onCancel = balcoreErrorMessage(data, "cancelWithdraw");
    assert.match(onDeposit, /Tuesday settlement/);
    assert.match(onCancel, /Collect the withdrawal instead/);
    assert.notEqual(onDeposit, onCancel);
  });

  test("NoWithdrawRequest is phrased for collect vs cancel", () => {
    const data = rawRevert(encoded(balcoreBankAbi as unknown as Abi, "NoWithdrawRequest"));
    assert.match(balcoreErrorMessage(data, "executeWithdraw"), /nothing to collect/i);
    assert.match(balcoreErrorMessage(data, "cancelWithdraw"), /cancel/i);
  });
});

/* ------------------------------------------------------------------ */
/* Wallet-level failures                                               */
/* ------------------------------------------------------------------ */

describe("walletMessage", () => {
  const cases: [string, RegExp][] = [
    ["User rejected the request", /Rejected in your wallet/],
    ["insufficient funds for gas", /Not enough AVAX/],
    ["chain mismatch", /wrong network/i],
    ["nonce too low", /transaction count/i],
    ["fetch failed", /Could not reach the network/],
  ];
  for (const [msg, expected] of cases) {
    test(`"${msg}" gets its own advice`, () => {
      assert.match(walletMessage(new Error(msg)), expected);
    });
  }

  test("an unrecognised wallet error still says nothing was sent", () => {
    assert.match(walletMessage(new Error("???")), /Nothing was sent/);
  });
});
