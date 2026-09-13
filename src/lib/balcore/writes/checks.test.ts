/**
 * Unit tests for the write pre-checks.
 *
 * Anchored to real chain state wherever a real number exists, the same rule
 * `math.test.ts` follows — balcore-contracts@c190dc0
 * docs/mainnet-ceremony-runsheet.md, "Tue Sep 8 as executed": wallet B's
 * request (shares 120,102,703, depositVal 119,995,378, readyAt 1789449517,
 * basket 77,050 sats + 58,911,371 USDC, strikeValue 119,576,516), and the live
 * BTC pool at `runMode` TRUE with a 100,000e6 TVL cap.
 *
 * The point of these tests is that the UI's "no" matches the chain's "no". Where
 * a check mirrors a revert, the contract line is named in the test, so a future
 * reader can go and confirm it rather than trusting the comment.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CANCEL_CONSEQUENCE,
  checkCancelWithdraw,
  checkClaimYield,
  checkDeposit,
  checkExecuteWithdraw,
  checkFastTrack,
  checkRequestWithdraw,
  formatCountdown,
  minTokenAForPairing,
  previewFastTrack,
  secondsUntilReady,
  splitUsdcForDeposit,
  summarise,
  valueDeposit,
  withdrawStatus,
  type DepositCheckInput,
} from "./checks.ts";

/** BTC trio constants, from config/addresses.ts. */
const BTC = { scaleA2B: 10_000_000_000n, decA: 8, decB: 6 };
/** A round $78,000, 8-dec Chainlink. Near the live range 8391276/8391290. */
const PRICE = 7_800_000_000_000n;

/** 1 BTC.b = 1e8 sats. $78,000 of BTC.b at PRICE. */
const ONE_BTC = 100_000_000n;

/* ------------------------------------------------------------------ */
/* summarise                                                           */
/* ------------------------------------------------------------------ */

describe("summarise", () => {
  test("no issues is ok", () => {
    const r = summarise([]);
    assert.equal(r.ok, true);
    assert.equal(r.blocker, null);
    assert.deepEqual(r.warnings, []);
  });

  test("a warning alone does not block", () => {
    const r = summarise([{ code: "w", message: "careful", severity: "warning" }]);
    assert.equal(r.ok, true);
    assert.equal(r.warnings.length, 1);
  });

  test("the FIRST blocker is the one reported", () => {
    const r = summarise([
      { code: "a", message: "first", severity: "blocker" },
      { code: "b", message: "second", severity: "blocker" },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.blocker?.code, "a");
  });
});

/* ------------------------------------------------------------------ */
/* Deposit valuation                                                   */
/* ------------------------------------------------------------------ */

describe("valueDeposit", () => {
  test("values tokenA exactly as BalCoreBank.sol:486 does", () => {
    // 1 BTC.b at $78,000 → 78,000e6 USDC atoms.
    const v = valueDeposit({
      tokenAAmount: ONE_BTC,
      usdcAmount: 0n,
      price8: PRICE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(v.tokenAValue, 78_000_000_000n);
  });

  test("a perfectly matched pair is balanced", () => {
    const v = valueDeposit({
      tokenAAmount: ONE_BTC,
      usdcAmount: 78_000_000_000n,
      price8: PRICE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(v.balanced, true);
    assert.equal(v.imbalanceBps, 0);
    assert.equal(v.totalValue, 156_000_000_000n);
  });

  test("exactly 1% apart still passes — the bound is inclusive", () => {
    // VaultMath.sol:823 is `diff <= tolerance`, and tolerance is larger/100.
    const a = 100_000_000n; // $100 in 6-dec terms
    const b = 99_000_000n; // exactly 1% less
    const v = valueDeposit({
      tokenAAmount: (a * BTC.scaleA2B) / PRICE,
      usdcAmount: b,
      price8: PRICE,
      scaleA2B: BTC.scaleA2B,
    });
    // The tokenA round-trip loses a little to truncation, so assert the rule
    // rather than the exact atom: a pair this close must be accepted.
    assert.equal(v.balanced, true);
  });

  test("2% apart is refused", () => {
    const v = valueDeposit({
      tokenAAmount: ONE_BTC,
      usdcAmount: 76_440_000_000n, // 2% below $78,000
      price8: PRICE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(v.balanced, false);
    assert.equal(v.imbalanceBps, 200);
  });

  /**
   * REGRESSION — the anchored price is not the price the deposit is checked at.
   *
   * Caught live by the dry-run harness on 2026-09-13: `vault.lastValidPrice()`
   * read 7816735754735 ($78,167.36) while the Chainlink feed read 7713859444851
   * ($77,138.59). `deposit` prices at the FEED (it calls
   * `TRADER.fetchAndCheckPrice()`, BalCoreBank.sol:484), so a pair matched off
   * the anchor was 1.33% out and simulated straight into
   * `DepositRatioOutOfBounds`.
   *
   * The numbers below are the real ones from that block, so this test fails if
   * anybody ever re-points the matching at the anchor.
   */
  const ANCHORED = 7_816_735_754_735n;
  const LIVE = 7_713_859_444_851n;

  test("a pair matched off the ANCHOR is rejected at the live price", () => {
    const usdc = 100_000_000n; // $100
    const matchedOffAnchor = (usdc * BTC.scaleA2B) / ANCHORED; // 127,930 sats
    assert.equal(matchedOffAnchor, 127_930n);

    // Balanced against the anchor, which is what made this easy to miss…
    assert.equal(
      valueDeposit({
        tokenAAmount: matchedOffAnchor,
        usdcAmount: usdc,
        price8: ANCHORED,
        scaleA2B: BTC.scaleA2B,
      }).balanced,
      true,
    );

    // …and NOT balanced at the price the chain actually uses.
    const atLive = valueDeposit({
      tokenAAmount: matchedOffAnchor,
      usdcAmount: usdc,
      price8: LIVE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(atLive.balanced, false, "this is the live DepositRatioOutOfBounds");
    assert.equal(atLive.tokenAValue, 98_683_403n); // $98.68, as the chain reported
  });

  test("a pair matched off the LIVE feed passes at the live price", () => {
    const usdc = 100_000_000n;
    const matchedOffLive = (usdc * BTC.scaleA2B) / LIVE; // 129,636 sats
    assert.equal(matchedOffLive, 129_636n);

    const atLive = valueDeposit({
      tokenAAmount: matchedOffLive,
      usdcAmount: usdc,
      price8: LIVE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(atLive.balanced, true);
    assert.equal(atLive.tokenAValue, 99_999_388n); // $99.999388
    assert.ok(atLive.imbalanceBps <= 1, `${atLive.imbalanceBps} bps`);
  });

  test("the two prices were 1.33% apart — outside the ±1% tolerance", () => {
    const gap = ((ANCHORED - LIVE) * 10_000n) / LIVE;
    assert.equal(gap, 133n);
    assert.ok(gap > 100n, "the gap has to exceed the tolerance for the bug to bite");
  });
});

/* ------------------------------------------------------------------ */
/* checkDeposit                                                        */
/* ------------------------------------------------------------------ */

/** A deposit that passes every check: 1 BTC.b + $78,000, balances ample. */
function okDeposit(over: Partial<DepositCheckInput> = {}): DepositCheckInput {
  return {
    mode: "both",
    tokenAAmount: ONE_BTC,
    usdcAmount: 78_000_000_000n,
    tokenABalance: ONE_BTC * 2n,
    usdcBalance: 200_000_000_000n,
    price8: PRICE,
    scaleA2B: BTC.scaleA2B,
    pricingTvl: 10_000_000_000n, // $10k in the pool
    tvlCap: 100_000_000_000n, // the live 100,000e6 cap
    tvlCapActive: true,
    hasQueuedDeposit: false,
    paused: false,
    poolLive: true,
    connected: true,
    wrongNetwork: false,
    ...over,
  };
}

describe("checkDeposit", () => {
  test("a balanced, affordable, in-cap deposit passes", () => {
    // $156k total would breach the $100k cap, so use a small one here.
    const r = checkDeposit(okDeposit({ tokenAAmount: ONE_BTC / 100n, usdcAmount: 780_000_000n }));
    assert.equal(r.ok, true, r.blocker?.message);
  });

  test("the AVAX pool refuses before anything else is considered", () => {
    const r = checkDeposit(okDeposit({ poolLive: false, tokenAAmount: 0n, usdcAmount: 0n }));
    assert.equal(r.blocker?.code, "poolNotLive");
  });

  test("a disconnected wallet is told to connect, not that the amount is wrong", () => {
    assert.equal(checkDeposit(okDeposit({ connected: false })).blocker?.code, "notConnected");
  });

  test("the wrong network is its own message — the UI can fix that one", () => {
    assert.equal(checkDeposit(okDeposit({ wrongNetwork: true })).blocker?.code, "wrongNetwork");
  });

  test("a paused pool blocks", () => {
    assert.equal(checkDeposit(okDeposit({ paused: true })).blocker?.code, "paused");
  });

  test("either leg at zero blocks — there is no one-sided deposit", () => {
    // BalCoreBank.sol:480 reverts ZeroAmount if EITHER is zero.
    assert.equal(checkDeposit(okDeposit({ usdcAmount: 0n })).blocker?.code, "zeroAmount");
    assert.equal(checkDeposit(okDeposit({ tokenAAmount: 0n })).blocker?.code, "zeroAmount");
  });

  test("a dead price feed blocks with its own reason", () => {
    assert.equal(checkDeposit(okDeposit({ price8: 0n })).blocker?.code, "noPrice");
  });

  test("an unbalanced pair is refused and the message quotes the gap", () => {
    const r = checkDeposit(okDeposit({ usdcAmount: 70_000_000_000n }));
    assert.equal(r.blocker?.code, "ratio");
    assert.match(r.blocker?.message ?? "", /1%/);
    assert.match(r.blocker?.message ?? "", /10\.2[0-9]%|10\.[0-9]+%/);
  });

  test("insufficient tokenA and insufficient USDC each have their own message", () => {
    const a = checkDeposit(
      okDeposit({
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
        tokenABalance: 1n,
      }),
    );
    assert.equal(a.blocker?.code, "tokenABalance");

    const b = checkDeposit(
      okDeposit({
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
        usdcBalance: 1n,
      }),
    );
    assert.equal(b.blocker?.code, "usdcBalance");
  });

  test("one queued deposit per address — BalCoreBank.sol:529", () => {
    const r = checkDeposit(
      okDeposit({
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
        hasQueuedDeposit: true,
      }),
    );
    assert.equal(r.blocker?.code, "queued");
    assert.match(r.blocker?.message ?? "", /Tuesday settlement/);
  });

  test("the TVL cap blocks and the message states the remaining room", () => {
    // $99,000 already in, cap $100,000 → $1,000 of room; try to add ~$1,560.
    const r = checkDeposit(
      okDeposit({
        pricingTvl: 99_000_000_000n,
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
      }),
    );
    assert.equal(r.blocker?.code, "tvlCap");
    assert.match(r.blocker?.message ?? "", /\$1,000 of room/);
  });

  test("an inactive cap is not enforced", () => {
    const r = checkDeposit(
      okDeposit({
        pricingTvl: 99_000_000_000n,
        tvlCapActive: false,
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
      }),
    );
    assert.equal(r.ok, true, r.blocker?.message);
  });

  test("price drift above 0.5% warns but does NOT block", () => {
    const r = checkDeposit(
      okDeposit({
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
        // quoted 1% above the live price
        quotedPrice8: (PRICE * 101n) / 100n,
      }),
    );
    assert.equal(r.ok, true, r.blocker?.message);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0]?.code, "drift");
    assert.match(r.warnings[0]?.message ?? "", /0\.99%|1\.00%/);
  });

  test("drift inside 0.5% is silent", () => {
    const r = checkDeposit(
      okDeposit({
        tokenAAmount: ONE_BTC / 100n,
        usdcAmount: 780_000_000n,
        quotedPrice8: (PRICE * 10_010n) / 10_000n, // 0.1%
      }),
    );
    assert.deepEqual(r.warnings, []);
  });
});

/* ------------------------------------------------------------------ */
/* The USDC-only split                                                 */
/* ------------------------------------------------------------------ */

describe("splitUsdcForDeposit", () => {
  test("halves an even amount and the two legs sum to the input", () => {
    const s = splitUsdcForDeposit(1_000_000_000n, PRICE, BTC.scaleA2B);
    assert.equal(s.swapUsdc, 500_000_000n);
    assert.equal(s.keepUsdc, 500_000_000n);
    assert.equal(s.swapUsdc + s.keepUsdc, 1_000_000_000n);
  });

  test("an ODD amount leaves no dust — the odd atom goes to the KEPT leg", () => {
    const s = splitUsdcForDeposit(1_000_000_001n, PRICE, BTC.scaleA2B);
    assert.equal(s.swapUsdc + s.keepUsdc, 1_000_000_001n, "must not lose an atom");
    assert.equal(s.keepUsdc, 500_000_001n);
    assert.equal(s.swapUsdc, 500_000_000n);
    // The safe direction: the leg we already hold is the larger one.
    assert.ok(s.keepUsdc >= s.swapUsdc);
  });

  test("the target tokenA is what the swapped USDC is worth at the live price", () => {
    const s = splitUsdcForDeposit(156_000_000_000n, PRICE, BTC.scaleA2B);
    // $78,000 of USDC at $78,000/BTC → exactly 1 BTC.b.
    assert.equal(s.swapUsdc, 78_000_000_000n);
    assert.equal(s.targetTokenA, ONE_BTC);
  });

  test("the split result pairs: the target and the kept leg are balanced", () => {
    const s = splitUsdcForDeposit(1_000_000_001n, PRICE, BTC.scaleA2B);
    const v = valueDeposit({
      tokenAAmount: s.targetTokenA,
      usdcAmount: s.keepUsdc,
      price8: PRICE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(v.balanced, true, `imbalance was ${v.imbalanceBps} bps`);
  });

  test("degenerate inputs give zeros rather than throwing", () => {
    for (const [total, price] of [
      [0n, PRICE],
      [1_000n, 0n],
      [-5n, PRICE],
    ] as [bigint, bigint][]) {
      const s = splitUsdcForDeposit(total, price, BTC.scaleA2B);
      assert.deepEqual(s, { keepUsdc: 0n, swapUsdc: 0n, targetTokenA: 0n });
    }
  });

  test("a tiny odd amount still splits without losing the atom", () => {
    const s = splitUsdcForDeposit(3n, PRICE, BTC.scaleA2B);
    assert.equal(s.swapUsdc, 1n);
    assert.equal(s.keepUsdc, 2n);
  });
});

describe("minTokenAForPairing", () => {
  test("the floor is 1% below the kept leg's value, in tokenA", () => {
    const keep = 78_000_000_000n; // $78,000
    const min = minTokenAForPairing(keep, PRICE, BTC.scaleA2B);
    // 99% of $78,000 = $77,220 → 0.99 BTC.b.
    assert.equal(min, 99_000_000n);
  });

  test("extra tolerance tightens the floor further", () => {
    const keep = 78_000_000_000n;
    const plain = minTokenAForPairing(keep, PRICE, BTC.scaleA2B);
    const padded = minTokenAForPairing(keep, PRICE, BTC.scaleA2B, 50n);
    assert.ok(padded < plain, "50 bps of headroom must lower the floor");
  });

  test("a fill exactly at the floor still pairs", () => {
    const keep = 78_000_000_000n;
    const min = minTokenAForPairing(keep, PRICE, BTC.scaleA2B);
    const v = valueDeposit({
      tokenAAmount: min,
      usdcAmount: keep,
      price8: PRICE,
      scaleA2B: BTC.scaleA2B,
    });
    assert.equal(v.balanced, true, `imbalance ${v.imbalanceBps} bps at the floor`);
  });

  test("zero in, zero out", () => {
    assert.equal(minTokenAForPairing(0n, PRICE, BTC.scaleA2B), 0n);
    assert.equal(minTokenAForPairing(100n, 0n, BTC.scaleA2B), 0n);
  });
});

/* ------------------------------------------------------------------ */
/* Withdrawal status                                                   */
/* ------------------------------------------------------------------ */

/** Wallet B's live request, runsheet "Tue Sep 8 as executed". */
const B_READY_AT = 1_789_449_517n;

describe("withdrawStatus", () => {
  const base = {
    requestShares: 120_102_703n,
    requestExecuted: false,
    readyAt: B_READY_AT,
    residualValue: 0n,
    nowSec: B_READY_AT - 86_400n,
  };

  test("no request at all", () => {
    assert.equal(withdrawStatus({ ...base, requestShares: 0n }), "none");
  });

  test("wallet B one day early is PENDING", () => {
    assert.equal(withdrawStatus(base), "pending");
  });

  test("wallet B at readyAt exactly is READY — the bound is inclusive", () => {
    // BalCoreBank.sol:957 reverts only while `block.timestamp < readyAt`.
    assert.equal(withdrawStatus({ ...base, nowSec: B_READY_AT }), "ready");
  });

  test("one second before readyAt is still pending", () => {
    assert.equal(withdrawStatus({ ...base, nowSec: B_READY_AT - 1n }), "pending");
  });

  test("executed", () => {
    assert.equal(withdrawStatus({ ...base, requestExecuted: true }), "executed");
  });

  test("a residual means PARTIAL — and partial outranks pending", () => {
    // W-6: a part-paid claim survives and is re-executable at once, so it must
    // never render as "waiting" again (BalCoreBank.sol:1023-1053).
    assert.equal(
      withdrawStatus({ ...base, residualValue: 5_000_000n, nowSec: B_READY_AT - 86_400n }),
      "partial",
    );
  });

  test("executed outranks a residual", () => {
    assert.equal(
      withdrawStatus({ ...base, requestExecuted: true, residualValue: 5_000_000n }),
      "executed",
    );
  });
});

describe("countdown", () => {
  test("secondsUntilReady floors at zero rather than going negative", () => {
    assert.equal(secondsUntilReady(100n, 200n), 0n);
    assert.equal(secondsUntilReady(200n, 100n), 100n);
    assert.equal(secondsUntilReady(100n, 100n), 0n);
  });

  test("renders days, hours and minutes at the right scales", () => {
    assert.equal(formatCountdown(0n), "ready now");
    assert.equal(formatCountdown(7n * 86_400n), "7d 0h");
    assert.equal(formatCountdown(86_400n + 3600n * 5n), "1d 5h");
    assert.equal(formatCountdown(3600n * 23n + 60n * 14n), "23h 14m");
    assert.equal(formatCountdown(60n * 4n), "4m");
  });

  test("a few seconds left still reads as a minute, never '0m'", () => {
    assert.equal(formatCountdown(30n), "1m");
  });

  test("wallet B's full 7 days reads as 7 days", () => {
    // readyAt - requestedAt is exactly WITHDRAW_DELAY (7 days).
    assert.equal(
      formatCountdown(secondsUntilReady(B_READY_AT, B_READY_AT - 7n * 86_400n)),
      "7d 0h",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Withdrawal checks                                                   */
/* ------------------------------------------------------------------ */

const WALLET_B = "0x626328C6E62A3F829A020132Bb6F47c80d8F5ac3" as const;
const WALLET_A = "0x4EF4f6Bf10e5B9B22c77048332d460930a629365" as const;

describe("checkRequestWithdraw", () => {
  const base = {
    status: "none" as const,
    shares: 339_543_906n, // wallet A's live share count
    paused: false,
    poolLive: true,
    connected: true,
    wrongNetwork: false,
    runMode: false,
  };

  test("a holder with shares and no request may request", () => {
    assert.equal(checkRequestWithdraw(base).ok, true);
  });

  test("no shares is refused with a plain reason", () => {
    const r = checkRequestWithdraw({ ...base, shares: 0n });
    assert.equal(r.blocker?.code, "noPosition");
  });

  test("an existing request blocks a second one — BalCoreBank.sol:686", () => {
    for (const status of ["pending", "ready", "partial"] as const) {
      assert.equal(checkRequestWithdraw({ ...base, status }).blocker?.code, "requestExists");
    }
  });

  test("an already-executed request does not block a new one", () => {
    assert.equal(checkRequestWithdraw({ ...base, status: "executed" }).ok, true);
  });

  test("run mode warns but does not block — requesting is always allowed", () => {
    const r = checkRequestWithdraw({ ...base, runMode: true });
    assert.equal(r.ok, true);
    assert.equal(r.warnings[0]?.code, "runMode");
  });
});

describe("checkExecuteWithdraw", () => {
  const base = {
    status: "ready" as const,
    shares: 0n,
    paused: false,
    poolLive: true,
    connected: true,
    wrongNetwork: false,
    runMode: false,
    readyAt: B_READY_AT,
    nowSec: B_READY_AT + 10n,
  };

  test("a ready request may be collected", () => {
    assert.equal(checkExecuteWithdraw(base).ok, true);
  });

  test("pending is refused with the countdown in the message", () => {
    const r = checkExecuteWithdraw({
      ...base,
      status: "pending",
      nowSec: B_READY_AT - 86_400n,
    });
    assert.equal(r.blocker?.code, "notReady");
    assert.match(r.blocker?.message ?? "", /1d 0h/);
  });

  test("nothing to collect, and already collected, are distinguished", () => {
    assert.equal(checkExecuteWithdraw({ ...base, status: "none" }).blocker?.code, "noRequest");
    assert.equal(
      checkExecuteWithdraw({ ...base, status: "executed" }).blocker?.code,
      "alreadyExecuted",
    );
  });

  test("a partial claim may be re-collected immediately", () => {
    assert.equal(checkExecuteWithdraw({ ...base, status: "partial" }).ok, true);
  });

  test("during a run, only the queue head may collect — BalCoreBank.sol:950", () => {
    const notHead = checkExecuteWithdraw({
      ...base,
      runMode: true,
      queueHead: WALLET_B,
      user: WALLET_A,
    });
    assert.equal(notHead.blocker?.code, "notHead");
    assert.match(notHead.blocker?.message ?? "", /place is held/i);

    const isHead = checkExecuteWithdraw({
      ...base,
      runMode: true,
      queueHead: WALLET_B,
      user: WALLET_B,
    });
    assert.equal(isHead.ok, true);
  });

  test("the head comparison is case-insensitive — checksums differ by case", () => {
    const r = checkExecuteWithdraw({
      ...base,
      runMode: true,
      queueHead: WALLET_B.toLowerCase() as typeof WALLET_B,
      user: WALLET_B,
    });
    assert.equal(r.ok, true);
  });

  test("an unknown head does not block — the chain decides, not us", () => {
    const r = checkExecuteWithdraw({ ...base, runMode: true, queueHead: null, user: WALLET_A });
    assert.equal(r.ok, true);
  });
});

describe("checkCancelWithdraw", () => {
  const base = {
    status: "pending" as const,
    paused: false,
    connected: true,
    wrongNetwork: false,
    holdsShares: false,
  };

  test("a pending request may be cancelled, and the consequence is always attached", () => {
    const r = checkCancelWithdraw(base);
    assert.equal(r.ok, true);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0]?.message, CANCEL_CONSEQUENCE);
  });

  test("the consequence text states every thing that is lost", () => {
    // The three facts BalCoreBank.sol:1443-1451 makes true, which a user will
    // otherwise discover after the fact.
    assert.match(CANCEL_CONSEQUENCE, /NEW deposit/);
    assert.match(CANCEL_CONSEQUENCE, /today's price/);
    assert.match(CANCEL_CONSEQUENCE, /next Tuesday settlement/);
    assert.match(CANCEL_CONSEQUENCE, /7-day clock restarts/);
  });

  test("holding shares blocks a cancel — no merge in v1, BalCoreBank.sol:1405", () => {
    const r = checkCancelWithdraw({ ...base, holdsShares: true });
    assert.equal(r.blocker?.code, "holdsShares");
  });

  test("there must be something to cancel", () => {
    assert.equal(checkCancelWithdraw({ ...base, status: "none" }).blocker?.code, "noRequest");
    assert.equal(checkCancelWithdraw({ ...base, status: "executed" }).blocker?.code, "noRequest");
  });
});

/* ------------------------------------------------------------------ */
/* Claim                                                               */
/* ------------------------------------------------------------------ */

describe("checkClaimYield", () => {
  const base = {
    claimableUsdc: 1_000_000n,
    claimableTokenA: 0n,
    paused: false,
    connected: true,
    wrongNetwork: false,
    lastClaimedEpoch: 0n,
    currentEpoch: 2n,
  };

  test("a settled epoch with a non-zero credit may be claimed", () => {
    assert.equal(checkClaimYield(base).ok, true);
  });

  test("wallet A today: epoch 1, nothing settled since entry — a SPECIFIC reason", () => {
    // The live state: currentEpoch 1, lastClaimedEpoch 1 → fromEpoch 2 >= 1,
    // so claimYield reverts NothingToClaim (BalCoreBank.sol:1303).
    const r = checkClaimYield({ ...base, lastClaimedEpoch: 1n, currentEpoch: 1n });
    assert.equal(r.blocker?.code, "noSettledEpoch");
    assert.match(r.blocker?.message ?? "", /Tuesday settlement/);
  });

  test("a settled range that credits nothing explains the activation rule", () => {
    // The trap: shares earn from the epoch AFTER they activate (:1342), so a
    // fresh deposit reads zero and looks broken.
    const r = checkClaimYield({ ...base, claimableUsdc: 0n, claimableTokenA: 0n });
    assert.equal(r.blocker?.code, "zeroClaimable");
    assert.match(r.blocker?.message ?? "", /week AFTER/);
  });

  test("a tokenA-only credit still claims", () => {
    const r = checkClaimYield({ ...base, claimableUsdc: 0n, claimableTokenA: 42n });
    assert.equal(r.ok, true);
  });

  test("disconnected and wrong-network come first", () => {
    assert.equal(checkClaimYield({ ...base, connected: false }).blocker?.code, "notConnected");
    assert.equal(checkClaimYield({ ...base, wrongNetwork: true }).blocker?.code, "wrongNetwork");
  });
});

/* ------------------------------------------------------------------ */
/* Fast-track                                                          */
/* ------------------------------------------------------------------ */

describe("previewFastTrack", () => {
  test("the 3% fee is floored integer division, as VaultMath.sol:307 does it", () => {
    const p = previewFastTrack(100_000_000n); // $100
    assert.equal(p.fee, 3_000_000n);
    assert.equal(p.net, 97_000_000n);
    assert.equal(p.fee + p.net, p.gross);
  });

  test("an amount that does not divide cleanly floors the FEE, favouring the user", () => {
    const p = previewFastTrack(101n);
    assert.equal(p.fee, 3n); // 303/100 floored
    assert.equal(p.net, 98n);
    assert.equal(p.fee + p.net, 101n);
  });

  test("wallet B's strike value through the fee", () => {
    // strikeValue 119,576,516 from the runsheet.
    const p = previewFastTrack(119_576_516n);
    assert.equal(p.fee, 3_587_295n);
    assert.equal(p.net, 115_989_221n);
  });

  test("zero and negative are inert", () => {
    assert.deepEqual(previewFastTrack(0n), { gross: 0n, fee: 0n, net: 0n });
    assert.deepEqual(previewFastTrack(-1n), { gross: 0n, fee: 0n, net: 0n });
  });
});

describe("checkFastTrack", () => {
  const base = {
    shares: 339_543_906n,
    positionValue: 119_576_516n,
    paused: false,
    poolLive: true,
    connected: true,
    wrongNetwork: false,
    available: true,
    unavailableReason: null,
    fitsAmount: true,
  };

  test("an available pool passes, but ALWAYS warns about the missing IL cover", () => {
    const r = checkFastTrack(base);
    assert.equal(r.ok, true);
    assert.equal(r.warnings[0]?.code, "noIlCover");
    assert.match(r.warnings[0]?.message ?? "", /NO impermanent-loss cover/);
    assert.match(r.warnings[0]?.message ?? "", /3% fee/);
  });

  test("run mode — the live BTC state today — blocks with the pool's own reason", () => {
    const reason = "Fast-Track is suspended while the pool works through its queue.";
    const r = checkFastTrack({ ...base, available: false, unavailableReason: reason });
    assert.equal(r.ok, false);
    assert.equal(r.blocker?.code, "unavailable");
    assert.equal(
      r.blocker?.message,
      reason,
      "the availability reason must reach the user verbatim",
    );
  });

  test("unavailable with no reason still says something", () => {
    const r = checkFastTrack({ ...base, available: false, unavailableReason: null });
    assert.ok((r.blocker?.message ?? "").length > 0);
  });

  test("no position blocks", () => {
    assert.equal(checkFastTrack({ ...base, shares: 0n }).blocker?.code, "noPosition");
    assert.equal(checkFastTrack({ ...base, positionValue: 0n }).blocker?.code, "noPosition");
  });

  test("a position larger than the pool can serve points at the standard path", () => {
    const r = checkFastTrack({ ...base, fitsAmount: false });
    assert.equal(r.blocker?.code, "tooLarge");
    assert.match(r.blocker?.message ?? "", /standard 7-day/);
  });
});
