/**
 * Pure pre-flight logic for the Balcore writes.
 *
 * Everything a screen needs to decide "may this button be pressed, and if not
 * what do I say" lives here as plain functions over plain values: no React, no
 * wagmi, no network. Two reasons, and the second is the load-bearing one.
 *
 *   1. It is unit-testable (`checks.test.ts`), which a hook is not — this repo
 *      has `node:test` and no DOM, so logic that lives inside a hook body
 *      cannot be tested at all.
 *   2. Every rule below mirrors a revert in the contracts. Mirroring them in
 *      one readable place is how we keep the UI's "no" and the chain's "no" in
 *      agreement; scattering them through a component is how they drift.
 *
 * THE DIVISION OF LABOUR, stated once: these checks exist to give a BETTER
 * message sooner, never to be the only gate. Every write still dry-runs through
 * `simulateContract` before the wallet opens, because only the chain knows the
 * truth at the block the transaction lands in. A check here that disagrees with
 * the chain costs a clear message; a check here TRUSTED in place of the
 * simulation would cost money.
 *
 * Contract citations are balcore-contracts@c190dc0.
 */

import { matchedAmount, ratioOk } from "../math.ts";

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

/**
 * Why a write cannot proceed.
 *
 * `code` is for tests and telemetry, `message` is for the user, and `severity`
 * decides how the panel renders it: a `blocker` disables the button, a `warning`
 * does not.
 */
export interface CheckIssue {
  code: string;
  message: string;
  severity: "blocker" | "warning";
}

export const blocker = (code: string, message: string): CheckIssue => ({
  code,
  message,
  severity: "blocker",
});
export const warning = (code: string, message: string): CheckIssue => ({
  code,
  message,
  severity: "warning",
});

/** First blocker wins; warnings accumulate. */
export interface CheckResult {
  ok: boolean;
  blocker: CheckIssue | null;
  warnings: CheckIssue[];
  issues: CheckIssue[];
}

export function summarise(issues: readonly CheckIssue[]): CheckResult {
  const all = [...issues];
  const firstBlocker = all.find((i) => i.severity === "blocker") ?? null;
  return {
    ok: firstBlocker === null,
    blocker: firstBlocker,
    warnings: all.filter((i) => i.severity === "warning"),
    issues: all,
  };
}

/* ------------------------------------------------------------------ */
/* Deposit                                                            */
/* ------------------------------------------------------------------ */

/**
 * The price-drift threshold at which we warn.
 *
 * The chain's tolerance is ±1% (`VaultMath.checkDepositRatio`, VaultMath.sol:810)
 * measured at the price IN THE BLOCK THE DEPOSIT LANDS IN, not the price the
 * form was filled at. Half the budget is a sane place to tell the user the
 * quote is aging, because the remaining half has to absorb the move between
 * signing and inclusion.
 */
export const DRIFT_WARN_BPS = 50n;

/** Both legs, or USDC that the panel splits for you first. */
export type DepositMode = "both" | "usdcOnly";

export interface DepositCheckInput {
  mode: DepositMode;
  /** tokenA in its own smallest unit (BTC.b: 8-dec sats). */
  tokenAAmount: bigint;
  /** tokenB (USDC) in 6-dec atoms. */
  usdcAmount: bigint;
  /** Wallet balances in the same units. */
  tokenABalance: bigint;
  usdcBalance: bigint;
  /** Chainlink tokenA/USD, 8 decimals — `vault.lastValidPrice()`. */
  price8: bigint;
  /** The pool's `SCALE_A2B`. */
  scaleA2B: bigint;
  /** `bank.totalAssets()` — the pricing TVL the cap is measured against. */
  pricingTvl: bigint;
  /** `bank.LAUNCH_TVL_CAP()`. */
  tvlCap: bigint;
  /** `bank.tvlCapActive()`. */
  tvlCapActive: boolean;
  /** True when `positions(user)` still shows an unactivated queued deposit. */
  hasQueuedDeposit: boolean;
  /** `bank.paused()`. */
  paused: boolean;
  /** The pool is open for deposits at all (AVAX is deployed but not open). */
  poolLive: boolean;
  /** Wallet connected and on Avalanche C-Chain. */
  connected: boolean;
  wrongNetwork: boolean;
  /**
   * The price the form's matched amount was computed at, when it differs from
   * `price8`. Drives the drift warning; null disables it.
   */
  quotedPrice8?: bigint | null;
}

/**
 * What a deposit is worth and whether the two legs are balanced.
 *
 * `tokenAValue` reproduces `mulDiv(amountA, price8, SCALE_A2B)`
 * (BalCoreBank.sol:486) and `ratioOk` reproduces the ±1% floor-division check,
 * so the numbers here are the ones the chain will compute — not a float
 * approximation of them.
 */
export interface DepositValuation {
  tokenAValue: bigint;
  usdcValue: bigint;
  totalValue: bigint;
  balanced: boolean;
  /** |a-b| as a fraction of the larger leg, in bps. For the message. */
  imbalanceBps: number;
}

export function valueDeposit(input: {
  tokenAAmount: bigint;
  usdcAmount: bigint;
  price8: bigint;
  scaleA2B: bigint;
}): DepositValuation {
  const tokenAValue = matchedAmount({ tokenA: input.tokenAAmount }, input.price8, input.scaleA2B);
  const usdcValue = input.usdcAmount;
  const larger = tokenAValue > usdcValue ? tokenAValue : usdcValue;
  const diff = tokenAValue > usdcValue ? tokenAValue - usdcValue : usdcValue - tokenAValue;
  return {
    tokenAValue,
    usdcValue,
    totalValue: tokenAValue + usdcValue,
    balanced: ratioOk(tokenAValue, usdcValue),
    imbalanceBps: larger > 0n ? Number((diff * 10_000n) / larger) : 0,
  };
}

/**
 * Every reason a deposit would be refused, in the order the contract checks.
 *
 * Order matters for the message: the chain reverts on the FIRST failure, so
 * reporting them in its order means the message the user sees is the message
 * the chain would have given.
 */
export function checkDeposit(input: DepositCheckInput): CheckResult {
  const issues: CheckIssue[] = [];

  if (!input.poolLive) {
    return summarise([blocker("poolNotLive", "This pool is not open for deposits yet.")]);
  }
  if (!input.connected) {
    return summarise([blocker("notConnected", "Connect your wallet to deposit.")]);
  }
  if (input.wrongNetwork) {
    return summarise([
      blocker("wrongNetwork", "Switch your wallet to Avalanche C-Chain to deposit."),
    ]);
  }
  if (input.paused) {
    return summarise([blocker("paused", "This pool is paused — deposits are closed right now.")]);
  }

  // `deposit` reverts ZeroAmount if EITHER leg is zero (BalCoreBank.sol:480).
  // This pool takes the two tokens together; there is no one-sided deposit.
  if (input.tokenAAmount <= 0n || input.usdcAmount <= 0n) {
    return summarise([blocker("zeroAmount", "Enter an amount.")]);
  }

  if (input.price8 <= 0n) {
    return summarise([
      blocker(
        "noPrice",
        "The pool's price feed is not reporting right now, so a deposit cannot be priced. Try again shortly.",
      ),
    ]);
  }

  const valuation = valueDeposit(input);

  // ---- the ±1% pairing rule ----
  if (!valuation.balanced) {
    issues.push(
      blocker(
        "ratio",
        `The two amounts have to match within 1% at the live price — they are ${(valuation.imbalanceBps / 100).toFixed(2)}% apart. Use the matched amount.`,
      ),
    );
  }

  // ---- balances ----
  // Checked after the ratio so a user who typed one leg too large is told the
  // real problem rather than "insufficient balance" on the leg we derived.
  if (input.tokenAAmount > input.tokenABalance) {
    issues.push(
      blocker("tokenABalance", "That is more than your wallet holds of the first token."),
    );
  }
  if (input.usdcAmount > input.usdcBalance) {
    issues.push(blocker("usdcBalance", "That is more than the USDC in your wallet."));
  }

  // ---- one queued deposit per address (BalCoreBank.sol:529) ----
  if (input.hasQueuedDeposit) {
    issues.push(
      blocker(
        "queued",
        "You already have a deposit waiting for the next Tuesday settlement. Only one at a time — wait for it to activate, then add more.",
      ),
    );
  }

  // ---- TVL cap (BalCoreBank.sol:517) ----
  if (input.tvlCapActive) {
    const after = input.pricingTvl + valuation.totalValue;
    if (after > input.tvlCap) {
      const room = input.tvlCap > input.pricingTvl ? input.tvlCap - input.pricingTvl : 0n;
      issues.push(
        blocker(
          "tvlCap",
          room > 0n
            ? `This pool is near its deposit cap — about ${fmtUsdc(room)} of room left.`
            : "This pool has reached its deposit cap and cannot take more right now.",
        ),
      );
    }
  }

  // ---- drift warning, not a blocker ----
  const quoted = input.quotedPrice8;
  if (quoted && quoted > 0n) {
    const diff = quoted > input.price8 ? quoted - input.price8 : input.price8 - quoted;
    const bps = (diff * 10_000n) / quoted;
    if (bps > DRIFT_WARN_BPS) {
      issues.push(
        warning(
          "drift",
          `The price has moved ${(Number(bps) / 100).toFixed(2)}% since these amounts were worked out. Re-matching them keeps the deposit inside the pool's 1% rule.`,
        ),
      );
    }
  }

  return summarise(issues);
}

/** 6-dec atoms as a rounded dollar string. */
function fmtUsdc(v: bigint): string {
  return `$${(v / 1_000_000n).toLocaleString("en-US")}`;
}

/* ------------------------------------------------------------------ */
/* The USDC-only split                                                 */
/* ------------------------------------------------------------------ */

export interface UsdcSplit {
  /** USDC to keep as the tokenB leg. */
  keepUsdc: bigint;
  /** USDC to sell for tokenA. */
  swapUsdc: bigint;
  /** tokenA the swap must deliver for the result to be balanced. */
  targetTokenA: bigint;
}

/**
 * Split a USDC-only deposit into the leg to keep and the leg to swap.
 *
 * HALF BY VALUE, not half by amount, and the distinction is the whole point: a
 * balanced deposit needs `valueOf(tokenA) == usdcKept` within 1%, and the swap
 * output is tokenA, so the USDC spent and the USDC kept must be equal in value.
 * Those are the same number, so the split is a halving — but it is a halving of
 * VALUE that happens to be a halving of the amount, and writing it that way
 * keeps it correct if a fee is ever taken out of one side.
 *
 * Rounding: `keepUsdc` takes the odd atom (`total - swapUsdc`), so the two legs
 * always sum to exactly the input with no dust left behind. An odd atom in the
 * KEPT leg is the safe direction — it makes the kept leg marginally larger than
 * the bought leg, and the ±1% tolerance absorbs one atom at any realistic size.
 *
 * `targetTokenA` is what the swap should aim for, derived from the price the
 * same way `matchedAmount` does, so the caller can set a min-out against it.
 */
export function splitUsdcForDeposit(
  totalUsdc: bigint,
  price8: bigint,
  scaleA2B: bigint,
): UsdcSplit {
  if (totalUsdc <= 0n || price8 <= 0n || scaleA2B <= 0n) {
    return { keepUsdc: 0n, swapUsdc: 0n, targetTokenA: 0n };
  }
  const swapUsdc = totalUsdc / 2n;
  const keepUsdc = totalUsdc - swapUsdc;
  return {
    swapUsdc,
    keepUsdc,
    // What that USDC is worth in tokenA at the live price.
    targetTokenA: matchedAmount({ usdc: swapUsdc }, price8, scaleA2B),
  };
}

/**
 * Minimum tokenA the split swap must deliver for the deposit to still pair.
 *
 * The deposit that follows is checked against `keepUsdc`, so the swap has to
 * land tokenA worth at least `keepUsdc * (1 - 1%)`. Sizing min-out off the
 * RATIO RULE rather than off a slippage preference is what stops a swap from
 * succeeding into a deposit that then reverts `DepositRatioOutOfBounds` — the
 * expensive failure, because the swap is already paid for by then.
 *
 * `extraToleranceBps` tightens it further if the caller wants headroom for the
 * price moving between the swap and the deposit (they are separate
 * transactions).
 */
export function minTokenAForPairing(
  keepUsdc: bigint,
  price8: bigint,
  scaleA2B: bigint,
  extraToleranceBps = 0n,
): bigint {
  if (keepUsdc <= 0n || price8 <= 0n) return 0n;
  // The ratio check passes while |valueA - keepUsdc| <= max(...)/100, so the
  // floor on valueA is keepUsdc * 99/100 (using the kept leg as the larger one,
  // which is the conservative assumption).
  const minValue = (keepUsdc * (10_000n - 100n - extraToleranceBps)) / 10_000n;
  return matchedAmount({ usdc: minValue }, price8, scaleA2B);
}

/* ------------------------------------------------------------------ */
/* Withdrawal                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where a holder stands in the withdrawal flow.
 *
 * Derived from `withdrawRequests(user)` and `withdrawBasket(user)` rather than
 * tracked locally, so a request made in another session or another tab shows up
 * correctly. `partial` is W-6: `executeWithdraw` can pay a tranche and leave
 * the rest claimable, in which case `executed` is still false and the basket
 * carries a `residualValue` (BalCoreBank.sol:1023-1053).
 */
export type WithdrawStatus = "none" | "pending" | "ready" | "partial" | "executed";

export interface WithdrawStatusInput {
  /** `withdrawRequests(user).shares` — zero means no request was ever made. */
  requestShares: bigint;
  requestExecuted: boolean;
  /** Unix seconds. */
  readyAt: bigint;
  /** `withdrawBasket(user).residualValue` — non-zero after a partial fill. */
  residualValue: bigint;
  /** Unix seconds, now. */
  nowSec: bigint;
}

export function withdrawStatus(input: WithdrawStatusInput): WithdrawStatus {
  if (input.requestShares <= 0n) return "none";
  if (input.requestExecuted) return "executed";
  // A residual means a tranche was already paid: the claim survives and is
  // re-executable immediately, so it is never "pending" again.
  if (input.residualValue > 0n) return "partial";
  if (input.readyAt > 0n && input.nowSec >= input.readyAt) return "ready";
  return "pending";
}

/** Seconds until `readyAt`, floored at zero. */
export function secondsUntilReady(readyAt: bigint, nowSec: bigint): bigint {
  if (readyAt <= nowSec) return 0n;
  return readyAt - nowSec;
}

/** "6d 23h" / "23h 14m" / "4m" — the countdown the pending state shows. */
export function formatCountdown(seconds: bigint): string {
  if (seconds <= 0n) return "ready now";
  const total = Number(seconds);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export interface WithdrawCheckInput {
  status: WithdrawStatus;
  /** The caller's live share balance — what `requestWithdraw` would burn. */
  shares: bigint;
  paused: boolean;
  poolLive: boolean;
  connected: boolean;
  wrongNetwork: boolean;
  /** `bank.runMode()`. */
  runMode: boolean;
  /** During a run, the address at the head of the queue, when known. */
  queueHead?: `0x${string}` | null;
  /** The connected address, for the head comparison. */
  user?: `0x${string}` | null;
}

/** `requestWithdraw()` — full position, one at a time. */
export function checkRequestWithdraw(input: WithdrawCheckInput): CheckResult {
  if (!input.poolLive) return summarise([blocker("poolNotLive", "This pool is not open yet.")]);
  if (!input.connected) return summarise([blocker("notConnected", "Connect your wallet.")]);
  if (input.wrongNetwork) {
    return summarise([blocker("wrongNetwork", "Switch your wallet to Avalanche C-Chain.")]);
  }
  if (input.paused) {
    return summarise([
      blocker("paused", "This pool is paused — withdrawals are closed right now."),
    ]);
  }
  // BalCoreBank.sol:686 — one live request at a time.
  if (input.status !== "none" && input.status !== "executed") {
    return summarise([
      blocker(
        "requestExists",
        "You already have a withdrawal in progress. Collect it or cancel it before starting another.",
      ),
    ]);
  }
  // BalCoreBank.sol:683 — ZeroAmount when the caller holds nothing.
  if (input.shares <= 0n) {
    return summarise([blocker("noPosition", "You have no position in this pool to withdraw.")]);
  }
  const issues: CheckIssue[] = [];
  if (input.runMode) {
    issues.push(
      warning(
        "runMode",
        "This pool is serving withdrawals in order right now, so yours will be paid when it reaches the front of the queue.",
      ),
    );
  }
  return summarise(issues);
}

/** `executeWithdraw()` — only after `readyAt`, and head-only during a run. */
export function checkExecuteWithdraw(
  input: WithdrawCheckInput & { readyAt: bigint; nowSec: bigint },
): CheckResult {
  if (!input.connected) return summarise([blocker("notConnected", "Connect your wallet.")]);
  if (input.wrongNetwork) {
    return summarise([blocker("wrongNetwork", "Switch your wallet to Avalanche C-Chain.")]);
  }
  if (input.paused) {
    return summarise([blocker("paused", "This pool is paused — collection is closed right now.")]);
  }
  if (input.status === "none") {
    return summarise([blocker("noRequest", "There is nothing to collect.")]);
  }
  if (input.status === "executed") {
    return summarise([blocker("alreadyExecuted", "This withdrawal has already been paid out.")]);
  }
  // BalCoreBank.sol:957 — WithdrawNotReady until readyAt.
  if (input.status === "pending") {
    const left = secondsUntilReady(input.readyAt, input.nowSec);
    return summarise([
      blocker("notReady", `Not ready yet — available in ${formatCountdown(left)}.`),
    ]);
  }
  const issues: CheckIssue[] = [];
  // BalCoreBank.sol:950-953 — NotHeadOfQueue. A real gate, but one the chain
  // owns: the head can change between this read and inclusion, so this is a
  // message, and the simulation is the decision.
  if (input.runMode && input.queueHead && input.user) {
    if (input.queueHead.toLowerCase() !== input.user.toLowerCase()) {
      issues.push(
        blocker(
          "notHead",
          "This pool is paying withdrawals strictly in order and yours is not at the front yet. Your place is held — try again later.",
        ),
      );
    }
  }
  return summarise(issues);
}

/**
 * `cancelWithdraw()` — and the consequence the UI has to state.
 *
 * Cancelling does NOT restore the old position. `BalCoreBank.cancelWithdraw`
 * (:1401-1463) re-values the frozen basket at the CURRENT price, re-mints at
 * the CURRENT share price, and writes `entryEpoch = currentEpoch` with
 * `activated = false` — so the entry epoch and the 7-day clock are both lost
 * and the basket becomes a fresh queued deposit. That is deliberate (a cancel
 * that restored the old entry would make requesting a free option), and it is
 * the single most surprising thing in the withdrawal flow, so the copy below is
 * not optional.
 */
export const CANCEL_CONSEQUENCE =
  "Cancelling puts your basket back in as a NEW deposit at today's price. You do not get your original position back: your place in the current week is lost, the deposit waits for the next Tuesday settlement to activate, and the 7-day clock restarts if you withdraw again.";

export function checkCancelWithdraw(
  input: Pick<WithdrawCheckInput, "status" | "paused" | "connected" | "wrongNetwork"> & {
    /** Cancel is refused outright if the caller already holds shares (:1405). */
    holdsShares: boolean;
  },
): CheckResult {
  if (!input.connected) return summarise([blocker("notConnected", "Connect your wallet.")]);
  if (input.wrongNetwork) {
    return summarise([blocker("wrongNetwork", "Switch your wallet to Avalanche C-Chain.")]);
  }
  if (input.paused) {
    return summarise([blocker("paused", "This pool is paused right now.")]);
  }
  if (input.status === "none" || input.status === "executed") {
    return summarise([blocker("noRequest", "There is no withdrawal request to cancel.")]);
  }
  // BalCoreBank.sol:1405 — DepositAlreadyQueued. No merge in v1.
  if (input.holdsShares) {
    return summarise([
      blocker(
        "holdsShares",
        "Cancelling would re-enter your basket as a new deposit, and you already hold a position here. Collect the withdrawal instead.",
      ),
    ]);
  }
  return summarise([warning("consequence", CANCEL_CONSEQUENCE)]);
}

/* ------------------------------------------------------------------ */
/* Claim                                                               */
/* ------------------------------------------------------------------ */

export interface ClaimCheckInput {
  /** `getClaimableYield(user)` tokenB leg, 6-dec atoms. */
  claimableUsdc: bigint;
  /** The tokenA leg. Always 0 for RD-v2 epochs, but checked rather than assumed. */
  claimableTokenA: bigint;
  paused: boolean;
  connected: boolean;
  wrongNetwork: boolean;
  /** `positions(user).lastClaimedEpoch` and `currentEpoch`, for the reason. */
  lastClaimedEpoch: bigint;
  currentEpoch: bigint;
}

/**
 * `claimYield()` — reverts `NothingToClaim` at zero, in three distinct ways
 * (BalCoreBank.sol:1298-1308), and the three want different sentences.
 */
export function checkClaimYield(input: ClaimCheckInput): CheckResult {
  if (!input.connected) return summarise([blocker("notConnected", "Connect your wallet.")]);
  if (input.wrongNetwork) {
    return summarise([blocker("wrongNetwork", "Switch your wallet to Avalanche C-Chain.")]);
  }
  if (input.paused) {
    return summarise([blocker("paused", "This pool is paused right now.")]);
  }
  // `fromEpoch >= currentEpoch` — nothing has settled since the last claim.
  if (input.lastClaimedEpoch + 1n >= input.currentEpoch) {
    return summarise([
      blocker(
        "noSettledEpoch",
        "No settled week to claim yet. Yield is credited at the Tuesday settlement.",
      ),
    ]);
  }
  if (input.claimableUsdc <= 0n && input.claimableTokenA <= 0n) {
    return summarise([
      blocker(
        "zeroClaimable",
        "Nothing to claim. Shares only earn from the week AFTER they activate, so a new deposit shows zero until it has been through a settlement.",
      ),
    ]);
  }
  return summarise([]);
}

/* ------------------------------------------------------------------ */
/* Fast-track                                                          */
/* ------------------------------------------------------------------ */

/** `VaultMath.calculateFastTrackFee` — a flat 3% (VaultMath.sol:298-310). */
export const FAST_TRACK_FEE_BPS = 300n;

export interface FastTrackPreview {
  /** Gross value of the position being exited, tokenB atoms. */
  gross: bigint;
  fee: bigint;
  /** What the user actually receives. */
  net: bigint;
}

/**
 * The 3% fee, computed the way the contract computes it.
 *
 * `fee = withdrawValue * 3 / 100` (VaultMath.sol:307) — integer division,
 * floored, so the fee is never a rounded-up float. The two halves of the fee
 * (`fee/2` and `fee - fee/2`) both land in the unified reserve, which is why
 * the preview only needs the total.
 */
export function previewFastTrack(gross: bigint): FastTrackPreview {
  if (gross <= 0n) return { gross: 0n, fee: 0n, net: 0n };
  const fee = (gross * 3n) / 100n;
  return { gross, fee, net: gross - fee };
}

export interface FastTrackCheckInput {
  shares: bigint;
  /** Value of those shares against holder-TVL, tokenB atoms. */
  positionValue: bigint;
  paused: boolean;
  poolLive: boolean;
  connected: boolean;
  wrongNetwork: boolean;
  /** From `useFastTrackAvailability`: the pool-level verdict and its reason. */
  available: boolean;
  unavailableReason: string | null;
  /** Does THIS amount fit both gates? */
  fitsAmount: boolean;
}

/**
 * `fastTrackWithdraw()` — the gates in the contract's own order
 * (BalCoreBank.sol:1095-1146): run mode, then zero shares, then the daily cap,
 * then the liquidity gate.
 *
 * Run mode is TRUE on the BTC pool today, so this path renders unavailable on
 * mainnet right now and that is correct, not a bug.
 */
export function checkFastTrack(input: FastTrackCheckInput): CheckResult {
  if (!input.poolLive) return summarise([blocker("poolNotLive", "This pool is not open yet.")]);
  if (!input.connected) return summarise([blocker("notConnected", "Connect your wallet.")]);
  if (input.wrongNetwork) {
    return summarise([blocker("wrongNetwork", "Switch your wallet to Avalanche C-Chain.")]);
  }
  if (input.paused) {
    return summarise([blocker("paused", "This pool is paused right now.")]);
  }
  // The pool-level verdict already distinguishes run mode, a spent daily cap
  // and thin liquidity, each with its own sentence.
  if (!input.available) {
    return summarise([
      blocker("unavailable", input.unavailableReason ?? "Instant withdrawal is not available now."),
    ]);
  }
  if (input.shares <= 0n || input.positionValue <= 0n) {
    return summarise([blocker("noPosition", "You have no position in this pool to withdraw.")]);
  }
  if (!input.fitsAmount) {
    return summarise([
      blocker(
        "tooLarge",
        "Your position is larger than instant withdrawal can serve right now. The standard 7-day withdrawal has no such limit.",
      ),
    ]);
  }
  return summarise([
    warning(
      "noIlCover",
      "Instant withdrawal pays out at today's value with a 3% fee and NO impermanent-loss cover. The standard 7-day withdrawal has both.",
    ),
  ]);
}
