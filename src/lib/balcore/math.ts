/**
 * Pure math shared by the Balcore reads and (later) the deposit/withdraw forms.
 *
 * Every function here mirrors a formula that exists in the contracts. Where it
 * does, the source is cited on the function — balcore-contracts@c190dc0 — and
 * the TS must not "improve" on it: a frontend that rounds differently from the
 * chain shows a number the transaction then contradicts.
 *
 * Deliberately free of viem/wagmi/React so it is unit-testable in isolation,
 * the same rule `src/lib/gasReserve.ts` and `src/lib/cctp.ts` follow. Token
 * amounts are `bigint` in the token's smallest unit; only the explicitly
 * display-oriented helpers return `number`.
 */

/* ------------------------------------------------------------------ */
/* Liquidity Book bins                                                 */
/* ------------------------------------------------------------------ */

/**
 * The LB reference bin — the id at which price == 1 in ATOM terms.
 * Liquidity Book centres its bin ids on 2**23.
 */
export const LB_REFERENCE_BIN = 8_388_608; // 2 ** 23

/**
 * Human price of an LB bin.
 *
 * LB defines bin `id` as `(1 + binStep/10_000) ** (id - 2**23)` tokenB ATOMS
 * per tokenA ATOM. Converting atoms→units multiplies by 10**(decA - decB).
 *
 * Returns a float: this is a display/threshold number (chart axes, "in range"
 * copy), never an amount that gets sent to a contract. The chain's own
 * fixed-point version is `ILBPair.getPriceFromId` (Q128.128).
 *
 * @param id       bin id (uint24 on chain)
 * @param binStep  bin step in bps — 25 for the BTC.b/USDC pair, 5 for WAVAX/USDC
 * @param decA     tokenA decimals (BTC.b 8, WAVAX 18)
 * @param decB     tokenB decimals (USDC 6)
 */
export function binToPrice(id: number, binStep: number, decA: number, decB: number): number {
  if (!Number.isFinite(id) || !Number.isFinite(binStep) || binStep <= 0) return NaN;
  const exponent = id - LB_REFERENCE_BIN;
  const atomPrice = Math.pow(1 + binStep / 10_000, exponent);
  return atomPrice * Math.pow(10, decA - decB);
}

/**
 * Inverse of {@link binToPrice}, rounded to the nearest bin.
 *
 * A price rarely lands exactly on a bin boundary, so the result is the bin
 * whose price is closest. Use it for "where would this price sit", never to
 * reconstruct a range the keeper already chose — read `rangeLower`/`rangeUpper`
 * for that.
 */
export function priceToBin(price: number, binStep: number, decA: number, decB: number): number {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(binStep) || binStep <= 0) {
    return NaN;
  }
  const atomPrice = price / Math.pow(10, decA - decB);
  const exponent = Math.log(atomPrice) / Math.log(1 + binStep / 10_000);
  return Math.round(exponent) + LB_REFERENCE_BIN;
}

/* ------------------------------------------------------------------ */
/* Fee dials                                                           */
/* ------------------------------------------------------------------ */

/**
 * The six money dials, packed 16 bits each into `BalCoreVault.feeDialsPacked`.
 *
 * Lane order is `key * 16` — BalCoreVault.setFeeParam (`shift = key * 16`,
 * BalCoreVault.sol:2648) and the launch literal at BalCoreVault.sol:532-533
 * (`(500 << 64) | (3000 << 48) | (3000 << 32) | (2500 << 16) | 500`, commented
 * "ilSkim 0 | reserveHealth 500 | apy 3000 | perf 3000 | debtRepay 2500 |
 * base 500"). Cross-checked against the stone-ceiling word
 * 0x1388_07D0_2710_1388_1388_03E8, whose lanes read 1000 / 5000 / 5000 /
 * 10000 / 2000 / 5000 for keys 0..5.
 */
export const FEE_DIAL_KEYS = {
  /** Base protocol fee, bps. Launch 500 (5%). */
  base: 0,
  /** Share of yield routed to debt repayment, bps. Launch 2500. */
  debtRepay: 1,
  /** Performance fee, bps. Launch 3000. */
  perf: 2,
  /** APY cap, bps. Launch 3000 = the "capped at 30%" the UI advertises. */
  apyCap: 3,
  /** Reserve health target, bps. Launch 500. */
  reserveHealth: 4,
  /** IL skim, bps. Launch 0 = OFF. */
  ilSkim: 5,
} as const;

export type FeeDialKey = keyof typeof FEE_DIAL_KEYS;

/**
 * Read one 16-bit dial out of the packed word.
 *
 * @param packed  the `feeDialsPacked()` value
 * @param key     which dial
 * @returns the dial in bps
 */
export function feeDialLane(packed: bigint, key: FeeDialKey): number {
  const shift = BigInt(FEE_DIAL_KEYS[key]) * 16n;
  return Number((packed >> shift) & 0xffffn);
}

/* ------------------------------------------------------------------ */
/* Deposit pairing                                                     */
/* ------------------------------------------------------------------ */

/**
 * The matching leg of a balanced deposit.
 *
 * The contract values tokenA in tokenB terms as
 * `mulDiv(amountA, price8, SCALE_A2B)` (BalCoreBank.sol:486). Given one leg
 * this returns the other, so a "USDC only, we split it" form can show what it
 * will buy, and a "both tokens" form can pin the second box to the first.
 *
 * Integer division truncates, exactly as the chain's `mulDiv` does — do not
 * round here, or the amount shown passes `checkDepositRatio` on screen and
 * fails on chain at the boundary.
 *
 * @param input     the leg the user typed, in that token's smallest unit
 * @param price8    tokenA/USD from the Chainlink feed, 8 decimals
 * @param scaleA2B  the pool's SCALE_A2B
 * @returns the OTHER leg, in its own smallest unit
 */
export function matchedAmount(
  input: { usdc: bigint } | { tokenA: bigint },
  price8: bigint,
  scaleA2B: bigint,
): bigint {
  if (price8 <= 0n || scaleA2B <= 0n) return 0n;
  if ("tokenA" in input) {
    // tokenA → its value in tokenB units.
    if (input.tokenA <= 0n) return 0n;
    return (input.tokenA * price8) / scaleA2B;
  }
  // tokenB → the tokenA amount of equal value. Inverse of the same identity.
  if (input.usdc <= 0n) return 0n;
  return (input.usdc * scaleA2B) / price8;
}

/**
 * The ±1% balanced-deposit check.
 *
 * Port of `VaultMath.checkDepositRatio` (VaultMath.sol:810): tolerance is
 * `max(a, b) / 100` — integer division, so it FLOORS — and the check is
 * `|a - b| <= tolerance`. Both arguments must already be in the same units
 * (tokenB terms); pair it with {@link matchedAmount} to get there.
 *
 * Reproducing the floor matters: at small amounts `larger / 100` truncates to
 * a smaller tolerance than a float 1% would give, and a form that used the
 * float version would let the user submit a deposit the chain then reverts
 * with `DepositRatioOutOfBounds`.
 */
export function ratioOk(a: bigint, b: bigint): boolean {
  const larger = a > b ? a : b;
  const tolerance = larger / 100n; // integer division — floors, as on chain
  const diff = a > b ? a - b : b - a;
  return diff <= tolerance;
}

/* ------------------------------------------------------------------ */
/* Share valuation                                                     */
/* ------------------------------------------------------------------ */

/**
 * What a holder's shares are worth, in tokenB units.
 *
 * Port of `VaultMath.calculateWithdrawValue` (VaultMath.sol:117):
 * `(userShares * totalTVL) / totalShares`. The TVL passed in must be
 * HOLDER-TVL, not `totalAssets()` — see {@link holderTVL}.
 *
 * Returns 0 rather than throwing when `totalShares` is 0; the contract reverts
 * `ZeroAmount()` there, but a read surface that throws takes the whole panel
 * down over an empty vault.
 */
export function positionValue(shares: bigint, tvl: bigint, totalShares: bigint): bigint {
  if (totalShares <= 0n || shares <= 0n || tvl <= 0n) return 0n;
  return (shares * tvl) / totalShares;
}

/**
 * The value backing LIVE shares — `totalAssets()` minus the baskets already
 * earmarked for pending exiters.
 *
 * Port of `BalCoreBank._holderPricingTVL` (BalCoreBank.sol:467) over
 * `_earmarkValue` (BalCoreBank.sol:454):
 *   earmark   = mulDiv(pendingA, price8, SCALE_A2B) + pendingB
 *   holderTVL = max(0, totalAssets - earmark)
 *
 * Pricing a position against `totalAssets()` instead OVERSTATES it whenever a
 * withdrawal is queued — which is the vault's current state (runMode true, one
 * pending basket) — so this offset is not optional.
 *
 * @param totalAssets  `bank.totalAssets()`
 * @param pendingA     `bank.pendingBtcb()` — tokenA atoms
 * @param pendingB     `bank.pendingUsdc()` — tokenB atoms
 */
export function holderTVL(
  totalAssets: bigint,
  pendingA: bigint,
  pendingB: bigint,
  price8: bigint,
  scaleA2B: bigint,
): bigint {
  const earmark = matchedAmount({ tokenA: pendingA }, price8, scaleA2B) + pendingB;
  return totalAssets > earmark ? totalAssets - earmark : 0n;
}

/* ------------------------------------------------------------------ */
/* Settlement clock                                                    */
/* ------------------------------------------------------------------ */

/** Milliseconds in a day — avoids repeating the literal. */
const DAY_MS = 86_400_000;

/**
 * The next weekly settlement boundary: Tuesday 00:00 UTC.
 *
 * `EPOCH_DURATION` is 7 days and `QUEUE_CUTOFF` 1 hour (BalCoreBank.sol:53-54),
 * which is the Monday 23:00 UTC cutoff the dashboard copy already quotes. This
 * returns the BOUNDARY, not the cutoff — subtract an hour for that.
 *
 * A `now` that is already exactly Tuesday 00:00:00.000 UTC returns the
 * following Tuesday: the boundary at that instant has arrived, so the next one
 * is a week out.
 *
 * @param now  reference time (ms since epoch), defaults to the current clock
 * @returns ms since epoch of the next Tuesday 00:00 UTC
 */
export function nextTuesday00Z(now: number = Date.now()): number {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // getUTCDay: 0 Sun … 2 Tue. Days until the next Tuesday, 1..7.
  let add = (2 - d.getUTCDay() + 7) % 7;
  if (add === 0 && now >= midnight) add = 7;
  return midnight + add * DAY_MS;
}
