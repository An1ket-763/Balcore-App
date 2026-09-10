/**
 * Balcore protocol deployments — Avalanche C-Chain mainnet.
 *
 * Every address below was read from the deployment record, NOT from memory:
 * balcore-contracts@c190dc0 `docs/mainnet-ceremony-runsheet.md` §10
 * ("AS EXECUTED — Thu Sep 3 2026"), with the line each value came from cited
 * on the field. A wrong address here does not throw — it points a deposit at
 * a contract that will happily take the tokens, so treat this file as
 * append-only unless you have re-read the runsheet.
 *
 * The two PAIR addresses appear truncated in §10's read-back lines
 * (`0xCD4d…189f2`, `0x8aC5…3379`); the full values are taken from
 * `docs/deploy-runbook.md` lines 178-179, which record the same pools with
 * their binSteps and were cross-checked against the truncation.
 *
 * Deliberately pure — constants and types only, no viem/wagmi/React imports —
 * so it can be read by tests and by non-hook code. Same shape as
 * `src/lib/cctp.ts`, including the `isMainnet` gate.
 */

import type { Address } from "viem";
import { avalanche } from "viem/chains";
import { isMainnet } from "@/lib/wagmi";
import { USDC_ADDRESS } from "@/features/ui-preview/dashboard/data/balances";
import { tokenBySymbol } from "@/lib/tokens";

/* ------------------------------------------------------------------ */
/* Chain                                                               */
/* ------------------------------------------------------------------ */

/**
 * Balcore v1 is deployed on Avalanche C-Chain ONLY. This is not the app's
 * `defaultChain` — that follows VITE_CHAIN_ENV and can point at Fuji, where
 * nothing below exists. Reads must pin this id explicitly.
 */
export const BALCORE_CHAIN_ID = avalanche.id; // 43114

/* ------------------------------------------------------------------ */
/* Pools                                                               */
/* ------------------------------------------------------------------ */

/** Which trio a caller means. Keys match the existing dashboard pool keys. */
export type PoolKey = "btc" | "avax";

/**
 * "live" = deployed, activated and taking deposits.
 * "comingSoon" = contracts exist on chain but the trio is not open to users
 * (the AVAX keeper is stopped — runsheet §10, "balcore-keeper-avax still
 * stopped / disabled"). Reads are safe; writes must be refused.
 */
export type PoolStatus = "live" | "comingSoon";

export interface BalcorePool {
  key: PoolKey;
  /** Human label, matching the dashboard's existing copy. */
  label: string;
  /** BalCoreBank — deposits, withdrawal queue, yield. The user-facing contract. */
  bank: Address;
  /** BalCoreVault ("the trader") — LP position, reserves, debt. */
  vault: Address;
  /** BalCoreSequencer — risk dials. */
  sequencer: Address;
  /** PharaohVenue — the LP venue clone. */
  venue: Address;
  /** Pharaoh Liquidity Book pair the venue deploys into. */
  pair: Address;
  /** Chainlink price feed for tokenA/USD (8 decimals). */
  feed: Address;
  /** The volatile leg. */
  tokenA: { address: Address; symbol: string; decimals: number };
  /** The stable leg — always Circle USDC. */
  tokenB: { address: Address; symbol: string; decimals: number };
  /** LB bin step in bps. Read back at the ceremony. */
  binStep: number;
  /**
   * 10 ** (tokenA.decimals + feedDecimals - tokenB.decimals).
   *
   * The contracts' own scaling constant: `tokenAValueInB =
   * mulDiv(amountA, price8, SCALE_A2B)` (BalCoreBank.sol:486). Chainlink feeds
   * are 8-decimal, so BTC.b is 10**(8+8-6) = 1e10 and WAVAX 10**(18+8-6) = 1e20.
   * Stored as a bigint because every use of it is bigint arithmetic.
   */
  scaleA2B: bigint;
  status: PoolStatus;
}

/** BTC.b and WAVAX come from the existing token list — one address per token. */
const BTCB = tokenBySymbol("BTC.b");
const WAVAX = tokenBySymbol("AVAX"); // .address is WAVAX, per tokens.ts

/**
 * BTC trio — runsheet §10 "BTC trio (Phase B, predicted == deployed)",
 * lines 797-800 (vault / bank / sequencer / venue table) and line 803
 * ("Read-backs: PAIR 0xCD4d…189f2, BIN_STEP 25, ADMIN = Safe, state 0,
 * unpaused"). Feed from §7, line 829.
 *
 * Live: currentEpoch 1, range 8391276/8391290, runMode TRUE
 * (runsheet "Tue Sep 8 as executed", lines 917-928).
 */
const BTC_POOL: BalcorePool = {
  key: "btc",
  label: "Bitcoin / Dollar",
  vault: "0x360b0A84278eea5772A4951883ED394DaC4bf798", // runsheet §10 L797
  bank: "0x55Ae400c5432CdeAe5aa6D7d4826588e4db83365", // runsheet §10 L798
  sequencer: "0x49bc55D434d46Ce9ae722c2f3E1Ecef9fBb2AB19", // runsheet §10 L799
  venue: "0xBB7Ba4eB12F3851BD5648b7CB9f000cd50C92924", // runsheet §10 L800
  pair: "0xCD4d8252854Ac05D0F7c50F1B0718F5C51D189f2", // §10 L803 (trunc) + deploy-runbook L178
  feed: "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743", // runsheet §7 L829 (Chainlink BTC/USD)
  tokenA: { address: BTCB.address, symbol: "BTC.b", decimals: 8 },
  tokenB: { address: USDC_ADDRESS, symbol: "USDC", decimals: 6 },
  binStep: 25, // runsheet §10 L803 read-back
  scaleA2B: 10_000_000_000n, // 1e10 = 10**(8 + 8 - 6)
  status: "live",
};

/**
 * AVAX trio — runsheet §10 "AVAX trio", lines 809-812, read-backs line 815
 * ("PAIR 0x8aC5…3379, BIN_STEP 5"). Feed from §7, line 831.
 *
 * Deployed but NOT open: the AVAX keeper is stopped (runsheet §10, "Keeper"
 * paragraph). Reads work; the UI must not offer a deposit.
 */
const AVAX_POOL: BalcorePool = {
  key: "avax",
  label: "Avalanche / Dollar",
  vault: "0x8a7Afa30E352D80B386b1415f6e10a3008D76Aa1", // runsheet §10 L809
  bank: "0x789A101e3FA724193C26F6A0A1741f9DA38d0447", // runsheet §10 L810
  sequencer: "0x377add5BEaaf47E570B0b70A6D2456577BF72f54", // runsheet §10 L811
  venue: "0xFfF4107e1b9Ad4E8209a6A26aBb58E1a01B78883", // runsheet §10 L812
  pair: "0x8aC5707f8D4BDe1d771d34c7AfD81c3922b73379", // §10 L815 (trunc) + deploy-runbook L179
  feed: "0x0A77230d17318075983913bC2145DB16C7366156", // runsheet §7 L831 (Chainlink AVAX/USD)
  tokenA: { address: WAVAX.address, symbol: "WAVAX", decimals: 18 },
  tokenB: { address: USDC_ADDRESS, symbol: "USDC", decimals: 6 },
  binStep: 5, // runsheet §10 L815 read-back
  scaleA2B: 100_000_000_000_000_000_000n, // 1e20 = 10**(18 + 8 - 6)
  status: "comingSoon",
};

/* ------------------------------------------------------------------ */
/* Protocol-wide                                                       */
/* ------------------------------------------------------------------ */

/** Gnosis Safe (v1.4.1, threshold 2) — admin of every contract above. */
const SAFE_MAINNET = "0x35712B2f62C508A78d13246f2BC1420120b29cf1" as const; // runsheet L24/L41

/** BalCoreFactory — owner = Safe, verified at the ceremony. */
const FACTORY_MAINNET = "0x0D7fb4Bb442D45EEfAEF71C9988A7D18578E0f92" as const; // runsheet §10 L789

/* ------------------------------------------------------------------ */
/* Environment gate                                                    */
/* ------------------------------------------------------------------ */

/**
 * There is NO testnet deployment. `VITE_CHAIN_ENV=testnet` therefore yields an
 * empty pool set rather than mainnet addresses on a Fuji client — pointing a
 * Fuji signer at a C-Chain address is how funds get sent to a contract that
 * does not exist there.
 *
 * Callers must gate on `BALCORE_DEPLOYED` (or take the `undefined` from
 * `poolByKey`) instead of assuming a pool exists.
 */
export const BALCORE_DEPLOYED = isMainnet;

/** Every configured pool, in display order. Empty off mainnet. */
export const BALCORE_POOLS: readonly BalcorePool[] = BALCORE_DEPLOYED ? [BTC_POOL, AVAX_POOL] : [];

/** Pools open for deposits right now. */
export const LIVE_POOLS: readonly BalcorePool[] = BALCORE_POOLS.filter((p) => p.status === "live");

export const BALCORE_SAFE: Address | undefined = BALCORE_DEPLOYED ? SAFE_MAINNET : undefined;
export const BALCORE_FACTORY: Address | undefined = BALCORE_DEPLOYED ? FACTORY_MAINNET : undefined;

/**
 * Look up a pool. Returns `undefined` off mainnet or for an unknown key —
 * the "not deployed" guard every read hook checks before it builds a call.
 */
export function poolByKey(key: PoolKey): BalcorePool | undefined {
  return BALCORE_POOLS.find((p) => p.key === key);
}

/** Why a pool is unavailable, or null when it is usable. */
export function poolUnavailableReason(key: PoolKey): string | null {
  if (!BALCORE_DEPLOYED)
    return "Balcore is deployed on Avalanche C-Chain only — not on this network.";
  const pool = poolByKey(key);
  if (!pool) return "Unknown pool.";
  if (pool.status !== "live") return `${pool.label} is not open for deposits yet.`;
  return null;
}
