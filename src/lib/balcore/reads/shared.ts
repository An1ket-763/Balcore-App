/**
 * Decoding helpers shared by the Balcore read hooks.
 *
 * `useReadContracts({ allowFailure: true })` returns a positional array of
 * `{ status, result }`, so every consumer needs the same two things: a safe
 * read at an index that may not exist, and a "did the whole batch land"
 * summary. Doing it here keeps the hooks about their own shape.
 *
 * allowFailure stays ON for the same reason swapBalances.ts uses it: one
 * reverting view (a vault with no position yet, a pair that has never traded)
 * must not blank out the other twenty reads.
 */

import { formatUnits } from "viem";

/** One entry of a wagmi `allowFailure: true` result array. */
export interface ReadResult {
  status: "success" | "failure";
  result?: unknown;
  error?: unknown;
}

/** Positional results as wagmi hands them back, before decoding. */
export type ReadResults = readonly ReadResult[] | undefined;

/**
 * A `bigint` at `index`, or `null` when that call failed, is missing, or came
 * back as something else.
 *
 * null — not 0n — because the two are different facts: "the vault holds
 * nothing" and "we could not read the vault" must not render identically.
 */
export function bigintAt(results: ReadResults, index: number): bigint | null {
  const entry = results?.[index];
  if (!entry || entry.status !== "success") return null;
  return typeof entry.result === "bigint" ? entry.result : null;
}

/** A `boolean` at `index`, or null on failure. */
export function boolAt(results: ReadResults, index: number): boolean | null {
  const entry = results?.[index];
  if (!entry || entry.status !== "success") return null;
  return typeof entry.result === "boolean" ? entry.result : null;
}

/**
 * A `number` at `index` — for the small uint types (uint8 vaultState, uint24
 * bin ids) viem decodes as JS numbers rather than bigints.
 */
export function numberAt(results: ReadResults, index: number): number | null {
  const entry = results?.[index];
  if (!entry || entry.status !== "success") return null;
  if (typeof entry.result === "number") return entry.result;
  // A uint32+ lands as bigint; narrow it only when it is exactly representable.
  if (typeof entry.result === "bigint" && entry.result <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(entry.result);
  }
  return null;
}

/**
 * A struct/tuple return at `index` as a readonly array, or null.
 *
 * Solidity getters for a `public mapping(address => Struct)` return the fields
 * as a flat tuple, which viem gives back as an array in declaration order.
 */
export function tupleAt(results: ReadResults, index: number): readonly unknown[] | null {
  const entry = results?.[index];
  if (!entry || entry.status !== "success") return null;
  return Array.isArray(entry.result) ? (entry.result as readonly unknown[]) : null;
}

/** One `bigint` field out of a decoded tuple. */
export function tupleBigint(tuple: readonly unknown[] | null, at: number): bigint {
  const v = tuple?.[at];
  return typeof v === "bigint" ? v : 0n;
}

/** One `boolean` field out of a decoded tuple. */
export function tupleBool(tuple: readonly unknown[] | null, at: number): boolean {
  return tuple?.[at] === true;
}

/**
 * A token amount as a display float.
 *
 * Display only. Anything deciding how much may actually be spent or withdrawn
 * reads the bigint — the rule swapBalances.ts states: formatting to a float
 * and parsing back loses precision and can land above the real balance.
 */
export function toFloat(value: bigint | null, decimals: number): number {
  if (value === null) return 0;
  const n = Number(formatUnits(value, decimals));
  return Number.isFinite(n) ? n : 0;
}

/** Chainlink feed prices are 8-decimal across the board. */
export const FEED_DECIMALS = 8;

/** A `lastValidPrice()` reading as a display float. */
export function priceToFloat(price8: bigint | null): number {
  return toFloat(price8, FEED_DECIMALS);
}
