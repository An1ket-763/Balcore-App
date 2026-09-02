/**
 * How much native AVAX a swap must leave behind for gas.
 *
 * "Max" used to mean the entire native balance, which is never spendable: the
 * swap itself sends that balance as `value`, leaving nothing to pay the
 * Avalanche fee with, so the wallet refuses it or the transaction reverts.
 * Every native Max was a guaranteed failure. These helpers carve out a
 * fee-aware buffer instead.
 *
 * Pure and free of viem/wagmi state on purpose — the numbers here decide how
 * much of someone's balance is spendable, so they are unit-testable in
 * isolation.
 */

/** 1 AVAX in wei. Avoids pulling viem in for a constant. */
const ONE_AVAX = 10n ** 18n;

/**
 * Deliberately generous: covers an aggregator multi-hop, which is the most
 * gas-hungry of the four routes. Over-reserving costs the user a sliver of
 * their Max; under-reserving costs them a failed transaction.
 */
export const SWAP_GAS_LIMIT = 700_000n;

/**
 * Avalanche's base fee moves between blocks, so the reserve is doubled against
 * the current estimate to survive a spike between quoting and signing.
 */
const FEE_SPIKE_MULTIPLIER = 2n;

/** Never hold back less than this, however cheap gas looks right now. */
const MIN_RESERVE = ONE_AVAX / 100n; // 0.01 AVAX

/** Never hold back more than this, however expensive gas looks right now. */
const MAX_RESERVE = (ONE_AVAX * 15n) / 100n; // 0.15 AVAX

/** Used when the node returns no fee data at all. */
const FALLBACK_RESERVE = (ONE_AVAX * 3n) / 100n; // 0.03 AVAX

/**
 * Native balance to hold back for gas, clamped so neither a quiet chain nor a
 * fee spike produces an absurd reserve.
 */
export function gasReserveWei(maxFeePerGas: bigint | null | undefined): bigint {
  if (maxFeePerGas === null || maxFeePerGas === undefined || maxFeePerGas <= 0n) {
    return FALLBACK_RESERVE;
  }
  const estimate = maxFeePerGas * SWAP_GAS_LIMIT * FEE_SPIKE_MULTIPLIER;
  if (estimate < MIN_RESERVE) return MIN_RESERVE;
  if (estimate > MAX_RESERVE) return MAX_RESERVE;
  return estimate;
}

/**
 * The part of a native balance a swap may actually spend. Never negative: a
 * wallet holding less than the reserve has nothing spendable, and saying so is
 * better than offering a Max that cannot be signed.
 */
export function spendableNative(balanceWei: bigint, reserveWei: bigint): bigint {
  return balanceWei > reserveWei ? balanceWei - reserveWei : 0n;
}

/**
 * A percentage of a balance, in the token's own smallest unit.
 *
 * Integer maths throughout, and it floors. The old path formatted the balance
 * to a float, rounded it to 8 decimal places and parsed it back — for an
 * 18-decimal token that rounding could land ABOVE the real balance (1.234567895
 * rounds to 1.23456790), producing a Max the wallet cannot cover.
 */
export function portionOf(balanceWei: bigint, pct: number): bigint {
  if (balanceWei <= 0n || pct <= 0) return 0n;
  const clamped = Math.min(Math.max(Math.round(pct), 0), 100);
  return (balanceWei * BigInt(clamped)) / 100n;
}
