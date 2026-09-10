/**
 * Unit tests for the Balcore pure math.
 *
 * Runner: Node's built-in `node:test` with `--experimental-strip-types`
 * (`npm run test`). Deliberately zero-dependency — bunfig.toml's 24h
 * supply-chain guard makes adding a test framework a decision for the user,
 * and these functions need no DOM, no network and no bundler.
 *
 * The expected values are anchored to real chain state wherever possible:
 * balcore-contracts@c190dc0 docs/mainnet-ceremony-runsheet.md, "Tue Sep 8 as
 * executed" (range 8391276/8391290, totalShares 339,544,906, epoch 1).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  LB_REFERENCE_BIN,
  binToPrice,
  priceToBin,
  feeDialLane,
  matchedAmount,
  ratioOk,
  positionValue,
  holderTVL,
  nextTuesday00Z,
} from "./math.ts";

/** BTC trio constants, from config/addresses.ts. */
const BTC = { binStep: 25, decA: 8, decB: 6, scaleA2B: 10_000_000_000n };
/** AVAX trio constants. */
const AVAX = { binStep: 5, decA: 18, decB: 6, scaleA2B: 100_000_000_000_000_000_000n };

describe("binToPrice", () => {
  test("the reference bin is price 1 in atom terms", () => {
    // 10 ** (8 - 6) = 100 for BTC.b/USDC.
    assert.equal(binToPrice(LB_REFERENCE_BIN, BTC.binStep, BTC.decA, BTC.decB), 100);
  });

  test("live BTC range 8391276/8391290 prices to ~78.2k / ~81.0k", () => {
    // Runsheet: rebalance(8391276, 8391290, NORMAL, true), block 94747365.
    const lower = binToPrice(8_391_276, BTC.binStep, BTC.decA, BTC.decB);
    const upper = binToPrice(8_391_290, BTC.binStep, BTC.decA, BTC.decB);
    assert.ok(lower > 78_000 && lower < 78_400, `lower was ${lower}`);
    assert.ok(upper > 80_800 && upper < 81_200, `upper was ${upper}`);
    assert.ok(upper > lower);
  });

  test("14 bins of 25bps compounds to ~3.56%", () => {
    const lower = binToPrice(8_391_276, BTC.binStep, BTC.decA, BTC.decB);
    const upper = binToPrice(8_391_290, BTC.binStep, BTC.decA, BTC.decB);
    // (1.0025 ** 14) - 1 = 0.035616…
    assert.ok(Math.abs(upper / lower - 1.0025 ** 14) < 1e-9);
  });

  test("one bin step up multiplies by exactly (1 + binStep/1e4)", () => {
    const a = binToPrice(8_391_276, BTC.binStep, BTC.decA, BTC.decB);
    const b = binToPrice(8_391_277, BTC.binStep, BTC.decA, BTC.decB);
    assert.ok(Math.abs(b / a - 1.0025) < 1e-12);
  });

  test("decimal scaling differs between the two trios", () => {
    // WAVAX is 18-dec, so the atom→unit factor is 10**12, not 10**2.
    assert.equal(binToPrice(LB_REFERENCE_BIN, AVAX.binStep, AVAX.decA, AVAX.decB), 1e12);
  });

  test("rejects a non-positive bin step", () => {
    assert.ok(Number.isNaN(binToPrice(LB_REFERENCE_BIN, 0, 8, 6)));
  });
});

describe("priceToBin", () => {
  test("round-trips every bin in the live range", () => {
    for (let id = 8_391_276; id <= 8_391_290; id++) {
      const price = binToPrice(id, BTC.binStep, BTC.decA, BTC.decB);
      assert.equal(priceToBin(price, BTC.binStep, BTC.decA, BTC.decB), id);
    }
  });

  test("round-trips on the AVAX trio too", () => {
    const id = 8_400_000;
    const price = binToPrice(id, AVAX.binStep, AVAX.decA, AVAX.decB);
    assert.equal(priceToBin(price, AVAX.binStep, AVAX.decA, AVAX.decB), id);
  });

  test("snaps a price between bins to the nearer one", () => {
    const lo = binToPrice(8_391_276, BTC.binStep, BTC.decA, BTC.decB);
    const hi = binToPrice(8_391_277, BTC.binStep, BTC.decA, BTC.decB);
    assert.equal(priceToBin(lo * 1.0001, BTC.binStep, BTC.decA, BTC.decB), 8_391_276);
    assert.equal(priceToBin(hi * 0.9999, BTC.binStep, BTC.decA, BTC.decB), 8_391_277);
  });

  test("rejects a non-positive price", () => {
    assert.ok(Number.isNaN(priceToBin(0, BTC.binStep, BTC.decA, BTC.decB)));
    assert.ok(Number.isNaN(priceToBin(-1, BTC.binStep, BTC.decA, BTC.decB)));
  });
});

describe("feeDialLane", () => {
  // The launch word, BalCoreVault.sol:532-533.
  const LAUNCH = (500n << 64n) | (3000n << 48n) | (3000n << 32n) | (2500n << 16n) | 500n;

  test("reads every launch default off the packed word", () => {
    assert.equal(feeDialLane(LAUNCH, "base"), 500);
    assert.equal(feeDialLane(LAUNCH, "debtRepay"), 2500);
    assert.equal(feeDialLane(LAUNCH, "perf"), 3000);
    assert.equal(feeDialLane(LAUNCH, "apyCap"), 3000);
    assert.equal(feeDialLane(LAUNCH, "reserveHealth"), 500);
    assert.equal(feeDialLane(LAUNCH, "ilSkim"), 0);
  });

  test("apyCap is the 30% the UI advertises", () => {
    assert.equal(feeDialLane(LAUNCH, "apyCap") / 100, 30);
  });

  test("lanes are independent — a turned dial does not disturb its neighbours", () => {
    // setFeeParam(3, 2500): clear lane 3, write 2500.
    const turned = (LAUNCH & ~(0xffffn << 48n)) | (2500n << 48n);
    assert.equal(feeDialLane(turned, "apyCap"), 2500);
    assert.equal(feeDialLane(turned, "perf"), 3000);
    assert.equal(feeDialLane(turned, "reserveHealth"), 500);
  });

  test("a lane can hold the full 16-bit range", () => {
    assert.equal(feeDialLane(0xffffn << 80n, "ilSkim"), 65535);
  });
});

describe("matchedAmount", () => {
  const price8 = 7_800_000_000_000n; // $78,000.00 at 8dp

  test("values 1 BTC.b at the feed price", () => {
    // 1e8 sats * 78_000e8 / 1e10 = 78_000e6 micro-USDC.
    assert.equal(matchedAmount({ tokenA: 100_000_000n }, price8, BTC.scaleA2B), 78_000_000_000n);
  });

  test("inverts back to the same tokenA amount", () => {
    const usdc = matchedAmount({ tokenA: 100_000_000n }, price8, BTC.scaleA2B);
    assert.equal(matchedAmount({ usdc }, price8, BTC.scaleA2B), 100_000_000n);
  });

  test("truncates like the chain's mulDiv rather than rounding", () => {
    // 1 sat is worth 780 micro-USDC exactly; 1 sat at a price with a
    // remainder must floor, not round up.
    const odd = 7_800_000_000_001n;
    assert.equal(matchedAmount({ tokenA: 1n }, odd, BTC.scaleA2B), 780n);
  });

  test("handles the 18-decimal AVAX leg", () => {
    const avaxPrice8 = 3_800_000_000n; // $38.00
    // 1e18 wei * 38e8 / 1e20 = 38e6 micro-USDC.
    assert.equal(matchedAmount({ tokenA: 10n ** 18n }, avaxPrice8, AVAX.scaleA2B), 38_000_000n);
  });

  test("degrades to 0 on non-positive inputs instead of dividing by zero", () => {
    assert.equal(matchedAmount({ tokenA: 100n }, 0n, BTC.scaleA2B), 0n);
    assert.equal(matchedAmount({ usdc: 100n }, price8, 0n), 0n);
    assert.equal(matchedAmount({ tokenA: 0n }, price8, BTC.scaleA2B), 0n);
    assert.equal(matchedAmount({ usdc: -5n }, price8, BTC.scaleA2B), 0n);
  });
});

describe("ratioOk", () => {
  test("accepts an exactly balanced pair", () => {
    assert.equal(ratioOk(1_000_000n, 1_000_000n), true);
  });

  test("accepts the boundary at exactly 1% of the larger", () => {
    // larger 100_000_000 → tolerance 1_000_000; diff exactly 1_000_000 passes.
    assert.equal(ratioOk(100_000_000n, 99_000_000n), true);
  });

  test("rejects one atom past the boundary", () => {
    assert.equal(ratioOk(100_000_000n, 98_999_999n), false);
  });

  test("is symmetric in its arguments", () => {
    assert.equal(ratioOk(100_000_000n, 99_500_000n), ratioOk(99_500_000n, 100_000_000n));
    assert.equal(ratioOk(100_000_000n, 90_000_000n), ratioOk(90_000_000n, 100_000_000n));
  });

  test("takes the tolerance from the LARGER side", () => {
    // If the tolerance came from the smaller side (99 → 0), this would fail.
    assert.equal(ratioOk(100n, 99n), true);
  });

  test("floors the tolerance, as integer division does on chain", () => {
    // larger 99 → 99/100 = 0 tolerance, so only an exact match passes.
    assert.equal(ratioOk(99n, 99n), true);
    assert.equal(ratioOk(99n, 98n), false);
  });

  test("two zeroes are trivially in ratio", () => {
    assert.equal(ratioOk(0n, 0n), true);
  });
});

describe("positionValue", () => {
  test("a whole-vault holder is worth the whole TVL", () => {
    assert.equal(positionValue(1_000n, 500_000n, 1_000n), 500_000n);
  });

  test("splits pro-rata", () => {
    assert.equal(positionValue(250n, 1_000_000n, 1_000n), 250_000n);
  });

  test("prices the live wallet-B request against live totalShares", () => {
    // Runsheet: request {shares 120,102,703}, totalShares after 339,544,906.
    // At a holder-TVL of 339,544,906 micro-USDC the shares are ~1:1.
    const v = positionValue(120_102_703n, 339_544_906n, 339_544_906n);
    assert.equal(v, 120_102_703n);
  });

  test("truncates rather than rounding", () => {
    // 1 * 10 / 3 = 3.33… → 3
    assert.equal(positionValue(1n, 10n, 3n), 3n);
  });

  test("returns 0 instead of throwing on an empty vault", () => {
    assert.equal(positionValue(100n, 500n, 0n), 0n);
    assert.equal(positionValue(0n, 500n, 100n), 0n);
    assert.equal(positionValue(100n, 0n, 100n), 0n);
  });
});

describe("holderTVL", () => {
  const price8 = 7_800_000_000_000n; // $78,000.00

  test("equals totalAssets when nothing is pending", () => {
    assert.equal(holderTVL(1_000_000n, 0n, 0n, price8, BTC.scaleA2B), 1_000_000n);
  });

  test("subtracts a pending USDC basket", () => {
    assert.equal(holderTVL(1_000_000n, 0n, 250_000n, price8, BTC.scaleA2B), 750_000n);
  });

  test("values a pending tokenA basket at the feed price before subtracting", () => {
    // 100_000 sats * 78_000e8 / 1e10 = 78_000_000 micro-USDC.
    assert.equal(holderTVL(100_000_000n, 100_000n, 0n, price8, BTC.scaleA2B), 22_000_000n);
  });

  test("subtracts both legs of the basket", () => {
    // Runsheet basket: 77,050 sats + 58,911,371 USDC.
    const ta = 200_000_000n;
    const expected = ta - ((77_050n * price8) / BTC.scaleA2B + 58_911_371n);
    assert.equal(holderTVL(ta, 77_050n, 58_911_371n, price8, BTC.scaleA2B), expected);
  });

  test("floors at 0 when the earmark exceeds totalAssets", () => {
    assert.equal(holderTVL(100n, 0n, 5_000n, price8, BTC.scaleA2B), 0n);
  });

  test("is never larger than totalAssets", () => {
    const ta = 1_000_000n;
    assert.ok(holderTVL(ta, 1_000n, 1_000n, price8, BTC.scaleA2B) <= ta);
  });
});

describe("nextTuesday00Z", () => {
  const iso = (ms: number) => new Date(ms).toISOString();

  test("from a Sunday, returns that week's Tuesday", () => {
    // 2026-09-06 is a Sunday.
    assert.equal(iso(nextTuesday00Z(Date.UTC(2026, 8, 6, 12, 0, 0))), "2026-09-08T00:00:00.000Z");
  });

  test("from a Monday before the cutoff, returns the next day", () => {
    assert.equal(iso(nextTuesday00Z(Date.UTC(2026, 8, 7, 22, 0, 0))), "2026-09-08T00:00:00.000Z");
  });

  test("from mid-Tuesday, returns the FOLLOWING Tuesday", () => {
    assert.equal(iso(nextTuesday00Z(Date.UTC(2026, 8, 8, 10, 0, 0))), "2026-09-15T00:00:00.000Z");
  });

  test("exactly on the boundary rolls forward a full week", () => {
    // The boundary has arrived; the NEXT one is 7 days out.
    assert.equal(iso(nextTuesday00Z(Date.UTC(2026, 8, 8, 0, 0, 0))), "2026-09-15T00:00:00.000Z");
  });

  test("one millisecond before the boundary returns that boundary", () => {
    const ms = Date.UTC(2026, 8, 8, 0, 0, 0) - 1;
    assert.equal(iso(nextTuesday00Z(ms)), "2026-09-08T00:00:00.000Z");
  });

  test("matches the runsheet's stated Sep 15 boundary", () => {
    // Runsheet, "Tue Sep 8 as executed": "Next: boundary Sep 15 00:00Z".
    assert.equal(iso(nextTuesday00Z(Date.UTC(2026, 8, 8, 4, 37, 0))), "2026-09-15T00:00:00.000Z");
  });

  test("always lands on a Tuesday at exactly midnight UTC", () => {
    for (let d = 0; d < 21; d++) {
      const t = nextTuesday00Z(Date.UTC(2026, 8, 1, 7, 13, 29) + d * 86_400_000);
      const at = new Date(t);
      assert.equal(at.getUTCDay(), 2);
      assert.equal(at.getUTCHours(), 0);
      assert.equal(at.getUTCMinutes(), 0);
      assert.equal(at.getUTCSeconds(), 0);
      assert.equal(at.getUTCMilliseconds(), 0);
      assert.ok(t > Date.UTC(2026, 8, 1, 7, 13, 29) + d * 86_400_000);
    }
  });

  test("is always strictly in the future and at most 7 days out", () => {
    const now = Date.UTC(2026, 8, 9, 15, 42, 11);
    const next = nextTuesday00Z(now);
    assert.ok(next > now);
    assert.ok(next - now <= 7 * 86_400_000);
  });
});
